// Background script for Bookmark Insight Chrome Extension
// This uses Chrome's service worker pattern for Manifest V3
// Now enhanced with IndexedDB storage via Dexie.js and enrichment pipeline

import {
  db,
  initializeDatabase,
  bulkUpsertBookmarks,
  smartMergeBookmarks,
  upsertBookmark,
  bulkDeleteBookmarks,
  addToEnrichmentQueue,
  bulkAddToEnrichmentQueue,
  clearEnrichmentQueue,
  logEvent,
  getSettings,
  updateSettings,
  invalidateMetricCaches,
  invalidateBookmarkCorpus,
  getAllBookmarks,
  getBookmark,
  takeTrashedByUrl,
  getDeadLinks,
  resetStaleDeadLinkVerdicts,
  ENRICHMENT_DEFAULTS
} from './db.js';
import { processEnrichmentBatch, enrichBookmark } from './enrichment.js';
import { addToIndex, updateInIndex, removeFromIndex, rebuildSearchIndex, searchBookmarks } from './search.js';
import { isEnrichable, isEnriched, isPendingEnrichment } from './predicates.js';
import { selectDeadLinkBatch } from './dead-link-queue.js';
import { migrateBookmarksWithTopics } from './topics.js';

/**
 * Extract domain from a bookmark URL
 * Handles all URL schemes (http, chrome, file, javascript, data, mailto, etc.)
 * @param {string} url - The bookmark URL
 * @returns {string} The extracted domain or a descriptive label
 */
function extractDomain(url) {
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return new URL(url).hostname;
    } else if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return 'chrome-internal';
    } else if (url.startsWith('file://')) {
      return 'local-file';
    } else if (url.startsWith('javascript:')) {
      return 'javascript-bookmarklet';
    } else if (url.startsWith('data:')) {
      return 'data-uri';
    } else if (url.startsWith('mailto:') || url.startsWith('tel:')) {
      return 'contact-link';
    } else {
      return 'other-protocol';
    }
  } catch (e) {
    return 'invalid-url';
  }
}

// Bump when the topic taxonomy or the search index format changes. Extension
// updates used to rebuild the index and re-run topic detection over the whole
// corpus every time, even for a pure UI release.
// 2: dead-link verdicts written by the old HEAD-only check are cleared so the
//    corrected classifier can re-decide them.
const DATA_VERSION = 2;

// Initialize extension and database
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  
  // Initialize IndexedDB and migrate data if needed
  await initializeDatabase();
  
  // Set up side panel to open on action click (instead of popup)
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Error setting panel behavior:', error));
  
  if (details.reason === 'install') {
    console.log('First install - syncing bookmarks...');
    await syncBookmarks();
    
    // Build initial search index
    console.log('Building initial search index...');
    await rebuildSearchIndex();
    await updateSettings({ dataVersion: DATA_VERSION });
  } else if (details.reason === 'update') {
    console.log('Extension updated - syncing bookmarks...');
    await syncBookmarks();

    const { dataVersion } = await getSettings();
    if (dataVersion === DATA_VERSION) {
      console.log('Data format unchanged - skipping migration and index rebuild');
      return;
    }

    // Clear dead-link verdicts recorded by the old check before anything else
    // re-reads them, so the corrected classifier decides these rows afresh.
    try {
      const { reset, markedUnfetchable, resetIds } = await resetStaleDeadLinkVerdicts();
      // syncBookmarks built the enrichment queue above, before these rows became
      // pending again - queue them here rather than waiting for the next startup.
      if (resetIds.length > 0) {
        const { enrichmentEnabled } = await getSettings();
        if (enrichmentEnabled) await bulkAddToEnrichmentQueue(resetIds, 0);
      }
      console.log(
        `Dead-link correction: ${reset} verdict(s) cleared for re-check, ${markedUnfetchable} marked unfetchable`
      );
    } catch (err) {
      console.error('Dead-link correction failed:', err);
    }

    // Migrate existing bookmarks to add topics
    console.log('Running topic migration for existing bookmarks...');
    try {
      const result = await migrateBookmarksWithTopics(getAllBookmarks, bulkUpsertBookmarks);
      console.log(`Topic migration complete: ${result.migrated}/${result.total} bookmarks updated`);
    } catch (err) {
      console.error('Topic migration failed:', err);
    }
    
    // Rebuild search index
    console.log('Rebuilding search index...');
    await rebuildSearchIndex();
    await updateSettings({ dataVersion: DATA_VERSION });
  }
});

