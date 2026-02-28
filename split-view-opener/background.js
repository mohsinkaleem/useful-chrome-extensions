let splitWindowId = null;

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "openSplit" && message.url) {
    const currentWindow = await chrome.windows.getCurrent();
    const screen = message.screen;
    
    // Check if the split window already exists
    if (splitWindowId) {
      try {
        await chrome.windows.get(splitWindowId);
        
        // Update existing split window
        const tabs = await chrome.tabs.query({ windowId: splitWindowId, active: true });
        if (tabs.length > 0) {
            await chrome.tabs.update(tabs[0].id, { url: message.url });
        } else {
            chrome.tabs.create({ windowId: splitWindowId, url: message.url });
        }

        // OPTIONAL: Even if the window exists, ensure the layout is still correct
        // snapWindows(currentWindow.id, splitWindowId, screen);
        
      } catch (e) {
        // Window was closed manually, create new one
        createSplitWindow(currentWindow.id, message.url, screen);
      }
    } else {
      createSplitWindow(currentWindow.id, message.url, screen);
    }
  }
});

async function createSplitWindow(originalWindowId, url, screen) {
  // Calculate exactly half of the AVAILABLE screen width
  const halfWidth = Math.floor(screen.width / 2);
  
  // 1. Force the Current Window to the Left Half of the screen
  // irrespective of its current size.
  await chrome.windows.update(originalWindowId, {
    width: halfWidth,
    height: screen.height,
    left: screen.left, // 0 on single monitor, or specific coordinate on multi-monitor
    top: screen.top,
    state: "normal"
  });

  // 2. Create the New Window on the Right Half
  const newWindow = await chrome.windows.create({
    url: url,
    width: halfWidth,
    height: screen.height,
    left: screen.left + halfWidth, // Offset by half the width
    top: screen.top,
    type: "normal"
  });

  splitWindowId = newWindow.id;
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === splitWindowId) {
    splitWindowId = null;
  }
});