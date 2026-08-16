// IndexedDB database using Dexie.js
// This provides a structured, indexed storage layer for bookmarks and enrichment data

import Dexie from 'dexie';
import { isDead, isEnrichable, isEnriched } from './predicates.js';

// Initialize Dexie database
export const db = new Dexie('BookmarkInsightsDB');

// Schema version 5 is the oldest declaration kept: versions 1-4 had no data
// migration (their upgrade bodies only logged), and Dexie upgrades an older
// store directly to the newest declared version.
// Version 6 drops `similarities`, which no code ever wrote to.
db.version(6).stores({
  bookmarks:
    'id, url, title, domain, category, dateAdded, lastAccessed, lastChecked, isAlive, parentId, platform, creator, contentType, publishedDate',
  enrichmentQueue: '++queueId, bookmarkId, addedAt, priority',
  events: '++eventId, bookmarkId, type, timestamp',
  cache: 'key',
  settings: 'key',
  similarities: null,
  computedMetrics: 'key',
});

// Define default settings
const DEFAULT_SETTINGS = {
  enrichmentEnabled: true,
  enrichmentBatchSize: 50,
  enrichmentConcurrency: 5, // Number of parallel requests (1-20)
  enrichmentFreshnessDays: 30, // Re-enrich bookmarks older than this many days (0 = always re-enrich)
  privacyMode: false, // If true, skip enrichment entirely - no outbound requests
  trackBrowsingBehavior: false, // If false, don't track tab visits (default OFF for privacy)
  dataVersion: 0, // Set by background.js; gates the update-time index rebuild
};

// Initialize settings
async function initializeSettings() {
  try {
    const existingSettings = await db.settings.get('app');
    if (!existingSettings) {
      await db.settings.put({ key: 'app', ...DEFAULT_SETTINGS });
    }
  } catch (error) {
    console.error('Error initializing settings:', error);
  }
}

// Get current settings
export async function getSettings() {
  try {
    const settings = await db.settings.get('app');
    return settings || DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error getting settings:', error);
    return DEFAULT_SETTINGS;
  }
}

// Update settings
export async function updateSettings(newSettings) {
  try {
    const current = await getSettings();
    await db.settings.put({ key: 'app', ...current, ...newSettings });
    return true;
  } catch (error) {
    console.error('Error updating settings:', error);
    return false;
  }
}

// =============================================
// Corpus cache
// =============================================

// Reading the whole bookmarks table is the hot path for search, insights and
// similarity - a single keystroke used to trigger several multi-MB reads. These
// caches hold the deserialized rows for a short window; every write path in
// this module invalidates them, and other contexts invalidate via
// invalidateBookmarkCorpus() when they receive a `bookmarksChanged` message.
const CORPUS_TTL_MS = 30 * 1000;

function createTtlCache(load, ttlMs) {
  let value = null;
  let loadedAt = 0;
  let inflight = null;

  return {
    async get() {
      if (value && Date.now() - loadedAt < ttlMs) return value;
      if (inflight) return inflight;

      inflight = load()
        .then((result) => {
          value = result;
          loadedAt = Date.now();
          return result;
        })
        .finally(() => {
          inflight = null;
        });

      return inflight;
    },
    invalidate() {
      value = null;
      loadedAt = 0;
    },
  };
}

const bookmarkCorpus = createTtlCache(() => db.bookmarks.toArray(), CORPUS_TTL_MS);
const readingListCorpus = createTtlCache(() => getReadingListItems(), CORPUS_TTL_MS);

/**
 * Drop the cached corpus. Called by every write path here, and by UI contexts
 * when the background script reports a change.
 */
export function invalidateBookmarkCorpus() {
  bookmarkCorpus.invalidate();
  readingListCorpus.invalidate();
}

// Get all bookmarks from IndexedDB.
// Returns a shallow copy so callers may sort or splice the array freely; the
// bookmark objects themselves are shared and must be treated as read-only.
export async function getAllBookmarks() {
  try {
    return (await bookmarkCorpus.get()).slice();
  } catch (error) {
    console.error('Error getting bookmarks:', error);
    return [];
  }
}

/**
 * Get all bookmarks including reading list items
 * This combines the IndexedDB bookmarks with Chrome's reading list
 * @returns {Promise<Array>} Combined array of bookmarks and reading list items
 */
export async function getAllBookmarksWithReadingList() {
  try {
    const [bookmarks, readingListItems] = await Promise.all([
      bookmarkCorpus.get(),
      readingListCorpus.get(),
    ]);

    // Reading list items already have isReadingListItem: true from getReadingListItems
    return [...bookmarks, ...readingListItems];
  } catch (error) {
    console.error('Error getting bookmarks with reading list:', error);
    return [];
  }
}

