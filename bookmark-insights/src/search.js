// FlexSearch integration for powerful bookmark search
// Provides fuzzy matching, relevance ranking, and multi-field search

import { Document } from 'flexsearch';
import { db, getAllBookmarks, setCache, getCache } from './db.js';
import { getSortFunction } from './utils.js';
// import { allBookmarks as bookmarksStore } from './stores.js';

// FlexSearch index instance
let searchIndex = null;
let indexInitialized = false;

/**
 * Get bookmarks using cached store when possible
 * Falls back to direct db call if store not available
 */
async function getBookmarksCached() {
  // try {
  //   // Try to use the cached store first
  //   return await bookmarksStore.getCached();
  // } catch (error) {
  //   // Fallback to direct db call
    return await getAllBookmarks();
  // }
}

/**
 * Parse advanced search query with +/- modifiers, quoted phrases, and regex patterns
 * @param {string} query - The raw search query
 * @returns {Object} Parsed query components
 */
export function parseAdvancedQuery(query) {
  if (!query || !query.trim()) {
    return { positive: [], negative: [], phrases: [], regular: [], regexPatterns: [], hasModifiers: false };
  }
  
  const positive = [];  // Must include (+term)
  const negative = [];  // Must exclude (-term)
  const phrases = [];   // Exact phrases ("exact match")
  const regular = [];   // Regular search terms
  const regexPatterns = []; // Regex patterns (/pattern/)
  
  // Extract regex patterns first (format: /pattern/ or /pattern/flags)
  const regexExtractPattern = /\/([^\/]+)\/([gimsuvy]*)?/g;
  let match;
  let remaining = query;
  
  while ((match = regexExtractPattern.exec(query)) !== null) {
    try {
      const pattern = match[1];
      const flags = match[2] || 'i'; // Default to case-insensitive
      const regex = new RegExp(pattern, flags);
      regexPatterns.push(regex);
    } catch (e) {
      // Invalid regex, treat as regular search term
      console.warn('Invalid regex pattern:', match[0], e.message);
    }
  }
  
  // Remove regex patterns from remaining query
  remaining = remaining.replace(/\/[^\/]+\/[gimsuvy]*/g, '').trim();
  
  // Extract quoted phrases (including their modifiers)
  const phraseRegex = /([+-]?)"([^"]+)"/g;
  while ((match = phraseRegex.exec(remaining)) !== null) {
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
  remaining = remaining.replace(/[+-]?"[^"]+"/g, '').trim();
  
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
    regexPatterns,
    hasModifiers: positive.length > 0 || negative.length > 0 || phrases.length > 0 || regexPatterns.length > 0
  };
}

/**
 * Check if a bookmark matches the parsed query
 * @param {Object} bookmark - The bookmark to check
 * @param {Object} parsedQuery - Parsed query from parseAdvancedQuery
 * @returns {boolean} Whether the bookmark matches
 */
