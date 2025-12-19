// Popup script for Video Speed Controller
document.addEventListener('DOMContentLoaded', async () => {
  // Check if current tab is supported
  await checkCurrentWebsite();
  
  // Load current settings
  await loadSettings();
  
  // Setup event listeners
  setupEventListeners();
});

async function checkCurrentWebsite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab.url;
    const statusDiv = document.getElementById('website-status');
    
    if (url.includes('youtube.com') || url.includes('netflix.com')) {
      statusDiv.className = 'website-status supported';
      statusDiv.textContent = '✅ This website is supported';
    } else {
      statusDiv.className = 'website-status not-supported';
      statusDiv.textContent = '⚠️ This website is not supported yet';
    }
  } catch (error) {
    console.error('Error checking website:', error);
  }
}

async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get([
      'speedStep',
      'maxSpeed', 
      'minSpeed',
      'showNotifications'
    ]);
    
    if (settings.speedStep) {
      document.getElementById('speedStep').value = settings.speedStep;
    }
    if (settings.maxSpeed) {
      document.getElementById('maxSpeed').value = settings.maxSpeed;
    }
    if (settings.minSpeed) {
      document.getElementById('minSpeed').value = settings.minSpeed;
    }
    if (settings.showNotifications !== undefined) {
      document.getElementById('showNotifications').checked = settings.showNotifications;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function setupEventListeners() {
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  
  // Auto-save on change
  const inputs = document.querySelectorAll('select, input[type="checkbox"]');
  inputs.forEach(input => {
    input.addEventListener('change', saveSettings);
  });
}

async function saveSettings() {
  try {
    const settings = {
      speedStep: parseFloat(document.getElementById('speedStep').value),
      maxSpeed: parseFloat(document.getElementById('maxSpeed').value),
      minSpeed: parseFloat(document.getElementById('minSpeed').value),
      showNotifications: document.getElementById('showNotifications').checked
    };
    
    await chrome.storage.sync.set(settings);
    
    // Show success message
    const status = document.getElementById('status');
    status.textContent = 'Settings saved!';
    status.style.color = '#4CAF50';
    
    setTimeout(() => {
      status.textContent = '';
    }, 2000);
    
    // Send message to content script to update settings
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, {
        action: 'updateSettings',
        settings: settings
      });
    } catch (error) {
      // Content script might not be loaded
    }
    
  } catch (error) {
    console.error('Error saving settings:', error);
    const status = document.getElementById('status');
    status.textContent = 'Error saving settings';
    status.style.color = '#f44336';
  }
}