// A service worker restart on browser launch does not fire onInstalled, so the
// database has to be opened here too.
chrome.runtime.onStartup.addListener(async () => {
  console.log('Browser started - initializing database and syncing bookmarks');
  try {
    await initializeDatabase();
    await syncBookmarks();
  } catch (error) {
    console.error('Startup initialization failed:', error);
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
          const domain = extractDomain(node.url);
          
          // Chrome-owned fields only. smartMergeBookmarks fills in the
          // enrichment defaults for genuinely new rows and leaves existing
          // records' own fields alone.
          flatBookmarks.push({
            id: node.id,
            title: node.title || 'Untitled',
            url: node.url,
            domain: domain,
            dateAdded: node.dateAdded || Date.now(),
            folderPath: folderPath,
            parentId: node.parentId
          });
        } else if (node.children) {
          // It's a folder
          // Fix: Ensure folderPath is correctly constructed. If folderPath is empty, use node.title.
          // If folderPath exists, append node.title.
          const newPath = folderPath ? `${folderPath}/${node.title}` : node.title;
          flattenBookmarks(node.children, newPath);
        }
      }
    }
    
    // Start flattening from the root's children to avoid "undefined" or empty root folder names
    // The root of the bookmark tree usually contains "Bookmarks Bar", "Other Bookmarks", etc.
    // We want to start processing from there.
    if (bookmarkTree[0] && bookmarkTree[0].children) {
       for (const child of bookmarkTree[0].children) {
           // Pass the child's title as the initial folder path if it's a folder, or empty string if we want to ignore root folders
           // Usually we want "Bookmarks Bar" to be part of the path.
           if (child.children) {
               flattenBookmarks(child.children, child.title);
           } else {
               // Direct children of root (unlikely but possible)
               flattenBookmarks([child], "");
           }
       }
    } else {
        flattenBookmarks(bookmarkTree);
    }
    
    // Use smart merge to preserve enrichment data
    const { removedIds } = await smartMergeBookmarks(flatBookmarks);
    for (const removedId of removedIds) {
      await removeFromIndex(removedId);
    }
    await invalidateUrlCache();
    
    console.log(`Synced ${flatBookmarks.length} bookmarks`);
    
    // Add ONLY genuinely new/unenriched bookmarks to enrichment queue
    // We must check our IndexedDB, not the Chrome data which doesn't have enrichment info
    const settings = await getSettings();
    if (settings.enrichmentEnabled) {
      const storedBookmarks = await getAllBookmarks();

      // Clear existing queue and only add truly unenriched bookmarks
      await clearEnrichmentQueue();

      // One bulk insert rather than a lookup + insert per bookmark: on a fresh
      // install that was thousands of sequential IndexedDB round-trips.
      const toQueue = storedBookmarks.filter(isPendingEnrichment).map(b => b.id);

      await bulkAddToEnrichmentQueue(toQueue, 0);
      console.log(`Queued ${toQueue.length} unenriched bookmarks for enrichment`);
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
      const domain = extractDomain(fullBookmark.url);
      
      // Get folder path
      const folderPath = await getBookmarkFolderPath(fullBookmark.parentId);

      // An undo, or a re-bookmark of something deleted recently: adopt the
      // enrichment instead of writing a blank record over it.
      const recovered = (await getBookmark(id)) || (await takeTrashedByUrl(fullBookmark.url));

      const newBookmark = {
        ...ENRICHMENT_DEFAULTS,
        ...(recovered || {}),
        id: fullBookmark.id,
        title: fullBookmark.title || 'Untitled',
        url: fullBookmark.url,
        domain: domain,
        dateAdded: fullBookmark.dateAdded || Date.now(),
        folderPath: folderPath,
        parentId: fullBookmark.parentId
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
      const settings = await getSettings();
      if (settings.enrichmentEnabled &&
          !isEnriched(newBookmark) &&
          (newBookmark.url.startsWith('http://') || newBookmark.url.startsWith('https://'))) {
        await addToEnrichmentQueue(id, 10); // Higher priority for new bookmarks
      }

      // Update URL cache
      if (behaviorTrackingEnabled) {
        const normalizedUrl = normalizeUrlForMatching(newBookmark.url);
        urlToBookmarkCache.set(normalizedUrl, newBookmark.id);
        await persistUrlCache();
      }
      
      // Notify dashboard
      chrome.runtime.sendMessage({ action: 'bookmarksChanged' }).catch(() => {});
    }
  } catch (error) {
    console.error('Error handling bookmark creation:', error);
  }
}

