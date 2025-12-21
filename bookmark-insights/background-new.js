// Background script for Bookmark Insight Chrome Extension
// This uses Chrome's service worker pattern for Manifest V3
// Now enhanced with IndexedDB storage via Dexie.js and enrichment pipeline

import { db, initializeDatabase, bulkUpsertBookmarks, smartMergeBookmarks, upsertBookmark, deleteBookmark as dbDeleteBookmark, addToEnrichmentQueue, logEvent, getSettings, invalidateMetricCaches } from './src/db.js';
import { processEnrichmentBatch } from './src/enrichment.js';
import { addToIndex, updateInIndex, removeFromIndex, rebuildSearchIndex } from './src/search.js';

// Initialize extension and database
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  
  // Initialize IndexedDB and migrate data if needed
  await initializeDatabase();
  
  if (details.reason === 'install') {
    console.log('First install - syncing bookmarks...');
    await syncBookmarks();
    
    // Build initial search index
    console.log('Building initial search index...');
    await rebuildSearchIndex();
    
    // Set up enrichment alarms
    await setupEnrichmentAlarms();
  } else if (details.reason === 'update') {
    console.log('Extension updated - syncing bookmarks...');
    await syncBookmarks();
    
    // Rebuild search index
    console.log('Rebuilding search index...');
    await rebuildSearchIndex();
    
    // Update enrichment alarms
    await setupEnrichmentAlarms();
  }
});

// Sync bookmarks from Chrome to IndexedDB
async function syncBookmarks() {
  try {
    console.log('Starting bookmark sync...');
    
    // Get all bookmarks from Chrome
    const bookmarkTree = await chrome.bookmarks.getTree();
    const flatBookmarks = [];
    
    // Recursive function to flatten bookmark tree
    function flattenBookmarks(nodes, folderPath = '') {
      for (const node of nodes) {
        if (node.url) {
          // It's a bookmark
          let domain = 'unknown';
          try {
            // Handle different URL schemes
            if (node.url.startsWith('http://') || node.url.startsWith('https://')) {
              const url = new URL(node.url);
              domain = url.hostname;
            } else if (node.url.startsWith('chrome://') || node.url.startsWith('chrome-extension://')) {
              domain = 'chrome-internal';
            } else if (node.url.startsWith('file://')) {
              domain = 'local-file';
            } else if (node.url.startsWith('javascript:')) {
              domain = 'javascript-bookmarklet';
            } else if (node.url.startsWith('data:')) {
              domain = 'data-uri';
            } else if (node.url.startsWith('mailto:') || node.url.startsWith('tel:')) {
              domain = 'contact-link';
            } else {
              domain = 'other-protocol';
            }
          } catch (e) {
            domain = 'invalid-url';
          }
          
          flatBookmarks.push({
            id: node.id,
            title: node.title || 'Untitled',
            url: node.url,
            domain: domain,
            dateAdded: node.dateAdded || Date.now(),
            folderPath: folderPath,
            parentId: node.parentId,
            // Initialize enrichment fields
            description: null,
            keywords: [],
            category: null,
            tags: [],
            isAlive: null,
            lastChecked: null,
            faviconUrl: null,
            contentSnippet: null,
            lastAccessed: null,
            accessCount: 0
          });
        } else if (node.children) {
          // It's a folder
          const newPath = folderPath ? `${folderPath}/${node.title}` : node.title;
          flattenBookmarks(node.children, newPath);
        }
      }
    }
    
    flattenBookmarks(bookmarkTree);
    
    // Use smart merge to preserve enrichment data
    await smartMergeBookmarks(flatBookmarks);
    
    // Keep chrome.storage.local updated for backward compatibility during transition
    await chrome.storage.local.set({ 
      bookmarks: flatBookmarks,
      lastSyncTime: Date.now()
    });
    
    console.log(`Synced ${flatBookmarks.length} bookmarks`);
    
    // Add ONLY genuinely new/unenriched bookmarks to enrichment queue
    // We must check our IndexedDB, not the Chrome data which doesn't have enrichment info
    const settings = await import('./src/db.js').then(m => m.getSettings());
    if (settings.enrichmentEnabled) {
      const { getAllBookmarks, clearEnrichmentQueue } = await import('./src/db.js');
      const storedBookmarks = await getAllBookmarks();
      const enrichedIds = new Set(
        storedBookmarks
          .filter(b => b.lastChecked || b.description || b.category)
          .map(b => b.id)
      );
      
      // Clear existing queue and only add truly unenriched bookmarks
      await clearEnrichmentQueue();
      
      let queuedCount = 0;
      for (const bookmark of flatBookmarks) {
        // Only queue http/https bookmarks that haven't been enriched
        if ((bookmark.url.startsWith('http://') || bookmark.url.startsWith('https://')) && 
            !enrichedIds.has(bookmark.id)) {
          await addToEnrichmentQueue(bookmark.id, 0);
          queuedCount++;
        }
      }
      console.log(`Queued ${queuedCount} unenriched bookmarks for enrichment`);
    }
  } catch (error) {
    console.error('Error syncing bookmarks:', error);
  }
}

