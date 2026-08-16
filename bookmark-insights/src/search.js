// FlexSearch integration for powerful bookmark search
// Provides fuzzy matching, relevance ranking, and multi-field search

import { Document } from 'flexsearch';
import { getAllBookmarksWithReadingList, setCache, getCache } from './db.js';
import { isDead, isEnriched, isNeverAccessed, isStale } from './predicates.js';
import { getSortFunction } from './utils.js';

// FlexSearch index instance
let searchIndex = null;
let indexInitialized = false;
let indexInitPromise = null;

// Corpus-cached in db.js: a keystroke no longer re-reads the whole table.
const getBookmarksCached = getAllBookmarksWithReadingList;

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * When the content itself was published, as a timestamp. Deep Analysis stores
 * this as either a number or an ISO string depending on the source.
 * @returns {number|null}
 */
export function publishedTimestamp(bookmark) {
  const raw = bookmark?.publishedDate ?? bookmark?.rawMetadata?.publishedDate;
  if (raw === null || raw === undefined || raw === '') return null;
  const ts = typeof raw === 'number' ? raw : Date.parse(raw);
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Compile a user-supplied regex from the search box.
 *
 * Two hazards are handled here:
 * - `g`/`y` make `.test()` stateful via `lastIndex`, and the compiled object is
 *   reused across every bookmark, so results alternated match/no-match.
 * - An unbounded pattern such as `/(a+)+$/` runs on the UI thread against every
 *   bookmark's concatenated text and freezes the dashboard.
 *
 * @returns {RegExp|null} null when the pattern is rejected or invalid
 */
const MAX_REGEX_LENGTH = 200;
// A quantifier applied to a group that already contains one — `(a+)+`, `(a*)*`.
const NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)\s*[+*{]/;

export function compileUserRegex(pattern, flags) {
  if (!pattern || pattern.length > MAX_REGEX_LENGTH) {
    console.warn('Rejected search regex: pattern too long');
    return null;
  }

  if (NESTED_QUANTIFIER.test(pattern)) {
    console.warn('Rejected search regex: nested quantifier (catastrophic backtracking risk)');
    return null;
  }

  // Default to case-insensitive; strip the stateful flags entirely.
  const safeFlags = (flags || 'i').replace(/[gy]/g, '') || 'i';

  try {
    return new RegExp(pattern, safeFlags);
  } catch (e) {
    console.warn('Invalid regex pattern:', pattern, e.message);
    return null;
  }
}

/**
 * Parse advanced search query with +/- modifiers, quoted phrases, and regex patterns
 * @param {string} query - The raw search query
 * @returns {Object} Parsed query components
 */
function parseAdvancedQuery(query) {
  if (!query || !query.trim()) {
    return {
      positive: [],
      negative: [],
      phrases: [],
      regular: [],
      regexPatterns: [],
      hasModifiers: false,
    };
  }

  const positive = []; // Must include (+term)
  const negative = []; // Must exclude (-term)
  const phrases = []; // Exact phrases ("exact match")
  const regular = []; // Regular search terms
  const regexPatterns = []; // Regex patterns (/pattern/)

  // Extract regex patterns first (format: /pattern/ or /pattern/flags)
  const regexExtractPattern = /\/([^/]+)\/([gimsuvy]*)?/g;
  let match;
  let remaining = query;

  while ((match = regexExtractPattern.exec(query)) !== null) {
    const regex = compileUserRegex(match[1], match[2]);
    if (regex) regexPatterns.push(regex);
  }

  // Remove regex patterns from remaining query
  remaining = remaining.replace(/\/[^/]+\/[gimsuvy]*/g, '').trim();

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
  const terms = remaining.split(/\s+/).filter((t) => t.length > 0);

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
    hasModifiers:
      positive.length > 0 || negative.length > 0 || phrases.length > 0 || regexPatterns.length > 0,
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
    Array.isArray(bookmark.keywords) ? bookmark.keywords.join(' ') : '',
  ]
    .join(' ')
    .toLowerCase();

  // For regex, we may want to preserve case in some cases
  const searchableTextOriginal = [
    bookmark.title || '',
    bookmark.url || '',
    bookmark.description || '',
    bookmark.domain || '',
    bookmark.category || '',
    Array.isArray(bookmark.keywords) ? bookmark.keywords.join(' ') : '',
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
    const hasRegularMatch = regular.some((term) => searchableText.includes(term));
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

// Shared FlexSearch configuration - the index is constructed in two places and
// the two copies must stay identical or a cached index fails to import.
function createSearchIndex() {
  return new Document({
    document: {
      id: 'id',
      index: ['title', 'url', 'description', 'keywords', 'category', 'domain'],
      store: true,
    },
    tokenize: 'forward',
    cache: true,
    optimize: true,
    resolution: 9,
    context: {
      depth: 3,
      bidirectional: true,
    },
  });
}

// Initialize FlexSearch index with optimized configuration
async function initializeSearchIndex() {
  if (indexInitialized) {
    return searchIndex;
  }

  // Concurrent bookmark events would otherwise each start their own rebuild.
  if (indexInitPromise) return indexInitPromise;

  indexInitPromise = (async () => {
    console.log('Initializing FlexSearch index...');

    // Try to load serialized index from cache
    const cachedIndex = await getCache('flexsearch_index');

    if (cachedIndex && cachedIndex.serialized) {
      try {
        searchIndex = createSearchIndex();

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
  })().finally(() => {
    indexInitPromise = null;
  });

  return indexInitPromise;
}

// Rebuild the entire search index from bookmarks
export async function rebuildSearchIndex() {
  console.log('Building FlexSearch index...');

  searchIndex = createSearchIndex();

  // Use cached bookmarks for better performance
  const bookmarks = await getBookmarksCached();

  // Add all bookmarks to index
  for (const bookmark of bookmarks) {
    await addToIndex(bookmark, false);
  }

  indexInitialized = true;

  await saveIndexToCache();
  console.log(`Indexed ${bookmarks.length} bookmarks`);

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
    domain: bookmark.domain || '',
  };

  await searchIndex.add(doc);
  if (saveCache) {
    scheduleIndexSave();
  }
}

// Remove a bookmark from the search index.
// The index must be loaded first: on a freshly-woken service worker
// `searchIndex` is always null, and returning early there left deleted
// bookmarks permanently searchable.
export async function removeFromIndex(bookmarkId, saveCache = true) {
  if (!searchIndex) {
    await initializeSearchIndex();
  }

  await searchIndex.remove(bookmarkId);
  if (saveCache) {
    scheduleIndexSave();
  }
}

// Update a bookmark in the search index
export async function updateInIndex(bookmark) {
  await removeFromIndex(bookmark.id, false);
  await addToIndex(bookmark, true);
}

// Serializing the index writes the whole O(N) structure as a single IndexedDB
// record. Doing that per mutation made a bulk import quadratic, so writes are
// coalesced into one save shortly after the last change.
const INDEX_SAVE_DEBOUNCE_MS = 2000;
let indexSaveTimer = null;

function scheduleIndexSave() {
  if (indexSaveTimer) clearTimeout(indexSaveTimer);
  indexSaveTimer = setTimeout(() => {
    indexSaveTimer = null;
    saveIndexToCache();
  }, INDEX_SAVE_DEBOUNCE_MS);
}

// Helper to save index to cache
async function saveIndexToCache() {
  if (!searchIndex) return;
  if (indexSaveTimer) {
    clearTimeout(indexSaveTimer);
    indexSaveTimer = null;
  }
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
function parseSpecialFilters(query) {
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
function applySpecialFilters(bookmarks, filters) {
  const now = Date.now();

  return bookmarks.filter((bookmark) => {
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
      if (filters.accessed === isNeverAccessed(bookmark)) return false;
    }

    // Stale filter (old + never accessed)
    if (filters.stale) {
      if (!isStale(bookmark, now)) return false;
    }

    // Enriched filter
    if (filters.enriched !== undefined) {
      if (filters.enriched !== isEnriched(bookmark)) return false;
    }

    // Dead link filter
    if (filters.dead !== undefined) {
      if (filters.dead !== isDead(bookmark)) return false;
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
      if (
        !bookmarkCreator.includes(filterCreator) &&
        !bookmarkCreator.includes(filterCreator.replace(/^@/, '')) &&
        !`@${bookmarkCreator}`.includes(filterCreator)
      ) {
        return false;
      }
    }

    // Repository filter (owner/repo format)
    if (filters.repo) {
      const repoName =
        bookmark.platformData?.extra?.owner && bookmark.platformData?.extra?.repo
          ? `${bookmark.platformData.extra.owner}/${bookmark.platformData.extra.repo}`.toLowerCase()
          : '';
      if (!repoName.includes(filters.repo)) return false;
    }

    // Content type filter
    if (filters.contentType) {
      const bookmarkType = (bookmark.contentType || '').toLowerCase();
      // Support pipe-separated values: type:video|article
      const allowedTypes = filters.contentType.split('|').map((t) => t.trim());
      if (!allowedTypes.includes(bookmarkType)) return false;
    }

    // Has image filter
    if (filters.hasImage !== undefined) {
      const hasThumbnail = Boolean(
        bookmark.platformData?.extra?.thumbnail ||
        bookmark.rawMetadata?.openGraph?.['og:image'] ||
        bookmark.rawMetadata?.twitterCard?.['twitter:image'],
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
    computeStats = false, // New option to compute stats in single pass
  } = options;

  // Use cached bookmarks for better performance
  let allBookmarksData = await getBookmarksCached();
  let filteredBookmarks = allBookmarksData;

  // Apply activeFilters if provided
  if (activeFilters) {
    const now = Date.now();

    filteredBookmarks = filteredBookmarks.filter((b) => {
      if (activeFilters.domains && activeFilters.domains.length > 0) {
        const domain = (b.domain || '').toLowerCase();
        if (!activeFilters.domains.some((d) => domain.includes(d.toLowerCase()))) return false;
      }
      if (activeFilters.folders && activeFilters.folders.length > 0) {
        // Fixed: Only check folderPath, don't fall back to category
        const folder = (b.folderPath || '').toLowerCase();
        if (!activeFilters.folders.some((f) => folder.includes(f.toLowerCase()))) return false;
      }
      if (activeFilters.topics && activeFilters.topics.length > 0) {
        // Check if bookmark has any of the selected topics
        const bookmarkTopics = b.topics || [];
        if (
          !activeFilters.topics.some((t) =>
            bookmarkTopics.some(
              (bt) =>
                bt.toLowerCase() === t.toLowerCase() ||
                bt.toLowerCase().startsWith(t.toLowerCase() + '/'),
            ),
          )
        )
          return false;
      }
      if (activeFilters.tags && activeFilters.tags.length > 0) {
        if (!b.tags || !Array.isArray(b.tags)) return false;
        if (!activeFilters.tags.some((t) => b.tags.includes(t))) return false;
      }
      if (activeFilters.deadLinks) {
        if (!isDead(b)) return false;
      }
      if (activeFilters.stale) {
        if (!isStale(b, now)) return false;
      }

      // Reading list filter - show only reading list items
      if (activeFilters.readingList) {
        if (!b.isReadingListItem) return false;
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
        // `contentQualityScore` is the field Deep Analysis writes; this used to
        // read `qualityScore`, which nothing has ever set.
        const qualityScore = b.contentQualityScore || 0;
        if (min !== undefined && min !== null && qualityScore < min) return false;
        if (max !== undefined && max !== null && qualityScore > max) return false;
      }

      // Has published date filter
      if (activeFilters.hasPublishedDate !== null && activeFilters.hasPublishedDate !== undefined) {
        const hasDate = Boolean(b.publishedDate || b.rawMetadata?.publishedDate);
        if (activeFilters.hasPublishedDate !== hasDate) return false;
      }

      // Content freshness: the article itself is N+ years old, which is a very
      // different signal from "you saved this N years ago".
      if (activeFilters.contentAgeYears) {
        const published = publishedTimestamp(b);
        if (published === null) return false;
        if (now - published < activeFilters.contentAgeYears * YEAR_MS) return false;
      }

      return true;
    });
  }

  if (!query || !query.trim()) {
    const sortFn = getSortFunction(options.sortBy || 'date_desc');
    // slice() first: filteredBookmarks may still be the shared cached corpus.
    const sorted = filteredBookmarks.slice().sort(sortFn);
    const response = {
      results: sorted.slice(offset, offset + limit),
      total: sorted.length,
      hasMore: offset + limit < sorted.length,
      parsedQuery: null,
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

  // Relevance scores keyed by id, so only the returned page carries _searchScore.
  let scoreLookup = null;

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
          suggest: true, // Enable suggestions/fuzzy matching
        });

        // FlexSearch Document search returns results grouped by field:
        // [{ field: 'title', result: [id1, id2] }, { field: 'url', result: [id3] }, ...]
        // We need to collect all unique IDs
        const resultIds = new Set();

        if (Array.isArray(searchResults)) {
          searchResults.forEach((fieldResult) => {
            if (fieldResult && Array.isArray(fieldResult.result)) {
              fieldResult.result.forEach((id) => resultIds.add(id));
            }
          });
        }

        // Filter the already filtered bookmarks (from special filters)
        // to only include those found by FlexSearch.
        // Reading-list rows carry synthetic ids and are never added to the index,
        // so intersecting on id alone dropped 100% of them; they are matched by
        // matchesAdvancedQuery below instead.
        filteredBookmarks = filteredBookmarks.filter(
          (bookmark) => bookmark.isReadingListItem || resultIds.has(bookmark.id),
        );

        // Then apply the remaining advanced query logic (negative terms, phrases, regex)
        // This is still needed because FlexSearch might not handle negative terms/regex exactly as we want
        // or we want to be double sure
        filteredBookmarks = filteredBookmarks.filter((bookmark) =>
          matchesAdvancedQuery(bookmark, parsedQuery),
        );
      } catch (err) {
        console.error('FlexSearch failed, falling back to manual search:', err);
        // Fallback to manual search
        filteredBookmarks = filteredBookmarks.filter((bookmark) =>
          matchesAdvancedQuery(bookmark, parsedQuery),
        );
      }
    } else {
      // No regular terms (only negative, phrases, or regex), use manual filter
      filteredBookmarks = filteredBookmarks.filter((bookmark) =>
        matchesAdvancedQuery(bookmark, parsedQuery),
      );
    }

    // Score into a side map rather than spreading every matching record. The old
    // version cloned the full object — `rawMetadata` blobs included — for every
    // match, on every keystroke, only to slice one page out of it afterwards.
    const sortBy = options.sortBy || 'relevance';
    scoreLookup = new Map();
    for (const bookmark of filteredBookmarks) {
      scoreLookup.set(bookmark.id, calculateRelevanceScore(bookmark, parsedQuery));
    }

    filteredBookmarks = filteredBookmarks.slice();
    if (sortBy === 'relevance') {
      filteredBookmarks.sort((a, b) => scoreLookup.get(b.id) - scoreLookup.get(a.id));
    } else {
      filteredBookmarks.sort(getSortFunction(sortBy));
    }
  } else {
    // No text query
    const sortFn = getSortFunction(options.sortBy || 'date_desc');
    filteredBookmarks = filteredBookmarks.slice();
    filteredBookmarks.sort(sortFn);
  }

  const total = filteredBookmarks.length;

  // Build response
  const response = {
    results: filteredBookmarks
      .slice(offset, offset + limit)
      .map((bookmark) =>
        scoreLookup ? { ...bookmark, _searchScore: scoreLookup.get(bookmark.id) } : bookmark,
      ),
    total,
    hasMore: offset + limit < total,
    parsedQuery,
    specialFilters,
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
function computeSearchResultStats(bookmarks) {
  const domainCounts = new Map();
  const folderCounts = new Map();
  const topicCounts = new Map();

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

  let week = 0,
    twoWeek = 0,
    month = 0,
    threeMonth = 0,
    sixMonth = 0,
    year = 0,
    older = 0;

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

  const dateCounts = { week, twoWeek, month, threeMonth, sixMonth, year, older };

  return { domains, folders, topics, dateCounts };
}
