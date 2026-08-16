// Similarity detection for duplicate and near-duplicate bookmarks.
// Uses normalized-URL matching plus fuzzy title comparison, with caching.

import { getAllBookmarks, getCache, setCache, CACHE_DURATIONS, CACHE_KEYS } from './db.js';
import { hasAccessData, isDead, isNeverAccessed } from './predicates.js';
import { runSimilarityAnalysis } from './analysis-client.js';

// Placeholder titles Chrome or the user left behind. Matched against the whole
// title (optionally with a trailing suffix) - a substring test would flag any
// title merely containing the word "bookmark", "link" or "page".
const GENERIC_TITLES = [
  'untitled',
  'untitled document',
  'new bookmark',
  'bookmark',
  'no title',
  'link',
  'page',
  'home',
  'homepage',
];

// Hostnames that indicate a throwaway or local-development target. Matched
// against hostname labels, so dev.to and /latest.html are not false positives.
const TEMP_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const TEMP_HOST_LABELS = new Set(['staging', 'dev', 'test', 'preview', 'temp', 'local', 'sandbox']);

function isGenericTitle(title) {
  if (!title) return false;
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—|:]+$/, '');
  return GENERIC_TITLES.includes(normalized);
}

function isTemporaryUrl(url) {
  if (!url) return false;
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (TEMP_HOSTNAMES.has(hostname)) return true;
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  // Only the leading label counts: dev.example.com is a dev host, dev.to is not.
  return TEMP_HOST_LABELS.has(hostname.split('.')[0]) && hostname.includes('.');
}

/**
 * Get bookmarks from database (corpus-cached in db.js)
 */
const getBookmarksCached = getAllBookmarks;

// =============================================
// Enhanced Fuzzy Similarity Detection
// =============================================

/**
 * Find similar bookmarks using fuzzy title/metadata matching.
 * Returns pairs with the per-signal breakdown the side-by-side view renders.
 * The scoring itself runs in a Web Worker (see analysis-client.js); this
 * function only handles the cache round-trip around it.
 */
export async function findSimilarBookmarksEnhancedFuzzy(options = {}) {
  const {
    minSimilarity = 0.5,
    maxPairs = 100,
    prioritizeSameDomain = true,
    requireHighCoverage = false,
    minCoveragePercent = 40,
    useCache = true,
    forceRefresh = false,
    onlyFromCache = false,
  } = options;

  try {
    const cacheKey = `enhanced_similar_${minSimilarity}_${maxPairs}`;

    if (useCache && !forceRefresh) {
      const cached = await getCache(cacheKey);
      if (
        cached &&
        cached.pairs &&
        Date.now() - cached.timestamp < CACHE_DURATIONS[CACHE_KEYS.SIMILARITIES]
      ) {
        return {
          pairs: cached.pairs,
          stats: cached.stats,
          fromCache: true,
          cachedAt: cached.timestamp,
          cacheAge: Date.now() - cached.timestamp,
        };
      }

      if (onlyFromCache) {
        return { pairs: [], stats: null, fromCache: false, noCache: true };
      }
    }

    const bookmarks = await getBookmarksCached();

    if (bookmarks.length < 2) {
      return { pairs: [], stats: { total: 0, sameDomain: 0, crossDomain: 0 }, fromCache: false };
    }

    const { pairs, stats } = await runSimilarityAnalysis(bookmarks, {
      minSimilarity,
      maxPairs,
      prioritizeSameDomain,
      requireHighCoverage,
      minCoveragePercent,
    });

    if (useCache) {
      await setCache(cacheKey, { pairs, stats, timestamp: Date.now() });
    }

    return { pairs, stats, fromCache: false };
  } catch (error) {
    console.error('Error finding similar bookmarks with fuzzy matching:', error);
    return { pairs: [], stats: { total: 0, sameDomain: 0, crossDomain: 0 }, fromCache: false };
  }
}

// =============================================
// Useless Links Detection
// =============================================

/**
 * Calculate a "usefulness score" for a bookmark
 * Lower score = more likely to be useless
 */
