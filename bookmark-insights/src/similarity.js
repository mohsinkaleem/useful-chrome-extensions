// Enhanced similarity detection using TF-IDF and cosine similarity
// Provides smarter duplicate and similar bookmark detection
// Now with on-demand computation and caching for better performance

import { getAllBookmarks, getCache, setCache, getCachedMetric, CACHE_DURATIONS, getBookmark, getBookmarksByDomain, getBookmarksByCategory, storeSimilarities, getStoredSimilarities } from './db.js';

// Calculate TF-IDF scores for a document
function calculateTFIDF(documents) {
  const N = documents.length;
  const idf = new Map(); // Inverse document frequency
  const tf = []; // Term frequency per document
  
  // Calculate term frequencies
  documents.forEach(doc => {
    const termFreq = new Map();
    const words = doc.words;
    const totalWords = words.length;
    
    words.forEach(word => {
      termFreq.set(word, (termFreq.get(word) || 0) + 1);
    });
    
    // Normalize by document length
    const normalized = new Map();
    for (const [word, freq] of termFreq.entries()) {
      normalized.set(word, freq / totalWords);
    }
    
    tf.push({ id: doc.id, terms: normalized, words: new Set(words) });
  });
  
  // Calculate document frequencies
  const df = new Map();
  documents.forEach(doc => {
    const uniqueWords = new Set(doc.words);
    uniqueWords.forEach(word => {
      df.set(word, (df.get(word) || 0) + 1);
    });
  });
  
  // Calculate IDF
  for (const [word, docFreq] of df.entries()) {
    idf.set(word, Math.log(N / docFreq));
  }
  
  // Calculate TF-IDF
  const tfidf = tf.map(doc => {
    const scores = new Map();
    for (const [word, tfScore] of doc.terms.entries()) {
      const idfScore = idf.get(word) || 0;
      scores.set(word, tfScore * idfScore);
    }
    return { id: doc.id, scores, words: doc.words };
  });
  
  return tfidf;
}

// Calculate cosine similarity between two TF-IDF vectors
function cosineSimilarity(vec1, vec2) {
  const words1 = vec1.words;
  const words2 = vec2.words;
  const commonWords = [...words1].filter(w => words2.has(w));
  
  if (commonWords.length === 0) {
    return 0;
  }
  
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  
  // Calculate dot product and magnitudes
  for (const word of commonWords) {
    const score1 = vec1.scores.get(word) || 0;
    const score2 = vec2.scores.get(word) || 0;
    dotProduct += score1 * score2;
  }
  
  for (const [, score] of vec1.scores) {
    magnitude1 += score * score;
  }
  
  for (const [, score] of vec2.scores) {
    magnitude2 += score * score;
  }
  
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);
  
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }
  
  return dotProduct / (magnitude1 * magnitude2);
}

// Extract meaningful words from bookmark
function extractWords(bookmark) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'about', 'from', 'up', 'out',
    'into', 'over', 'under', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their'
  ]);
  
  const words = [];
  
  // Extract from title (weight: 3)
  if (bookmark.title) {
    const titleWords = bookmark.title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    words.push(...titleWords, ...titleWords, ...titleWords); // Triple weight
  }
  
  // Extract from description (weight: 2)
  if (bookmark.description) {
    const descWords = bookmark.description
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 20); // Limit description words
    words.push(...descWords, ...descWords); // Double weight
  }
  
  // Extract from keywords (weight: 2)
  if (bookmark.keywords && Array.isArray(bookmark.keywords)) {
    const keywordWords = bookmark.keywords
      .map(k => k.toLowerCase())
      .filter(w => w.length > 2 && !stopWords.has(w));
    words.push(...keywordWords, ...keywordWords); // Double weight
  }
  
  // Add category (weight: 1)
  if (bookmark.category) {
    words.push(bookmark.category.toLowerCase());
  }
  
  return words;
}