// Chrome fires onRemoved exactly once for a folder; every descendant arrives
// inside removeInfo.node.children and is otherwise never pruned.
function collectRemovedIds(node, into = []) {
  if (!node) return into;
  into.push(node.id);
  for (const child of node.children || []) {
    collectRemovedIds(child, into);
  }
  return into;
}

// Handle bookmark removal
async function handleBookmarkRemoved(id, removeInfo) {
  try {
    const removedIds = collectRemovedIds(removeInfo?.node);
    if (!removedIds.includes(id)) removedIds.push(id);
    console.log('Bookmark removed:', id, `(${removedIds.length} record(s))`);

    for (const removedId of removedIds) {
      await removeFromIndex(removedId);
    }
    await bulkDeleteBookmarks(removedIds);
    await logEvent(id, 'delete', { removedCount: removedIds.length });
    // Invalidate relevant caches
    await invalidateMetricCaches('delete');
    
    // Invalidate URL cache
    if (behaviorTrackingEnabled) {
      await invalidateUrlCache();
    }
    
    // Notify dashboard
    chrome.runtime.sendMessage({ action: 'bookmarksChanged' }).catch(() => {});
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
      const domain = extractDomain(bookmark.url);
      
      const folderPath = await getBookmarkFolderPath(bookmark.parentId);
      
      // Get existing bookmark data to preserve enrichment fields
      const existingBookmark = await getBookmark(id);
      
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
      // A title or URL change feeds domainAnalytics and quickStats; without this
      // the sidebar and header stay wrong for up to an hour.
      await invalidateMetricCaches('update');
      
      // Re-enrich if URL changed
      if (changeInfo.url) {
        const settings = await getSettings();
        if (settings.enrichmentEnabled) {
          await addToEnrichmentQueue(id, 5);
        }
        
        // Invalidate URL cache
        if (behaviorTrackingEnabled) {
          await invalidateUrlCache();
        }
      }
      
      // Notify dashboard
      chrome.runtime.sendMessage({ action: 'bookmarksChanged' }).catch(() => {});
    }
  } catch (error) {
    console.error('Error handling bookmark change:', error);
  }
}

