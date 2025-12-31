// IndexedDB database using Dexie.js
// This provides a structured, indexed storage layer for bookmarks and enrichment data

import Dexie from 'dexie';

// Initialize Dexie database
export const db = new Dexie('BookmarkInsightsDB');

// Define schema version 1
db.version(1).stores({
  bookmarks: 'id, url, title, domain, category, dateAdded, lastAccessed, lastChecked, isAlive, parentId',
  enrichmentQueue: '++queueId, bookmarkId, addedAt, priority',
  events: '++eventId, bookmarkId, type, timestamp',
  cache: 'key',
  settings: 'key'
});

// Schema version 2: Add rawMetadata field for comprehensive data storage
db.version(2).stores({
  bookmarks: 'id, url, title, domain, category, dateAdded, lastAccessed, lastChecked, isAlive, parentId',
  enrichmentQueue: '++queueId, bookmarkId, addedAt, priority',
  events: '++eventId, bookmarkId, type, timestamp',
  cache: 'key',
  settings: 'key'
}).upgrade(tx => {
  console.log('Upgrading database to version 2 - adding rawMetadata support');
  // No need to modify existing records, new field will be added on enrichment
});

// Schema version 3: Add similarities and computedMetrics tables for caching
db.version(3).stores({
  bookmarks: 'id, url, title, domain, category, dateAdded, lastAccessed, lastChecked, isAlive, parentId',
  enrichmentQueue: '++queueId, bookmarkId, addedAt, priority',
  events: '++eventId, bookmarkId, type, timestamp',
  cache: 'key',
  settings: 'key',
  similarities: '++id, bookmark1Id, bookmark2Id, score, [bookmark1Id+bookmark2Id]',
  computedMetrics: 'key'
}).upgrade(tx => {
  console.log('Upgrading database to version 3 - adding similarities and computedMetrics tables');
});

// Schema version 4: Add platformData fields for platform-specific enrichment
// Adds indexed fields for platform, creator, contentType, repoName for advanced filtering
db.version(4).stores({
  bookmarks: 'id, url, title, domain, category, dateAdded, lastAccessed, lastChecked, isAlive, parentId, platform, creator, contentType',
  enrichmentQueue: '++queueId, bookmarkId, addedAt, priority',
  events: '++eventId, bookmarkId, type, timestamp',
  cache: 'key',
  settings: 'key',
  similarities: '++id, bookmark1Id, bookmark2Id, score, [bookmark1Id+bookmark2Id]',
  computedMetrics: 'key'
}).upgrade(tx => {
  console.log('Upgrading database to version 4 - adding platformData indexes');
  // platformData will be populated during enrichment
});

// Schema version 5: Add deep metadata analysis fields
// Adds readingTime, publishedDate, contentQualityScore, and smartTags for content intelligence
db.version(5).stores({
  bookmarks: 'id, url, title, domain, category, dateAdded, lastAccessed, lastChecked, isAlive, parentId, platform, creator, contentType, publishedDate',
  enrichmentQueue: '++queueId, bookmarkId, addedAt, priority',
  events: '++eventId, bookmarkId, type, timestamp',
  cache: 'key',
  settings: 'key',
  similarities: '++id, bookmark1Id, bookmark2Id, score, [bookmark1Id+bookmark2Id]',
  computedMetrics: 'key'
}).upgrade(tx => {
  console.log('Upgrading database to version 5 - adding deep metadata analysis fields');
  // New fields: readingTime (minutes), publishedDate (timestamp), contentQualityScore (0-100), smartTags (array)
  // These will be populated during metadata analysis (can be run on existing rawMetadata without new fetches)
});

// Define default settings
const DEFAULT_SETTINGS = {
  enrichmentEnabled: true,
  enrichmentSchedule: 'manual', // 'manual' only - user triggers enrichment
  enrichmentBatchSize: 50,
  enrichmentConcurrency: 5, // Number of parallel requests (1-20)
  enrichmentRateLimit: 1000, // milliseconds between requests (deprecated with concurrency)
  enrichmentFreshnessDays: 30, // Re-enrich bookmarks older than this many days (0 = always re-enrich)
  autoCategorizationEnabled: true,
  deadLinkCheckEnabled: true,
  privacyMode: false, // If true, skip enrichment entirely
  trackBrowsingBehavior: false // If false, don't track tab visits (default OFF for privacy)
};

