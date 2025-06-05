const enabledCheckbox = document.getElementById('enabled');
const statusDiv = document.getElementById('status');

// View count filter elements
const minViewsInput = document.getElementById('minViews');
const maxViewsInput = document.getElementById('maxViews');
const minViewsEnabled = document.getElementById('minViewsEnabled');
const maxViewsEnabled = document.getElementById('maxViewsEnabled');

// Duration filter elements
const minDurationInput = document.getElementById('minDuration');
const maxDurationInput = document.getElementById('maxDuration');
const minDurationEnabled = document.getElementById('minDurationEnabled');
const maxDurationEnabled = document.getElementById('maxDurationEnabled');

// Default settings
const defaultSettings = {
    filterEnabled: false,
    minViews: 1,
    maxViews: 100000000,
    minViewsEnabled: false,
    maxViewsEnabled: false,
    minDuration: 3,
    maxDuration: 15,
    minDurationEnabled: false,
    maxDurationEnabled: false
};

// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(defaultSettings, (result) => {
        // Apply loaded settings to UI
        enabledCheckbox.checked = result.filterEnabled;
        
        // View filters
        minViewsInput.value = result.minViews;
        maxViewsInput.value = result.maxViews;
        minViewsEnabled.checked = result.minViewsEnabled;
        maxViewsEnabled.checked = result.maxViewsEnabled;
        
        // Duration filters
        minDurationInput.value = result.minDuration;
        maxDurationInput.value = result.maxDuration;
        minDurationEnabled.checked = result.minDurationEnabled;
        maxDurationEnabled.checked = result.maxDurationEnabled;
        
        updateStatus('Settings loaded.');
    });
});

// Function to save settings and notify content script
function saveSettings() {
    // Parse all inputs to appropriate types
    const minViewsValue = parseInt(minViewsInput.value, 10);
    const maxViewsValue = parseInt(maxViewsInput.value, 10);
    const minDurationValue = parseInt(minDurationInput.value, 10);
    const maxDurationValue = parseInt(maxDurationInput.value, 10);
    
    // Validate inputs
    if (isNaN(minViewsValue) || minViewsValue < 0 || 
        isNaN(maxViewsValue) || maxViewsValue < 0 ||
        isNaN(minDurationValue) || minDurationValue < 0 ||
        isNaN(maxDurationValue) || maxDurationValue < 0) {
        updateStatus('Invalid input value(s).', true);
        return; // Don't save invalid input
    }
    
    // Collect all settings
    const settings = {
        filterEnabled: enabledCheckbox.checked,
        minViews: minViewsValue,
        maxViews: maxViewsValue,
        minViewsEnabled: minViewsEnabled.checked,
        maxViewsEnabled: maxViewsEnabled.checked,
        minDuration: minDurationValue,
        maxDuration: maxDurationValue,
        minDurationEnabled: minDurationEnabled.checked,
        maxDurationEnabled: maxDurationEnabled.checked
    };
    
    // Save settings to storage
    chrome.storage.sync.set(settings, () => {
        updateStatus('Settings saved.');
        
        // Send message to active tab's content script to update immediately
        chrome.tabs.query({ active: true, currentWindow: true, url: "*://*.youtube.com/*" }, (tabs) => {
            if (tabs.length > 0 && tabs[0].id) {
                const activeTab = tabs[0];
                // Only send if the URL looks like a channel page (basic check)
                if (activeTab.url && (activeTab.url.includes("/videos") || activeTab.url.includes("/shorts"))) {
                    chrome.tabs.sendMessage(
                        activeTab.id,
                        {
                            action: "updateSettings",
                            settings: settings
                        },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                updateStatus('Settings saved. Reload channel page if needed.');
                            } else if (response && response.status) {
                                console.log("Content script response:", response.status);
                                updateStatus('Settings saved and applied.');
                            } else {
                                updateStatus('Settings saved. No response from content script.');
                            }
                        }
                    );
                } else {
                    updateStatus('Settings saved. Not on a channel video page.');
                }
            } else {
                updateStatus('Settings saved. Could not find active YouTube tab.');
            }
        });
    });
}

// Add event listeners to save automatically on change
enabledCheckbox.addEventListener('change', saveSettings);

// View count filters
minViewsInput.addEventListener('input', saveSettings);
maxViewsInput.addEventListener('input', saveSettings);
minViewsEnabled.addEventListener('change', saveSettings);
maxViewsEnabled.addEventListener('change', saveSettings);

// Duration filters
minDurationInput.addEventListener('input', saveSettings);
maxDurationInput.addEventListener('input', saveSettings);
minDurationEnabled.addEventListener('change', saveSettings);
maxDurationEnabled.addEventListener('change', saveSettings);

// --- Helper to show status messages ---
let statusTimeout;
function updateStatus(message, isError = false) {
    clearTimeout(statusTimeout);
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? 'red' : 'green';
    statusTimeout = setTimeout(() => {
        statusDiv.textContent = ''; // Clear status after a few seconds
    }, 3000);
}