// Get bookmark by ID
export async function getBookmark(id) {
  try {
    return await db.bookmarks.get(id);
  } catch (error) {
    console.error('Error getting bookmark:', error);
    return null;
  }
}

// Add or update a bookmark
export async function upsertBookmark(bookmark) {
  try {
    await db.bookmarks.put(bookmark);
    invalidateBookmarkCorpus();
    return true;
  } catch (error) {
    console.error('Error upserting bookmark:', error);
    return false;
  }
}

// Add multiple bookmarks
export async function bulkUpsertBookmarks(bookmarks) {
  try {
    await db.bookmarks.bulkPut(bookmarks);
    invalidateBookmarkCorpus();
    return true;
  } catch (error) {
    console.error('Error bulk upserting bookmarks:', error);
    return false;
  }
}

/**
 * Smart merge bookmarks - preserves enrichment data during sync
 * This fixes the issue where extension updates reset enrichment progress
 * @param {Array} newBookmarks - Fresh bookmarks from Chrome API
 * @returns {Promise<boolean>} Success status
 */
export async function smartMergeBookmarks(newBookmarks) {
  try {
    // Get all existing bookmarks as a map for fast lookup
    const existingBookmarks = await db.bookmarks.toArray();
    const existingMap = new Map(existingBookmarks.map((b) => [b.id, b]));

    // Merge new bookmarks with existing enrichment data
    const mergedBookmarks = newBookmarks.map((newBookmark) => {
      const existing = existingMap.get(newBookmark.id);

      if (existing) {
        // Preserve enrichment data from existing bookmark
        return {
          // Chrome bookmark fields (always take fresh)
          id: newBookmark.id,
          title: newBookmark.title,
          url: newBookmark.url,
          dateAdded: newBookmark.dateAdded,
          parentId: newBookmark.parentId,
          folderPath: newBookmark.folderPath,
          domain: newBookmark.domain,
          // Enrichment fields (preserve existing)
          description: existing.description ?? null,
          keywords: existing.keywords ?? [],
          category: existing.category ?? null,
          tags: existing.tags ?? [],
          isAlive: existing.isAlive ?? null,
          lastChecked: existing.lastChecked ?? null,
          enrichedAt: existing.enrichedAt ?? null,
          enrichable: existing.enrichable ?? null,
          enrichmentError: existing.enrichmentError ?? null,
          faviconUrl: existing.faviconUrl ?? null,
          contentSnippet: existing.contentSnippet ?? null,
          rawMetadata: existing.rawMetadata ?? null,
          lastAccessed: existing.lastAccessed ?? null,
          accessCount: existing.accessCount ?? 0,
          // Platform-specific fields (preserve existing)
          platform: existing.platform ?? null,
          creator: existing.creator ?? null,
          contentType: existing.contentType ?? null,
          platformData: existing.platformData ?? null,
        };
      }

      // New bookmark - use default enrichment fields
      return {
        ...newBookmark,
        description: null,
        keywords: [],
        category: null,
        tags: [],
        isAlive: null,
        lastChecked: null,
        enrichedAt: null,
        enrichable: null,
        enrichmentError: null,
        faviconUrl: null,
        contentSnippet: null,
        rawMetadata: null,
        lastAccessed: null,
        accessCount: 0,
        // Platform-specific fields
        platform: null,
        creator: null,
        contentType: null,
        platformData: null,
      };
    });

    // Bulk upsert the merged bookmarks
    await db.bookmarks.bulkPut(mergedBookmarks);

    // Chrome is the source of truth: anything still stored but no longer present
    // upstream was deleted while the service worker was suspended, or on another
    // synced device. Without this the row survives in every stat and search
    // result indefinitely.
    const incomingIds = new Set(newBookmarks.map((b) => b.id));
    const removedIds = existingBookmarks.map((b) => b.id).filter((id) => !incomingIds.has(id));
    if (removedIds.length > 0) {
      await db.bookmarks.bulkDelete(removedIds);
    }

    invalidateBookmarkCorpus();

    console.log(
      `Smart merged ${mergedBookmarks.length} bookmarks (${newBookmarks.length - existingMap.size} new, ${existingMap.size} updated, ${removedIds.length} pruned)`,
    );
    return { success: true, removedIds };
  } catch (error) {
    console.error('Error smart merging bookmarks:', error);
    return { success: false, removedIds: [] };
  }
}

// Delete several bookmarks from IndexedDB only. Used by the sync prune and the
// onRemoved handler, where Chrome has already removed the real bookmarks.
export async function bulkDeleteBookmarks(ids) {
  if (!ids || ids.length === 0) return true;
  try {
    await db.bookmarks.bulkDelete(ids);
    invalidateBookmarkCorpus();
    return true;
  } catch (error) {
    console.error('Error bulk deleting bookmarks:', error);
    return false;
  }
}

