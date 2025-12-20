// FlexSearch integration for powerful bookmark search
// Provides fuzzy matching, relevance ranking, and multi-field search

import { Document } from 'flexsearch';
import { db, getAllBookmarks, setCache, getCache } from './db.js';

// FlexSearch index instance
let searchIndex = null;
let indexInitialized = false;

/**
 * Parse advanced search query with +/- modifiers and quoted phrases
 * @param {string} query - The raw search query
 * @returns {Object} Parsed query components
 */
export function parseAdvancedQuery(query) {
  if (!query || !query.trim()) {
    return { positive: [], negative: [], phrases: [], regular: [], hasModifiers: false };
  }
  
  const positive = [];  // Must include (+term)
  const negative = [];  // Must exclude (-term)
  const phrases = [];   // Exact phrases ("exact match")
  const regular = [];   // Regular search terms
  
  // Extract quoted phrases first (including their modifiers)
  const phraseRegex = /([+-]?)"([^"]+)"/g;
  let match;
  while ((match = phraseRegex.exec(query)) !== null) {
    const modifier = match[1];
    const phrase = match[2].toLowerCase();
    if (modifier === '+') {
      positive.push(phrase);
    } else if (modifier === '-') {
      negative.push(phrase);
    } else {
      phrases.push(phrase);
    }
  }
  
  // Remove quoted phrases for further parsing
  let remaining = query.replace(/[+-]?"[^"]+"/g, '').trim();
  
  // Split into terms and categorize
  const terms = remaining.split(/\s+/).filter(t => t.length > 0);
  
  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    if (term.startsWith('+') && term.length > 1) {
      positive.push(lowerTerm.slice(1));
    } else if (term.startsWith('-') && term.length > 1) {
      negative.push(lowerTerm.slice(1));
    } else {
      regular.push(lowerTerm);
    }
  }
  
  return {
    positive,
    negative,
    phrases,
    regular,
    hasModifiers: positive.length > 0 || negative.length > 0 || phrases.length > 0
  };
}

/**
 * Check if a bookmark matches the parsed query
 * @param {Object} bookmark - The bookmark to check
 * @param {Object} parsedQuery - Parsed query from parseAdvancedQuery
 * @returns {boolean} Whether the bookmark matches
 */
function matchesAdvancedQuery(bookmark, parsedQuery) {
  const { positive, negative, phrases, regular } = parsedQuery;
  
  // Build searchable text from bookmark (cached for performance)
  const searchableText = [
    bookmark.title || '',
    bookmark.url || '',
    bookmark.description || '',
    bookmark.domain || '',
    bookmark.category || '',
    Array.isArray(bookmark.keywords) ? bookmark.keywords.join(' ') : ''
  ].join(' ').toLowerCase();
  
  // All positive terms must be present
  for (const term of positive) {
    if (!searchableText.includes(term)) {
      return false;
    }
  }
  
  // All negative terms must be absent
  for (const term of negative) {
    if (searchableText.includes(term)) {
      return false;
    }
  }
  
  // All exact phrases must be present
  for (const phrase of phrases) {
    if (!searchableText.includes(phrase)) {
      return false;
    }
  }
  
  // If there are regular terms, at least one must match
  if (regular.length > 0) {
    const hasRegularMatch = regular.some(term => searchableText.includes(term));
    if (!hasRegularMatch) {
      return false;
    }
  }
  
  return true;
}

/**
 * Calculate relevance score for a bookmark
 * @param {Object} bookmark - The bookmark
 * @param {Object} parsedQuery - Parsed query
 * @returns {number} Relevance score
 */
function calculateRelevanceScore(bookmark, parsedQuery) {
  const { positive, phrases, regular } = parsedQuery;
  let score = 0;
  
  const title = (bookmark.title || '').toLowerCase();
  const url = (bookmark.url || '').toLowerCase();
  const domain = (bookmark.domain || '').toLowerCase();
  const description = (bookmark.description || '').toLowerCase();
  const category = (bookmark.category || '').toLowerCase();
  
  const allTerms = [...positive, ...phrases, ...regular];
  
  for (const term of allTerms) {
    // Title matches are most valuable
    if (title.includes(term)) {
      score += 10;
      // Bonus for title starting with term
      if (title.startsWith(term)) score += 5;
    }
    // Domain matches
    if (domain.includes(term)) score += 5;
    // Category matches
    if (category.includes(term)) score += 4;
    // Description matches
    if (description.includes(term)) score += 2;
    // URL matches
    if (url.includes(term)) score += 1;
  }
  
  return score;
}

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

