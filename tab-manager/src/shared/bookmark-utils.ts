// Bookmark utilities

import { isChromeInternalUrl } from './url-utils.js';

// Get the Bookmarks Bar folder ID dynamically.
// Matching on the folder title breaks on non-English Chrome, so rely on position:
// the bookmarks bar is always the first child of the root node.
async function getBookmarksBarId(): Promise<string> {
  try {
    const [root] = await chrome.bookmarks.getTree();
    const bar = root?.children?.[0];
    if (bar) return bar.id;
  } catch (e) {
    console.error('Failed to get bookmarks bar ID:', e);
  }
  return '1'; // Chrome's well-known bookmarks bar ID
}

// Create a bookmark from a tab
export async function createBookmark(
  tab: chrome.tabs.Tab,
  parentId?: string
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const defaultParentId = parentId || await getBookmarksBarId();
  return await chrome.bookmarks.create({
    parentId: defaultParentId,
    title: tab.title || 'Untitled',
    url: tab.url
  });
}

// Bulk bookmark multiple tabs
export async function bulkBookmarkTabs(
  tabs: chrome.tabs.Tab[],
  folderName?: string
): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const bookmarksBarId = await getBookmarksBarId();
  let folderId = bookmarksBarId;
  
  // Create folder if name provided
  if (folderName) {
    const folder = await chrome.bookmarks.create({
      parentId: bookmarksBarId,
      title: folderName
    });
    folderId = folder.id;
  }
  
  const bookmarks: chrome.bookmarks.BookmarkTreeNode[] = [];
  
  for (const tab of tabs) {
    if (tab.url && !isChromeInternalUrl(tab.url)) {
      const bookmark = await createBookmark(tab, folderId);
      bookmarks.push(bookmark);
    }
  }
  
  return bookmarks;
}
