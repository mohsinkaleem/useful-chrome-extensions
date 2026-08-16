// Pure CPU-bound analysis over plain bookmark objects.
//
// Nothing here touches IndexedDB, chrome.* or the DOM, so the module runs
// unchanged on the main thread and inside a Web Worker. Keep it that way -
// analysis-worker.js is the only other importer that matters.

import { shuffle } from './utils.js';
import { analyzeBookmarkMetadata } from './metadata-analyzer.js';
import { enhanceWithSchemaOrg } from './url-parsers.js';
import { detectTopics } from './topics.js';

/**
 * Levenshtein distance using two rolling rows instead of a full (m+1)x(n+1)
 * matrix - the matrix allocation was the largest GC pressure source here.
 */
export function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  let previous = new Array(n + 1);
  let current = new Array(n + 1);

  for (let j = 0; j <= n; j++) previous[j] = j;

  for (let i = 1; i <= m; i++) {
    current[0] = i;
    const c1 = str1[i - 1];

    for (let j = 1; j <= n; j++) {
      const cost = c1 === str2[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }

    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[n];
}

// Two strings of length minLen and maxLen differ by at least maxLen - minLen
// edits, so their normalized similarity cannot exceed minLen / maxLen. Below
// this ratio the result is already under every threshold callers use, and the
// distance is not worth computing - this skips most pairs.
const MIN_LENGTH_RATIO = 0.4;

/**
 * Normalized Levenshtein similarity between two titles, in [0, 1].
 */
export function fuzzyTitleSimilarity(title1, title2) {
  const t1 = title1.toLowerCase().trim();
  const t2 = title2.toLowerCase().trim();

  if (t1 === t2) return 1.0;

  const maxLen = Math.max(t1.length, t2.length);
  if (maxLen === 0) return 0;

  const minLen = Math.min(t1.length, t2.length);
  const upperBound = minLen / maxLen;
  if (upperBound < MIN_LENGTH_RATIO) return upperBound;

  return 1 - levenshteinDistance(t1, t2) / maxLen;
}

/**
 * Word-level Jaccard similarity between two texts.
 */
export function wordJaccardSimilarity(text1, text2) {
  const words1 = new Set(
    text1
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  const words2 = new Set(
    text2
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter((w) => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return intersection / union;
}

/**
 * How many of the five comparable metadata fields a bookmark actually has.
 */
export function getMetadataCoverage(bookmark) {
  let coverage = 0;

  if (bookmark.title && bookmark.title.length > 3) coverage++;
  if (bookmark.description && bookmark.description.length > 10) coverage++;
  if (bookmark.keywords && bookmark.keywords.length > 0) coverage++;
  if (bookmark.category) coverage++;
  if (bookmark.domain) coverage++;

  return { coverage, percentage: (coverage / 5) * 100 };
}

/**
 * Weighted similarity between two bookmarks, with the per-signal breakdown the
 * side-by-side comparison view renders.
 */
function calculateComprehensiveSimilarity(bookmark1, bookmark2) {
  const scores = {
    titleFuzzy: 0,
    titleWords: 0,
    descriptionWords: 0,
    keywordsOverlap: 0,
    categoryMatch: 0,
    domainMatch: 0,
    urlPathSimilarity: 0,
  };

  if (bookmark1.title && bookmark2.title) {
    scores.titleFuzzy = fuzzyTitleSimilarity(bookmark1.title, bookmark2.title);
    scores.titleWords = wordJaccardSimilarity(bookmark1.title, bookmark2.title);
  }

  if (bookmark1.description && bookmark2.description) {
    scores.descriptionWords = wordJaccardSimilarity(bookmark1.description, bookmark2.description);
  }

  if (bookmark1.keywords?.length > 0 && bookmark2.keywords?.length > 0) {
    const kw1 = new Set(bookmark1.keywords.map((k) => k.toLowerCase()));
    const kw2 = new Set(bookmark2.keywords.map((k) => k.toLowerCase()));
    const intersection = [...kw1].filter((k) => kw2.has(k)).length;
    const union = new Set([...kw1, ...kw2]).size;
    scores.keywordsOverlap = intersection / union;
  }

  if (bookmark1.category && bookmark2.category) {
    scores.categoryMatch = bookmark1.category === bookmark2.category ? 1 : 0;
  }

  if (bookmark1.domain && bookmark2.domain) {
    scores.domainMatch = bookmark1.domain === bookmark2.domain ? 1 : 0;
  }

  if (scores.domainMatch === 1) {
    try {
      const path1 = new URL(bookmark1.url).pathname;
      const path2 = new URL(bookmark2.url).pathname;
      scores.urlPathSimilarity = fuzzyTitleSimilarity(path1, path2);
    } catch {
      // Invalid URL - leave the path score at 0
    }
  }

  const combined =
    scores.domainMatch === 1
      ? // Same domain: the URL path carries most of the signal
        scores.titleFuzzy * 0.25 +
        scores.titleWords * 0.2 +
        scores.urlPathSimilarity * 0.2 +
        scores.descriptionWords * 0.15 +
        scores.keywordsOverlap * 0.1 +
        scores.categoryMatch * 0.1
      : // Different domain: only the content can match
        scores.titleFuzzy * 0.3 +
        scores.titleWords * 0.25 +
        scores.descriptionWords * 0.2 +
        scores.keywordsOverlap * 0.15 +
        scores.categoryMatch * 0.1;

  return {
    combined,
    breakdown: scores,
    sameDomain: scores.domainMatch === 1,
    sameCategory: scores.categoryMatch === 1,
  };
}

// Within a domain group, compare each bookmark only against the next N entries
// of a title-sorted list rather than against every other entry. A domain with
// 500 bookmarks was 124,750 comparisons; this makes the cost linear in the
// group size while keeping near-duplicate titles - which sort adjacently -
// in the same window. Groups smaller than the window are still fully pairwise.
const DOMAIN_COMPARISON_WINDOW = 60;

// Cross-domain comparison is sampled rather than exhaustive.
const CROSS_DOMAIN_SAMPLE_SIZE = 200;

function normalizedTitle(bookmark) {
  return (bookmark.title || '').toLowerCase().trim();
}

/**
 * Find similar bookmark pairs. Synchronous and potentially long-running: call
 * it from a worker, or via runSimilarityAnalysis in analysis-client.js.
 *
 * Pairs reference bookmarks by id so the result stays small crossing a worker
 * boundary; runSimilarityAnalysis hydrates them back into full records.
 *
 * @param {Array} bookmarks
 * @param {Object} options
 * @returns {{pairs: Array, stats: Object}}
 */
export function computeSimilarPairs(bookmarks, options = {}) {
  const {
    minSimilarity = 0.5,
    maxPairs = 100,
    prioritizeSameDomain = true,
    requireHighCoverage = false,
    minCoveragePercent = 40,
  } = options;

  if (!bookmarks || bookmarks.length < 2) {
    return { pairs: [], stats: { total: 0, sameDomain: 0, crossDomain: 0, avgSimilarity: 0 } };
  }

  const candidates = requireHighCoverage
    ? bookmarks.filter((b) => getMetadataCoverage(b).percentage >= minCoveragePercent)
    : bookmarks;

  const domainGroups = new Map();
  for (const bookmark of candidates) {
    const domain = bookmark.domain || 'unknown';
    const group = domainGroups.get(domain);
    if (group) group.push(bookmark);
    else domainGroups.set(domain, [bookmark]);
  }

  const pairs = [];

  const record = (b1, b2, similarity, sameDomain) => {
    pairs.push({
      bookmark1Id: b1.id,
      bookmark2Id: b2.id,
      similarity: similarity.combined,
      breakdown: similarity.breakdown,
      sameDomain,
      sameCategory: similarity.sameCategory,
      coverage1: getMetadataCoverage(b1),
      coverage2: getMetadataCoverage(b2),
    });
  };

  // Phase 1: within each domain
  for (const groupBookmarks of domainGroups.values()) {
    if (groupBookmarks.length < 2) continue;

    const group =
      groupBookmarks.length > DOMAIN_COMPARISON_WINDOW
        ? groupBookmarks
            .slice()
            .sort((a, b) => normalizedTitle(a).localeCompare(normalizedTitle(b)))
        : groupBookmarks;

    for (let i = 0; i < group.length; i++) {
      const end = Math.min(group.length, i + 1 + DOMAIN_COMPARISON_WINDOW);

      for (let j = i + 1; j < end; j++) {
        const b1 = group[i];
        const b2 = group[j];
        if (b1.url === b2.url) continue; // exact duplicates belong to the duplicates view

        const similarity = calculateComprehensiveSimilarity(b1, b2);
        if (similarity.combined >= minSimilarity) record(b1, b2, similarity, true);
      }
    }
  }

  // Phase 2: sampled cross-domain, only if phase 1 came up short
  if (!prioritizeSameDomain || pairs.length < maxPairs / 2) {
    const sample = shuffle(candidates).slice(
      0,
      Math.min(CROSS_DOMAIN_SAMPLE_SIZE, candidates.length),
    );

    for (let i = 0; i < sample.length && pairs.length < maxPairs * 2; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        const b1 = sample[i];
        const b2 = sample[j];
        if (b1.domain === b2.domain || b1.url === b2.url) continue;

        const similarity = calculateComprehensiveSimilarity(b1, b2);
        // Higher bar across domains: a coincidental title match means less
        if (similarity.combined >= minSimilarity + 0.1) record(b1, b2, similarity, false);
      }
    }
  }

  const sortedPairs = pairs.sort((a, b) => b.similarity - a.similarity).slice(0, maxPairs);

  return {
    pairs: sortedPairs,
    stats: {
      total: sortedPairs.length,
      sameDomain: sortedPairs.filter((p) => p.sameDomain).length,
      crossDomain: sortedPairs.filter((p) => !p.sameDomain).length,
      avgSimilarity:
        sortedPairs.length > 0
          ? sortedPairs.reduce((sum, p) => sum + p.similarity, 0) / sortedPairs.length
          : 0,
    },
  };
}

/**
 * Deep metadata analysis for one bookmark: reading time, published date,
 * content quality, smart tags, topics and Schema.org-enhanced platform data.
 *
 * Returns only the fields to patch, so the caller can batch the writes. Pure —
 * no IndexedDB, so this runs in the analysis worker.
 *
 * @param {Object} bookmark
 * @returns {{id: string}|null} Patch object, or null when there is nothing to analyze.
 */
export function analyzeBookmarkDeep(bookmark) {
  if (!bookmark || !bookmark.rawMetadata || Object.keys(bookmark.rawMetadata).length === 0) {
    return null;
  }

  const analysis = analyzeBookmarkMetadata(bookmark);
  if (!analysis) return null;

  const patch = {
    id: bookmark.id,
    readingTime: analysis.readingTime,
    publishedDate: analysis.publishedDate,
    contentQualityScore: analysis.contentQualityScore,
    smartTags: analysis.smartTags,
    topics: detectTopics(bookmark),
  };

  if (bookmark.platformData) {
    const enhanced = enhanceWithSchemaOrg(bookmark.platformData, bookmark.rawMetadata);
    if (enhanced) {
      patch.platformData = enhanced;
      patch.contentType = enhanced.type;
    }
  }

  return patch;
}
