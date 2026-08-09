// Background service worker

import { extractBaseDomain, normalizeUrl } from '../shared/url-utils.js';
import { createBookmark } from '../shared/bookmark-utils.js';
import { applyCluster } from '../shared/grouping.js';

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
    id: 'group-by-domain',
    title: 'Group Tabs by Domain',
    contexts: ['page']
  });

  // Initialize badge
  updateTabCountBadge();

  // Ensure action click opens popup, not side panel
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
    .catch((error: unknown) => console.error('Failed to set panel behavior:', error));
});

// Badge text does not survive a browser restart, so recompute it on startup.
chrome.runtime.onStartup.addListener(() => {
  updateTabCountBadge();
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'close-duplicate-tabs':
      if (tab?.url) {
        const target = normalizeUrl(tab.url);
        const tabs = await chrome.tabs.query({});
        const ids = tabs
          .filter(t => t.url && normalizeUrl(t.url) === target && t.id !== tab.id)
          .map(t => t.id)
          .filter((id): id is number => id !== undefined);
        if (ids.length > 0) {
          await chrome.tabs.remove(ids);
        }
      }
      break;

    case 'bookmark-tab':
      if (tab?.url && tab?.title) {
        await createBookmark(tab);
      }
      break;

    case 'group-by-domain':
      if (tab?.url) {
        const domain = extractBaseDomain(tab.url);
        if (!domain) break;

        // Group per window — chrome.tabs.group cannot span windows.
        const allWindows = await chrome.windows.getAll({ populate: true });
        for (const win of allWindows) {
          if (!win.tabs || win.id === undefined) continue;
          const ids = win.tabs
            .filter(t => t.url && extractBaseDomain(t.url) === domain)
            .map(t => t.id)
            .filter((id): id is number => id !== undefined);
          await applyCluster(win.id, domain, ids);
        }
      }
      break;
  }
});

// Tab event listeners
chrome.tabs.onCreated.addListener(() => {
  debouncedUpdateTabCountBadge();
});

// Command listener for keyboard shortcuts
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open_side_panel') {
    if (tab?.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId })
        .catch((error: unknown) => console.error('Failed to open side panel:', error));
    }
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

console.log('Tab Manager service worker initialized');