function calculateUsefulnessScore(bookmark, hasVisitData = true) {
  let score = 50; // Start at neutral
  const reasons = [];

  // Positive factors
  if (bookmark.accessCount > 0) {
    score += Math.min(bookmark.accessCount * 5, 20); // Max +20 for access
    reasons.push(`Accessed ${bookmark.accessCount}x`);
  }

  if (bookmark.lastAccessed) {
    const daysSinceAccess = (Date.now() - bookmark.lastAccessed) / (1000 * 60 * 60 * 24);
    if (daysSinceAccess < 30) {
      score += 15;
      reasons.push('Accessed recently');
    } else if (daysSinceAccess < 90) {
      score += 5;
    }
  }

  if (bookmark.description && bookmark.description.length > 20) {
    score += 5;
    reasons.push('Has description');
  }

  if (bookmark.category) {
    score += 5;
    reasons.push('Categorized');
  }

  if (bookmark.keywords && bookmark.keywords.length > 0) {
    score += 5;
    reasons.push('Has keywords');
  }

  // Negative factors
  if (isDead(bookmark)) {
    score -= 40;
    reasons.push('Dead link');
  }

  // Only a real signal when visit tracking has actually produced data. With
  // tracking off - the default - accessCount is 0 everywhere, so this penalty
  // applied to nearly every bookmark in the library and depressed the whole
  // score distribution rather than distinguishing anything.
  const daysSinceCreated = (Date.now() - bookmark.dateAdded) / (1000 * 60 * 60 * 24);
  if (hasVisitData && daysSinceCreated > 365 && isNeverAccessed(bookmark)) {
    score -= 20;
    reasons.push('Old & never accessed');
  }

  if (!bookmark.title || bookmark.title.length < 5) {
    score -= 10;
    reasons.push('Poor title');
  }

  // Check for generic/placeholder titles
  if (isGenericTitle(bookmark.title)) {
    score -= 15;
    reasons.push('Generic title');
  }

  // Check for temporary/dev URLs
  if (isTemporaryUrl(bookmark.url)) {
    score -= 20;
    reasons.push('Temporary/dev URL');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    isLikelyUseless: score < 30,
  };
}

/**
 * Find potentially useless bookmarks
 * Returns bookmarks categorized by type of issue
 */
export async function findUselessBookmarks(options = {}) {
  const {
    includeDeadLinks = true,
    includeOldUnused = true,
    includeGeneric = true,
    includeTemp = true,
    includeLowScore = true,
    maxResults = 200,
  } = options;

  try {
    const bookmarks = await getBookmarksCached();
    // Reported back so the UI can label the access-derived panels honestly
    // rather than presenting "we never saw you open this" as "you never did".
    const hasVisitData = hasAccessData(bookmarks);

    const results = {
      deadLinks: [],
      oldUnused: [],
      genericTitles: [],
      temporaryUrls: [],
      lowScore: [],
      hasVisitData,
      summary: {
        total: 0,
        byCategory: {},
      },
    };

    const now = Date.now();
    const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;

    // The low-score catch-all only takes bookmarks no other category claimed.
    // This used to be four `.some()` scans over four growing arrays per bookmark.
    const categorized = new Set();

    for (const bookmark of bookmarks) {
      const usefulness = calculateUsefulnessScore(bookmark, hasVisitData);
      const enrichedBookmark = {
        ...bookmark,
        usefulnessScore: usefulness.score,
        uselessReasons: usefulness.reasons,
      };

      // Dead links
      if (includeDeadLinks && isDead(bookmark)) {
        results.deadLinks.push(enrichedBookmark);
        categorized.add(bookmark.id);
      }

      // Old and never accessed
      if (includeOldUnused) {
        if (bookmark.dateAdded < sixMonthsAgo && isNeverAccessed(bookmark)) {
          results.oldUnused.push(enrichedBookmark);
          categorized.add(bookmark.id);
        }
      }

      // Generic titles
      if (includeGeneric && isGenericTitle(bookmark.title)) {
        results.genericTitles.push(enrichedBookmark);
        categorized.add(bookmark.id);
      }

      // Temporary/dev URLs
      if (includeTemp && isTemporaryUrl(bookmark.url)) {
        results.temporaryUrls.push(enrichedBookmark);
        categorized.add(bookmark.id);
      }

      // Low usefulness score (catch-all for other issues)
      if (includeLowScore && usefulness.score < 25 && !categorized.has(bookmark.id)) {
        results.lowScore.push(enrichedBookmark);
      }
    }

    // Sort each category by usefulness score
    results.deadLinks.sort((a, b) => a.usefulnessScore - b.usefulnessScore);
    results.oldUnused.sort((a, b) => a.usefulnessScore - b.usefulnessScore);
    results.genericTitles.sort((a, b) => a.usefulnessScore - b.usefulnessScore);
    results.temporaryUrls.sort((a, b) => a.usefulnessScore - b.usefulnessScore);
    results.lowScore.sort((a, b) => a.usefulnessScore - b.usefulnessScore);

    // Limit results
    results.deadLinks = results.deadLinks.slice(0, maxResults);
    results.oldUnused = results.oldUnused.slice(0, maxResults);
    results.genericTitles = results.genericTitles.slice(0, maxResults);
    results.temporaryUrls = results.temporaryUrls.slice(0, maxResults);
    results.lowScore = results.lowScore.slice(0, maxResults);

    // Calculate summary
    results.summary = {
      total:
        results.deadLinks.length +
        results.oldUnused.length +
        results.genericTitles.length +
        results.temporaryUrls.length +
        results.lowScore.length,
      byCategory: {
        deadLinks: results.deadLinks.length,
        oldUnused: results.oldUnused.length,
        genericTitles: results.genericTitles.length,
        temporaryUrls: results.temporaryUrls.length,
        lowScore: results.lowScore.length,
      },
    };

    return results;
  } catch (error) {
    console.error('Error finding useless bookmarks:', error);
    return {
      deadLinks: [],
      oldUnused: [],
      genericTitles: [],
      temporaryUrls: [],
      lowScore: [],
      hasVisitData: true,
      summary: { total: 0, byCategory: {} },
    };
  }
}