// Note: The main searchBookmarks function is in search.js using FlexSearch
// This legacy function is kept for backward compatibility but deprecated
// Use import { searchBookmarks } from './search.js' instead

// Get bookmarks by domain
export async function getBookmarksByDomain(domain) {
  try {
    return await db.bookmarks.where('domain').equals(domain).toArray();
  } catch (error) {
    console.error('Error getting bookmarks by domain:', error);
    return [];
  }
}

// Get bookmarks by date range
export async function getBookmarksByDateRange(startDate, endDate) {
  try {
    return await db.bookmarks.where('dateAdded').between(startDate, endDate, true, true).toArray();
  } catch (error) {
    console.error('Error getting bookmarks by date range:', error);
    return [];
  }
}

// Event logging
export async function logEvent(bookmarkId, type, metadata = {}) {
  try {
    await db.events.add({
      bookmarkId,
      type, // 'create', 'delete', 'access', 'update', 'enrichment'
      timestamp: Date.now(),
      ...metadata,
    });
    return true;
  } catch (error) {
    console.error('Error logging event:', error);
    return false;
  }
}

// Cache operations
export async function setCache(key, value, ttl = null) {
  try {
    await db.cache.put({
      key,
      value,
      timestamp: Date.now(),
      ttl,
    });
    return true;
  } catch (error) {
    console.error('Error setting cache:', error);
    return false;
  }
}

export async function getCache(key) {
  try {
    const cached = await db.cache.get(key);
    if (!cached) return null;

    // Check TTL
    if (cached.ttl && Date.now() - cached.timestamp > cached.ttl) {
      await db.cache.delete(key);
      return null;
    }

    return cached.value;
  } catch (error) {
    console.error('Error getting cache:', error);
    return null;
  }
}

// Enrichment queue operations
export async function addToEnrichmentQueue(bookmarkId, priority = 0) {
  try {
    // Check if already in queue
    const existing = await db.enrichmentQueue.where('bookmarkId').equals(bookmarkId).first();
    if (existing) {
      return false; // Already queued
    }

    await db.enrichmentQueue.add({
      bookmarkId,
      addedAt: Date.now(),
      priority, // Higher priority = processed first
    });
    return true;
  } catch (error) {
    console.error('Error adding to enrichment queue:', error);
    return false;
  }
}

/**
 * Queue many bookmarks at once. Sync used to await addToEnrichmentQueue per
 * bookmark, which meant an indexed lookup plus an insert - two transactions -
 * for every row. This does one read and one bulkAdd.
 * @param {string[]} bookmarkIds
 * @param {number} priority
 * @returns {Promise<number>} Number of rows actually queued
 */
export async function bulkAddToEnrichmentQueue(bookmarkIds, priority = 0) {
  if (!bookmarkIds || bookmarkIds.length === 0) return 0;

  try {
    const queued = new Set(await db.enrichmentQueue.orderBy('bookmarkId').keys());
    const addedAt = Date.now();
    const rows = [...new Set(bookmarkIds)]
      .filter((bookmarkId) => !queued.has(bookmarkId))
      .map((bookmarkId) => ({ bookmarkId, addedAt, priority }));

    if (rows.length > 0) {
      await db.enrichmentQueue.bulkAdd(rows);
    }
    return rows.length;
  } catch (error) {
    console.error('Error bulk adding to enrichment queue:', error);
    return 0;
  }
}

export async function getNextEnrichmentBatch(batchSize = 20) {
  try {
    return await db.enrichmentQueue.orderBy('priority').reverse().limit(batchSize).toArray();
  } catch (error) {
    console.error('Error getting enrichment batch:', error);
    return [];
  }
}

export async function removeFromEnrichmentQueue(queueId) {
  try {
    await db.enrichmentQueue.delete(queueId);
    return true;
  } catch (error) {
    console.error('Error removing from enrichment queue:', error);
    return false;
  }
}

export async function clearEnrichmentQueue() {
  try {
    await db.enrichmentQueue.clear();
    return true;
  } catch (error) {
    console.error('Error clearing enrichment queue:', error);
    return false;
  }
}

// =============================================
// Reading List API Functions
// =============================================

/**
 * Get all items from Chrome's Reading List
 * @returns {Promise<Array>} Array of reading list items
 */
