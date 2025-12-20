// FlexSearch integration for powerful bookmark search
// Provides fuzzy matching, relevance ranking, and multi-field search

import { Document } from 'flexsearch';
import { db, getAllBookmarks, setCache, getCache } from './db.js';

// FlexSearch index instance
let searchIndex = null;
let indexInitialized = false;

// Initialize FlexSearch index with optimized configuration
export async function initializeSearchIndex() {
  if (indexInitialized) {
    return searchIndex;
  }

  console.log('Initializing FlexSearch index...');

  // Try to load serialized index from cache
  const cachedIndex = await getCache('flexsearch_index');
  
  if (cachedIndex && cachedIndex.serialized) {
    try {
      searchIndex = new Document({
        document: {
          id: 'id',
          index: ['title', 'url', 'description', 'keywords', 'category', 'domain'],
          store: true
        },
        tokenize: 'forward',
        cache: true,
        optimize: true,
        resolution: 9,
        context: {
          depth: 3,
          bidirectional: true
        }
      });
      
      // Import serialized data
      searchIndex.import(cachedIndex.serialized);
      indexInitialized = true;
      console.log('Loaded FlexSearch index from cache');
      return searchIndex;
    } catch (error) {
      console.error('Error loading cached index:', error);
      // Fall through to rebuild
    }
  }

  // Build new index
  await rebuildSearchIndex();
  return searchIndex;
}

// Rebuild the entire search index from bookmarks
export async function rebuildSearchIndex() {
  console.log('Building FlexSearch index...');
  
  searchIndex = new Document({
    document: {
      id: 'id',
      index: ['title', 'url', 'description', 'keywords', 'category', 'domain'],
      store: true
    },
    tokenize: 'forward',
    cache: true,
    optimize: true,
    resolution: 9,
    context: {
      depth: 3,
      bidirectional: true
    }
  });

  const bookmarks = await getAllBookmarks();
  
  // Add all bookmarks to index
  for (const bookmark of bookmarks) {
    await addToIndex(bookmark);
  }

  indexInitialized = true;
  
  // Cache the serialized index
  try {
    const serialized = await searchIndex.export();
    await setCache('flexsearch_index', { serialized, timestamp: Date.now() });
    console.log(`Indexed ${bookmarks.length} bookmarks`);
  } catch (error) {
    console.error('Error caching index:', error);
  }

  return searchIndex;
}

// Add a bookmark to the search index
export async function addToIndex(bookmark) {
  if (!searchIndex) {
    await initializeSearchIndex();
  }

  // Prepare document for indexing
  const doc = {
    id: bookmark.id,
    title: bookmark.title || '',
    url: bookmark.url || '',
    description: bookmark.description || '',
    keywords: Array.isArray(bookmark.keywords) ? bookmark.keywords.join(' ') : '',
    category: bookmark.category || '',
    domain: bookmark.domain || ''
  };

  await searchIndex.add(doc);
}

// Remove a bookmark from the search index
export async function removeFromIndex(bookmarkId) {
  if (!searchIndex) {
    return;
  }

  await searchIndex.remove(bookmarkId);
}

// Update a bookmark in the search index
export async function updateInIndex(bookmark) {
  await removeFromIndex(bookmark.id);
  await addToIndex(bookmark);
}

// Search bookmarks with FlexSearch
export async function searchBookmarks(query, options = {}) {
  if (!query || !query.trim()) {
    // Return all bookmarks sorted by date if no query
    const bookmarks = await getAllBookmarks();
    return bookmarks
      .sort((a, b) => b.dateAdded - a.dateAdded)
      .slice(0, options.limit || 100);
  }

  if (!searchIndex) {
    await initializeSearchIndex();
  }

  const {
    limit = 50,
    offset = 0,
    fields = ['title', 'url', 'description', 'keywords', 'category'],
    boost = {
      title: 3,
      category: 2,
      keywords: 2,
      description: 1,
      url: 1,
      domain: 1
    }
  } = options;

  try {
    // Perform search across specified fields
    const results = await searchIndex.search(query, {
      index: fields,
      limit: limit + offset,
      offset: 0,
      enrich: true,
      boost: boost
    });

    // Flatten and deduplicate results
    const resultMap = new Map();
    
    for (const fieldResult of results) {
      if (fieldResult && fieldResult.result) {
        for (const item of fieldResult.result) {
          const id = item.id;
          if (!resultMap.has(id)) {
            resultMap.set(id, {
              id: item.id,
              doc: item.doc,
              score: 1,
              matchedFields: [fieldResult.field]
            });
          } else {
            const existing = resultMap.get(id);
            existing.score += 1;
            existing.matchedFields.push(fieldResult.field);
          }
        }
      }
    }

    // Convert to array and sort by score
    let finalResults = Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score);

    // Apply offset and limit
    if (offset > 0) {
      finalResults = finalResults.slice(offset);
    }
    if (limit > 0) {
      finalResults = finalResults.slice(0, limit);
    }

    // Get full bookmark data from IndexedDB
    const bookmarkIds = finalResults.map(r => r.id);
    const bookmarks = await Promise.all(
      bookmarkIds.map(id => db.bookmarks.get(id))
    );

    // Merge with search metadata
    return bookmarks
      .filter(b => b !== undefined)
      .map((bookmark, index) => ({
        ...bookmark,
        _searchScore: finalResults[index].score,
        _matchedFields: finalResults[index].matchedFields
      }));
  } catch (error) {
    console.error('Search error:', error);
    // Fallback to basic search
    return fallbackSearch(query, limit);
  }
}

