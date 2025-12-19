// Background script for Video Speed Controller
chrome.commands.onCommand.addListener((command, tab) => {
  // Send command to content script
  chrome.tabs.sendMessage(tab.id, {
    action: command
  }).catch(() => {
    // Ignore errors if content script is not ready
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showNotification') {
    // Create notification for speed changes
    chrome.action.setBadgeText({
      text: request.speed,
      tabId: sender.tab.id
    });
    
    chrome.action.setBadgeBackgroundColor({
      color: '#4CAF50',
      tabId: sender.tab.id
    });
    
    // Clear badge after 2 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({
        text: '',
        tabId: sender.tab.id
      });
    }, 2000);
  }
});

// Store default settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    speedStep: 0.25,
    maxSpeed: 4.0,
    minSpeed: 0.25,
    showNotifications: true
  });
});