export async function getReadingListItems() {
  try {
    if (!chrome.readingList) {
      console.warn('Reading List API not available');
      return [];
    }
    const items = await chrome.readingList.query({});
    return items.map((item) => ({
      ...item,
      id: `reading-list-${encodeURIComponent(item.url)}`, // Unique ID for reading list items
      isReadingListItem: true,
      dateAdded: item.creationTime,
      lastUpdated: item.lastUpdateTime,
      domain: (() => {
        try {
          return new URL(item.url).hostname;
        } catch {
          return 'unknown';
        }
      })(),
    }));
  } catch (error) {
    console.error('Error getting reading list items:', error);
    return [];
  }
}

/**
 * Remove an item from Chrome's Reading List
 * @param {string} url - URL of the item to remove
 * @returns {Promise<boolean>} Success status
 */
export async function removeFromReadingList(url) {
  try {
    if (!chrome.readingList) {
      console.warn('Reading List API not available');
      return false;
    }
    await chrome.readingList.removeEntry({ url });
    return true;
  } catch (error) {
    console.error('Error removing from reading list:', error);
    return false;
  }
}

/**
 * Mark a reading list item as read/unread
 * @param {string} url - URL of the item
 * @param {boolean} hasBeenRead - Read status
 * @returns {Promise<boolean>} Success status
 */
export async function updateReadingListItem(url, hasBeenRead) {
  try {
    if (!chrome.readingList) {
      console.warn('Reading List API not available');
      return false;
    }
    await chrome.readingList.updateEntry({ url, hasBeenRead });
    return true;
  } catch (error) {
    console.error('Error updating reading list item:', error);
    return false;
  }
}

// Initialize database
export async function initializeDatabase() {
  try {
    await initializeSettings();
    console.log('Database initialized');
    return { success: true };
  } catch (error) {
    console.error('Error initializing database:', error);
    return { success: false, error: error.message };
  }
}

// =============================================
// Computed Metrics Caching System
// =============================================

/**
 * Canonical cache keys. Every `getCachedMetric` call, every TTL and every
 * invalidation rule must reference one of these — they are the only keys ever
 * written to the `computedMetrics` table.
 */
export const CACHE_KEYS = {
  DOMAIN_ANALYTICS: 'domainAnalytics',
  AGE_DISTRIBUTION: 'ageDistribution',
  CREATION_PATTERNS: 'creationPatterns',
  WORD_FREQUENCY: 'wordFrequency',
  DUPLICATES: 'duplicates',
  QUICK_STATS: 'quickStats',
  QUICK_DUPLICATE_COUNT: 'quickDuplicateCount',
  SIMILARITIES: 'similarities',
};

/**
 * Cache duration constants (in milliseconds)
 */