// Fallback search using simple string matching (if FlexSearch fails)
async function fallbackSearch(query, limit = 50) {
  console.log('Using fallback search');
  const bookmarks = await getAllBookmarks();
  const lowerQuery = query.toLowerCase();

  return bookmarks
    .filter(bookmark => 
      (bookmark.title && bookmark.title.toLowerCase().includes(lowerQuery)) ||
      (bookmark.url && bookmark.url.toLowerCase().includes(lowerQuery)) ||
      (bookmark.description && bookmark.description.toLowerCase().includes(lowerQuery)) ||
      (bookmark.domain && bookmark.domain.toLowerCase().includes(lowerQuery)) ||
      (bookmark.category && bookmark.category.toLowerCase().includes(lowerQuery)) ||
      (bookmark.keywords && bookmark.keywords.some(k => k.toLowerCase().includes(lowerQuery)))
    )
    .sort((a, b) => b.dateAdded - a.dateAdded)
    .slice(0, limit);
}

// Advanced search with filters
export async function advancedSearch(query, filters = {}) {
  let results = await searchBookmarks(query, {
    limit: 1000, // Get more results for filtering
    fields: filters.fields || ['title', 'url', 'description', 'keywords', 'category']
  });

  // Apply filters
  if (filters.category) {
    results = results.filter(b => b.category === filters.category);
  }

  if (filters.domain) {
    results = results.filter(b => b.domain === filters.domain);
  }

  if (filters.domains && filters.domains.length > 0) {
    results = results.filter(b => filters.domains.includes(b.domain));
  }

  if (filters.categories && filters.categories.length > 0) {
    results = results.filter(b => filters.categories.includes(b.category));
  }

  if (filters.dateRange) {
    const { startDate, endDate } = filters.dateRange;
    results = results.filter(b => 
      b.dateAdded >= startDate && b.dateAdded <= endDate
    );
  }

  if (filters.isAlive !== undefined) {
    results = results.filter(b => b.isAlive === filters.isAlive);
  }

  if (filters.hasDescription !== undefined) {
    if (filters.hasDescription) {
      results = results.filter(b => b.description && b.description.length > 0);
    } else {
      results = results.filter(b => !b.description || b.description.length === 0);
    }
  }

  // Apply sorting
  if (filters.sortBy) {
    switch (filters.sortBy) {
      case 'relevance':
        // Already sorted by search score
        break;
      case 'date_desc':
        results.sort((a, b) => b.dateAdded - a.dateAdded);
        break;
      case 'date_asc':
        results.sort((a, b) => a.dateAdded - b.dateAdded);
        break;
      case 'title_asc':
        results.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'title_desc':
        results.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
        break;
      case 'domain':
        results.sort((a, b) => (a.domain || '').localeCompare(b.domain || ''));
        break;
    }
  }

  // Apply pagination
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  
  return {
    results: results.slice(offset, offset + limit),
    total: results.length,
    hasMore: offset + limit < results.length
  };
}

// Get search suggestions (autocomplete)
export async function getSearchSuggestions(query, limit = 10) {
  if (!query || query.length < 2) {
    return [];
  }

  if (!searchIndex) {
    await initializeSearchIndex();
  }

  try {
    // Search with prefix matching
    const results = await searchIndex.search(query, {
      index: ['title', 'category', 'domain'],
      limit: limit * 2,
      suggest: true,
      enrich: true
    });

    const suggestions = new Set();
    
    for (const fieldResult of results) {
      if (fieldResult && fieldResult.result) {
        for (const item of fieldResult.result) {
          if (item.doc) {
            // Add title
            if (item.doc.title) {
              suggestions.add(item.doc.title);
            }
            // Add domain
            if (item.doc.domain && !item.doc.domain.includes('unknown')) {
              suggestions.add(item.doc.domain);
            }
            // Add category
            if (item.doc.category) {
              suggestions.add(item.doc.category);
            }
          }
        }
      }
    }

    return Array.from(suggestions).slice(0, limit);
  } catch (error) {
    console.error('Error getting suggestions:', error);
    return [];
  }
}

// Clear the search index
export async function clearSearchIndex() {
  if (searchIndex) {
    searchIndex.clear();
  }
  await setCache('flexsearch_index', null);
  indexInitialized = false;
}

// Export for statistics
export function getIndexStats() {
  if (!searchIndex || !indexInitialized) {
    return { initialized: false };
  }

  return {
    initialized: true,
    // FlexSearch doesn't expose size directly, but we can estimate
    cached: true
  };
}