function matchesAdvancedQuery(bookmark, parsedQuery) {
  const { positive, negative, phrases, regular, regexPatterns = [] } = parsedQuery;
  
  // Build searchable text from bookmark (cached for performance)
  const searchableText = [
    bookmark.title || '',
    bookmark.url || '',
    bookmark.description || '',
    bookmark.domain || '',
    bookmark.category || '',
    Array.isArray(bookmark.keywords) ? bookmark.keywords.join(' ') : ''
  ].join(' ').toLowerCase();
  
  // For regex, we may want to preserve case in some cases
  const searchableTextOriginal = [
    bookmark.title || '',
    bookmark.url || '',
    bookmark.description || '',
    bookmark.domain || '',
    bookmark.category || '',
    Array.isArray(bookmark.keywords) ? bookmark.keywords.join(' ') : ''
  ].join(' ');
  
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
  
  // All regex patterns must match
  for (const regex of regexPatterns) {
    // Use original text if regex is case-sensitive, otherwise use lowercase
    const textToSearch = regex.flags.includes('i') ? searchableText : searchableTextOriginal;
    if (!regex.test(textToSearch)) {
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
  const { positive, phrases, regular, regexPatterns = [] } = parsedQuery;
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
  
  // Bonus for regex matches in title
  for (const regex of regexPatterns) {
    if (regex.test(bookmark.title || '')) score += 8;
    if (regex.test(bookmark.url || '')) score += 3;
    if (regex.test(bookmark.description || '')) score += 2;
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
      const keys = Object.keys(cachedIndex.serialized);
      for (const key of keys) {
        await searchIndex.import(key, cachedIndex.serialized[key]);
      }
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

  // Use cached bookmarks for better performance
  const bookmarks = await getBookmarksCached();
  
  // Add all bookmarks to index
  for (const bookmark of bookmarks) {
    await addToIndex(bookmark, false);
  }

  indexInitialized = true;
  
  // Cache the serialized index
  try {
    const serialized = {};
    await searchIndex.export((key, data) => {
      serialized[key] = data;
    });
    await setCache('flexsearch_index', { serialized, timestamp: Date.now() });
    console.log(`Indexed ${bookmarks.length} bookmarks`);
  } catch (error) {
    console.error('Error caching index:', error);
  }

  return searchIndex;
}

// Add a bookmark to the search index
export async function addToIndex(bookmark, saveCache = true) {
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
  if (saveCache) {
    await saveIndexToCache();
  }
}

// Remove a bookmark from the search index
export async function removeFromIndex(bookmarkId, saveCache = true) {
  if (!searchIndex) {
    return;
  }

  await searchIndex.remove(bookmarkId);
  if (saveCache) {
    await saveIndexToCache();
  }
}

// Update a bookmark in the search index
export async function updateInIndex(bookmark) {
  await removeFromIndex(bookmark.id, false);
  await addToIndex(bookmark, true);
}

// Helper to save index to cache
async function saveIndexToCache() {
  if (!searchIndex) return;
  try {
    const serialized = {};
    await searchIndex.export((key, data) => {
      serialized[key] = data;
    });
    await setCache('flexsearch_index', { serialized, timestamp: Date.now() });
  } catch (error) {
    console.error('Error caching index:', error);
  }
}

// Invalidate the in-memory index to force reload/rebuild
export function invalidateSearchIndex() {
  searchIndex = null;
  indexInitialized = false;
}

/**
 * Parse special filter prefixes from search query
 * Supports: category:X, domain:X, accessed:yes/no, stale:yes, enriched:yes/no, dead:yes
 * Platform filters: platform:X, channel:X, repo:X, author:X, type:X, hasimage:yes/no
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
  
  // Platform filter: platform:youtube, platform:github, etc.
  const platformMatch = remaining.match(/platform:(\S+)/i);
  if (platformMatch) {
    filters.platform = platformMatch[1].toLowerCase();
    remaining = remaining.replace(platformMatch[0], '').trim();
  }
  
  // Channel/Creator filter: channel:@username or channel:username
  const channelMatch = remaining.match(/channel:(@?\S+)/i);
  if (channelMatch) {
    filters.creator = channelMatch[1];
    remaining = remaining.replace(channelMatch[0], '').trim();
  }
  
  // Author filter (alias for channel/creator): author:username
  const authorMatch = remaining.match(/author:(@?\S+)/i);
  if (authorMatch) {
    filters.creator = authorMatch[1];
    remaining = remaining.replace(authorMatch[0], '').trim();
  }
  
  // Repo filter: repo:owner/repo
  const repoMatch = remaining.match(/repo:(\S+)/i);
  if (repoMatch) {
    filters.repo = repoMatch[1].toLowerCase();
    remaining = remaining.replace(repoMatch[0], '').trim();
  }
  
  // Content type filter: type:video, type:issue, type:article, etc.
  const typeMatch = remaining.match(/type:(\S+)/i);
  if (typeMatch) {
    filters.contentType = typeMatch[1].toLowerCase();
    remaining = remaining.replace(typeMatch[0], '').trim();
  }
  
  // Has image filter: hasimage:yes/no
  const hasImageMatch = remaining.match(/hasimage:(yes|no)/i);
  if (hasImageMatch) {
    filters.hasImage = hasImageMatch[1].toLowerCase() === 'yes';
    remaining = remaining.replace(hasImageMatch[0], '').trim();
  }
  
  // Playlist filter: playlist:ID
  const playlistMatch = remaining.match(/playlist:(\S+)/i);
  if (playlistMatch) {
    filters.playlist = playlistMatch[1];
    remaining = remaining.replace(playlistMatch[0], '').trim();
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
    
    // Platform filter
    if (filters.platform) {
      const bookmarkPlatform = (bookmark.platform || 'other').toLowerCase();
      if (bookmarkPlatform !== filters.platform) return false;
    }
    
    // Creator/Channel filter
    if (filters.creator) {
      const bookmarkCreator = (bookmark.creator || '').toLowerCase();
      const filterCreator = filters.creator.toLowerCase();
      // Match with or without @ prefix
      if (!bookmarkCreator.includes(filterCreator) && 
          !bookmarkCreator.includes(filterCreator.replace(/^@/, '')) &&
          !(`@${bookmarkCreator}`).includes(filterCreator)) {
        return false;
      }
    }
    
    // Repository filter (owner/repo format)
    if (filters.repo) {
      const repoName = bookmark.platformData?.extra?.owner && bookmark.platformData?.extra?.repo
        ? `${bookmark.platformData.extra.owner}/${bookmark.platformData.extra.repo}`.toLowerCase()
        : '';
      if (!repoName.includes(filters.repo)) return false;
    }
    
    // Content type filter
    if (filters.contentType) {
      const bookmarkType = (bookmark.contentType || '').toLowerCase();
      // Support pipe-separated values: type:video|article
      const allowedTypes = filters.contentType.split('|').map(t => t.trim());
      if (!allowedTypes.includes(bookmarkType)) return false;
    }
    
    // Has image filter
    if (filters.hasImage !== undefined) {
      const hasThumbnail = Boolean(
        bookmark.platformData?.extra?.thumbnail ||
        bookmark.rawMetadata?.openGraph?.['og:image'] ||
        bookmark.rawMetadata?.twitterCard?.['twitter:image']
      );
      if (filters.hasImage !== hasThumbnail) return false;
    }
    
    // Playlist filter
    if (filters.playlist) {
      const playlistId = bookmark.platformData?.extra?.playlistId || '';
      if (!playlistId.includes(filters.playlist)) return false;
    }
    
    return true;
  });
}

/**
 * Parse search query to extract filters (domain:, folder:, etc.)
 * @param {string} query - Raw search query
 * @returns {Object} - { text, filters }
 */
export function parseSearchQuery(query) {
  if (!query) return { text: '', filters: {} };

  const filters = {
    domains: [],
    folders: [],
    topics: [],
    types: [],
    tags: [],
    deadLinks: false,
    stale: false
  };

  let text = query;

  // Helper to extract and remove patterns
  const extract = (prefix, targetArray) => {
    const regex = new RegExp(`${prefix}:"([^"]+)"|${prefix}:([^\\s]+)`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = match[1] || match[2];
      targetArray.push(value.toLowerCase());
    }
    text = text.replace(regex, '').trim();
  };

  extract('domain', filters.domains);
  extract('site', filters.domains); // Alias
  extract('folder', filters.folders);
  extract('topic', filters.topics);
  extract('type', filters.types);
  extract('tag', filters.tags);
  
  // Boolean flags
  if (text.match(/dead:yes|is:dead/i)) {
      filters.deadLinks = true;
      text = text.replace(/dead:yes|is:dead/gi, '').trim();
  }
  
  if (text.match(/stale:yes|is:stale/i)) {
      filters.stale = true;
      text = text.replace(/stale:yes|is:stale/gi, '').trim();
  }

  // Clean up extra spaces
  text = text.replace(/\s+/g, ' ').trim();

  return { text, filters };
}

// Search bookmarks with advanced query support
export async function searchBookmarks(query, activeFilters = null, options = {}) {
  // Handle legacy call signature: searchBookmarks(query, options)
  if (activeFilters && !activeFilters.domains && !Array.isArray(activeFilters.domains)) {
      options = activeFilters;
      activeFilters = null;
  }

  const {
    limit = 50,
    offset = 0,
    computeStats = false  // New option to compute stats in single pass
  } = options;

  // Use cached bookmarks for better performance
  let allBookmarksData = await getBookmarksCached();
  let filteredBookmarks = allBookmarksData;

  // Apply activeFilters if provided
  if (activeFilters) {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      filteredBookmarks = filteredBookmarks.filter(b => {
          if (activeFilters.domains && activeFilters.domains.length > 0) {
              const domain = (b.domain || '').toLowerCase();
              if (!activeFilters.domains.some(d => domain.includes(d.toLowerCase()))) return false;
          }
          if (activeFilters.folders && activeFilters.folders.length > 0) {
              // Fixed: Only check folderPath, don't fall back to category
              const folder = (b.folderPath || '').toLowerCase();
              if (!activeFilters.folders.some(f => folder.includes(f.toLowerCase()))) return false;
          }
          if (activeFilters.topics && activeFilters.topics.length > 0) {
              // Check if bookmark has any of the selected topics
              const bookmarkTopics = b.topics || [];
              if (!activeFilters.topics.some(t => 
                  bookmarkTopics.some(bt => bt.toLowerCase() === t.toLowerCase() || bt.toLowerCase().startsWith(t.toLowerCase() + '/'))
              )) return false;
          }
          if (activeFilters.types && activeFilters.types.length > 0) {
              const contentType = (b.contentType || '').toLowerCase();
              if (!activeFilters.types.some(t => contentType === t.toLowerCase())) return false;
          }
          if (activeFilters.creators && activeFilters.creators.length > 0) {
              const key = `${b.platform || 'other'}:${b.creator}`;
              // activeFilters.creators contains objects { key, creator, platform }
              if (!activeFilters.creators.some(c => c.key === key)) return false;
          }
          if (activeFilters.tags && activeFilters.tags.length > 0) {
              if (!b.tags || !Array.isArray(b.tags)) return false;
              if (!activeFilters.tags.some(t => b.tags.includes(t))) return false;
          }
          if (activeFilters.deadLinks) {
              if (b.isAlive !== false) return false;
          }
          if (activeFilters.stale) {
              const isOld = b.dateAdded < thirtyDaysAgo;
              const neverAccessed = !b.accessCount || b.accessCount === 0;
              const isAlive = b.isAlive !== false;
              if (!(isOld && neverAccessed && isAlive)) return false;
          }
          
          if (activeFilters.dateRange) {
              const { startDate, endDate } = activeFilters.dateRange;
              if (b.dateAdded < startDate || b.dateAdded > endDate) return false;
          }
          
          // Reading time filter (minutes)
          if (activeFilters.readingTimeRange) {
              const { min, max } = activeFilters.readingTimeRange;
              const readingTime = b.readingTime || 0;
              if (min !== undefined && min !== null && readingTime < min) return false;
              if (max !== undefined && max !== null && readingTime > max) return false;
          }
          
          // Quality score filter (0-100)
          if (activeFilters.qualityScoreRange) {
              const { min, max } = activeFilters.qualityScoreRange;
              const qualityScore = b.qualityScore || 0;
              if (min !== undefined && min !== null && qualityScore < min) return false;
              if (max !== undefined && max !== null && qualityScore > max) return false;
          }
          
          // Has published date filter
          if (activeFilters.hasPublishedDate !== null && activeFilters.hasPublishedDate !== undefined) {
              const hasDate = Boolean(b.publishedDate || b.rawMetadata?.publishedDate);
              if (activeFilters.hasPublishedDate !== hasDate) return false;
          }

          return true;
      });
  }

  if (!query || !query.trim()) {
    const sortFn = getSortFunction(options.sortBy || 'date_desc');
    const response = {
      results: filteredBookmarks
        .sort(sortFn)
        .slice(offset, offset + limit),
      total: filteredBookmarks.length,
      hasMore: offset + limit < filteredBookmarks.length,
      parsedQuery: null
    };
    
    // Compute stats in single pass if requested (for filter-only mode)
    if (computeStats) {
      response.stats = computeSearchResultStats(filteredBookmarks);
    }
    
    return response;
  }

  // Parse special filters first
  const { filters: specialFilters, remainingQuery } = parseSpecialFilters(query);

  // Parse the advanced query from remaining text
  const parsedQuery = parseAdvancedQuery(remainingQuery);
  
  // Apply special filters first
  if (Object.keys(specialFilters).length > 0) {
    filteredBookmarks = applySpecialFilters(filteredBookmarks, specialFilters);
  }
  
  // If there's remaining text query, filter further
  if (remainingQuery.trim()) {
    // Use FlexSearch for regular terms if available
    if (parsedQuery.regular.length > 0) {
      try {
        const index = await initializeSearchIndex();
        const regularQuery = parsedQuery.regular.join(' ');
        
        // Search using FlexSearch
        const searchResults = await index.search(regularQuery, {
          limit: 10000, // Get all potential matches
          suggest: true // Enable suggestions/fuzzy matching
        });
        
        // FlexSearch Document search returns results grouped by field:
        // [{ field: 'title', result: [id1, id2] }, { field: 'url', result: [id3] }, ...]
        // We need to collect all unique IDs
        const resultIds = new Set();
        
        if (Array.isArray(searchResults)) {
          searchResults.forEach(fieldResult => {
            if (fieldResult && Array.isArray(fieldResult.result)) {
              fieldResult.result.forEach(id => resultIds.add(id));
            }
          });
        }
        
        // Filter the already filtered bookmarks (from special filters)
        // to only include those found by FlexSearch
        filteredBookmarks = filteredBookmarks.filter(bookmark => resultIds.has(bookmark.id));
        
        // Then apply the remaining advanced query logic (negative terms, phrases, regex)
        // This is still needed because FlexSearch might not handle negative terms/regex exactly as we want
        // or we want to be double sure
        filteredBookmarks = filteredBookmarks.filter(bookmark => 
          matchesAdvancedQuery(bookmark, parsedQuery)
        );
      } catch (err) {
        console.error('FlexSearch failed, falling back to manual search:', err);
        // Fallback to manual search
        filteredBookmarks = filteredBookmarks.filter(bookmark => 
          matchesAdvancedQuery(bookmark, parsedQuery)
        );
      }
    } else {
      // No regular terms (only negative, phrases, or regex), use manual filter
      filteredBookmarks = filteredBookmarks.filter(bookmark => 
        matchesAdvancedQuery(bookmark, parsedQuery)
      );
    }
    
    // Calculate relevance scores
    filteredBookmarks = filteredBookmarks.map(bookmark => ({
      ...bookmark,
      _searchScore: calculateRelevanceScore(bookmark, parsedQuery)
    }));
    
    // Sort using requested sort option
    const sortFn = getSortFunction(options.sortBy || 'relevance');
    filteredBookmarks.sort(sortFn);
  } else {
    // No text query
    const sortFn = getSortFunction(options.sortBy || 'date_desc');
    filteredBookmarks.sort(sortFn);
  }
  
  const total = filteredBookmarks.length;
  
  // Build response
  const response = {
    results: filteredBookmarks.slice(offset, offset + limit),
    total,
    hasMore: offset + limit < total,
    parsedQuery,
    specialFilters
  };
  
  // Compute stats in single pass if requested (avoids second search call)
  if (computeStats) {
    response.stats = computeSearchResultStats(filteredBookmarks);
  }
  
  return response;
}

/**
 * Compute stats from search results for sidebar updates
 * @param {Array} bookmarks - Array of bookmark results
 * @returns {Object} Stats for sidebar (domains, folders, topics, etc.)
 */
export function computeSearchResultStats(bookmarks) {
  const domainCounts = new Map();
  const folderCounts = new Map();
  const topicCounts = new Map();
  const creatorCounts = new Map();
  const typeCounts = new Map();
  
  // Date period calculations
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;
  const twoWeeks = 14 * oneDay;
  const threeMonths = 90 * oneDay;
  const sixMonths = 180 * oneDay;
  
  const today = new Date();
  const currentYear = today.getFullYear();
  const startOfMonth = new Date(currentYear, today.getMonth(), 1).getTime();
  const startOfYear = new Date(currentYear, 0, 1).getTime();
  
  let week = 0, twoWeek = 0, month = 0, threeMonth = 0, sixMonth = 0, year = 0, older = 0;
  
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

    // Count topics
    const bookmarkTopics = bookmark.topics || [];
    for (const topic of bookmarkTopics) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }

    // Count creators
    if (bookmark.creator) {
      const key = `${bookmark.platform || 'other'}:${bookmark.creator}`;
      if (!creatorCounts.has(key)) {
        creatorCounts.set(key, { 
          creator: bookmark.creator, 
          platform: bookmark.platform || 'other', 
          count: 0 
        });
      }
      creatorCounts.get(key).count++;
    }

    // Count content types
    if (bookmark.contentType) {
      typeCounts.set(bookmark.contentType, (typeCounts.get(bookmark.contentType) || 0) + 1);
    }
    
    // Count date periods
    const dateAdded = bookmark.dateAdded;
    if (now - dateAdded < oneWeek) week++;
    if (now - dateAdded < twoWeeks) twoWeek++;
    if (dateAdded >= startOfMonth) month++;
    if (now - dateAdded < threeMonths) threeMonth++;
    if (now - dateAdded < sixMonths) sixMonth++;
    if (dateAdded >= startOfYear) year++;
    if (dateAdded < startOfYear) older++;
  }
  
  // Convert to sorted arrays
  const domains = Array.from(domainCounts.entries())
    .map(([domain, data]) => ({ domain, count: data.count, latestDate: data.latestDate }))
    .sort((a, b) => b.count - a.count);
  
  const folders = Array.from(folderCounts.entries())
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count);

  const topics = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);

  const creators = Array.from(creatorCounts.values())
    .sort((a, b) => b.count - a.count);

  const contentTypes = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  
  const dateCounts = { week, twoWeek, month, threeMonth, sixMonth, year, older };
  
  return { domains, folders, topics, creators, contentTypes, dateCounts };
}

// Note: advancedSearch function removed - use searchBookmarks() with activeFilters parameter instead
// The main searchBookmarks() function now supports all advanced filtering via the activeFilters object

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