// Listen for bookmark changes and update IndexedDB
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  await handleBookmarkCreated(id, bookmark);
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  await handleBookmarkRemoved(id, removeInfo);
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  await handleBookmarkChanged(id, changeInfo);
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  await handleBookmarkMoved(id, moveInfo);
});

// Handle bookmark creation
async function handleBookmarkCreated(id, bookmark) {
  try {
    console.log('Bookmark created:', id);
    
    // Get the complete bookmark info
    const [fullBookmark] = await chrome.bookmarks.get(id);
    
    if (fullBookmark.url) {
      let domain = 'unknown';
      try {
        if (fullBookmark.url.startsWith('http://') || fullBookmark.url.startsWith('https://')) {
          domain = new URL(fullBookmark.url).hostname;
        }
      } catch (e) {
        domain = 'invalid-url';
      }
      
      // Get folder path
      const folderPath = await getBookmarkFolderPath(fullBookmark.parentId);
      
      const newBookmark = {
        id: fullBookmark.id,
        title: fullBookmark.title || 'Untitled',
        url: fullBookmark.url,
        domain: domain,
        dateAdded: fullBookmark.dateAdded || Date.now(),
        folderPath: folderPath,
        parentId: fullBookmark.parentId,
        description: null,
        keywords: [],
        category: null,
        tags: [],
        isAlive: null,
        lastChecked: null,
        faviconUrl: null,
        contentSnippet: null,
        lastAccessed: null,
        accessCount: 0
      };
      
      // Add to IndexedDB
      await upsertBookmark(newBookmark);
      
      // Add to search index
      await addToIndex(newBookmark);
      
      // Log event
      await logEvent(id, 'create');
      
      // Invalidate relevant caches
      await invalidateMetricCaches('add');
      
      // Add to enrichment queue if enabled
      const settings = await import('./src/db.js').then(m => m.getSettings());
      if (settings.enrichmentEnabled && 
          (newBookmark.url.startsWith('http://') || newBookmark.url.startsWith('https://'))) {
        await addToEnrichmentQueue(id, 10); // Higher priority for new bookmarks
      }
    }
  } catch (error) {
    console.error('Error handling bookmark creation:', error);
  }
}

// Handle bookmark removal
async function handleBookmarkRemoved(id, removeInfo) {
  try {
    console.log('Bookmark removed:', id);
    await removeFromIndex(id);
    await dbDeleteBookmark(id);
    await logEvent(id, 'delete');
    // Invalidate relevant caches
    await invalidateMetricCaches('delete');
  } catch (error) {
    console.error('Error handling bookmark removal:', error);
  }
}

