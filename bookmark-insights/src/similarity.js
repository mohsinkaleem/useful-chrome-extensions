// Similarity detection for duplicate and near-duplicate bookmarks.
// Uses normalized-URL matching plus fuzzy title comparison, with caching.

import { getAllBookmarks, getCache, setCache, CACHE_DURATIONS, CACHE_KEYS } from './db.js';

// Placeholder titles Chrome or the user left behind. Matched against the whole
// title (optionally with a trailing suffix) - a substring test would flag any
// title merely containing the word "bookmark", "link" or "page".
const GENERIC_TITLES = ['untitled', 'untitled document', 'new bookmark', 'bookmark', 'no title', 'link', 'page', 'home', 'homepage'];

// Hostnames that indicate a throwaway or local-development target. Matched
// against hostname labels, so dev.to and /latest.html are not false positives.
const TEMP_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const TEMP_HOST_LABELS = new Set(['staging', 'dev', 'test', 'preview', 'temp', 'local', 'sandbox']);

function isGenericTitle(title) {
  if (!title) return false;
  const normalized = title.trim().toLowerCase().replace(/[\s\-–—|:]+$/, '');
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
 * Get bookmarks from database
 */
async function getBookmarksCached() {
  return await getAllBookmarks();
}

// Calculate TF-IDF scores for a document

// Calculate cosine similarity between two TF-IDF vectors

// Extract meaningful words from bookmark

// Find similar bookmarks using TF-IDF and cosine similarity

// Find duplicate bookmarks (exact or very similar URLs)

// Find bookmarks that might be related (same domain, similar category)

// =============================================
// Improved On-Demand Similarity Computation
// =============================================

// =============================================
// Enhanced Fuzzy Similarity Detection
// =============================================

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  
  if (m === 0) return n;
  if (n === 0) return m;
  
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate fuzzy title similarity using normalized Levenshtein distance
 */
function fuzzyTitleSimilarity(title1, title2) {
  const t1 = title1.toLowerCase().trim();
  const t2 = title2.toLowerCase().trim();
  
  if (t1 === t2) return 1.0;
  
  const maxLen = Math.max(t1.length, t2.length);
  if (maxLen === 0) return 0;
  
  const distance = levenshteinDistance(t1, t2);
  return 1 - (distance / maxLen);
}

/**
 * Calculate word-level Jaccard similarity
 */
function wordJaccardSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  
  return intersection / union;
}

/**
 * Calculate metadata coverage score
 * Higher score = more metadata available for comparison
 */
function getMetadataCoverage(bookmark) {
  let coverage = 0;
  let fields = 0;
  
  if (bookmark.title && bookmark.title.length > 3) { coverage += 1; fields++; }
  if (bookmark.description && bookmark.description.length > 10) { coverage += 1; fields++; }
  if (bookmark.keywords && bookmark.keywords.length > 0) { coverage += 1; fields++; }
  if (bookmark.category) { coverage += 1; fields++; }
  if (bookmark.domain) { coverage += 1; fields++; }
  
  return { coverage, fields, percentage: fields > 0 ? (coverage / 5) * 100 : 0 };
}

/**
 * Calculate comprehensive similarity score using fuzzy matching and metadata
 */
function calculateComprehensiveSimilarity(bookmark1, bookmark2) {
  const scores = {
    titleFuzzy: 0,
    titleWords: 0,
    descriptionWords: 0,
    keywordsOverlap: 0,
    categoryMatch: 0,
    domainMatch: 0,
    urlPathSimilarity: 0
  };
  
  // 1. Fuzzy title similarity (edit distance)
  if (bookmark1.title && bookmark2.title) {
    scores.titleFuzzy = fuzzyTitleSimilarity(bookmark1.title, bookmark2.title);
    scores.titleWords = wordJaccardSimilarity(bookmark1.title, bookmark2.title);
  }
  
  // 2. Description word similarity
  if (bookmark1.description && bookmark2.description) {
    scores.descriptionWords = wordJaccardSimilarity(bookmark1.description, bookmark2.description);
  }
  
  // 3. Keywords overlap
  if (bookmark1.keywords?.length > 0 && bookmark2.keywords?.length > 0) {
    const kw1 = new Set(bookmark1.keywords.map(k => k.toLowerCase()));
    const kw2 = new Set(bookmark2.keywords.map(k => k.toLowerCase()));
    const intersection = [...kw1].filter(k => kw2.has(k)).length;
    const union = new Set([...kw1, ...kw2]).size;
    scores.keywordsOverlap = intersection / union;
  }
  
  // 4. Category match
  if (bookmark1.category && bookmark2.category) {
    scores.categoryMatch = bookmark1.category === bookmark2.category ? 1 : 0;
  }
  
  // 5. Domain match
  if (bookmark1.domain && bookmark2.domain) {
    scores.domainMatch = bookmark1.domain === bookmark2.domain ? 1 : 0;
  }
  
  // 6. URL path similarity (for same domain)
  if (scores.domainMatch === 1) {
    try {
      const path1 = new URL(bookmark1.url).pathname;
      const path2 = new URL(bookmark2.url).pathname;
      scores.urlPathSimilarity = fuzzyTitleSimilarity(path1, path2);
    } catch (e) {
      // Invalid URL
    }
  }
  
  // Calculate weighted combined score
  // Weight higher for same-domain comparisons
  let combinedScore;
  if (scores.domainMatch === 1) {
    // Same domain: emphasize title, path, and content similarity
    combinedScore = (
      scores.titleFuzzy * 0.25 +
      scores.titleWords * 0.20 +
      scores.urlPathSimilarity * 0.20 +
      scores.descriptionWords * 0.15 +
      scores.keywordsOverlap * 0.10 +
      scores.categoryMatch * 0.10
    );
  } else {
    // Different domain: emphasize content similarity
    combinedScore = (
      scores.titleFuzzy * 0.30 +
      scores.titleWords * 0.25 +
      scores.descriptionWords * 0.20 +
      scores.keywordsOverlap * 0.15 +
      scores.categoryMatch * 0.10
    );
  }
  
  return {
    combined: combinedScore,
    breakdown: scores,
    sameDomain: scores.domainMatch === 1,
    sameCategory: scores.categoryMatch === 1
  };
}