/**
 * Parse special filter prefixes from search query
 * Supports: category:X, domain:X, accessed:yes/no, stale:yes, enriched:yes/no, dead:yes
 * @param {string} query - Raw search query
 * @returns {Object} { filters, remainingQuery }
 */
export function parseSpecialFilters(query) {
  if (!query || !query.trim()) {
    return { filters: {}, remainingQuery: '' };
  }
  
  const filters = {};
  let remaining = query;
  
  // Category filter: category:value
  const categoryMatch = remaining.match(/category:(\S+)/i);
  if (categoryMatch) {
    filters.category = categoryMatch[1].toLowerCase();
    remaining = remaining.replace(categoryMatch[0], '').trim();
  }
  
  // Domain filter: domain:value
  const domainMatch = remaining.match(/domain:(\S+)/i);
  if (domainMatch) {
    filters.domain = domainMatch[1].toLowerCase();
    remaining = remaining.replace(domainMatch[0], '').trim();
  }
  
  // Accessed filter: accessed:yes/no
  const accessedMatch = remaining.match(/accessed:(yes|no)/i);
  if (accessedMatch) {
    filters.accessed = accessedMatch[1].toLowerCase() === 'yes';
    remaining = remaining.replace(accessedMatch[0], '').trim();
  }
  
  // Stale filter: stale:yes (old and never accessed)
  const staleMatch = remaining.match(/stale:(yes|no)/i);
  if (staleMatch) {
    filters.stale = staleMatch[1].toLowerCase() === 'yes';
    remaining = remaining.replace(staleMatch[0], '').trim();
  }
  
  // Enriched filter: enriched:yes/no
  const enrichedMatch = remaining.match(/enriched:(yes|no)/i);
  if (enrichedMatch) {
    filters.enriched = enrichedMatch[1].toLowerCase() === 'yes';
    remaining = remaining.replace(enrichedMatch[0], '').trim();
  }
  
  // Dead link filter: dead:yes/no
  const deadMatch = remaining.match(/dead:(yes|no)/i);
  if (deadMatch) {
    filters.dead = deadMatch[1].toLowerCase() === 'yes';
    remaining = remaining.replace(deadMatch[0], '').trim();
  }
  
  // Folder filter: folder:value or folder:"value with spaces"
  const folderMatch = remaining.match(/folder:(?:"([^"]+)"|(\S+))/i);
  if (folderMatch) {
    filters.folder = (folderMatch[1] || folderMatch[2]).toLowerCase();
    remaining = remaining.replace(folderMatch[0], '').trim();
  }
  
  return { filters, remainingQuery: remaining };
}

/**
 * Apply special filters to bookmarks
 * @param {Array} bookmarks - Array of bookmarks
 * @param {Object} filters - Special filters from parseSpecialFilters
 * @returns {Array} Filtered bookmarks
 */
export function applySpecialFilters(bookmarks, filters) {
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  
  return bookmarks.filter(bookmark => {
    // Category filter
    if (filters.category) {
      const bookmarkCategory = (bookmark.category || 'uncategorized').toLowerCase();
      if (bookmarkCategory !== filters.category) return false;
    }
    
    // Domain filter
    if (filters.domain) {
      const bookmarkDomain = (bookmark.domain || '').toLowerCase();
      if (!bookmarkDomain.includes(filters.domain)) return false;
    }
    
    // Accessed filter
    if (filters.accessed !== undefined) {
      const wasAccessed = bookmark.accessCount && bookmark.accessCount > 0;
      if (filters.accessed !== wasAccessed) return false;
    }
    
    // Stale filter (old + never accessed)
    if (filters.stale) {
      const isOld = bookmark.dateAdded < thirtyDaysAgo;
      const neverAccessed = !bookmark.accessCount || bookmark.accessCount === 0;
      const isAlive = bookmark.isAlive !== false;
      if (!(isOld && neverAccessed && isAlive)) return false;
    }
    
    // Enriched filter
    if (filters.enriched !== undefined) {
      const isEnriched = Boolean(
        bookmark.description || 
        (bookmark.keywords && bookmark.keywords.length > 0) ||
        bookmark.contentSnippet
      );
      if (filters.enriched !== isEnriched) return false;
    }
    
    // Dead link filter
    if (filters.dead !== undefined) {
      const isDead = bookmark.isAlive === false;
      if (filters.dead !== isDead) return false;
    }
    
    // Folder filter
    if (filters.folder) {
      const folderPath = (bookmark.folderPath || '').toLowerCase();
      if (!folderPath.includes(filters.folder)) return false;
    }
    
    return true;
  });
}