// Handle bookmark moved
async function handleBookmarkMoved(id, moveInfo) {
  try {
    console.log('Bookmark moved:', id);
    
    const folderPath = await getBookmarkFolderPath(moveInfo.parentId);
    
    const existingBookmark = await getBookmark(id);
    
    if (existingBookmark) {
      existingBookmark.folderPath = folderPath;
      existingBookmark.parentId = moveInfo.parentId;
      await upsertBookmark(existingBookmark);
      await logEvent(id, 'update', { moved: true });
      await invalidateMetricCaches('update');
      
      // Notify dashboard
      chrome.runtime.sendMessage({ action: 'bookmarksChanged' }).catch(() => {});
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

// Message handling for dashboard / side panel communication.
// Each handler is a plain async function; the router below turns its resolved
// value into the response envelope and funnels rejections into one place.

// Dead-link re-checking is capped per invocation and checkpointed, so a worker
// termination costs at most one chunk rather than the whole run.
const RE_ENRICH_MAX_BATCH = 100;
const RE_ENRICH_PROCESSED_KEY = 'reEnrichProcessedIds';

// The checkpoint used to be a numeric index into getDeadLinks(). That list is
// recomputed on every invocation and shrinks as links revive, so a run that
// revived 30 of its first 100 left the cursor 30 entries past where the list had
// moved - and those 30 were never checked. Ids are immune to the list changing
// underneath them.
async function getProcessedDeadIds() {
  try {
    const stored = await chrome.storage.session.get(RE_ENRICH_PROCESSED_KEY);
    return new Set(stored[RE_ENRICH_PROCESSED_KEY] || []);
  } catch {
    return new Set();
  }
}

async function setProcessedDeadIds(ids) {
  try {
    await chrome.storage.session.set({ [RE_ENRICH_PROCESSED_KEY]: [...ids] });
  } catch (error) {
    console.error('Error persisting re-enrich checkpoint:', error);
  }
}

const messageHandlers = {
  async syncBookmarks() {
    await syncBookmarks();
    return {};
  },

  async getEnrichmentStatus() {
    const settings = await getSettings();
    const bookmarks = await getAllBookmarks();
    const enrichable = bookmarks.filter(isEnrichable);
    const enrichedCount = enrichable.filter(isEnriched).length;
    // Computed through the same predicate the sync queue uses, rather than by
    // subtraction - the two disagreed, and the subtraction included dead and
    // blocked links the queue would never process.
    const pendingCount = enrichable.filter(isPendingEnrichment).length;

    return {
      queueSize: pendingCount,
      totalBookmarks: enrichable.length,
      enrichedCount,
      pendingCount,
      enabled: settings.enrichmentEnabled
    };
  },

  // Clears every stored dead-link verdict and re-queues those rows, so the
  // corrected classifier decides them again from scratch. Exposed as
  // "Re-verify all" in the Health tab for users who do not want to wait for an
  // extension update to run the same correction.
  async resetDeadLinkVerdicts() {
    const { reset, markedUnfetchable, resetIds } = await resetStaleDeadLinkVerdicts();
    if (resetIds.length > 0) {
      const { enrichmentEnabled } = await getSettings();
      if (enrichmentEnabled) await bulkAddToEnrichmentQueue(resetIds, 0);
    }
    // A fresh pass, so the previous run's checkpoint no longer applies.
    await setProcessedDeadIds(new Set());
    return { reset, markedUnfetchable };
  },

  async reEnrichDeadLinks(request) {
    const allDeadLinks = await getDeadLinks();

    // The default used to be "every dead link", with no keepalive. A run over a
    // few hundred links outlives the service worker's idle budget, so it is
    // capped and the processed ids are checkpointed after each chunk; the next
    // invocation resumes with whatever is left instead of starting over.
    const batchSize = Math.min(request.batchSize || RE_ENRICH_MAX_BATCH, RE_ENRICH_MAX_BATCH);
    const concurrency = request.concurrency || 3;

    const resume = request.resume !== false;
    const processed = resume ? await getProcessedDeadIds() : new Set();
    const { batch: deadLinks, pending } = selectDeadLinkBatch(allDeadLinks, processed, batchSize);

    let success = 0;
    let stillDead = 0;
    let errors = 0;
    const total = deadLinks.length;
    const snapshot = () => ({ total, pending, success, stillDead, errors });

    const report = progress => {
      chrome.runtime.sendMessage({ action: 'reEnrichProgress', progress }).catch(() => {});
    };

    // Sequential within a chunk-free loop: the counters above are shared state,
    // so parallel updates would race.
    for (let i = 0; i < deadLinks.length; i += concurrency) {
      const chunk = deadLinks.slice(i, i + concurrency);
      const outcomes = await Promise.all(
        chunk.map(async (bookmark, j) => {
          report({
            current: i + j + 1,
            total,
            title: bookmark.title,
            url: bookmark.url,
            status: 'processing'
          });
          try {
            // `force` bypasses the freshness guard directly. The old code loaded
            // the record, nulled lastChecked and wrote it back purely to get
            // past that guard - one IndexedDB write and one corpus-cache
            // invalidation per link, for nothing.
            const result = await enrichBookmark(bookmark.id, { force: true });
            if (result.isAlive === false) return 'stillDead';
            return result.success ? 'success' : 'errors';
          } catch (err) {
            console.error(`Error re-enriching ${bookmark.id}:`, err);
            return 'errors';
          }
        })
      );

      for (const outcome of outcomes) {
        if (outcome === 'success') success++;
        else if (outcome === 'stillDead') stillDead++;
        else errors++;
      }
      for (const bookmark of chunk) processed.add(bookmark.id);
      await setProcessedDeadIds(processed);
      report({ current: Math.min(i + concurrency, total), total, status: 'completed', results: snapshot() });
    }

    // Whole pass done - drop the checkpoint so the next run starts clean.
    if (pending === 0) await setProcessedDeadIds(new Set());

    return { results: snapshot() };
  },

  async runEnrichment(request) {
    const progressCallback = progress => {
      chrome.runtime.sendMessage({ action: 'enrichmentProgress', progress }).catch(() => {});
    };

    const result = await processEnrichmentBatch(
      request.batchSize || 10,
      progressCallback,
      request.concurrency || 3,
      { force: request.force || false }
    );
    return { result };
  },

  async enrichSpecificBookmarks(request) {
    const { ids } = request;
    if (!ids || !ids.length) throw new Error('No IDs provided');

    const results = [];
    // Sequential to avoid overwhelming the network
    for (const id of ids) {
      try {
        const result = await enrichBookmark(id, { force: true });
        results.push({ id, ...result });
      } catch (e) {
        results.push({ id, success: false, error: e.message });
      }
    }
    return { results };
  },

  async updateSettings(request) {
    await updateSettings(request.settings);

    if (request.settings.trackBrowsingBehavior !== undefined) {
      behaviorTrackingEnabled = request.settings.trackBrowsingBehavior;
      console.log(`Behavior tracking ${behaviorTrackingEnabled ? 'enabled' : 'disabled'}`);
      const active = await updateBehaviorTrackingListeners(behaviorTrackingEnabled);
      if (active && !cacheBuilt) {
        buildUrlCache();
      }
      return { trackBrowsingBehavior: active };
    }
    return {};
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handler = messageHandlers[request?.action];
  if (!handler) return false;

  handler(request, sender)
    .then(result => sendResponse({ success: true, ...result }))
    .catch(error => sendResponse({ success: false, error: error.message }));

  return true; // Response is sent asynchronously
});


// =========================================
// Omnibox: the whole query language from the address bar
// =========================================

// Omnibox suggestion descriptions are parsed as XML, so any user-supplied text
// has to be escaped or a title containing `&` silently drops the suggestion.
function escapeOmniboxText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dashboardUrlFor(query) {
  const base = chrome.runtime.getURL('dashboard.html');
  return query ? `${base}?q=${encodeURIComponent(query)}#bookmarks` : `${base}#bookmarks`;
}

chrome.omnibox.setDefaultSuggestion({
  description:
    'Search bookmarks — supports +term, -term, "phrase", /regex/, domain:, folder:, platform:, type:',
});

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  if (!text || !text.trim()) {
    suggest([]);
    return;
  }
  try {
    const { results } = await searchBookmarks(text, null, { limit: 8 });
    suggest(
      results.map((bookmark) => ({
        content: bookmark.url,
        description: `${escapeOmniboxText(bookmark.title || bookmark.url)} <dim>${escapeOmniboxText(
          bookmark.domain || ''
        )}</dim>`,
      }))
    );
  } catch (error) {
    console.error('Omnibox search failed:', error);
    suggest([]);
  }
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  let url = /^https?:\/\//i.test(text) ? text : null;

  if (!url) {
    try {
      const { results } = await searchBookmarks(text, null, { limit: 1 });
      url = results[0]?.url || null;
    } catch (error) {
      console.error('Omnibox navigation failed:', error);
    }
  }

  // No single obvious hit: hand the query to the dashboard rather than guessing.
  const target = url || dashboardUrlFor(text);

  if (disposition === 'currentTab') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.update(tab.id, { url: target });
      return;
    }
  }
  await chrome.tabs.create({ url: target, active: disposition !== 'newBackgroundTab' });
});

