document.addEventListener('DOMContentLoaded', async () => {
  const domainEl = document.getElementById('domain');
  const enabledCheckbox = document.getElementById('enabled');
  const filterModeCheckbox = document.getElementById('filterMode');
  const brightnessInput = document.getElementById('brightness');
  const contrastInput = document.getElementById('contrast');
  const saturationInput = document.getElementById('saturation');
  const hueInput = document.getElementById('hue');
  const brightnessVal = document.getElementById('brightness-val');
  const contrastVal = document.getElementById('contrast-val');
  const saturationVal = document.getElementById('saturation-val');
  const hueVal = document.getElementById('hue-val');
  const resetButton = document.getElementById('reset');
  const clearButton = document.getElementById('clear');

  // Default settings
  const DEFAULT_SETTINGS = {
    enabled: false,
    filterMode: false,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0
  };

  let saveTimeout = null;
  let pendingSettings = null;
  let currentDomain = null;
  let storageKey = null;

  const sliders = [brightnessInput, contrastInput, saturationInput, hueInput];
  const controlGroups = document.querySelectorAll('.control-group');

  // Get current tab's domain
  async function getCurrentDomain() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const url = new URL(tab.url);
        return url.hostname;
      }
    } catch (e) {}
    return null;
  }

  // Update UI state based on which mode is active
  function updateUIState() {
    const anyModeActive = enabledCheckbox.checked || filterModeCheckbox.checked;
    sliders.forEach(slider => slider.disabled = !anyModeActive);
    controlGroups.forEach(group => group.classList.toggle('disabled', !anyModeActive));
  }

  function updateLabels() {
    brightnessVal.textContent = brightnessInput.value;
    contrastVal.textContent = contrastInput.value;
    saturationVal.textContent = saturationInput.value;
    hueVal.textContent = hueInput.value;
  }

  // Load settings for current domain
  function loadSettings() {
    if (!storageKey) return;
    
    chrome.storage.sync.get([storageKey], (result) => {
      const settings = result[storageKey] || DEFAULT_SETTINGS;
      enabledCheckbox.checked = settings.enabled ?? DEFAULT_SETTINGS.enabled;
      filterModeCheckbox.checked = settings.filterMode ?? DEFAULT_SETTINGS.filterMode;
      brightnessInput.value = settings.brightness ?? DEFAULT_SETTINGS.brightness;
      contrastInput.value = settings.contrast ?? DEFAULT_SETTINGS.contrast;
      saturationInput.value = settings.saturation ?? DEFAULT_SETTINGS.saturation;
      hueInput.value = settings.hue ?? DEFAULT_SETTINGS.hue;
      
      updateLabels();
      updateUIState();
    });
  }

  // Save settings for current domain
  function saveSettings(immediate = false) {
    if (!storageKey) return;
    
    const settings = {
      enabled: enabledCheckbox.checked,
      filterMode: filterModeCheckbox.checked,
      brightness: parseInt(brightnessInput.value),
      contrast: parseInt(contrastInput.value),
      saturation: parseInt(saturationInput.value),
      hue: parseInt(hueInput.value)
    };
    
    updateLabels();
    pendingSettings = { [storageKey]: settings };
    
    if (immediate) {
      if (saveTimeout) clearTimeout(saveTimeout);
      chrome.storage.sync.set(pendingSettings).catch(() => {});
      pendingSettings = null;
    } else {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (pendingSettings) {
          chrome.storage.sync.set(pendingSettings).catch(() => {});
          pendingSettings = null;
        }
      }, 500);
    }
  }

  // Initialize
  currentDomain = await getCurrentDomain();
  
  if (!currentDomain) {
    domainEl.textContent = 'Not available';
    domainEl.style.color = '#888';
    // Disable all controls
    enabledCheckbox.disabled = true;
    filterModeCheckbox.disabled = true;
    sliders.forEach(s => s.disabled = true);
    resetButton.disabled = true;
    clearButton.disabled = true;
    return;
  }
  
  storageKey = `site:${currentDomain}`;
  domainEl.textContent = currentDomain;
  loadSettings();

  // Event listeners
  enabledCheckbox.addEventListener('change', () => {
    if (enabledCheckbox.checked) {
      filterModeCheckbox.checked = false;
    }
    updateUIState();
    saveSettings(true);
  });
  
  filterModeCheckbox.addEventListener('change', () => {
    if (filterModeCheckbox.checked) {
      enabledCheckbox.checked = false;
    }
    updateUIState();
    saveSettings(true);
  });
  
  sliders.forEach(slider => slider.addEventListener('input', () => saveSettings(false)));

  // Reset sliders to defaults
  resetButton.addEventListener('click', () => {
    brightnessInput.value = DEFAULT_SETTINGS.brightness;
    contrastInput.value = DEFAULT_SETTINGS.contrast;
    saturationInput.value = DEFAULT_SETTINGS.saturation;
    hueInput.value = DEFAULT_SETTINGS.hue;
    saveSettings(true);
  });

  // Clear settings for this site
  clearButton.addEventListener('click', () => {
    if (confirm(`Clear settings for ${currentDomain}?`)) {
      enabledCheckbox.checked = DEFAULT_SETTINGS.enabled;
      filterModeCheckbox.checked = DEFAULT_SETTINGS.filterMode;
      brightnessInput.value = DEFAULT_SETTINGS.brightness;
      contrastInput.value = DEFAULT_SETTINGS.contrast;
      saturationInput.value = DEFAULT_SETTINGS.saturation;
      hueInput.value = DEFAULT_SETTINGS.hue;
      updateLabels();
      updateUIState();
      
      if (saveTimeout) clearTimeout(saveTimeout);
      pendingSettings = null;
      chrome.storage.sync.remove([storageKey]).catch(() => {});
    }
  });
});
