const STYLE_ID = 'simple-smart-dark-mode-style';

// Get current domain
const DOMAIN = location.hostname;
const STORAGE_KEY = `site:${DOMAIN}`;

// Cache to avoid redundant DOM updates
let lastSettingsHash = '';
let styleEl = null;

// Default settings
const DEFAULT_SETTINGS = {
  enabled: false,
  filterMode: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0
};

function getCSS(brightness, contrast, saturation, hue, isDarkMode) {
  const b = brightness / 100;
  const c = contrast / 100;
  const s = saturation / 100;

  if (!isDarkMode) {
    return `html{filter:brightness(${b}) contrast(${c}) saturate(${s}) hue-rotate(${hue}deg)!important}`;
  } else {
    const totalHue = 180 + hue;
    return `html{filter:invert(1) hue-rotate(${totalHue}deg) brightness(${b}) contrast(${c}) saturate(${s})!important}
img,video,picture,canvas,iframe,embed,object,svg,[style*="background-image"],[role="img"],[type="image"],.fix-invert{filter:invert(1) hue-rotate(180deg)!important}`;
  }
}

let observer = null;
let pendingNodes = new Set();
let processingScheduled = false;

function processNodesBatch(deadline) {
  while (pendingNodes.size > 0 && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
    const node = pendingNodes.values().next().value;
    pendingNodes.delete(node);
    
    if (!node.isConnected || node.nodeType !== 1) continue;

    try {
      const style = window.getComputedStyle(node);
      if (style.backgroundImage !== 'none' && 
          style.backgroundImage.includes('url(') && 
          !node.classList.contains('fix-invert')) {
        node.classList.add('fix-invert');
      }
    } catch (e) {
      // Ignore
    }
  }
  
  if (pendingNodes.size > 0) {
    window.requestIdleCallback(processNodesBatch);
  } else {
    processingScheduled = false;
  }
}

function scheduleNode(node) {
  if (node.nodeType !== 1) return;
  pendingNodes.add(node);
  
  if (!processingScheduled) {
    processingScheduled = true;
    if (window.requestIdleCallback) {
      window.requestIdleCallback(processNodesBatch);
    } else {
      setTimeout(() => {
        processNodesBatch({ timeRemaining: () => 50, didTimeout: false });
      }, 200);
    }
  }
}

function startObserver() {
  if (observer) return;
  
  // Initial scan
  document.querySelectorAll('*').forEach(scheduleNode);

  observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        scheduleNode(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('*').forEach(scheduleNode);
        }
      });
    });
  });
  
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  pendingNodes.clear();
  processingScheduled = false;
}

function updateTheme(settings) {
  const isActive = settings.enabled || settings.filterMode;
  
  const hash = isActive ? `${settings.enabled}-${settings.filterMode}-${settings.brightness}-${settings.contrast}-${settings.saturation}-${settings.hue}` : '';
  
  if (hash === lastSettingsHash) return;
  lastSettingsHash = hash;
  
  if (!isActive) {
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
    stopObserver();
    return;
  }

  if (settings.enabled) {
    startObserver();
  } else {
    stopObserver();
  }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
  }
  
  if (!styleEl.parentNode) {
    (document.head || document.documentElement).appendChild(styleEl);
  }

  const brightness = settings.brightness ?? 100;
  const contrast = settings.contrast ?? 100;
  const saturation = settings.saturation ?? 100;
  const hue = settings.hue ?? 0;
  const isDarkMode = settings.enabled === true;
  
  styleEl.textContent = getCSS(brightness, contrast, saturation, hue, isDarkMode);
}

function applyTheme() {
  chrome.storage.sync.get([STORAGE_KEY], (result) => {
    const siteSettings = result[STORAGE_KEY];
    
    if (!siteSettings) {
      // No settings for this domain - ensure clean state
      if (lastSettingsHash !== '') {
        lastSettingsHash = '';
        if (styleEl) {
          styleEl.remove();
          styleEl = null;
        }
      }
      return;
    }
    
    updateTheme({ ...DEFAULT_SETTINGS, ...siteSettings });
  });
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyTheme, { once: true });
} else {
  applyTheme();
}

// Listen ONLY for changes to this domain's settings
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;
  
  // Only react if OUR domain's key changed
  if (!(STORAGE_KEY in changes)) return;
  
  const newSettings = changes[STORAGE_KEY].newValue;
  
  if (!newSettings) {
    // Settings were deleted for this domain
    if (lastSettingsHash !== '') {
      lastSettingsHash = '';
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
    }
    return;
  }
  
  updateTheme({ ...DEFAULT_SETTINGS, ...newSettings });
});