// Handle bookmark changes
async function handleBookmarkChanged(id, changeInfo) {
  try {
    console.log('Bookmark changed:', id, changeInfo);
    
    // Get the updated bookmark
    const [bookmark] = await chrome.bookmarks.get(id);
    
    if (bookmark.url) {
      let domain = 'unknown';
      try {
        if (bookmark.url.startsWith('http://') || bookmark.url.startsWith('https://')) {
          domain = new URL(bookmark.url).hostname;
        }
      } catch (e) {
        domain = 'invalid-url';
      }
      
      const folderPath = await getBookmarkFolderPath(bookmark.parentId);
      
      // Get existing bookmark data to preserve enrichment fields
      const existingBookmark = await import('./src/db.js').then(m => m.getBookmark(id));
      
      const updatedBookmark = {
        ...(existingBookmark || {}),
        id: bookmark.id,
        title: changeInfo.title !== undefined ? changeInfo.title : bookmark.title,
        url: changeInfo.url !== undefined ? changeInfo.url : bookmark.url,
        domain: domain,
        dateAdded: bookmark.dateAdded || Date.now(),
        folderPath: folderPath,
        parentId: bookmark.parentId
      };
      
      await updateInIndex(updatedBookmark);
      await upsertBookmark(updatedBookmark);
      await logEvent(id, 'update', changeInfo);
      
      // Re-enrich if URL changed
      if (changeInfo.url) {
        const settings = await import('./src/db.js').then(m => m.getSettings());
        if (settings.enrichmentEnabled) {
          await addToEnrichmentQueue(id, 5);
        }
      }
    }
  } catch (error) {
    console.error('Error handling bookmark change:', error);
  }
}

// Handle bookmark moved
async function handleBookmarkMoved(id, moveInfo) {
  try {
    console.log('Bookmark moved:', id);
    
    const [bookmark] = await chrome.bookmarks.get(id);
    const folderPath = await getBookmarkFolderPath(moveInfo.parentId);
    
    const existingBookmark = await import('./src/db.js').then(m => m.getBookmark(id));
    
    if (existingBookmark) {
      existingBookmark.folderPath = folderPath;
      existingBookmark.parentId = moveInfo.parentId;
      await upsertBookmark(existingBookmark);
      await logEvent(id, 'update', { moved: true });
    }
  } catch (error) {
    console.error('Error handling bookmark move:', error);
  }
}

// Helper function to get folder path for a bookmark
async function getBookmarkFolderPath(parentId) {
  try {
    const path = [];
    let currentId = parentId;
    
    while (currentId) {
      const [node] = await chrome.bookmarks.get(currentId);
      if (node.title) {
        path.unshift(node.title);
      }
      currentId = node.parentId;
      
      // Prevent infinite loop
      if (path.length > 10) break;
    }
    
    return path.join('/');
  } catch (error) {
    return '';
  }
}