// =========================================
// Tab Monitoring for Behavioral Analytics
// (Only runs if user enables trackBrowsingBehavior)
// =========================================

// The URL->bookmark map is rebuilt from scratch whenever the service worker is
// woken, so it is mirrored into chrome.storage.session (memory-backed, cleared
// when the browser closes) rather than recomputed on every wake.
const URL_CACHE_SESSION_KEY = 'urlToBookmarkCache';

let urlToBookmarkCache = new Map();
let cacheBuilt = false;
let cacheBuildPromise = null;
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
  const enabled = await isBehaviorTrackingEnabled();
  const active = await updateBehaviorTrackingListeners(enabled);
  console.log(`Behavior tracking: ${active ? 'enabled' : 'disabled (default)'}`);
  return active;
}

// Build URL cache from bookmarks, restoring from session storage when possible.
// Concurrent tab events share one build - without this each event triggered its
// own full table scan.
function buildUrlCache() {
  if (cacheBuildPromise) return cacheBuildPromise;

  cacheBuildPromise = (async () => {
    try {
      const stored = await chrome.storage.session.get(URL_CACHE_SESSION_KEY);
      const entries = stored?.[URL_CACHE_SESSION_KEY];
      if (entries) {
        urlToBookmarkCache = new Map(Object.entries(entries));
        cacheBuilt = true;
        console.log(`URL cache restored from session (${urlToBookmarkCache.size} entries)`);
        return;
      }

      const bookmarks = await db.bookmarks.toArray();
      urlToBookmarkCache = new Map();

      for (const bookmark of bookmarks) {
        if (bookmark.url) {
          urlToBookmarkCache.set(normalizeUrlForMatching(bookmark.url), bookmark.id);
        }
      }

      cacheBuilt = true;
      await persistUrlCache();
      console.log(`URL cache built with ${urlToBookmarkCache.size} entries`);
    } catch (error) {
      console.error('Error building URL cache:', error);
    } finally {
      cacheBuildPromise = null;
    }
  })();

  return cacheBuildPromise;
}

