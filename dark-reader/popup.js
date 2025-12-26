document.addEventListener('DOMContentLoaded', () => {
  const enabledCheckbox = document.getElementById('enabled');
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
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0
  };

  let saveTimeout = null;

  // Load saved settings
  chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS), (result) => {
    enabledCheckbox.checked = result.enabled !== undefined ? result.enabled : DEFAULT_SETTINGS.enabled;
    brightnessInput.value = result.brightness || DEFAULT_SETTINGS.brightness;
    contrastInput.value = result.contrast || DEFAULT_SETTINGS.contrast;
    saturationInput.value = result.saturation || DEFAULT_SETTINGS.saturation;
    hueInput.value = result.hue || DEFAULT_SETTINGS.hue;
    
    updateLabels();
  });

  // Save settings with debouncing for sliders
  function saveSettings(immediate = false) {
    const settings = {
      enabled: enabledCheckbox.checked,
      brightness: parseInt(brightnessInput.value),
      contrast: parseInt(contrastInput.value),
      saturation: parseInt(saturationInput.value),
      hue: parseInt(hueInput.value)
    };
    
    updateLabels();
    
    if (immediate) {
      // Save immediately for toggle changes
      if (saveTimeout) clearTimeout(saveTimeout);
      chrome.storage.sync.set(settings);
    } else {
      // Debounce for slider changes
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        chrome.storage.sync.set(settings);
      }, 100);
    }
  }

  function updateLabels() {
    brightnessVal.textContent = brightnessInput.value;
    contrastVal.textContent = contrastInput.value;
    saturationVal.textContent = saturationInput.value;
    hueVal.textContent = hueInput.value;
  }

  enabledCheckbox.addEventListener('change', () => saveSettings(true));
  brightnessInput.addEventListener('input', () => saveSettings(false));
  contrastInput.addEventListener('input', () => saveSettings(false));
  saturationInput.addEventListener('input', () => saveSettings(false));
  hueInput.addEventListener('input', () => saveSettings(false));

  // Reset button - restore defaults but keep enabled state
  resetButton.addEventListener('click', () => {
    brightnessInput.value = DEFAULT_SETTINGS.brightness;
    contrastInput.value = DEFAULT_SETTINGS.contrast;
    saturationInput.value = DEFAULT_SETTINGS.saturation;
    hueInput.value = DEFAULT_SETTINGS.hue;
    saveSettings(true);
  });

  // Clear settings button - completely reset everything including enabled state
  clearButton.addEventListener('click', () => {
    if (confirm('This will clear all settings and disable dark mode. Continue?')) {
      // Reset UI first
      enabledCheckbox.checked = DEFAULT_SETTINGS.enabled;
      brightnessInput.value = DEFAULT_SETTINGS.brightness;
      contrastInput.value = DEFAULT_SETTINGS.contrast;
      saturationInput.value = DEFAULT_SETTINGS.saturation;
      hueInput.value = DEFAULT_SETTINGS.hue;
      updateLabels();
      
      // Clear and save defaults immediately
      if (saveTimeout) clearTimeout(saveTimeout);
      chrome.storage.sync.clear(() => {
        chrome.storage.sync.set(DEFAULT_SETTINGS);
      });
    }
  });
});