export const CACHE_DURATIONS = {
  [CACHE_KEYS.DOMAIN_ANALYTICS]: 60 * 60 * 1000, // 1 hour
  [CACHE_KEYS.AGE_DISTRIBUTION]: 6 * 60 * 60 * 1000, // 6 hours
  [CACHE_KEYS.CREATION_PATTERNS]: 6 * 60 * 60 * 1000, // 6 hours
  [CACHE_KEYS.WORD_FREQUENCY]: 24 * 60 * 60 * 1000, // 24 hours
  [CACHE_KEYS.DUPLICATES]: 24 * 60 * 60 * 1000, // 24 hours
  [CACHE_KEYS.QUICK_STATS]: 5 * 60 * 1000, // 5 minutes
  [CACHE_KEYS.QUICK_DUPLICATE_COUNT]: 5 * 60 * 1000, // 5 minutes
  [CACHE_KEYS.SIMILARITIES]: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Generic cached metric getter
 * @param {string} key - Cache key
 * @param {Function} computeFn - Function to compute the metric if not cached
 * @param {number} ttlMs - Time to live in milliseconds
 * @returns {Promise<any>} Cached or computed data
 */
async function getCachedMetric(key, computeFn, ttlMs) {
  try {
    const cached = await db.computedMetrics.get(key);
    if (cached && cached.validUntil > Date.now()) {
      console.log(`Cache hit for metric: ${key}`);
      return cached.data;
    }

    console.log(`Cache miss for metric: ${key}, computing...`);
    const data = await computeFn();

    await db.computedMetrics.put({
      key,
      data,
      computedAt: Date.now(),
      validUntil: Date.now() + ttlMs,
    });

    return data;
  } catch (error) {
    console.error(`Error getting cached metric ${key}:`, error);
    // Fall back to computing without cache
    return computeFn();
  }
}

/**
 * Invalidate specific metric caches based on change type
 * @param {string} changeType - Type of change: 'add', 'delete', 'update', 'enrich'
 */
export async function invalidateMetricCaches(changeType) {
  const {
    DOMAIN_ANALYTICS,
    AGE_DISTRIBUTION,
    CREATION_PATTERNS,
    WORD_FREQUENCY,
    DUPLICATES,
    QUICK_STATS,
    QUICK_DUPLICATE_COUNT,
    SIMILARITIES,
  } = CACHE_KEYS;

  const keysToInvalidate = {
    add: [
      DOMAIN_ANALYTICS,
      AGE_DISTRIBUTION,
      CREATION_PATTERNS,
      WORD_FREQUENCY,
      DUPLICATES,
      QUICK_DUPLICATE_COUNT,
      QUICK_STATS,
    ],
    delete: [
      DOMAIN_ANALYTICS,
      AGE_DISTRIBUTION,
      CREATION_PATTERNS,
      WORD_FREQUENCY,
      DUPLICATES,
      QUICK_DUPLICATE_COUNT,
      SIMILARITIES,
      QUICK_STATS,
    ],
    update: [WORD_FREQUENCY, DUPLICATES, QUICK_DUPLICATE_COUNT, QUICK_STATS],
    enrich: [DOMAIN_ANALYTICS, WORD_FREQUENCY, SIMILARITIES, QUICK_STATS],
    all: Object.keys(CACHE_DURATIONS),
  };

  const keys = keysToInvalidate[changeType] || [];

  invalidateBookmarkCorpus();

  try {
    for (const key of keys) {
      await db.computedMetrics.delete(key);
    }
    console.log(`Invalidated caches for change type: ${changeType}`, keys);
  } catch (error) {
    console.error('Error invalidating metric caches:', error);
  }
}

/**
 * Clear all computed metrics (useful for debugging or forced refresh)
 */
async function clearAllMetricCaches() {
  try {
    await db.computedMetrics.clear();
    invalidateBookmarkCorpus();
    console.log('Cleared all metric caches');
    return true;
  } catch (error) {
    console.error('Error clearing metric caches:', error);
    return false;
  }
}

// =============================================
// Similarity Storage Functions
// =============================================

// =============================================
// Consolidated Analytics Functions
// (Migrated from database.js for single source of truth)
// =============================================

/**
 * Get consolidated domain analytics in a single pass
 */
async function getConsolidatedDomainAnalytics() {
  return getCachedMetric(
    CACHE_KEYS.DOMAIN_ANALYTICS,
    async () => {
      const bookmarks = await getAllBookmarks();
      const domainData = {};

      bookmarks.forEach((bookmark) => {
        if (!bookmark.domain) return;

        if (!domainData[bookmark.domain]) {
          domainData[bookmark.domain] = {
            domain: bookmark.domain,
            count: 0,
            latestDate: 0,
            oldestDate: Infinity,
            enrichedCount: 0,
          };
        }

        const data = domainData[bookmark.domain];
        data.count++;
        if (isEnriched(bookmark)) data.enrichedCount++;
        if (bookmark.dateAdded > data.latestDate) data.latestDate = bookmark.dateAdded;
        if (bookmark.dateAdded < data.oldestDate) data.oldestDate = bookmark.dateAdded;
      });

      const domainArray = Object.values(domainData);
      const totalBookmarks = bookmarks.length;

      domainArray.forEach((d) => {
        d.percentage = totalBookmarks > 0 ? Math.round((d.count / totalBookmarks) * 100) : 0;
        d.dateAdded = d.latestDate;
      });

      return {
        byRecency: [...domainArray].sort((a, b) => b.latestDate - a.latestDate),
        byCount: [...domainArray].sort((a, b) => b.count - a.count),
        top10: [...domainArray].sort((a, b) => b.count - a.count).slice(0, 10),
        totalDomains: domainArray.length,
        totalBookmarks,
      };
    },
    CACHE_DURATIONS[CACHE_KEYS.DOMAIN_ANALYTICS],
  );
}

/**
 * Get unique folders from bookmarks
 */
export async function getUniqueFolders() {
  try {
    const bookmarks = await getAllBookmarks();
    const folderCounts = {};

    bookmarks.forEach((b) => {
      if (b.folderPath) {
        folderCounts[b.folderPath] = (folderCounts[b.folderPath] || 0) + 1;
      }
    });

    return Object.entries(folderCounts)
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error getting unique folders:', error);
    return [];
  }
}

/**
 * Find duplicate bookmarks
 */
export async function findDuplicates() {
  return getCachedMetric(
    CACHE_KEYS.DUPLICATES,
    async () => {
      const bookmarks = await getAllBookmarks();
      const urlMap = {};

      bookmarks.forEach((bookmark) => {
        const normalizedUrl = bookmark.url.toLowerCase().replace(/\/$/, '');
        if (!urlMap[normalizedUrl]) {
          urlMap[normalizedUrl] = [];
        }
        urlMap[normalizedUrl].push(bookmark);
      });

      return Object.values(urlMap).filter((group) => group.length > 1);
    },
    CACHE_DURATIONS[CACHE_KEYS.DUPLICATES],
  );
}

/**
 * Find uncategorized bookmarks (in root folders)
 */
async function findUncategorizedBookmarks() {
  try {
    const bookmarks = await getAllBookmarks();
    const rootFolders = ['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks', ''];

    return bookmarks.filter((bookmark) => {
      const folderPath = bookmark.folderPath || '';
      return rootFolders.includes(folderPath) || !folderPath.includes('/');
    });
  } catch (error) {
    console.error('Error finding uncategorized bookmarks:', error);
    return [];
  }
}

/**
 * Find malformed URLs
 */
export async function findMalformedUrls() {
  try {
    const bookmarks = await getAllBookmarks();

    const validSchemes = [
      'http://',
      'https://',
      'chrome://',
      'chrome-extension://',
      'file://',
      'javascript:',
      'data:',
      'about:',
      'mailto:',
      'tel:',
      'ftp://',
      'sftp://',
      'ssh://',
    ];

    return bookmarks.filter((bookmark) => {
      const url = bookmark.url || '';
      const hasValidScheme = validSchemes.some((scheme) => url.startsWith(scheme));
      return !hasValidScheme || url.trim() === '';
    });
  } catch (error) {
    console.error('Error finding malformed URLs:', error);
    return [];
  }
}

/**
 * Get quick statistics for dashboard
 */
export async function getQuickStats() {
  return getCachedMetric(
    CACHE_KEYS.QUICK_STATS,
    async () => {
      const bookmarks = await getAllBookmarks();
      const duplicates = await findDuplicates();
      const uncategorized = await findUncategorizedBookmarks();
      const malformed = await findMalformedUrls();

      const now = Date.now();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      const oneMonth = 30 * 24 * 60 * 60 * 1000;

      const enrichable = bookmarks.filter(isEnrichable);
      const enriched = enrichable.filter(isEnriched).length;
      const deadLinks = bookmarks.filter(isDead).length;
      const uniqueDomains = new Set(bookmarks.map((b) => b.domain).filter((d) => d)).size;

      return {
        total: bookmarks.length,
        enriched,
        pending: enrichable.length - enriched,
        enrichedPercentage:
          enrichable.length > 0 ? Math.round((enriched / enrichable.length) * 100) : 0,
        duplicateGroups: duplicates.length,
        uncategorized: uncategorized.length,
        malformed: malformed.length,
        deadLinks,
        uniqueDomains,
        addedThisWeek: bookmarks.filter((b) => now - b.dateAdded < oneWeek).length,
        addedThisMonth: bookmarks.filter((b) => now - b.dateAdded < oneMonth).length,
        oldestBookmark: bookmarks.reduce(
          (oldest, b) => (b.dateAdded < oldest ? b.dateAdded : oldest),
          Date.now(),
        ),
        newestBookmark: bookmarks.reduce(
          (newest, b) => (b.dateAdded > newest ? b.dateAdded : newest),
          0,
        ),
      };
    },
    CACHE_DURATIONS[CACHE_KEYS.QUICK_STATS],
  );
}

/**
 * Export bookmarks to JSON format
 */
export async function exportBookmarks() {
  try {
    const bookmarks = await getAllBookmarks();
    return {
      exportDate: new Date().toISOString(),
      version: '2.0',
      totalBookmarks: bookmarks.length,
      bookmarks: bookmarks,
    };
  } catch (error) {
    console.error('Error exporting bookmarks:', error);
    throw error;
  }
}

// =============================================
// Additional Analytics Functions (migrated from database.js)
// =============================================

/**
 * Get bookmarks by folder path
 */
export async function getBookmarksByFolder(folderPath) {
  try {
    const bookmarks = await getAllBookmarks();
    return bookmarks.filter((bookmark) => bookmark.folderPath === folderPath);
  } catch (error) {
    console.error('Error getting bookmarks by folder:', error);
    return [];
  }
}

/**
 * Get domains sorted by recency
 */
export async function getDomainsByRecency() {
  const analytics = await getConsolidatedDomainAnalytics();
  return analytics.byRecency;
}

/**
 * Get domains sorted by count
 */
export async function getDomainsByCount() {
  const analytics = await getConsolidatedDomainAnalytics();
  return analytics.byCount;
}

/**
 * Delete multiple bookmarks
 */
export async function deleteBookmarks(bookmarkIds) {
  try {
    const errors = [];

    // Delete from Chrome bookmarks API
    for (const id of bookmarkIds) {
      try {
        await chrome.bookmarks.remove(id);
      } catch (error) {
        console.error(`Error deleting bookmark ${id}:`, error);
        errors.push({ id, error: error.message });
      }
    }

    // Remove from IndexedDB
    await db.bookmarks.bulkDelete(bookmarkIds);

    // Invalidate caches
    await invalidateMetricCaches('delete');

    return {
      success: bookmarkIds.length - errors.length,
      errors: errors,
    };
  } catch (error) {
    console.error('Error deleting bookmarks:', error);
    throw error;
  }
}

/**
 * Get bookmarks that have been detected as dead links
 * Returns bookmarks where isAlive === false (already checked and found dead)
 */
export async function getDeadLinks() {
  try {
    const bookmarks = await getAllBookmarks();
    return bookmarks.filter((b) => b.isAlive === false);
  } catch (error) {
    console.error('Error getting dead links:', error);
    return [];
  }
}

// =============================================
// Backup & Restore System
// =============================================

/**
 * Create a full backup of the IndexedDB database
 * @returns {Promise<Object>} Backup object with all data
 */
async function createBackup() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const settings = await db.settings.toArray();
    const events = await db.events.orderBy('timestamp').reverse().limit(1000).toArray();

    // Get stats for backup metadata
    const enrichedCount = bookmarks.filter(isEnriched).length;
    const categorizedCount = bookmarks.filter((b) => b.category).length;

    const backup = {
      version: '2.1',
      schemaVersion: 3,
      createdAt: new Date().toISOString(),
      metadata: {
        totalBookmarks: bookmarks.length,
        enrichedCount,
        categorizedCount,
        eventsCount: events.length,
      },
      data: {
        bookmarks,
        settings,
        events,
      },
    };

    return backup;
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
}

