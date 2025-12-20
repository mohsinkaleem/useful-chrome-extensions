// Compatibility wrapper for database functions
// This file exports both old chrome.storage.local functions and new IndexedDB functions

// Re-export everything from the original database.js
export * from './database.js';

// Import new DB functions
import * as NewDB from './db.js';

// Export new DB functions with different names (prefixed with "db")
export const dbGetAllBookmarks = NewDB.getAllBookmarks;
export const dbGetBookmark = NewDB.getBookmark;
export const dbUpsertBookmark = NewDB.upsertBookmark;
export const dbBulkUpsertBookmarks = NewDB.bulkUpsertBookmarks;
export const dbDeleteBookmark = NewDB.deleteBookmark;
export const dbSearchBookmarks = NewDB.searchBookmarks;
export const dbGetBookmarksByDomain = NewDB.getBookmarksByDomain;
export const dbGetBookmarksByCategory = NewDB.getBookmarksByCategory;
export const dbGetBookmarksByDateRange = NewDB.getBookmarksByDateRange;
export const dbGetUniqueDomains = NewDB.getUniqueDomains;
export const dbGetUniqueCategories = NewDB.getUniqueCategories;
export const dbGetDomainStats = NewDB.getDomainStats;
export const dbGetActivityTimeline = NewDB.getActivityTimeline;

// Event logging
export const logEvent = NewDB.logEvent;
export const getBookmarkEvents = NewDB.getBookmarkEvents;
export const getRecentEvents = NewDB.getRecentEvents;

// Cache operations
export const setCache = NewDB.setCache;
export const getCache = NewDB.getCache;
export const clearCache = NewDB.clearCache;

// Enrichment queue
export const addToEnrichmentQueue = NewDB.addToEnrichmentQueue;
export const getNextEnrichmentBatch = NewDB.getNextEnrichmentBatch;
export const removeFromEnrichmentQueue = NewDB.removeFromEnrichmentQueue;
export const clearEnrichmentQueue = NewDB.clearEnrichmentQueue;
export const getEnrichmentQueueSize = NewDB.getEnrichmentQueueSize;

// Settings
export const getSettings = NewDB.getSettings;
export const updateSettings = NewDB.updateSettings;

// Database initialization
export const initializeDatabase = NewDB.initializeDatabase;
export const migrateFromChromeStorage = NewDB.migrateFromChromeStorage;

// Export the Dexie database instance
export { db } from './db.js';
