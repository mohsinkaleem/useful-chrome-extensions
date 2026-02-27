// Background script for Quick Links Manager
// This handles service worker lifecycle and context menu actions

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'add-to-quick-links',
            title: 'Add to Quick Links',
            contexts: ['page', 'link']
        });
    });
});

// Handle keyboard shortcuts (if we add them later)
chrome.commands?.onCommand.addListener((command) => {
    if (command === 'open-quick-links') {
        chrome.action.openPopup();
    }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'add-to-quick-links') {
        const targetUrl = info.linkUrl || tab?.url;
        const targetTitle = info.linkUrl ? 'Saved Link' : tab?.title;

        if (!targetUrl) return;

        // Store the current page info for the popup to use
        chrome.storage.local.set({
            pendingLink: {
                title: targetTitle || targetUrl,
                url: targetUrl,
                timestamp: Date.now()
            }
        });
        
        // Open the popup
        chrome.action.openPopup();
    }
});
