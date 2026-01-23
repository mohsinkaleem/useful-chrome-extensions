// Background service worker

import { AutoGrouper } from './auto-grouper.js';

// Initialize auto-grouper
const autoGrouper = new AutoGrouper();

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  // Create context menus
  chrome.contextMenus.create({
    id: 'close-duplicate-tabs',
    title: 'Close Duplicate Tabs',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'bookmark-tab',
    title: 'Bookmark This Tab',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'hibernate-tab',
    title: 'Hibernate This Tab',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'group-by-domain',
    title: 'Group Tabs by Domain',
    contexts: ['page']
  });

  // Initialize badge
  updateTabCountBadge();
  
  // Ensure action click opens popup, not side panel
  // @ts-ignore - sidePanel API types might not be fully available
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
    .catch((error: unknown) => console.error('Failed to set panel behavior:', error));
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'close-duplicate-tabs':
      if (tab?.url) {
        const tabs = await chrome.tabs.query({});
        const duplicates = tabs.filter(t => t.url === tab.url && t.id !== tab.id);
        const ids = duplicates.map(t => t.id).filter(Boolean) as number[];
        if (ids.length > 0) {
          await chrome.tabs.remove(ids);
        }
      }
      break;

    case 'bookmark-tab':
      if (tab?.url && tab?.title) {
        await chrome.bookmarks.create({
          parentId: '1',
          title: tab.title,
          url: tab.url
        });
      }
      break;

    case 'hibernate-tab':
      if (tab?.id) {
        await chrome.tabs.discard(tab.id);
      }
      break;

    case 'group-by-domain':
      if (tab?.url) {
        const domain = new URL(tab.url).hostname;
        const tabs = await chrome.tabs.query({});
        const sameDomain = tabs.filter(t => {
          try {
            return t.url && new URL(t.url).hostname === domain;
          } catch {
            return false;
          }
        });
        const ids = sameDomain.map(t => t.id).filter(Boolean) as number[];
        if (ids.length > 1) {
          const groupId = await chrome.tabs.group({ tabIds: ids });
          await chrome.tabGroups.update(groupId, {
            title: domain,
            collapsed: false
          });
        }
      }
      break;
  }
});

// Tab event listeners for auto-grouping
chrome.tabs.onCreated.addListener((tab) => {
  autoGrouper.onTabCreated(tab);
  debouncedUpdateTabCountBadge();
});

// Command listener for keyboard shortcuts
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open_side_panel') {
    if (tab?.windowId) {
      // @ts-ignore
      chrome.sidePanel.open({ windowId: tab.windowId })
        .catch((error: unknown) => console.error('Failed to open side panel:', error));
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    autoGrouper.onTabUpdated(tab);
  }
});

chrome.tabs.onRemoved.addListener(() => {
  debouncedUpdateTabCountBadge();
});

chrome.tabs.onAttached.addListener(() => {
  debouncedUpdateTabCountBadge();
});

chrome.tabs.onDetached.addListener(() => {
  debouncedUpdateTabCountBadge();
});

let badgeUpdateTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedUpdateTabCountBadge() {
  if (badgeUpdateTimer) {
    clearTimeout(badgeUpdateTimer);
  }
  badgeUpdateTimer = setTimeout(() => {
    updateTabCountBadge();
    badgeUpdateTimer = null;
  }, 200);
}

// Update badge with tab count
async function updateTabCountBadge() {
  const tabs = await chrome.tabs.query({});
  const count = tabs.length;
  
  // Set badge text
  await chrome.action.setBadgeText({ text: count.toString() });
  
  // Set badge color based on count
  if (count > 50) {
    await chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' }); // Red
  } else if (count > 30) {
    await chrome.action.setBadgeBackgroundColor({ color: '#f39c12' }); // Orange
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: '#3498db' }); // Blue
  }
}

// Keep service worker alive
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    sendResponse({ status: 'alive' });
  }
  return true;
});

console.log('Tab Manager service worker initialized');
