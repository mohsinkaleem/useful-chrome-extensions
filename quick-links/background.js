// Background script for Quick Links Manager
// This handles the service worker functionality

chrome.runtime.onInstalled.addListener(() => {
    console.log('Quick Links Manager installed');
    
    // Initialize storage with default data if needed
    chrome.storage.local.get(['quickLinks'], (result) => {
        if (!result.quickLinks) {
            const defaultLinks = [
                {
                    id: '1',
                    title: 'GitHub',
                    url: 'https://github.com',
                    category: 'tools',
                    description: 'Code repository hosting',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            ];
            
            chrome.storage.local.set({ quickLinks: defaultLinks });
        }
    });
});

// Handle keyboard shortcuts (if we add them later)
chrome.commands?.onCommand.addListener((command) => {
    if (command === 'open-quick-links') {
        chrome.action.openPopup();
    }
});

// Context menu for adding current page (optional feature)
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'add-to-quick-links',
        title: 'Add to Quick Links',
        contexts: ['page']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'add-to-quick-links') {
        // Store the current page info for the popup to use
        chrome.storage.local.set({
            pendingLink: {
                title: tab.title,
                url: tab.url,
                timestamp: Date.now()
            }
        });
        
        // Open the popup
        chrome.action.openPopup();
    }
});
