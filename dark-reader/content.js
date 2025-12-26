const STYLE_ID = 'simple-smart-dark-mode-style';
let pageIsDark = false;

// Check if the page already has a dark background
function isPageAlreadyDark() {
  if (!document.body) return false;
  
  const body = document.body;
  const html = document.documentElement;
  
  // Get computed background color from body or html
  let bgColor = window.getComputedStyle(body).backgroundColor;
  
  // If body background is transparent, check html
  if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
    bgColor = window.getComputedStyle(html).backgroundColor;
  }
  
  // Parse RGB values
  const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgbMatch) return false;
  
  const r = parseInt(rgbMatch[1]);
  const g = parseInt(rgbMatch[2]);
  const b = parseInt(rgbMatch[3]);
  
  // Calculate relative luminance (perceived brightness)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // If luminance is below 0.4, consider it dark (YouTube's dark mode is around 0.1)
  return luminance < 0.4;
}

function getCSS(brightness, contrast, saturation, hue, isDark) {
  // Convert percentage values to decimal for CSS filters
  const b = brightness / 100;
  const c = contrast / 100;
  const s = saturation / 100;

  if (isDark) {
    // Page is already dark, just apply subtle adjustments without inversion
    return `
      html {
        filter: brightness(${b}) contrast(${c}) saturate(${s}) hue-rotate(${hue}deg) !important;
        transition: filter 0.1s ease !important;
      }
    `;
  } else {
    // Page is light, apply full dark mode with inversion
    const totalHue = 180 + hue;
    return `
      html {
        filter: invert(1) hue-rotate(${totalHue}deg) brightness(${b}) contrast(${c}) saturate(${s}) !important;
        transition: filter 0.1s ease !important;
      }
      
      /* Revert media and other elements that shouldn't be inverted */
      img, video, picture, canvas, iframe, embed, object, svg {
        filter: invert(1) hue-rotate(180deg) !important;
      }
      
      /* Preserve background images in their original state */
      [style*="background-image"] {
        filter: invert(1) hue-rotate(180deg) !important;
      }
    `;
  }
}

function updateTheme(settings) {
  let styleEl = document.getElementById(STYLE_ID);

  if (!settings.enabled) {
    if (styleEl) styleEl.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  // Default values if undefined
  const brightness = settings.brightness || 100;
  const contrast = settings.contrast || 100;
  const saturation = settings.saturation || 100;
  const hue = settings.hue || 0;

  // Update dark page detection
  pageIsDark = isPageAlreadyDark();
  
  styleEl.textContent = getCSS(brightness, contrast, saturation, hue, pageIsDark);
}

// Default settings
const DEFAULT_SETTINGS = {
  enabled: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0
};

// Apply theme with settings
function applyTheme() {
  chrome.storage.sync.get(['enabled', 'brightness', 'contrast', 'saturation', 'hue'], (result) => {
    const settings = { ...DEFAULT_SETTINGS, ...result };
    updateTheme(settings);
  });
}

// Initial Load - wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyTheme);
} else {
  // DOM is already ready
  applyTheme();
}

// Listen for changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    applyTheme();
  }
});

// Re-check dark mode detection when page fully loads (styles might change)
window.addEventListener('load', () => {
  applyTheme();
});
