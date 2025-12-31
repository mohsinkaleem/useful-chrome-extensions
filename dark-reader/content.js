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
img,video,picture,canvas,iframe,embed,object,svg,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}`;
  }
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
    return;
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