// Find similar bookmarks using TF-IDF and cosine similarity
export async function findSimilarBookmarksEnhanced(threshold = 0.3, maxPairs = 100) {
  try {
    // Check cache first
    const cacheKey = `similar_bookmarks_${threshold}`;
    const cached = await getCache(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
      return cached.results;
    }
    
    const bookmarks = await getAllBookmarks();
    
    if (bookmarks.length < 2) {
      return [];
    }
    
    // Prepare documents with extracted words
    const documents = bookmarks.map(b => ({
      id: b.id,
      bookmark: b,
      words: extractWords(b)
    })).filter(doc => doc.words.length > 0);
    
    // Calculate TF-IDF vectors
    const tfidfVectors = calculateTFIDF(documents);
    
    // Calculate similarities
    const similarities = [];
    
    for (let i = 0; i < tfidfVectors.length; i++) {
      for (let j = i + 1; j < tfidfVectors.length; j++) {
        const bookmark1 = documents[i].bookmark;
        const bookmark2 = documents[j].bookmark;
        
        // Skip if same URL (duplicates)
        if (bookmark1.url === bookmark2.url) {
          continue;
        }
        
        const similarity = cosineSimilarity(tfidfVectors[i], tfidfVectors[j]);
        
        if (similarity >= threshold) {
          similarities.push({
            bookmark1,
            bookmark2,
            similarity,
            commonCategory: bookmark1.category && bookmark1.category === bookmark2.category,
            sameDomain: bookmark1.domain === bookmark2.domain
          });
        }
        
        // Early exit if we have enough
        if (similarities.length >= maxPairs * 3) {
          break;
        }
      }
      
      if (similarities.length >= maxPairs * 3) {
        break;
      }
    }
    
    // Sort by similarity score
    const results = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxPairs)
      .map(s => [s.bookmark1, s.bookmark2, s.similarity, s.commonCategory, s.sameDomain]);
    
    // Cache results
    await setCache(cacheKey, {
      results,
      timestamp: Date.now(),
      count: results.length
    });
    
    return results;
  } catch (error) {
    console.error('Error finding similar bookmarks:', error);
    return [];
  }
}

// Find duplicate bookmarks (exact or very similar URLs)
export async function findDuplicatesEnhanced() {
  try {
    const bookmarks = await getAllBookmarks();
    const urlMap = new Map();
    const normalizedUrlMap = new Map();
    
    bookmarks.forEach(bookmark => {
      // Exact URL matching
      const url = bookmark.url;
      if (!urlMap.has(url)) {
        urlMap.set(url, []);
      }
      urlMap.get(url).push(bookmark);
      
      // Normalized URL matching (remove protocol, www, trailing slash, query params)
      try {
        const urlObj = new URL(bookmark.url);
        const normalized = urlObj.hostname.replace(/^www\./, '') + urlObj.pathname.replace(/\/$/, '');
        
        if (!normalizedUrlMap.has(normalized)) {
          normalizedUrlMap.set(normalized, []);
        }
        normalizedUrlMap.get(normalized).push(bookmark);
      } catch (e) {
        // Invalid URL, skip normalization
      }
    });
    
    // Find exact duplicates
    const exactDuplicates = Array.from(urlMap.values())
      .filter(group => group.length > 1)
      .map(group => ({ type: 'exact', bookmarks: group }));
    
    // Find similar URLs (different query params, etc.)
    const similarUrls = Array.from(normalizedUrlMap.values())
      .filter(group => group.length > 1)
      .map(group => {
        // Check if they're not already in exact duplicates
        const urls = new Set(group.map(b => b.url));
        if (urls.size > 1) {
          return { type: 'similar', bookmarks: group };
        }
        return null;
      })
      .filter(g => g !== null);
    
    return {
      exact: exactDuplicates,
      similar: similarUrls,
      total: exactDuplicates.length + similarUrls.length
    };
  } catch (error) {
    console.error('Error finding duplicates:', error);
    return { exact: [], similar: [], total: 0 };
  }
}