/**
 * Download backup as a file
 * @param {string} format - The format to download: 'json' or 'db'
 */
export async function downloadBackup(format = 'json') {
  try {
    const backup = await createBackup();
    const date = new Date().toISOString().slice(0, 10);

    let blob, filename;

    if (format === 'db') {
      // Export as binary format (.db) - JSON with optional gzip compression
      // Add a magic header to identify the format: "BKMI" (Bookmark Insights)
      const MAGIC_HEADER = 'BKMI'; // 4 bytes
      const VERSION = 1; // 1 byte for version

      const jsonStr = JSON.stringify(backup);
      const encoder = new TextEncoder();
      const jsonBytes = encoder.encode(jsonStr);

      let isCompressed = false;
      let payloadBytes = jsonBytes;

      // Try to compress using CompressionStream if available
      if (typeof CompressionStream !== 'undefined') {
        try {
          const cs = new CompressionStream('gzip');
          const writer = cs.writable.getWriter();
          writer.write(jsonBytes);
          writer.close();
          const compressedData = await new Response(cs.readable).arrayBuffer();
          // Only use compression if it's smaller
          if (compressedData.byteLength < jsonBytes.byteLength) {
            payloadBytes = new Uint8Array(compressedData);
            isCompressed = true;
          }
        } catch (compressionError) {
          console.warn('Compression failed, using uncompressed format:', compressionError);
        }
      }

      // Build the final binary: MAGIC (4) + VERSION (1) + FLAGS (1) + PAYLOAD
      // FLAGS: bit 0 = isCompressed
      const flags = isCompressed ? 1 : 0;
      const headerBytes = encoder.encode(MAGIC_HEADER);
      const finalData = new Uint8Array(4 + 1 + 1 + payloadBytes.length);
      finalData.set(headerBytes, 0);
      finalData[4] = VERSION;
      finalData[5] = flags;
      finalData.set(payloadBytes, 6);

      blob = new Blob([finalData], { type: 'application/octet-stream' });
      filename = `bookmark-insights-backup-${date}.db`;
    } else {
      // Default JSON format
      blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      filename = `bookmark-insights-backup-${date}.json`;
    }

    const url = URL.createObjectURL(blob);

    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, filename, metadata: backup.metadata };
  } catch (error) {
    console.error('Error downloading backup:', error);
    throw error;
  }
}

