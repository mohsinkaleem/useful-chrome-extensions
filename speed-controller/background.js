// Background script for Netflix Speed Controller

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      console.log('Netflix Speed Controller: No active tab found');
      return;
    }

    // Only work on Netflix
    if (!tab.url?.includes('netflix.com')) {
      console.log('Netflix Speed Controller: Not on Netflix');
      return;
    }

    // Send command to content script
    await chrome.tabs.sendMessage(tab.id, { action: command });
  } catch (error) {
    console.log('Netflix Speed Controller: Could not send command', error.message);
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showNotification' && sender.tab?.id) {
    // Show speed in badge
    chrome.action.setBadgeText({
      text: request.speed,
      tabId: sender.tab.id
    }).catch(() => {});
    
    chrome.action.setBadgeBackgroundColor({
      color: '#e50914', // Netflix red
      tabId: sender.tab.id
    }).catch(() => {});
    
    // Clear badge after 2 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({
        text: '',
        tabId: sender.tab.id
      }).catch(() => {});
    }, 2000);
  }
  
  sendResponse({ received: true });
  return true;
});

// Initialize default settings on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      speedStep: 0.25,
      maxSpeed: 4.0,
      minSpeed: 0.25,
      showNotifications: true,
      lastSpeed: 1.5,
      skipSeconds: 30
    });
    
    console.log('Netflix Speed Controller: Installed successfully');
  }
});

// Keep service worker alive for commands
chrome.runtime.onStartup.addListener(() => {
  console.log('Netflix Speed Controller: Service worker started');
});