// Find bookmarks that might be related (same domain, similar category)
export async function findRelatedBookmarks(bookmarkId, limit = 10) {
  try {
    const bookmarks = await getAllBookmarks();
    const targetBookmark = bookmarks.find(b => b.id === bookmarkId);
    
    if (!targetBookmark) {
      return [];
    }
    
    // Prepare target document
    const targetDoc = {
      id: targetBookmark.id,
      bookmark: targetBookmark,
      words: extractWords(targetBookmark)
    };
    
    // Prepare other documents
    const otherDocs = bookmarks
      .filter(b => b.id !== bookmarkId)
      .map(b => ({
        id: b.id,
        bookmark: b,
        words: extractWords(b)
      }))
      .filter(doc => doc.words.length > 0);
    
    // Calculate TF-IDF for all documents including target
    const allDocs = [targetDoc, ...otherDocs];
    const tfidfVectors = calculateTFIDF(allDocs);
    
    // Find target vector
    const targetVector = tfidfVectors[0];
    
    // Calculate similarities with other bookmarks
    const similarities = otherDocs.map((doc, index) => {
      const similarity = cosineSimilarity(targetVector, tfidfVectors[index + 1]);
      
      // Boost score for same domain or category
      let boostedScore = similarity;
      if (doc.bookmark.domain === targetBookmark.domain) {
        boostedScore *= 1.5;
      }
      if (doc.bookmark.category && doc.bookmark.category === targetBookmark.category) {
        boostedScore *= 1.3;
      }
      
      return {
        bookmark: doc.bookmark,
        similarity: boostedScore,
        sameDomain: doc.bookmark.domain === targetBookmark.domain,
        sameCategory: doc.bookmark.category === targetBookmark.category
      };
    });
    
    // Sort and return top results
    return similarities
      .filter(s => s.similarity > 0.1)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } catch (error) {
    console.error('Error finding related bookmarks:', error);
    return [];
  }
}

// =============================================
// Improved On-Demand Similarity Computation
// =============================================

/**
 * Find candidates for similarity comparison using pre-filtering
 * This dramatically reduces O(n²) complexity by only comparing relevant bookmarks
 * @param {Object} bookmark - Target bookmark
 * @returns {Promise<Array>} Array of candidate bookmarks
 */
async function findSimilarCandidates(bookmark) {
  const candidates = new Map();
  
  // Step 1: Same domain bookmarks (most likely similar) - limit 50
  try {
    const sameDomain = await getBookmarksByDomain(bookmark.domain);
    sameDomain
      .filter(b => b.id !== bookmark.id)
      .slice(0, 50)
      .forEach(b => candidates.set(b.id, b));
  } catch (e) {
    // Domain query might not be available
  }
  
  // Step 2: Same category bookmarks - limit 30
  if (bookmark.category) {
    try {
      const sameCategory = await getBookmarksByCategory(bookmark.category);
      sameCategory
        .filter(b => b.id !== bookmark.id)
        .slice(0, 30)
        .forEach(b => candidates.set(b.id, b));
    } catch (e) {
      // Category query might not be available
    }
  }
  
  // Step 3: If we have keywords, look for bookmarks with matching keywords
  if (bookmark.keywords && bookmark.keywords.length > 0) {
    const allBookmarks = await getAllBookmarks();
    const keywordSet = new Set(bookmark.keywords.map(k => k.toLowerCase()));
    
    allBookmarks
      .filter(b => 
        b.id !== bookmark.id && 
        b.keywords && 
        b.keywords.some(k => keywordSet.has(k.toLowerCase()))
      )
      .slice(0, 20)
      .forEach(b => candidates.set(b.id, b));
  }
  
  return Array.from(candidates.values());
}

