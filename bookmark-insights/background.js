// Background script for Bookmark Insight Chrome Extension
// This uses Chrome's service worker pattern for Manifest V3

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await syncBookmarks();
  }
});

// Sync bookmarks from Chrome to local storage
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
            } else if (node.url.startsWith('chrome://')) {
              domain = 'chrome-internal';
            } else if (node.url.startsWith('file://')) {
              domain = 'local-file';
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
            parentId: node.parentId
          });
        } else if (node.children) {
          // It's a folder
          const newPath = folderPath ? `${folderPath}/${node.title}` : node.title;
          flattenBookmarks(node.children, newPath);
        }
      }
    }
    
    flattenBookmarks(bookmarkTree);
    
    // Store bookmarks in Chrome storage
    await chrome.storage.local.set({ 
      bookmarks: flatBookmarks,
      lastSyncTime: Date.now()
    });
    
    console.log(`Synced ${flatBookmarks.length} bookmarks`);
  } catch (error) {
    console.error('Error syncing bookmarks:', error);
  }
}

// Listen for bookmark changes
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  await handleBookmarkChange();
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  await handleBookmarkChange();
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  await handleBookmarkChange();
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  await handleBookmarkChange();
});

// Handle bookmark changes by re-syncing (simple approach)
let syncTimeout = null;
async function handleBookmarkChange() {
  // Debounce bookmark changes to avoid excessive syncing
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  syncTimeout = setTimeout(async () => {
    console.log('Handling bookmark change...');
    await syncBookmarks();
    syncTimeout = null;
  }, 2000); // Wait 2 seconds before syncing
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
});