// Initialize settings
export async function initializeSettings() {
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

// Migration: Import data from chrome.storage.local to IndexedDB
export async function migrateFromChromeStorage() {
  try {
    // Check if migration has already been done
    const migrationStatus = await db.settings.get('migration');
    if (migrationStatus && migrationStatus.completed) {
      console.log('Migration already completed');
      return { success: true, alreadyMigrated: true };
    }

    console.log('Starting migration from chrome.storage.local to IndexedDB...');
    
    // Get existing data from chrome.storage.local
    const result = await chrome.storage.local.get(['bookmarks', 'lastSyncTime']);
    const oldBookmarks = result.bookmarks || [];
    
    if (oldBookmarks.length === 0) {
      console.log('No bookmarks to migrate');
      await db.settings.put({ key: 'migration', completed: true, timestamp: Date.now(), count: 0 });
      return { success: true, count: 0 };
    }

    // Transform old bookmarks to new schema with enrichment fields
    const newBookmarks = oldBookmarks.map(bookmark => ({
      ...bookmark,
      // New enrichment fields
      description: null,
      keywords: [],
      category: null,
      tags: [],
      isAlive: null, // null = unknown, true = alive, false = dead
      lastChecked: null,
      faviconUrl: null,
      contentSnippet: null,
      lastAccessed: null,
      accessCount: 0,
      // Platform-specific fields
      platform: null,
      creator: null,
      contentType: null,
      platformData: null
    }));

    // Bulk insert into IndexedDB
    await db.bookmarks.bulkPut(newBookmarks);
    
    // Mark migration as complete
    await db.settings.put({ 
      key: 'migration', 
      completed: true, 
      timestamp: Date.now(), 
      count: newBookmarks.length,
      oldSyncTime: result.lastSyncTime
    });

    console.log(`Successfully migrated ${newBookmarks.length} bookmarks`);
    return { success: true, count: newBookmarks.length };
  } catch (error) {
    console.error('Migration error:', error);
    return { success: false, error: error.message };
  }
}

// Get all bookmarks from IndexedDB
export async function getAllBookmarks() {
  try {
    return await db.bookmarks.toArray();
  } catch (error) {
    console.error('Error getting bookmarks:', error);
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
    const existingMap = new Map(existingBookmarks.map(b => [b.id, b]));
    
    // Merge new bookmarks with existing enrichment data
    const mergedBookmarks = newBookmarks.map(newBookmark => {
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
    
    console.log(`Smart merged ${mergedBookmarks.length} bookmarks (${newBookmarks.length - existingMap.size} new, ${existingMap.size} updated)`);
    return true;
  } catch (error) {
    console.error('Error smart merging bookmarks:', error);
    return false;
  }
}

// Delete a bookmark
export async function deleteBookmark(id) {
  try {
    await db.bookmarks.delete(id);
    return true;
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    return false;
  }
}

// Search bookmarks (basic implementation, will be enhanced with FlexSearch later)
export async function searchBookmarks(query) {
  try {
    if (!query || !query.trim()) {
      return await db.bookmarks.orderBy('dateAdded').reverse().toArray();
    }

    const lowerQuery = query.toLowerCase();
    const bookmarks = await db.bookmarks.toArray();
    
    return bookmarks.filter(bookmark => 
      bookmark.title.toLowerCase().includes(lowerQuery) ||
      bookmark.url.toLowerCase().includes(lowerQuery) ||
      (bookmark.domain && bookmark.domain.toLowerCase().includes(lowerQuery)) ||
      (bookmark.description && bookmark.description.toLowerCase().includes(lowerQuery)) ||
      (bookmark.keywords && bookmark.keywords.some(k => k.toLowerCase().includes(lowerQuery)))
    ).sort((a, b) => b.dateAdded - a.dateAdded);
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

// Get bookmarks by domain
export async function getBookmarksByDomain(domain) {
  try {
    return await db.bookmarks.where('domain').equals(domain).toArray();
  } catch (error) {
    console.error('Error getting bookmarks by domain:', error);
    return [];
  }
}

// Get bookmarks by category
export async function getBookmarksByCategory(category) {
  try {
    return await db.bookmarks.where('category').equals(category).toArray();
  } catch (error) {
    console.error('Error getting bookmarks by category:', error);
    return [];
  }
}

// Get bookmarks by date range
export async function getBookmarksByDateRange(startDate, endDate) {
  try {
    return await db.bookmarks
      .where('dateAdded')
      .between(startDate, endDate, true, true)
      .toArray();
  } catch (error) {
    console.error('Error getting bookmarks by date range:', error);
    return [];
  }
}

// Get unique domains
export async function getUniqueDomains() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const domains = [...new Set(bookmarks.map(b => b.domain).filter(d => d))];
    return domains.sort();
  } catch (error) {
    console.error('Error getting unique domains:', error);
    return [];
  }
}

// Get unique categories
export async function getUniqueCategories() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const categories = [...new Set(bookmarks.map(b => b.category).filter(c => c))];
    return categories.sort();
  } catch (error) {
    console.error('Error getting unique categories:', error);
    return [];
  }
}

// Get domain statistics
export async function getDomainStats() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const domainCount = {};
    
    bookmarks.forEach(bookmark => {
      if (bookmark.domain) {
        domainCount[bookmark.domain] = (domainCount[bookmark.domain] || 0) + 1;
      }
    });
    
    return Object.entries(domainCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  } catch (error) {
    console.error('Error getting domain stats:', error);
    return [];
  }
}

// Get activity timeline
export async function getActivityTimeline() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const monthlyCount = {};
    
    bookmarks.forEach(bookmark => {
      const date = new Date(bookmark.dateAdded);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1;
    });
    
    return Object.entries(monthlyCount).sort();
  } catch (error) {
    console.error('Error getting activity timeline:', error);
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
      ...metadata
    });
    return true;
  } catch (error) {
    console.error('Error logging event:', error);
    return false;
  }
}

// Get events for a bookmark
export async function getBookmarkEvents(bookmarkId, limit = 50) {
  try {
    return await db.events
      .where('bookmarkId').equals(bookmarkId)
      .reverse()
      .limit(limit)
      .toArray();
  } catch (error) {
    console.error('Error getting bookmark events:', error);
    return [];
  }
}

// Get recent events
export async function getRecentEvents(limit = 100) {
  try {
    return await db.events
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  } catch (error) {
    console.error('Error getting recent events:', error);
    return [];
  }
}

