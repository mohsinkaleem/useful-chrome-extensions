// Bookmark utilities

export interface BookmarkFolder {
  id: string;
  title: string;
  parentId?: string;
}

// Get the Bookmarks Bar folder ID dynamically
async function getBookmarksBarId(): Promise<string> {
  try {
    const tree = await chrome.bookmarks.getTree();
    // The bookmarks bar is typically the first child of the root
    const root = tree[0];
    if (root.children && root.children.length > 0) {
      // Find "Bookmarks Bar" or "Bookmarks bar" or first folder
      const bookmarksBar = root.children.find(c => 
        c.title.toLowerCase().includes('bookmark') && !c.url
      ) || root.children[0];
      return bookmarksBar.id;
    }
  } catch (e) {
    console.error('Failed to get bookmarks bar ID:', e);
  }
  return '1'; // Fallback to default
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
    if (tab.url && !tab.url.startsWith('chrome://')) {
      const bookmark = await createBookmark(tab, folderId);
      bookmarks.push(bookmark);
    }
  }
  
  return bookmarks;
}

// Create folder for window bookmarks
export async function bookmarkWindow(
  windowId: number,
  folderName?: string
): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const tabs = await chrome.tabs.query({ windowId });
  const timestamp = new Date().toISOString().split('T')[0];
  const defaultFolderName = folderName || `Window - ${timestamp}`;
  
  return await bulkBookmarkTabs(tabs, defaultFolderName);
}

// Get all bookmark folders
export async function getAllBookmarkFolders(): Promise<BookmarkFolder[]> {
  const tree = await chrome.bookmarks.getTree();
  const folders: BookmarkFolder[] = [];
  
  function traverse(node: chrome.bookmarks.BookmarkTreeNode) {
    if (!node.url) { // It's a folder
      folders.push({
        id: node.id,
        title: node.title,
        parentId: node.parentId
      });
    }
    
    if (node.children) {
      node.children.forEach(traverse);
    }
  }
  
  tree.forEach(traverse);
  return folders;
}