/**
 * Compute similarity for a single bookmark and store results
 * Call this after enrichment to pre-compute similarities
 * @param {string} bookmarkId - Bookmark ID
 * @param {number} topN - Number of similar bookmarks to store
 * @returns {Promise<Array>} Array of similar bookmarks
 */
export async function computeSimilarityForBookmark(bookmarkId, topN = 10) {
  try {
    const bookmark = await getBookmark(bookmarkId);
    if (!bookmark) return [];
    
    // Get candidates (pre-filtered for performance)
    const candidates = await findSimilarCandidates(bookmark);
    
    if (candidates.length === 0) {
      await storeSimilarities(bookmarkId, []);
      return [];
    }
    
    // Prepare documents
    const targetDoc = { id: bookmark.id, bookmark, words: extractWords(bookmark) };
    
    if (targetDoc.words.length === 0) {
      await storeSimilarities(bookmarkId, []);
      return [];
    }
    
    const candidateDocs = candidates
      .map(b => ({ id: b.id, bookmark: b, words: extractWords(b) }))
      .filter(doc => doc.words.length > 0);
    
    // Calculate TF-IDF
    const allDocs = [targetDoc, ...candidateDocs];
    const tfidfVectors = calculateTFIDF(allDocs);
    const targetVector = tfidfVectors[0];
    
    // Compute similarities
    const similarities = candidateDocs.map((doc, index) => {
      const score = cosineSimilarity(targetVector, tfidfVectors[index + 1]);
      return {
        bookmark2Id: doc.id,
        score,
        sameDomain: doc.bookmark.domain === bookmark.domain,
        sameCategory: doc.bookmark.category === bookmark.category
      };
    });
    
    // Sort and get top N
    const topSimilar = similarities
      .filter(s => s.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
    
    // Store results
    await storeSimilarities(bookmarkId, topSimilar);
    
    return topSimilar;
  } catch (error) {
    console.error('Error computing similarity for bookmark:', error);
    return [];
  }
}

/**
 * Get similar bookmarks with caching
 * First checks stored similarities, computes if needed
 * @param {string} bookmarkId - Bookmark ID
 * @returns {Promise<Array>} Array of similar bookmarks with details
 */
export async function getSimilarBookmarksWithCache(bookmarkId) {
  try {
    // Check for stored similarities
    const stored = await getStoredSimilarities(bookmarkId);
    
    if (stored && stored.length > 0) {
      // Check freshness (24 hours)
      const isStale = stored.some(s => 
        !s.computedAt || (Date.now() - s.computedAt > CACHE_DURATIONS.similarities)
      );
      
      if (!isStale) {
        // Enrich with bookmark details
        const allBookmarks = await getAllBookmarks();
        const bookmarkMap = new Map(allBookmarks.map(b => [b.id, b]));
        
        return stored.map(s => ({
          bookmark: bookmarkMap.get(s.bookmark2Id),
          score: s.score,
          sameDomain: s.sameDomain,
          sameCategory: s.sameCategory
        })).filter(s => s.bookmark);
      }
    }
    
    // Compute fresh similarities
    const computed = await computeSimilarityForBookmark(bookmarkId);
    
    // Enrich with bookmark details
    const allBookmarks = await getAllBookmarks();
    const bookmarkMap = new Map(allBookmarks.map(b => [b.id, b]));
    
    return computed.map(s => ({
      bookmark: bookmarkMap.get(s.bookmark2Id),
      score: s.score,
      sameDomain: s.sameDomain,
      sameCategory: s.sameCategory
    })).filter(s => s.bookmark);
  } catch (error) {
    console.error('Error getting similar bookmarks with cache:', error);
    return [];
  }
}

/**
 * Batch compute similarities for all enriched bookmarks
 * Run this as a background task after bulk enrichment
 * @param {Function} progressCallback - Progress callback function
 */
export async function batchComputeSimilarities(progressCallback = null) {
  try {
    const bookmarks = await getAllBookmarks();
    const enrichedBookmarks = bookmarks.filter(b => b.lastChecked);
    
    let completed = 0;
    const total = enrichedBookmarks.length;
    
    for (const bookmark of enrichedBookmarks) {
      await computeSimilarityForBookmark(bookmark.id);
      completed++;
      
      if (progressCallback && completed % 10 === 0) {
        progressCallback({
          completed,
          total,
          percentage: Math.round((completed / total) * 100)
        });
      }
    }
    
    return { completed, total };
  } catch (error) {
    console.error('Error batch computing similarities:', error);
    return { completed: 0, total: 0, error };
  }
}

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

/**
 * Find similar bookmarks using enhanced fuzzy matching on same domain + metadata
 * Returns pairs with detailed comparison data for side-by-side viewing
 */
export async function findSimilarBookmarksEnhancedFuzzy(options = {}) {
  const {
    minSimilarity = 0.5,
    maxPairs = 100,
    prioritizeSameDomain = true,
    requireHighCoverage = false,
    minCoveragePercent = 40
  } = options;
  
  try {
    const bookmarks = await getAllBookmarks();
    
    if (bookmarks.length < 2) {
      return { pairs: [], stats: { total: 0, sameDomain: 0, crossDomain: 0 } };
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
    
    // Phase 1: Compare within same domains (highest priority)
    for (const [domain, groupBookmarks] of domainGroups.entries()) {
      if (groupBookmarks.length < 2) continue;
      
      for (let i = 0; i < groupBookmarks.length; i++) {
        for (let j = i + 1; j < groupBookmarks.length; j++) {
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
    
    return { pairs: sortedPairs, stats };
  } catch (error) {
    console.error('Error finding similar bookmarks with fuzzy matching:', error);
    return { pairs: [], stats: { total: 0, sameDomain: 0, crossDomain: 0 } };
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
  const genericTitles = ['untitled', 'new bookmark', 'bookmark', 'link', 'page'];
  if (bookmark.title && genericTitles.some(g => bookmark.title.toLowerCase().includes(g))) {
    score -= 15;
    reasons.push('Generic title');
  }
  
  // Check for temporary/dev URLs
  const tempPatterns = ['localhost', '127.0.0.1', 'staging', 'dev.', 'test.', 'preview.'];
  if (bookmark.url && tempPatterns.some(p => bookmark.url.toLowerCase().includes(p))) {
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
    const bookmarks = await getAllBookmarks();
    
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
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000);
    
    const genericPatterns = ['untitled', 'new bookmark', 'bookmark', 'no title', 'link'];
    const tempPatterns = ['localhost', '127.0.0.1', '192.168.', '10.0.', 'staging.', 'dev.', 'test.', 'preview.', 'temp.'];
    
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
      if (includeGeneric && bookmark.title) {
        const lowerTitle = bookmark.title.toLowerCase();
        if (genericPatterns.some(p => lowerTitle === p || lowerTitle.startsWith(p + ' '))) {
          results.genericTitles.push(enrichedBookmark);
        }
      }
      
      // Temporary/dev URLs
      if (includeTemp && bookmark.url) {
        const lowerUrl = bookmark.url.toLowerCase();
        if (tempPatterns.some(p => lowerUrl.includes(p))) {
          results.temporaryUrls.push(enrichedBookmark);
        }
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

/**
 * Get all unique IDs from useless bookmarks results
 * Useful for bulk deletion
 */
export function getUselessBookmarkIds(uselessResults) {
  const ids = new Set();
  
  uselessResults.deadLinks?.forEach(b => ids.add(b.id));
  uselessResults.oldUnused?.forEach(b => ids.add(b.id));
  uselessResults.genericTitles?.forEach(b => ids.add(b.id));
  uselessResults.temporaryUrls?.forEach(b => ids.add(b.id));
  uselessResults.lowScore?.forEach(b => ids.add(b.id));
  
  return Array.from(ids);
}