/**
 * Parse a .db backup file and extract the JSON backup object
 * Handles both new format (with BKMI magic header) and legacy formats
 * @param {ArrayBuffer} arrayBuffer - The raw file data
 * @returns {Promise<Object>} The parsed backup object
 */
export async function parseDbBackupFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder();

  // Check for new format with magic header "BKMI"
  if (bytes.length > 6) {
    const magicHeader = decoder.decode(bytes.slice(0, 4));
    if (magicHeader === 'BKMI') {
      const flags = bytes[5];
      const isCompressed = (flags & 1) === 1;
      const payload = bytes.slice(6);

      let jsonStr;
      if (isCompressed && typeof DecompressionStream !== 'undefined') {
        try {
          const ds = new DecompressionStream('gzip');
          const writer = ds.writable.getWriter();
          writer.write(payload);
          writer.close();
          const decompressedData = await new Response(ds.readable).arrayBuffer();
          jsonStr = decoder.decode(decompressedData);
        } catch (decompressError) {
          throw new Error('Failed to decompress backup file: ' + decompressError.message);
        }
      } else {
        jsonStr = decoder.decode(payload);
      }

      return JSON.parse(jsonStr);
    }
  }

  // Legacy format: try gzip decompression first
  let textData;
  try {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const decompressedData = await new Response(ds.readable).arrayBuffer();
      textData = decoder.decode(decompressedData);
    } else {
      // No DecompressionStream, try as plain text
      textData = decoder.decode(bytes);
    }
  } catch (decompressError) {
    // Decompression failed, try as plain text
    textData = decoder.decode(bytes);
  }

  return JSON.parse(textData);
}