async function persistUrlCache() {
  try {
    await chrome.storage.session.set({
      [URL_CACHE_SESSION_KEY]: Object.fromEntries(urlToBookmarkCache),
    });
  } catch (error) {
    console.warn('Could not persist URL cache to session storage:', error);
  }
}

// Drop both the in-memory and the session copy so the next lookup rebuilds.
async function invalidateUrlCache() {
  cacheBuilt = false;
  urlToBookmarkCache.clear();
  try {
    await chrome.storage.session.remove(URL_CACHE_SESSION_KEY);
  } catch (error) {
    console.warn('Could not clear session URL cache:', error);
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

const DEBOUNCE_TIME = 60000; // 1 minute

// Record a bookmark access when user visits a bookmarked URL.
// Debounce state lives on the record itself rather than in a Map, so it holds
// across service-worker restarts and cannot grow unbounded. The read, the
// debounce check and the increment all happen inside one Dexie transaction, so
// concurrent tab events cannot lose an increment.
async function recordBookmarkAccess(bookmarkId, url) {
  try {
    let recorded = false;

    await db.bookmarks
      .where(':id')
      .equals(bookmarkId)
      .modify((bookmark) => {
        const now = Date.now();
        if (bookmark.lastAccessed && now - bookmark.lastAccessed < DEBOUNCE_TIME) return;
        bookmark.lastAccessed = now;
        bookmark.accessCount = (bookmark.accessCount || 0) + 1;
        recorded = true;
      });

    if (!recorded) return false;

    invalidateBookmarkCorpus();
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

// Tab listeners are registered synchronously in the first turn (MV3 drops
// events registered later). They gate on `trackingReady` instead, so events
// arriving before the settings read completes are still handled.
const onTabUpdated = async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return;

  try {
    await trackingReady;
    if (!behaviorTrackingEnabled) return;

    const bookmarkId = await findMatchingBookmark(tab.url);
    if (bookmarkId) {
      await recordBookmarkAccess(bookmarkId, tab.url);
    }
  } catch (error) {
    console.error('Error in tab update handler:', error);
  }
};

const onTabActivated = async (activeInfo) => {
  try {
    await trackingReady;
    if (!behaviorTrackingEnabled) return;

    const tab = await chrome.tabs.get(activeInfo.tabId);

    // Skip non-http URLs
    if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
      return;
    }
    
    const bookmarkId = await findMatchingBookmark(tab.url);
    if (bookmarkId) {
      await recordBookmarkAccess(bookmarkId, tab.url);
    }
  } catch (error) {
    console.error('Error in tab activation handler:', error);
  }
};

chrome.tabs.onUpdated.addListener(onTabUpdated);
chrome.tabs.onActivated.addListener(onTabActivated);

// Apply the tracking setting.
// "tabs" is an optional permission - without it tab URLs are not readable, so
// tracking stays off rather than silently recording nothing.
async function updateBehaviorTrackingListeners(enabled) {
  const hasTabsPermission = enabled
    ? await chrome.permissions.contains({ permissions: ['tabs'] })
    : false;

  if (enabled && !hasTabsPermission) {
    console.warn('Behavior tracking requires the optional "tabs" permission - staying disabled');
  }

  behaviorTrackingEnabled = enabled && hasTabsPermission;
  return behaviorTrackingEnabled;
}

// Resolved once the tracking setting has been read; tab handlers await it.
const trackingReady = initBehaviorTracking().then((active) => {
  if (active) buildUrlCache();
  return active;
});

console.log('Bookmark Insights background service worker loaded');
