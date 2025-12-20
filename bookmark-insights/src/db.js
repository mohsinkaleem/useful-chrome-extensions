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

// Define default settings
const DEFAULT_SETTINGS = {
  enrichmentEnabled: true,
  enrichmentSchedule: 'manual', // 'manual' only - user triggers enrichment
  enrichmentBatchSize: 20,
  enrichmentRateLimit: 1000, // milliseconds between requests
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
      accessCount: 0
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