// Cache operations
export async function setCache(key, value, ttl = null) {
  try {
    await db.cache.put({
      key,
      value,
      timestamp: Date.now(),
      ttl
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

export async function clearCache(keyPattern = null) {
  try {
    if (keyPattern) {
      const allCache = await db.cache.toArray();
      const toDelete = allCache.filter(c => c.key.includes(keyPattern)).map(c => c.key);
      await db.cache.bulkDelete(toDelete);
    } else {
      await db.cache.clear();
    }
    return true;
  } catch (error) {
    console.error('Error clearing cache:', error);
    return false;
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
      priority // Higher priority = processed first
    });
    return true;
  } catch (error) {
    console.error('Error adding to enrichment queue:', error);
    return false;
  }
}

export async function getNextEnrichmentBatch(batchSize = 20) {
  try {
    return await db.enrichmentQueue
      .orderBy('priority')
      .reverse()
      .limit(batchSize)
      .toArray();
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

export async function getEnrichmentQueueSize() {
  try {
    return await db.enrichmentQueue.count();
  } catch (error) {
    console.error('Error getting queue size:', error);
    return 0;
  }
}

// Initialize database
export async function initializeDatabase() {
  try {
    await initializeSettings();
    const migrationResult = await migrateFromChromeStorage();
    console.log('Database initialized', migrationResult);
    return migrationResult;
  } catch (error) {
    console.error('Error initializing database:', error);
    return { success: false, error: error.message };
  }
}

// =============================================
// Computed Metrics Caching System
// =============================================

/**
 * Cache duration constants (in milliseconds)
 */
const CACHE_DURATIONS = {
  domainStats: 60 * 60 * 1000,      // 1 hour
  activityTimeline: 6 * 60 * 60 * 1000,  // 6 hours
  wordFrequency: 24 * 60 * 60 * 1000,    // 24 hours
  ageDistribution: 6 * 60 * 60 * 1000,   // 6 hours
  categoryTrends: 24 * 60 * 60 * 1000,   // 24 hours
  expertiseAreas: 24 * 60 * 60 * 1000,   // 24 hours
  quickStats: 5 * 60 * 1000,             // 5 minutes
  duplicates: 24 * 60 * 60 * 1000,       // 24 hours
  similarities: 24 * 60 * 60 * 1000,     // 24 hours
  insightsSummary: 5 * 60 * 1000,        // 5 minutes
};

/**
 * Generic cached metric getter
 * @param {string} key - Cache key
 * @param {Function} computeFn - Function to compute the metric if not cached
 * @param {number} ttlMs - Time to live in milliseconds
 * @returns {Promise<any>} Cached or computed data
 */
export async function getCachedMetric(key, computeFn, ttlMs) {
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
      validUntil: Date.now() + ttlMs
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
  const keysToInvalidate = {
    'add': ['domainStats', 'quickStats', 'activityTimeline', 'ageDistribution', 'insightsSummary'],
    'delete': ['domainStats', 'quickStats', 'duplicates', 'similarities', 'insightsSummary'],
    'update': ['quickStats', 'insightsSummary'],
    'enrich': ['categoryTrends', 'expertiseAreas', 'insightsSummary', 'quickStats'],
    'all': Object.keys(CACHE_DURATIONS) // Invalidate all
  };
  
  const keys = keysToInvalidate[changeType] || [];
  
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
export async function clearAllMetricCaches() {
  try {
    await db.computedMetrics.clear();
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

/**
 * Store similarity results for a bookmark
 * @param {string} bookmarkId - Source bookmark ID
 * @param {Array} similarities - Array of {bookmark2Id, score} objects
 */
export async function storeSimilarities(bookmarkId, similarities) {
  try {
    // Remove old similarities for this bookmark
    await db.similarities.where('bookmark1Id').equals(bookmarkId).delete();
    
    // Add new similarities
    const records = similarities.map(sim => ({
      bookmark1Id: bookmarkId,
      bookmark2Id: sim.bookmark2Id,
      score: sim.score,
      computedAt: Date.now()
    }));
    
    await db.similarities.bulkAdd(records);
    return true;
  } catch (error) {
    console.error('Error storing similarities:', error);
    return false;
  }
}

/**
 * Get stored similar bookmarks for a specific bookmark
 * @param {string} bookmarkId - Bookmark ID
 * @returns {Promise<Array>} Array of similar bookmarks with scores
 */
export async function getStoredSimilarities(bookmarkId) {
  try {
    return await db.similarities.where('bookmark1Id').equals(bookmarkId).toArray();
  } catch (error) {
    console.error('Error getting stored similarities:', error);
    return [];
  }
}

/**
 * Clear all stored similarities (call when bookmarks are deleted)
 */
export async function clearSimilarities() {
  try {
    await db.similarities.clear();
    return true;
  } catch (error) {
    console.error('Error clearing similarities:', error);
    return false;
  }
}

// Export cache durations for use in other modules
export { CACHE_DURATIONS };

// =============================================
// Consolidated Analytics Functions
// (Migrated from database.js for single source of truth)
// =============================================

/**
 * Get bookmarks with pagination and filtering
 * @param {number} page - Page number (0-indexed)
 * @param {number} pageSize - Items per page
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Paginated results
 */
export async function getBookmarksPaginated(page = 0, pageSize = 50, filters = {}) {
  try {
    let bookmarks = await getAllBookmarks();
    
    // Apply multiple filters
    if (filters.domains && filters.domains.length > 0) {
      bookmarks = bookmarks.filter(b => filters.domains.includes(b.domain));
    }
    
    if (filters.folders && filters.folders.length > 0) {
      bookmarks = bookmarks.filter(b => filters.folders.includes(b.folderPath));
    }
    
    if (filters.dateRange) {
      bookmarks = bookmarks.filter(b => 
        b.dateAdded >= filters.dateRange.startDate && 
        b.dateAdded <= filters.dateRange.endDate
      );
    }
    
    if (filters.searchQuery) {
      const lowerQuery = filters.searchQuery.toLowerCase();
      bookmarks = bookmarks.filter(b => 
        (b.title && b.title.toLowerCase().includes(lowerQuery)) ||
        (b.url && b.url.toLowerCase().includes(lowerQuery)) ||
        (b.domain && b.domain.toLowerCase().includes(lowerQuery)) ||
        (b.description && b.description.toLowerCase().includes(lowerQuery))
      );
    }
    
    // Platform filter
    if (filters.platforms && filters.platforms.length > 0) {
      bookmarks = bookmarks.filter(b => filters.platforms.includes(b.platform || 'other'));
    }
    
    // Creators filter (each creator is an object with {key, creator, platform})
    if (filters.creators && filters.creators.length > 0) {
      bookmarks = bookmarks.filter(b => {
        if (!b.creator) return false;
        const bookmarkCreatorKey = `${b.platform || 'other'}:${b.creator}`;
        return filters.creators.some(c => c.key === bookmarkCreatorKey);
      });
    }
    
    // Content types filter
    if (filters.contentTypes && filters.contentTypes.length > 0) {
      bookmarks = bookmarks.filter(b => filters.contentTypes.includes(b.contentType));
    }
    
    if (filters.category) {
      bookmarks = bookmarks.filter(b => b.category === filters.category);
    }
    
    if (filters.isEnriched !== undefined) {
      bookmarks = filters.isEnriched 
        ? bookmarks.filter(b => b.lastChecked) 
        : bookmarks.filter(b => !b.lastChecked);
    }
    
    // Apply sorting
    const sortBy = filters.sortBy || 'date_desc';
    switch (sortBy) {
      case 'date_asc':
        bookmarks.sort((a, b) => a.dateAdded - b.dateAdded);
        break;
      case 'title_asc':
        bookmarks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'title_desc':
        bookmarks.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
        break;
      case 'domain_asc':
        bookmarks.sort((a, b) => (a.domain || '').localeCompare(b.domain || ''));
        break;
      case 'accessed_desc':
        bookmarks.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
        break;
      case 'date_desc':
      default:
        bookmarks.sort((a, b) => b.dateAdded - a.dateAdded);
        break;
    }
    
    const startIndex = page * pageSize;
    const endIndex = startIndex + pageSize;
    
    return {
      bookmarks: bookmarks.slice(startIndex, endIndex),
      totalCount: bookmarks.length,
      hasMore: endIndex < bookmarks.length,
      currentPage: page,
      totalPages: Math.ceil(bookmarks.length / pageSize)
    };
  } catch (error) {
    console.error('Error getting paginated bookmarks:', error);
    return { bookmarks: [], totalCount: 0, hasMore: false, currentPage: 0, totalPages: 0 };
  }
}

/**
 * Get consolidated domain analytics in a single pass
 */
export async function getConsolidatedDomainAnalytics() {
  return getCachedMetric('domainAnalytics', async () => {
    const bookmarks = await getAllBookmarks();
    const domainData = {};
    
    bookmarks.forEach(bookmark => {
      if (!bookmark.domain) return;
      
      if (!domainData[bookmark.domain]) {
        domainData[bookmark.domain] = {
          domain: bookmark.domain,
          count: 0,
          latestDate: 0,
          oldestDate: Infinity,
          enrichedCount: 0
        };
      }
      
      const data = domainData[bookmark.domain];
      data.count++;
      if (bookmark.lastChecked) data.enrichedCount++;
      if (bookmark.dateAdded > data.latestDate) data.latestDate = bookmark.dateAdded;
      if (bookmark.dateAdded < data.oldestDate) data.oldestDate = bookmark.dateAdded;
    });
    
    const domainArray = Object.values(domainData);
    const totalBookmarks = bookmarks.length;
    
    domainArray.forEach(d => {
      d.percentage = totalBookmarks > 0 ? Math.round((d.count / totalBookmarks) * 100) : 0;
      d.dateAdded = d.latestDate;
    });
    
    return {
      byRecency: [...domainArray].sort((a, b) => b.latestDate - a.latestDate),
      byCount: [...domainArray].sort((a, b) => b.count - a.count),
      top10: [...domainArray].sort((a, b) => b.count - a.count).slice(0, 10),
      totalDomains: domainArray.length,
      totalBookmarks
    };
  }, CACHE_DURATIONS.domainStats);
}

/**
 * Get unique folders from bookmarks
 */
export async function getUniqueFolders() {
  try {
    const bookmarks = await getAllBookmarks();
    const folders = [...new Set(bookmarks.map(b => b.folderPath).filter(f => f))];
    return folders.sort();
  } catch (error) {
    console.error('Error getting unique folders:', error);
    return [];
  }
}

/**
 * Get bookmark age distribution
 */
export async function getBookmarkAgeDistribution() {
  return getCachedMetric('ageDistribution', async () => {
    const bookmarks = await getAllBookmarks();
    const now = Date.now();
    const ageGroups = {
      'Last 24 hours': 0,
      'Last week': 0,
      'Last month': 0,
      'Last 3 months': 0,
      'Last 6 months': 0,
      'Last year': 0,
      'Over 1 year': 0
    };
    
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    
    bookmarks.forEach(bookmark => {
      const age = now - bookmark.dateAdded;
      
      if (age <= DAY) ageGroups['Last 24 hours']++;
      else if (age <= WEEK) ageGroups['Last week']++;
      else if (age <= MONTH) ageGroups['Last month']++;
      else if (age <= 3 * MONTH) ageGroups['Last 3 months']++;
      else if (age <= 6 * MONTH) ageGroups['Last 6 months']++;
      else if (age <= 365 * DAY) ageGroups['Last year']++;
      else ageGroups['Over 1 year']++;
    });
    
    return Object.entries(ageGroups);
  }, CACHE_DURATIONS.ageDistribution);
}

/**
 * Get bookmark creation patterns (hourly, daily, monthly)
 */
export async function getBookmarkCreationPatterns() {
  return getCachedMetric('creationPatterns', async () => {
    const bookmarks = await getAllBookmarks();
    const hourPatterns = new Array(24).fill(0);
    const dayPatterns = new Array(7).fill(0);
    const monthPatterns = new Array(12).fill(0);
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    bookmarks.forEach(bookmark => {
      const date = new Date(bookmark.dateAdded);
      hourPatterns[date.getHours()]++;
      dayPatterns[date.getDay()]++;
      monthPatterns[date.getMonth()]++;
    });
    
    return {
      hourly: hourPatterns.map((count, hour) => [`${hour}:00`, count]),
      daily: dayPatterns.map((count, day) => [dayNames[day], count]),
      monthly: monthPatterns.map((count, month) => [monthNames[month], count])
    };
  }, CACHE_DURATIONS.ageDistribution);
}

/**
 * Get title word frequency
 */
export async function getTitleWordFrequency() {
  return getCachedMetric('wordFrequency', async () => {
    const bookmarks = await getAllBookmarks();
    const wordCount = {};
    
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'about', 'from', 'up', 'out'
    ]);
    
    bookmarks.forEach(bookmark => {
      if (bookmark.title) {
        const words = bookmark.title
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 2 && !stopWords.has(word));
        
        words.forEach(word => {
          wordCount[word] = (wordCount[word] || 0) + 1;
        });
      }
    });
    
    return Object.entries(wordCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20);
  }, CACHE_DURATIONS.wordFrequency);
}

/**
 * Find duplicate bookmarks
 */
export async function findDuplicates() {
  return getCachedMetric('duplicates', async () => {
    const bookmarks = await getAllBookmarks();
    const urlMap = {};
    
    bookmarks.forEach(bookmark => {
      const normalizedUrl = bookmark.url.toLowerCase().replace(/\/$/, '');
      if (!urlMap[normalizedUrl]) {
        urlMap[normalizedUrl] = [];
      }
      urlMap[normalizedUrl].push(bookmark);
    });
    
    return Object.values(urlMap).filter(group => group.length > 1);
  }, CACHE_DURATIONS.duplicates);
}

/**
 * Find uncategorized bookmarks (in root folders)
 */
export async function findUncategorizedBookmarks() {
  try {
    const bookmarks = await getAllBookmarks();
    const rootFolders = ['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks', ''];
    
    return bookmarks.filter(bookmark => {
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
      'http://', 'https://', 'chrome://', 'chrome-extension://',
      'file://', 'javascript:', 'data:', 'about:', 'mailto:',
      'tel:', 'ftp://', 'sftp://', 'ssh://'
    ];
    
    return bookmarks.filter(bookmark => {
      const url = bookmark.url || '';
      const hasValidScheme = validSchemes.some(scheme => url.startsWith(scheme));
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
  return getCachedMetric('quickStats', async () => {
    const bookmarks = await getAllBookmarks();
    const duplicates = await findDuplicates();
    const uncategorized = await findUncategorizedBookmarks();
    const malformed = await findMalformedUrls();
    
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const oneMonth = 30 * 24 * 60 * 60 * 1000;
    
    const enriched = bookmarks.filter(b => b.lastChecked).length;
    const deadLinks = bookmarks.filter(b => b.isAlive === false).length;
    const uniqueDomains = new Set(bookmarks.map(b => b.domain).filter(d => d)).size;
    
    return {
      total: bookmarks.length,
      enriched,
      pending: bookmarks.length - enriched,
      enrichedPercentage: bookmarks.length > 0 ? Math.round((enriched / bookmarks.length) * 100) : 0,
      duplicateGroups: duplicates.length,
      uncategorized: uncategorized.length,
      malformed: malformed.length,
      deadLinks,
      uniqueDomains,
      addedThisWeek: bookmarks.filter(b => now - b.dateAdded < oneWeek).length,
      addedThisMonth: bookmarks.filter(b => now - b.dateAdded < oneMonth).length,
      oldestBookmark: bookmarks.reduce((oldest, b) => b.dateAdded < oldest ? b.dateAdded : oldest, Date.now()),
      newestBookmark: bookmarks.reduce((newest, b) => b.dateAdded > newest ? b.dateAdded : newest, 0)
    };
  }, CACHE_DURATIONS.quickStats);
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
      bookmarks: bookmarks
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
    return bookmarks.filter(bookmark => bookmark.folderPath === folderPath);
  } catch (error) {
    console.error('Error getting bookmarks by folder:', error);
    return [];
  }
}

/**
 * Find similar bookmarks using word overlap
 */
export async function findSimilarBookmarks(threshold = 0.7, maxPairs = 100) {
  try {
    const bookmarks = await getAllBookmarks();
    const similar = [];
    
    // Pre-compute word sets
    const wordSets = bookmarks.map(b => ({
      bookmark: b,
      words: new Set(b.title.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    })).filter(item => item.words.size > 0);
    
    for (let i = 0; i < wordSets.length; i++) {
      for (let j = i + 1; j < wordSets.length; j++) {
        if (wordSets[i].bookmark.url === wordSets[j].bookmark.url) continue;
        
        const words1 = wordSets[i].words;
        const words2 = wordSets[j].words;
        
        const intersection = [...words1].filter(w => words2.has(w)).length;
        const similarity = (2 * intersection) / (words1.size + words2.size);
        
        if (similarity >= threshold) {
          similar.push([wordSets[i].bookmark, wordSets[j].bookmark, similarity]);
        }
      }
      
      if (similar.length >= maxPairs * 2) break;
    }
    
    return similar.sort((a, b) => b[2] - a[2]).slice(0, maxPairs);
  } catch (error) {
    console.error('Error finding similar bookmarks:', error);
    return [];
  }
}

/**
 * Legacy alias for backward compatibility
 */
export async function findOrphans() {
  return findUncategorizedBookmarks();
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
      errors: errors
    };
  } catch (error) {
    console.error('Error deleting bookmarks:', error);
    throw error;
  }
}

/**
 * Get common title patterns
 */
export async function getTitlePatterns() {
  try {
    const bookmarks = await getAllBookmarks();
    const patterns = {};
    
    bookmarks.forEach(bookmark => {
      if (bookmark.title) {
        const title = bookmark.title.toLowerCase();
        
        if (title.includes('how to')) patterns['How-to guides'] = (patterns['How-to guides'] || 0) + 1;
        if (title.includes('tutorial')) patterns['Tutorials'] = (patterns['Tutorials'] || 0) + 1;
        if (title.includes('documentation') || title.includes('docs')) patterns['Documentation'] = (patterns['Documentation'] || 0) + 1;
        if (title.includes('api') || title.includes('reference')) patterns['API/Reference'] = (patterns['API/Reference'] || 0) + 1;
        if (title.includes('blog') || title.includes('article')) patterns['Blog/Articles'] = (patterns['Blog/Articles'] || 0) + 1;
        if (title.includes('github') || title.includes('repository')) patterns['Code Repositories'] = (patterns['Code Repositories'] || 0) + 1;
        if (title.includes('video') || title.includes('youtube')) patterns['Videos'] = (patterns['Videos'] || 0) + 1;
        if (title.includes('tool') || title.includes('app')) patterns['Tools/Apps'] = (patterns['Tools/Apps'] || 0) + 1;
        
        if (title.length > 60) patterns['Long titles (60+ chars)'] = (patterns['Long titles (60+ chars)'] || 0) + 1;
        if (title.split(' ').length <= 3) patterns['Short titles (≤3 words)'] = (patterns['Short titles (≤3 words)'] || 0) + 1;
      }
    });
    
    return Object.entries(patterns).sort(([,a], [,b]) => b - a);
  } catch (error) {
    console.error('Error getting title patterns:', error);
    return [];
  }
}

/**
 * Analyze URL patterns
 */
export async function getUrlPatterns() {
  try {
    const bookmarks = await getAllBookmarks();
    const protocols = {};
    const topLevelDomains = {};
    const pathPatterns = {};
    const subdomainPatterns = {};
    
    bookmarks.forEach(bookmark => {
      try {
        const url = new URL(bookmark.url);
        
        protocols[url.protocol] = (protocols[url.protocol] || 0) + 1;
        
        const domain = url.hostname;
        const parts = domain.split('.');
        if (parts.length > 1) {
          const tld = parts[parts.length - 1];
          topLevelDomains[tld] = (topLevelDomains[tld] || 0) + 1;
        }
        
        if (parts.length > 2) {
          const subdomain = parts[0];
          if (subdomain !== 'www') {
            subdomainPatterns[subdomain] = (subdomainPatterns[subdomain] || 0) + 1;
          }
        }
        
        const pathSegments = url.pathname.split('/').filter(segment => segment.length > 0);
        if (pathSegments.length > 0) {
          const firstSegment = pathSegments[0];
          pathPatterns[firstSegment] = (pathPatterns[firstSegment] || 0) + 1;
        }
      } catch (e) {
        // Skip malformed URLs
      }
    });
    
    return {
      protocols: Object.entries(protocols).sort(([,a], [,b]) => b - a),
      topLevelDomains: Object.entries(topLevelDomains).sort(([,a], [,b]) => b - a).slice(0, 10),
      subdomains: Object.entries(subdomainPatterns).sort(([,a], [,b]) => b - a).slice(0, 10),
      pathPatterns: Object.entries(pathPatterns).sort(([,a], [,b]) => b - a).slice(0, 15)
    };
  } catch (error) {
    console.error('Error getting URL patterns:', error);
    return { protocols: [], topLevelDomains: [], subdomains: [], pathPatterns: [] };
  }
}

/**
 * Analyze URL parameter usage
 */
export async function getUrlParameterUsage() {
  try {
    const bookmarks = await getAllBookmarks();
    const parameterCount = {};
    let urlsWithParams = 0;
    let totalUrls = 0;
    
    bookmarks.forEach(bookmark => {
      totalUrls++;
      try {
        const url = new URL(bookmark.url);
        const params = url.searchParams;
        
        if (params.toString()) {
          urlsWithParams++;
          for (const [key] of params) {
            parameterCount[key] = (parameterCount[key] || 0) + 1;
          }
        }
      } catch (e) {
        // Skip malformed URLs
      }
    });
    
    const parameterUsage = Object.entries(parameterCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15);
    
    return {
      parameters: parameterUsage,
      urlsWithParams,
      totalUrls,
      percentage: totalUrls > 0 ? Math.round((urlsWithParams / totalUrls) * 100) : 0
    };
  } catch (error) {
    console.error('Error getting URL parameter usage:', error);
    return { parameters: [], urlsWithParams: 0, totalUrls: 0, percentage: 0 };
  }
}

/**
 * Get domain distribution
 */
export async function getDomainDistribution() {
  try {
    const bookmarks = await getAllBookmarks();
    const domainCount = {};
    
    bookmarks.forEach(bookmark => {
      domainCount[bookmark.domain] = (domainCount[bookmark.domain] || 0) + 1;
    });
    
    const sortedDomains = Object.entries(domainCount)
      .sort(([,a], [,b]) => b - a);
    
    const totalBookmarks = bookmarks.length;
    const top10 = sortedDomains.slice(0, 10);
    const others = sortedDomains.slice(10);
    const othersCount = others.reduce((sum, [,count]) => sum + count, 0);
    
    const distribution = top10.map(([domain, count]) => ({
      domain,
      count,
      percentage: Math.round((count / totalBookmarks) * 100)
    }));
    
    if (othersCount > 0) {
      distribution.push({
        domain: 'Others',
        count: othersCount,
        percentage: Math.round((othersCount / totalBookmarks) * 100)
      });
    }
    
    return distribution;
  } catch (error) {
    console.error('Error getting domain distribution:', error);
    return [];
  }
}

/**
 * Get bookmarks that have been detected as dead links
 * Returns bookmarks where isAlive === false (already checked and found dead)
 */
export async function getDeadLinks() {
  try {
    const bookmarks = await getAllBookmarks();
    return bookmarks.filter(b => b.isAlive === false);
  } catch (error) {
    console.error('Error getting dead links:', error);
    return [];
  }
}

/**
 * Check for dead links
 */
export async function checkDeadLinks(bookmarkIds = null, batchSize = 10) {
  try {
    const bookmarks = await getAllBookmarks();
    const toCheck = bookmarkIds 
      ? bookmarks.filter(b => bookmarkIds.includes(b.id))
      : bookmarks.filter(b => b.url.startsWith('http'));
    
    const results = {
      checked: 0,
      alive: [],
      dead: [],
      errors: [],
      inProgress: false
    };
    
    for (let i = 0; i < Math.min(toCheck.length, batchSize); i++) {
      const bookmark = toCheck[i];
      results.checked++;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        await fetch(bookmark.url, {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        results.alive.push(bookmark);
      } catch (error) {
        if (error.name === 'AbortError') {
          results.errors.push({ bookmark, reason: 'timeout' });
        } else {
          results.dead.push({ bookmark, reason: error.message });
        }
      }
    }
    
    return {
      ...results,
      total: toCheck.length,
      remaining: Math.max(0, toCheck.length - batchSize)
    };
  } catch (error) {
    console.error('Error checking dead links:', error);
    return { checked: 0, alive: [], dead: [], errors: [], total: 0, remaining: 0 };
  }
}

// =============================================
// Backup & Restore System
// =============================================

/**
 * Create a full backup of the IndexedDB database
 * @returns {Promise<Object>} Backup object with all data
 */
export async function createBackup() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const settings = await db.settings.toArray();
    const events = await db.events.orderBy('timestamp').reverse().limit(1000).toArray();
    const similarities = await db.similarities.toArray();
    
    // Get stats for backup metadata
    const enrichedCount = bookmarks.filter(b => b.lastChecked).length;
    const categorizedCount = bookmarks.filter(b => b.category).length;
    
    const backup = {
      version: '2.1',
      schemaVersion: 3,
      createdAt: new Date().toISOString(),
      metadata: {
        totalBookmarks: bookmarks.length,
        enrichedCount,
        categorizedCount,
        eventsCount: events.length,
        similaritiesCount: similarities.length
      },
      data: {
        bookmarks,
        settings,
        events,
        similarities
      }
    };
    
    return backup;
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
}

/**
 * Download backup as a JSON file
 */
export async function downloadBackup() {
  try {
    const backup = await createBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const date = new Date().toISOString().slice(0, 10);
    const filename = `bookmark-insights-backup-${date}.json`;
    
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
 * Restore database from a backup file
 * @param {Object} backup - The backup object to restore from
 * @param {Object} options - Restore options
 * @returns {Promise<Object>} Restore result
 */
export async function restoreFromBackup(backup, options = {}) {
  const { 
    restoreBookmarks = true, 
    restoreSettings = true,
    restoreEvents = false,  // Events are optional
    restoreSimilarities = true,
    mergeMode = false  // If true, merge with existing data; if false, replace
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
      similaritiesRestored: 0,
      errors: []
    };
    
    // Restore bookmarks
    if (restoreBookmarks && backup.data.bookmarks.length > 0) {
      if (!mergeMode) {
        await db.bookmarks.clear();
      }
      
      if (mergeMode) {
        // Merge mode: preserve newer enrichment data
        const existingBookmarks = await db.bookmarks.toArray();
        const existingMap = new Map(existingBookmarks.map(b => [b.id, b]));
        
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
    
    // Restore similarities
    if (restoreSimilarities && backup.data.similarities && backup.data.similarities.length > 0) {
      if (!mergeMode) {
        await db.similarities.clear();
      }
      await db.similarities.bulkPut(backup.data.similarities);
      results.similaritiesRestored = backup.data.similarities.length;
    }
    
    // Clear caches after restore
    await clearAllMetricCaches();
    
    return {
      success: true,
      results,
      backupMetadata: backup.metadata
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
    createdAt: backup.createdAt || 'unknown'
  };
}

/**
 * Create an automatic backup (called before risky operations)
 * Stores backup in chrome.storage.local with rotation (keeps last 3)
 */
export async function createAutoBackup() {
  try {
    const backup = await createBackup();
    
    // Get existing auto-backups
    const result = await chrome.storage.local.get(['autoBackups']);
    let autoBackups = result.autoBackups || [];
    
    // Add new backup
    autoBackups.unshift({
      createdAt: backup.createdAt,
      metadata: backup.metadata,
      data: backup.data
    });
    
    // Keep only last 3 auto-backups
    if (autoBackups.length > 3) {
      autoBackups = autoBackups.slice(0, 3);
    }
    
    await chrome.storage.local.set({ autoBackups });
    
    console.log('Auto-backup created:', backup.metadata);
    return { success: true, metadata: backup.metadata };
  } catch (error) {
    console.error('Error creating auto-backup:', error);
    return { success: false, error: error.message };
  }
}

/**
 * List available auto-backups
 */
export async function listAutoBackups() {
  try {
    const result = await chrome.storage.local.get(['autoBackups']);
    const autoBackups = result.autoBackups || [];
    
    return autoBackups.map((b, index) => ({
      index,
      createdAt: b.createdAt,
      metadata: b.metadata
    }));
  } catch (error) {
    console.error('Error listing auto-backups:', error);
    return [];
  }
}

/**
 * Restore from an auto-backup by index
 * @param {number} index - The index of the auto-backup to restore (0 = most recent)
 */
export async function restoreFromAutoBackup(index = 0) {
  try {
    const result = await chrome.storage.local.get(['autoBackups']);
    const autoBackups = result.autoBackups || [];
    
    if (index < 0 || index >= autoBackups.length) {
      throw new Error(`Invalid backup index: ${index}. Available: 0-${autoBackups.length - 1}`);
    }
    
    const backup = {
      version: '2.1',
      ...autoBackups[index]
    };
    
    return await restoreFromBackup(backup);
  } catch (error) {
    console.error('Error restoring from auto-backup:', error);
    throw error;
  }
}

// ============================================================================
// PLATFORM DATA BACKFILL
// ============================================================================

import { parseBookmarkUrl } from './url-parsers.js';

/**
 * Backfill platform data for all existing bookmarks
 * This parses URLs to extract platform, creator, and content type without network requests
 * @param {Function} progressCallback - Optional callback for progress updates (processed, total)
 * @returns {Object} - { processed, updated, errors }
 */
export async function backfillPlatformData(progressCallback = null) {
  console.log('Starting platform data backfill...');
  
  const stats = { processed: 0, updated: 0, errors: 0, platforms: {} };
  
  try {
    const allBookmarks = await db.bookmarks.toArray();
    const total = allBookmarks.length;
    
    console.log(`Processing ${total} bookmarks for platform data...`);
    
    // Process in batches of 100 for efficiency
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < allBookmarks.length; i += BATCH_SIZE) {
      const batch = allBookmarks.slice(i, i + BATCH_SIZE);
      const updates = [];
      
      for (const bookmark of batch) {
        stats.processed++;
        
        try {
          // Skip if no URL
          if (!bookmark.url) continue;
          
          // Parse the URL for platform data
          const platformData = parseBookmarkUrl(bookmark.url);
          
          // Skip if no platform detected
          if (!platformData || !platformData.platform) continue;
          
          // Only update if platform data is different or missing
          if (bookmark.platform !== platformData.platform ||
              bookmark.creator !== platformData.creator ||
              bookmark.contentType !== platformData.type) {
            
            updates.push({
              id: bookmark.id,
              platform: platformData.platform,
              creator: platformData.creator || null,
              contentType: platformData.type || null,
              platformData: platformData
            });
            
            // Track platform stats
            stats.platforms[platformData.platform] = (stats.platforms[platformData.platform] || 0) + 1;
          }
        } catch (err) {
          stats.errors++;
          console.warn(`Error processing bookmark ${bookmark.id}:`, err.message);
        }
      }
      
      // Bulk update this batch
      if (updates.length > 0) {
        await db.bookmarks.bulkUpdate(updates.map(u => ({
          key: u.id,
          changes: {
            platform: u.platform,
            creator: u.creator,
            contentType: u.contentType,
            platformData: u.platformData
          }
        })));
        stats.updated += updates.length;
      }
      
      // Report progress
      if (progressCallback) {
        progressCallback(stats.processed, total);
      }
    }
    
    console.log('Platform data backfill complete:', stats);
    return stats;
    
  } catch (error) {
    console.error('Error during platform data backfill:', error);
    throw error;
  }
}

/**
 * Get platform data statistics
 * @returns {Object} - Stats about platform coverage
 */
export async function getPlatformDataStats() {
  try {
    const total = await db.bookmarks.count();
    const withPlatform = await db.bookmarks.where('platform').notEqual('').count();
    const withCreator = await db.bookmarks.where('creator').notEqual('').count();
    
    // Count by platform
    const platforms = {};
    await db.bookmarks.where('platform').notEqual('').each(b => {
      if (b.platform) {
        platforms[b.platform] = (platforms[b.platform] || 0) + 1;
      }
    });
    
    return {
      total,
      withPlatform,
      withCreator,
      coverage: total > 0 ? Math.round((withPlatform / total) * 100) : 0,
      platforms
    };
  } catch (error) {
    console.error('Error getting platform stats:', error);
    return { total: 0, withPlatform: 0, withCreator: 0, coverage: 0, platforms: {} };
  }
}