/**
 * Restore database from a backup file
 * @param {Object} backup - The backup object to restore from
 * @param {Object} options - Restore options
 * @returns {Promise<Object>} Restore result
 */
export async function restoreFromBackup(backup, options = {}) {
  const {
    restoreBookmarks = true,
    restoreSettings = true,
    restoreEvents = false, // Events are optional
    mergeMode = false, // If true, merge with existing data; if false, replace
  } = options;

  try {
    // Validate backup format
    if (!backup || !backup.version || !backup.data) {
      throw new Error('Invalid backup format');
    }

    if (!backup.data.bookmarks || !Array.isArray(backup.data.bookmarks)) {
      throw new Error('Backup does not contain valid bookmarks data');
    }

    const results = {
      bookmarksRestored: 0,
      settingsRestored: 0,
      eventsRestored: 0,
      errors: [],
    };

    // Restore bookmarks
    if (restoreBookmarks && backup.data.bookmarks.length > 0) {
      if (!mergeMode) {
        await db.bookmarks.clear();
      }

      if (mergeMode) {
        // Merge mode: preserve newer enrichment data
        const existingBookmarks = await db.bookmarks.toArray();
        const existingMap = new Map(existingBookmarks.map((b) => [b.id, b]));

        for (const bookmark of backup.data.bookmarks) {
          const existing = existingMap.get(bookmark.id);
          if (existing) {
            // Keep whichever has more recent lastChecked
            const existingTime = existing.lastChecked || 0;
            const backupTime = bookmark.lastChecked || 0;
            if (backupTime > existingTime) {
              await db.bookmarks.put(bookmark);
              results.bookmarksRestored++;
            }
          } else {
            await db.bookmarks.put(bookmark);
            results.bookmarksRestored++;
          }
        }
      } else {
        // Replace mode: bulk insert
        await db.bookmarks.bulkPut(backup.data.bookmarks);
        results.bookmarksRestored = backup.data.bookmarks.length;
      }
    }

    // Restore settings
    if (restoreSettings && backup.data.settings && backup.data.settings.length > 0) {
      if (!mergeMode) {
        await db.settings.clear();
      }
      await db.settings.bulkPut(backup.data.settings);
      results.settingsRestored = backup.data.settings.length;
    }

    // Restore events (optional)
    if (restoreEvents && backup.data.events && backup.data.events.length > 0) {
      if (!mergeMode) {
        await db.events.clear();
      }
      await db.events.bulkPut(backup.data.events);
      results.eventsRestored = backup.data.events.length;
    }

    // Clear caches after restore
    await clearAllMetricCaches();

    return {
      success: true,
      results,
      backupMetadata: backup.metadata,
    };
  } catch (error) {
    console.error('Error restoring from backup:', error);
    throw error;
  }
}

/**
 * Validate a backup file before restoring
 * @param {Object} backup - The backup object to validate
 * @returns {Object} Validation result
 */
export function validateBackup(backup) {
  const issues = [];

  if (!backup) {
    return { valid: false, issues: ['Backup is empty or null'] };
  }

  if (!backup.version) {
    issues.push('Missing version field');
  }

  if (!backup.data) {
    issues.push('Missing data field');
  } else {
    if (!backup.data.bookmarks || !Array.isArray(backup.data.bookmarks)) {
      issues.push('Missing or invalid bookmarks array');
    }

    if (backup.data.bookmarks && backup.data.bookmarks.length > 0) {
      const sample = backup.data.bookmarks[0];
      if (!sample.id || !sample.url) {
        issues.push('Bookmarks are missing required fields (id, url)');
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    metadata: backup.metadata || null,
    version: backup.version || 'unknown',
    createdAt: backup.createdAt || 'unknown',
  };
}