// Message handling for popup/dashboard communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'syncBookmarks') {
    syncBookmarks().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Indicates we will send a response asynchronously
  }
  
  if (request.action === 'getEnrichmentStatus') {
    import('./src/db.js').then(async (m) => {
      const queueSize = await m.getEnrichmentQueueSize();
      const settings = await m.getSettings();
      
      // Get actual enrichment stats from IndexedDB
      const bookmarks = await m.getAllBookmarks();
      const httpBookmarks = bookmarks.filter(b => 
        b.url && (b.url.startsWith('http://') || b.url.startsWith('https://'))
      );
      const enrichedCount = httpBookmarks.filter(b => b.lastChecked).length;
      const pendingCount = httpBookmarks.length - enrichedCount;
      
      sendResponse({ 
        success: true, 
        queueSize: pendingCount, // Use actual pending count, not queue table size
        totalBookmarks: httpBookmarks.length,
        enrichedCount,
        pendingCount,
        enabled: settings.enrichmentEnabled 
      });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.action === 'reEnrichDeadLinks') {
    // Re-enrich dead links by forcing re-check
    import('./src/enrichment.js').then(async (enrichment) => {
      const { getDeadLinks, upsertBookmark, getBookmark } = await import('./src/db.js');
      
      const deadLinks = await getDeadLinks();
      const results = {
        total: deadLinks.length,
        success: 0,
        stillDead: 0,
        errors: 0
      };
      
      // Create progress callback
      const progressCallback = (progress) => {
        chrome.runtime.sendMessage({
          action: 'reEnrichProgress',
          progress: progress
        }).catch(() => {});
      };
      
      // Process each dead link
      for (let i = 0; i < deadLinks.length; i++) {
        const bookmark = deadLinks[i];
        
        progressCallback({
          current: i + 1,
          total: deadLinks.length,
          title: bookmark.title,
          url: bookmark.url,
          status: 'processing'
        });
        
        try {
          // Force re-check by clearing lastChecked temporarily
          const currentBookmark = await getBookmark(bookmark.id);
          if (currentBookmark) {
            // Clear lastChecked to force re-enrichment
            currentBookmark.lastChecked = null;
            await upsertBookmark(currentBookmark);
            
            // Now enrich
            const result = await enrichment.enrichBookmark(bookmark.id);
            
            if (result.isAlive === false) {
              results.stillDead++;
            } else if (result.success) {
              results.success++;
            } else {
              results.errors++;
            }
          }
        } catch (err) {
          console.error(`Error re-enriching ${bookmark.id}:`, err);
          results.errors++;
        }
        
        progressCallback({
          current: i + 1,
          total: deadLinks.length,
          title: bookmark.title,
          url: bookmark.url,
          status: 'completed'
        });
      }
      
      sendResponse({ success: true, results });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.action === 'runEnrichment') {
    // Create progress callback to send updates to the requesting tab
    const progressCallback = (progress) => {
      // Send progress update to all dashboard tabs
      chrome.runtime.sendMessage({
        action: 'enrichmentProgress',
        progress: progress
      }).catch(() => {
        // Ignore errors if no listeners
      });
    };

    processEnrichmentBatch(
      request.batchSize || 10, 
      progressCallback,
      request.concurrency || 3,
      { force: request.force || false }
    ).then((result) => {
      sendResponse({ success: true, result });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.action === 'updateSettings') {
    import('./src/db.js').then(async (m) => {
      await m.updateSettings(request.settings);
      
      // Update behavior tracking if that setting changed
      if (request.settings.trackBrowsingBehavior !== undefined) {
        behaviorTrackingEnabled = request.settings.trackBrowsingBehavior;
        console.log(`Behavior tracking ${behaviorTrackingEnabled ? 'enabled' : 'disabled'}`);
        if (behaviorTrackingEnabled && !cacheBuilt) {
          buildUrlCache();
        }
      }
      
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Set up enrichment alarms based on settings
async function setupEnrichmentAlarms() {
  // Always clear alarms - enrichment is manual only now
  await chrome.alarms.clear('enrichmentPipeline');
  console.log('Enrichment is manual-only - no automatic alarms set');
}

// Handle alarm events (kept for backwards compatibility, but won't fire)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'enrichmentPipeline') {
    console.log('Alarm triggered but enrichment is manual-only');
  }
});

// =========================================
// Tab Monitoring for Behavioral Analytics
// (Only runs if user enables trackBrowsingBehavior)
// =========================================

// Track URL to bookmark ID mapping for faster lookups
let urlToBookmarkCache = new Map();
let cacheBuilt = false;
let behaviorTrackingEnabled = false;

// Check if behavior tracking is enabled
async function isBehaviorTrackingEnabled() {
  try {
    const settings = await getSettings();
    return settings.trackBrowsingBehavior === true;
  } catch (error) {
    return false;
  }
}

// Initialize behavior tracking setting
async function initBehaviorTracking() {
  behaviorTrackingEnabled = await isBehaviorTrackingEnabled();
  console.log(`Behavior tracking: ${behaviorTrackingEnabled ? 'enabled' : 'disabled (default)'}`);
}

// Build URL cache from bookmarks
async function buildUrlCache() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    urlToBookmarkCache.clear();
    
    for (const bookmark of bookmarks) {
      if (bookmark.url) {
        // Normalize URL for matching
        const normalizedUrl = normalizeUrlForMatching(bookmark.url);
        urlToBookmarkCache.set(normalizedUrl, bookmark.id);
      }
    }
    
    cacheBuilt = true;
    console.log(`URL cache built with ${urlToBookmarkCache.size} entries`);
  } catch (error) {
    console.error('Error building URL cache:', error);
  }
}

// Normalize URL for matching (remove trailing slashes, www, etc.)
function normalizeUrlForMatching(url) {
  try {
    const urlObj = new URL(url);
    let normalized = urlObj.hostname.replace(/^www\./, '') + urlObj.pathname;
    normalized = normalized.replace(/\/$/, ''); // Remove trailing slash
    return normalized.toLowerCase();
  } catch (e) {
    return url.toLowerCase();
  }
}

// Record a bookmark access when user visits a bookmarked URL
async function recordBookmarkAccess(bookmarkId, url) {
  try {
    // Update bookmark access stats
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (bookmark) {
      await db.bookmarks.update(bookmarkId, {
        lastAccessed: Date.now(),
        accessCount: (bookmark.accessCount || 0) + 1
      });
    }
    
    // Log event
    await logEvent(bookmarkId, 'access', { url });
    
    console.log(`Recorded access for bookmark: ${bookmarkId}`);
    return true;
  } catch (error) {
    console.error('Error recording bookmark access:', error);
    return false;
  }
}

// Check if a URL matches any bookmarked URL
async function findMatchingBookmark(url) {
  // Ensure cache is built
  if (!cacheBuilt) {
    await buildUrlCache();
  }
  
  const normalizedUrl = normalizeUrlForMatching(url);
  
  // Exact match
  if (urlToBookmarkCache.has(normalizedUrl)) {
    return urlToBookmarkCache.get(normalizedUrl);
  }
  
  // Try without path parameters
  const urlWithoutParams = normalizedUrl.split('?')[0];
  if (urlToBookmarkCache.has(urlWithoutParams)) {
    return urlToBookmarkCache.get(urlWithoutParams);
  }
  
  return null;
}

// Listen for tab updates (URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Check if behavior tracking is enabled
  if (!behaviorTrackingEnabled) return;
  
  // Only process when the URL is complete (not loading)
  if (changeInfo.status === 'complete' && tab.url) {
    // Skip non-http URLs
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
      return;
    }
    
    try {
      const bookmarkId = await findMatchingBookmark(tab.url);
      if (bookmarkId) {
        await recordBookmarkAccess(bookmarkId, tab.url);
      }
    } catch (error) {
      console.error('Error in tab update handler:', error);
    }
  }
});

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // Check if behavior tracking is enabled
  if (!behaviorTrackingEnabled) return;
  
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    
    // Skip non-http URLs
    if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
      return;
    }
    
    const bookmarkId = await findMatchingBookmark(tab.url);
    if (bookmarkId) {
      // Only log if it's been more than 5 minutes since last access
      const bookmark = await db.bookmarks.get(bookmarkId);
      if (bookmark && (!bookmark.lastAccessed || (Date.now() - bookmark.lastAccessed > 5 * 60 * 1000))) {
        await recordBookmarkAccess(bookmarkId, tab.url);
      }
    }
  } catch (error) {
    console.error('Error in tab activation handler:', error);
  }
});

// Rebuild URL cache when bookmarks change
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (bookmark.url) {
    const normalizedUrl = normalizeUrlForMatching(bookmark.url);
    urlToBookmarkCache.set(normalizedUrl, bookmark.id);
  }
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  // Rebuild cache since we don't know the URL that was removed
  cacheBuilt = false;
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  if (changeInfo.url) {
    // Rebuild cache when URL changes
    cacheBuilt = false;
  }
});

// Initialize URL cache on startup (only if tracking enabled)
initBehaviorTracking().then(() => {
  if (behaviorTrackingEnabled) {
    buildUrlCache();
  }
});

console.log('Bookmark Insights background service worker loaded');