// Helper to yield control to main thread to prevent UI freezing
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Find similar bookmarks using enhanced fuzzy matching on same domain + metadata
 * Returns pairs with detailed comparison data for side-by-side viewing
 * Supports caching for faster subsequent loads
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
    onlyFromCache = false
  } = options;
  
  try {
    // Check cache first (unless forceRefresh)
    const cacheKey = `enhanced_similar_${minSimilarity}_${maxPairs}`;
    if (useCache && !forceRefresh) {
      const cached = await getCache(cacheKey);
      if (cached && cached.pairs && Date.now() - cached.timestamp < CACHE_DURATIONS[CACHE_KEYS.SIMILARITIES]) {
        console.log('Returning cached enhanced similar results');
        return { 
          pairs: cached.pairs, 
          stats: cached.stats,
          fromCache: true,
          cachedAt: cached.timestamp,
          cacheAge: Date.now() - cached.timestamp
        };
      }

      // If we only want from cache and none found, return empty
      if (onlyFromCache) {
        return { pairs: [], stats: null, fromCache: false, noCache: true };
      }
    }
    
    const bookmarks = await getBookmarksCached();
    
    if (bookmarks.length < 2) {
      return { pairs: [], stats: { total: 0, sameDomain: 0, crossDomain: 0 }, fromCache: false };
    }
    
    // Pre-filter bookmarks with sufficient metadata if required
    let candidateBookmarks = bookmarks;
    if (requireHighCoverage) {
      candidateBookmarks = bookmarks.filter(b => {
        const { percentage } = getMetadataCoverage(b);
        return percentage >= minCoveragePercent;
      });
    }
    
    // Group by domain for efficient same-domain comparison
    const domainGroups = new Map();
    candidateBookmarks.forEach(b => {
      const domain = b.domain || 'unknown';
      if (!domainGroups.has(domain)) {
        domainGroups.set(domain, []);
      }
      domainGroups.get(domain).push(b);
    });
    
    const pairs = [];
    let operationsCount = 0;
    const YIELD_THRESHOLD = 100; // Yield every 100 comparisons
    
    // Phase 1: Compare within same domains (highest priority)
    for (const groupBookmarks of domainGroups.values()) {
      if (groupBookmarks.length < 2) continue;
      
      for (let i = 0; i < groupBookmarks.length; i++) {
        for (let j = i + 1; j < groupBookmarks.length; j++) {
          operationsCount++;
          if (operationsCount % YIELD_THRESHOLD === 0) await yieldToMain();

          const b1 = groupBookmarks[i];
          const b2 = groupBookmarks[j];
          
          // Skip exact URL duplicates
          if (b1.url === b2.url) continue;
          
          const similarity = calculateComprehensiveSimilarity(b1, b2);
          
          if (similarity.combined >= minSimilarity) {
            pairs.push({
              bookmark1: b1,
              bookmark2: b2,
              similarity: similarity.combined,
              breakdown: similarity.breakdown,
              sameDomain: true,
              sameCategory: similarity.sameCategory,
              coverage1: getMetadataCoverage(b1),
              coverage2: getMetadataCoverage(b2)
            });
          }
        }
      }
    }
    
    // Phase 2: Cross-domain comparison (if we don't have enough pairs)
    if (!prioritizeSameDomain || pairs.length < maxPairs / 2) {
      // Sample bookmarks for cross-domain comparison (to avoid O(n²))
      const sampleSize = Math.min(200, candidateBookmarks.length);
      const sampledBookmarks = candidateBookmarks
        .sort(() => Math.random() - 0.5)
        .slice(0, sampleSize);
      
      for (let i = 0; i < sampledBookmarks.length; i++) {
        for (let j = i + 1; j < sampledBookmarks.length; j++) {
          operationsCount++;
          if (operationsCount % YIELD_THRESHOLD === 0) await yieldToMain();

          const b1 = sampledBookmarks[i];
          const b2 = sampledBookmarks[j];
          
          // Skip if same domain (already handled) or same URL
          if (b1.domain === b2.domain || b1.url === b2.url) continue;
          
          const similarity = calculateComprehensiveSimilarity(b1, b2);
          
          // Higher threshold for cross-domain
          if (similarity.combined >= minSimilarity + 0.1) {
            pairs.push({
              bookmark1: b1,
              bookmark2: b2,
              similarity: similarity.combined,
              breakdown: similarity.breakdown,
              sameDomain: false,
              sameCategory: similarity.sameCategory,
              coverage1: getMetadataCoverage(b1),
              coverage2: getMetadataCoverage(b2)
            });
          }
        }
        
        if (pairs.length >= maxPairs * 2) break;
      }
    }
    
    // Sort by similarity and limit
    const sortedPairs = pairs
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxPairs);
    
    // Calculate stats
    const stats = {
      total: sortedPairs.length,
      sameDomain: sortedPairs.filter(p => p.sameDomain).length,
      crossDomain: sortedPairs.filter(p => !p.sameDomain).length,
      avgSimilarity: sortedPairs.length > 0 
        ? sortedPairs.reduce((sum, p) => sum + p.similarity, 0) / sortedPairs.length 
        : 0
    };
    
    // Cache results for future use
    if (useCache) {
      await setCache(cacheKey, {
        pairs: sortedPairs,
        stats: stats,
        timestamp: Date.now()
      });
      console.log('Cached enhanced similar results');
    }
    
    return { pairs: sortedPairs, stats, fromCache: false };
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
function calculateUsefulnessScore(bookmark) {
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
  if (bookmark.isAlive === false) {
    score -= 40;
    reasons.push('Dead link');
  }
  
  const daysSinceCreated = (Date.now() - bookmark.dateAdded) / (1000 * 60 * 60 * 24);
  if (daysSinceCreated > 365 && !bookmark.lastAccessed) {
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
    isLikelyUseless: score < 30
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
    maxResults = 200
  } = options;
  
  try {
    const bookmarks = await getBookmarksCached();
    
    const results = {
      deadLinks: [],
      oldUnused: [],
      genericTitles: [],
      temporaryUrls: [],
      lowScore: [],
      summary: {
        total: 0,
        byCategory: {}
      }
    };
    
    const now = Date.now();
    const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000);
    
    for (const bookmark of bookmarks) {
      const usefulness = calculateUsefulnessScore(bookmark);
      const enrichedBookmark = {
        ...bookmark,
        usefulnessScore: usefulness.score,
        uselessReasons: usefulness.reasons
      };
      
      // Dead links
      if (includeDeadLinks && bookmark.isAlive === false) {
        results.deadLinks.push(enrichedBookmark);
      }
      
      // Old and never accessed
      if (includeOldUnused) {
        const isOld = bookmark.dateAdded < sixMonthsAgo;
        const neverAccessed = !bookmark.lastAccessed && (!bookmark.accessCount || bookmark.accessCount === 0);
        if (isOld && neverAccessed) {
          results.oldUnused.push(enrichedBookmark);
        }
      }
      
      // Generic titles
      if (includeGeneric && isGenericTitle(bookmark.title)) {
        results.genericTitles.push(enrichedBookmark);
      }
      
      // Temporary/dev URLs
      if (includeTemp && isTemporaryUrl(bookmark.url)) {
        results.temporaryUrls.push(enrichedBookmark);
      }
      
      // Low usefulness score (catch-all for other issues)
      if (includeLowScore && usefulness.score < 25) {
        // Avoid duplicates
        if (!results.deadLinks.some(b => b.id === bookmark.id) &&
            !results.oldUnused.some(b => b.id === bookmark.id) &&
            !results.genericTitles.some(b => b.id === bookmark.id) &&
            !results.temporaryUrls.some(b => b.id === bookmark.id)) {
          results.lowScore.push(enrichedBookmark);
        }
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
      total: results.deadLinks.length + results.oldUnused.length + 
             results.genericTitles.length + results.temporaryUrls.length + results.lowScore.length,
      byCategory: {
        deadLinks: results.deadLinks.length,
        oldUnused: results.oldUnused.length,
        genericTitles: results.genericTitles.length,
        temporaryUrls: results.temporaryUrls.length,
        lowScore: results.lowScore.length
      }
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
      summary: { total: 0, byCategory: {} }
    };
  }
}