// Search bookmarks with advanced query support
export async function searchBookmarks(query, options = {}) {
  const {
    limit = 50,
    offset = 0
  } = options;

  if (!query || !query.trim()) {
    // Return all bookmarks sorted by date if no query
    const bookmarks = await getAllBookmarks();
    return {
      results: bookmarks
        .sort((a, b) => b.dateAdded - a.dateAdded)
        .slice(offset, offset + limit),
      total: bookmarks.length,
      hasMore: offset + limit < bookmarks.length,
      parsedQuery: null
    };
  }

  // Parse special filters first
  const { filters: specialFilters, remainingQuery } = parseSpecialFilters(query);

  // Parse the advanced query from remaining text
  const parsedQuery = parseAdvancedQuery(remainingQuery);
  
  // Get all bookmarks
  let allBookmarks = await getAllBookmarks();
  
  // Apply special filters first
  if (Object.keys(specialFilters).length > 0) {
    allBookmarks = applySpecialFilters(allBookmarks, specialFilters);
  }
  
  // If there's remaining text query, filter further
  let filteredBookmarks;
  if (remainingQuery.trim()) {
    filteredBookmarks = allBookmarks.filter(bookmark => 
      matchesAdvancedQuery(bookmark, parsedQuery)
    );
    
    // Calculate relevance scores and sort
    filteredBookmarks = filteredBookmarks.map(bookmark => ({
      ...bookmark,
      _searchScore: calculateRelevanceScore(bookmark, parsedQuery)
    }));
    
    // Sort by relevance score (highest first)
    filteredBookmarks.sort((a, b) => b._searchScore - a._searchScore);
  } else {
    // No text query, just use filtered results sorted by date
    filteredBookmarks = allBookmarks.sort((a, b) => b.dateAdded - a.dateAdded);
  }
  
  const total = filteredBookmarks.length;
  
  return {
    results: filteredBookmarks.slice(offset, offset + limit),
    total,
    hasMore: offset + limit < total,
    parsedQuery,
    specialFilters
  };
}

/**
 * Compute stats from search results for sidebar updates
 * @param {Array} bookmarks - Array of bookmark results
 * @returns {Object} Stats for sidebar (domains, folders)
 */
export function computeSearchResultStats(bookmarks) {
  const domainCounts = new Map();
  const folderCounts = new Map();
  
  for (const bookmark of bookmarks) {
    // Count domains
    if (bookmark.domain) {
      const current = domainCounts.get(bookmark.domain) || { count: 0, latestDate: 0 };
      current.count++;
      if (bookmark.dateAdded > current.latestDate) {
        current.latestDate = bookmark.dateAdded;
      }
      domainCounts.set(bookmark.domain, current);
    }
    
    // Count folders
    if (bookmark.folderPath) {
      const current = folderCounts.get(bookmark.folderPath) || 0;
      folderCounts.set(bookmark.folderPath, current + 1);
    }
  }
  
  // Convert to sorted arrays
  const domains = Array.from(domainCounts.entries())
    .map(([domain, data]) => ({ domain, count: data.count, latestDate: data.latestDate }))
    .sort((a, b) => b.count - a.count);
  
  const folders = Array.from(folderCounts.entries())
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count);
  
  return { domains, folders };
}

// Advanced search with filters
export async function advancedSearch(query, filters = {}) {
  const searchResult = await searchBookmarks(query, {
    limit: 1000 // Get more results for filtering
  });

  let results = searchResult.results || [];

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
