/* ===========================================================================
 * TubeFilter — background service worker (MV3)
 * Receives stats messages from content scripts and updates the toolbar
 * badge so the user can see the per-tab hidden count at a glance. Also
 * routes the toggle keyboard command to the active tab.
 * ========================================================================= */

const BADGE_COLOR_ACTIVE = '#cc0000';
const BADGE_COLOR_IDLE = '#9aa0a6';

const YOUTUBE_URL_RE = /^https:\/\/(www\.|m\.)?youtube\.com\//;

/**
 * Tabs we've painted a badge on. The service worker can be torn down at any
 * time, which empties this — that's fine, it only drives cleanup and the
 * content script re-sends its count on the next pass.
 * @type {Set<number>}
 */
const badgedTabs = new Set();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!sender || !sender.tab) {
    sendResponse?.({ ok: true });
    return;
  }

  if (msg.action === 'statsUpdate') {
    const tabId = sender.tab.id;
    const count = Number(msg.hiddenCount) || 0;
    updateBadge(tabId, count);
    sendResponse?.({ ok: true });
  }

  return false;
});

function updateBadge(tabId, count) {
  try {
    const text = count > 0 ? formatBadge(count) : '';
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: count > 0 ? BADGE_COLOR_ACTIVE : BADGE_COLOR_IDLE,
    });
    chrome.action.setBadgeText({ tabId, text });
    if (count > 0) badgedTabs.add(tabId);
    else badgedTabs.delete(tabId);
  } catch (e) {
    // tab may already be gone; safe to ignore
  }
}

function clearBadge(tabId) {
  if (!badgedTabs.has(tabId)) return;
  badgedTabs.delete(tabId);
  try {
    chrome.action.setBadgeText({ tabId, text: '' });
  } catch {}
}

function formatBadge(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + 'k';
  return Math.floor(n / 1000) + 'k';
}

// ---------------------------------------------------------------------------
// Badge lifecycle
//
// Chrome only populates changeInfo.url when the extension holds the "tabs"
// permission or a host permission matching the tab's *new* URL. We hold
// neither for non-YouTube sites, so a navigation away from YouTube arrives
// with the URL stripped and a url-only check would never fire. changeInfo
// .status, on the other hand, is always present — so clear the badge the
// moment a badged tab starts loading a new document and let the content
// script repaint it if the destination is still YouTube.
// ---------------------------------------------------------------------------
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    // Same-document YouTube navigations (the SPA case) keep their badge:
    // when the URL *is* visible to us and still YouTube, leave it alone.
    if (changeInfo.url && YOUTUBE_URL_RE.test(changeInfo.url)) return;
    clearBadge(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  badgedTabs.delete(tabId);
});

// ---------------------------------------------------------------------------
// Keyboard command
// ---------------------------------------------------------------------------
chrome.commands?.onCommand.addListener((command) => {
  if (command !== 'toggle-filtering') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id === undefined) return;
    chrome.tabs.sendMessage(tab.id, { action: 'toggleFilters' }, (response) => {
      // Swallow "no receiving end" on non-YouTube tabs.
      if (chrome.runtime.lastError) return;
      if (response && response.success) {
        updateBadge(tab.id, Number(response.hiddenCount) || 0);
      }
    });
  });
});
