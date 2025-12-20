// Enhanced similarity detection using TF-IDF and cosine similarity
// Provides smarter duplicate and similar bookmark detection

import { getAllBookmarks, getCache, setCache } from './db.js';

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
