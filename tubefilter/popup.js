// Popup JavaScript for TubeFilter Extension

document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status');
  
  // Clean up old tab filters
  cleanupOldTabFilters();
  
  // Load saved filters from storage for the current tab
  loadSavedFilters();
  
  // Add event listeners for radio buttons to enable/disable inputs
  setupRadioButtonListeners();
  
  // Apply filters button
  document.getElementById('applyFilters').addEventListener('click', applyFilters);
  
  // Clear filters button
  document.getElementById('clearFilters').addEventListener('click', clearFilters);
  
  // Add input event listener for keywords to show preview of parsed keywords
  document.getElementById('titleKeywords').addEventListener('input', function() {
    const keywords = parseKeywords(this.value);
    if (keywords.length > 1) {
      showKeywordPreview(keywords);
    } else {
      hideKeywordPreview();
    }
  });
  
  // Add event listeners for keyword logic and mode changes to update preview
  const keywordLogicRadios = document.querySelectorAll('input[name="keywordLogic"]');
  const keywordModeRadios = document.querySelectorAll('input[name="keywordMode"]');
  
  keywordLogicRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      const keywords = parseKeywords(document.getElementById('titleKeywords').value);
      if (keywords.length > 1) {
        showKeywordPreview(keywords);
      }
    });
  });
  
  keywordModeRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      const keywords = parseKeywords(document.getElementById('titleKeywords').value);
      if (keywords.length > 1) {
        showKeywordPreview(keywords);
      }
    });
  });
  
  // Optional: Clean up old tab filter data periodically
  cleanupOldTabFilters();
});

function setupRadioButtonListeners() {
  // View filter radio buttons
  const viewRadios = document.querySelectorAll('input[name="viewFilter"]');
  viewRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      updateViewInputs(this.value);
    });
  });
  
  // Duration filter radio buttons
  const durationRadios = document.querySelectorAll('input[name="durationFilter"]');
  durationRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      updateDurationInputs(this.value);
    });
  });
}

function updateViewInputs(selectedValue) {
  const viewMin = document.getElementById('viewMin');
  const viewMax = document.getElementById('viewMax');
  const viewBetweenMin = document.getElementById('viewBetweenMin');
  const viewBetweenMax = document.getElementById('viewBetweenMax');
  
  // Disable all inputs first
  [viewMin, viewMax, viewBetweenMin, viewBetweenMax].forEach(input => {
    input.disabled = true;
  });
  
  // Enable relevant inputs based on selection
  switch(selectedValue) {
    case 'greater':
      viewMin.disabled = false;
      break;
    case 'less':
      viewMax.disabled = false;
      break;
    case 'between':
      viewBetweenMin.disabled = false;
      viewBetweenMax.disabled = false;
      break;
  }
}

function updateDurationInputs(selectedValue) {
  const durationLess = document.getElementById('durationLess');
  const durationGreater = document.getElementById('durationGreater');
  const durationMin = document.getElementById('durationMin');
  const durationMax = document.getElementById('durationMax');
  
  // Disable all inputs first
  [durationLess, durationGreater, durationMin, durationMax].forEach(input => {
    if (input) input.disabled = true;
  });
  
  // Enable relevant inputs based on selection
  switch(selectedValue) {
    case 'less':
      if (durationLess) durationLess.disabled = false;
      break;
    case 'greater':
      if (durationGreater) durationGreater.disabled = false;
      break;
    case 'custom':
      if (durationMin) durationMin.disabled = false;
      if (durationMax) durationMax.disabled = false;
      break;
  }
}

function applyFilters() {
  const filters = collectFilters();
  
  if (!validateFilters(filters)) {
    return;
  }

  // Get current tab to save filters per tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com')) {
      const tabId = tabs[0].id;
      const storageKey = `tubeFilters_${tabId}`;
      
      // Save filters to storage with tab-specific key
      chrome.storage.local.set({[storageKey]: filters}, function() {
        if (chrome.runtime.lastError) {
          showStatus('Error saving filters', 'error');
          return;
        }
        
        // Send filters to content script
        chrome.tabs.sendMessage(tabId, {
          action: 'applyFilters',
          filters: filters
        }, function(response) {
          if (chrome.runtime.lastError) {
            showStatus('Error: Make sure you\'re on YouTube', 'error');
          } else if (response && response.success) {
            showStatus(`Filters applied! ${response.hiddenCount} videos hidden.`, 'success');
          } else {
            showStatus('Error applying filters', 'error');
          }
        });
      });
    } else {
      showStatus('Please navigate to YouTube first', 'error');
    }
  });
}

function clearFilters() {
  // Reset all form elements
  document.querySelector('input[name="viewFilter"][value="none"]').checked = true;
  document.querySelector('input[name="durationFilter"][value="none"]').checked = true;
  document.getElementById('titleKeywords').value = '';
  document.querySelector('input[name="keywordLogic"][value="AND"]').checked = true;
  document.querySelector('input[name="keywordMode"][value="include"]').checked = true;
  
  // Hide keyword preview
  hideKeywordPreview();
  
  // Update inputs
  updateViewInputs('none');
  updateDurationInputs('none');
  
  // Get current tab to clear filters for this specific tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com')) {
      const tabId = tabs[0].id;
      const storageKey = `tubeFilters_${tabId}`;
      
      // Clear storage for this tab
      chrome.storage.local.remove(storageKey, function() {
        // Send clear message to content script
        chrome.tabs.sendMessage(tabId, {
          action: 'clearFilters'
        }, function(response) {
          if (!chrome.runtime.lastError && response && response.success) {
            showStatus('All filters cleared', 'success');
          }
        });
      });
    }
  });
}

function collectFilters() {
  const keywords = parseKeywords(document.getElementById('titleKeywords').value);
  
  const filters = {
    viewFilter: {
      type: document.querySelector('input[name="viewFilter"]:checked').value,
      min: parseInt(document.getElementById('viewMin').value) || 0,
      max: parseInt(document.getElementById('viewMax').value) || 0,
      betweenMin: parseInt(document.getElementById('viewBetweenMin').value) || 0,
      betweenMax: parseInt(document.getElementById('viewBetweenMax').value) || 0
    },
    durationFilter: {
      type: document.querySelector('input[name="durationFilter"]:checked').value,
      lessValue: document.getElementById('durationLess') ? document.getElementById('durationLess').value || '' : '',
      greaterValue: document.getElementById('durationGreater') ? document.getElementById('durationGreater').value || '' : '',
      customMin: document.getElementById('durationMin').value || '',
      customMax: document.getElementById('durationMax').value || ''
    },
    // Updated for multiple keywords support
    titleKeywords: keywords,
    keywordLogic: document.querySelector('input[name="keywordLogic"]:checked').value,
    keywordMode: document.querySelector('input[name="keywordMode"]:checked').value,
    
    // Keep old property for backward compatibility
    titleKeyword: keywords.length > 0 ? keywords.join(', ') : ''
  };
  
  return filters;
}

function validateFilters(filters) {
  // Validate view count filters
  if (filters.viewFilter.type === 'greater' && filters.viewFilter.min <= 0) {
    showStatus('Please enter a valid minimum view count', 'error');
    return false;
  }
  
  if (filters.viewFilter.type === 'less' && filters.viewFilter.max <= 0) {
    showStatus('Please enter a valid maximum view count', 'error');
    return false;
  }
  
  if (filters.viewFilter.type === 'between') {
    if (filters.viewFilter.betweenMin <= 0 || filters.viewFilter.betweenMax <= 0) {
      showStatus('Please enter valid view count range', 'error');
      return false;
    }
    if (filters.viewFilter.betweenMin >= filters.viewFilter.betweenMax) {
      showStatus('Minimum view count must be less than maximum', 'error');
      return false;
    }
  }
  
  // Validate duration filters
  if (filters.durationFilter.type === 'less') {
    if (!filters.durationFilter.lessValue) {
      showStatus('Please enter a maximum duration', 'error');
      return false;
    }
    
    const maxSeconds = parseTimeToSeconds(filters.durationFilter.lessValue);
    if (maxSeconds === -1) {
      showStatus('Please enter duration in format mm:ss (e.g., 5:30)', 'error');
      return false;
    }
  }
  
  if (filters.durationFilter.type === 'greater') {
    if (!filters.durationFilter.greaterValue) {
      showStatus('Please enter a minimum duration', 'error');
      return false;
    }
    
    const minSeconds = parseTimeToSeconds(filters.durationFilter.greaterValue);
    if (minSeconds === -1) {
      showStatus('Please enter duration in format mm:ss (e.g., 5:30)', 'error');
      return false;
    }
  }
  
  if (filters.durationFilter.type === 'custom') {
    if (!filters.durationFilter.customMin || !filters.durationFilter.customMax) {
      showStatus('Please enter both minimum and maximum duration', 'error');
      return false;
    }
    
    const minSeconds = parseTimeToSeconds(filters.durationFilter.customMin);
    const maxSeconds = parseTimeToSeconds(filters.durationFilter.customMax);
    
    if (minSeconds === -1 || maxSeconds === -1) {
      showStatus('Please enter duration in format mm:ss (e.g., 5:30)', 'error');
      return false;
    }
    
    if (minSeconds >= maxSeconds) {
      showStatus('Minimum duration must be less than maximum', 'error');
      return false;
    }
  }
  
  return true;
}

function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length !== 2) return -1;
  
  const minutes = parseInt(parts[0]);
  const seconds = parseInt(parts[1]);
  
  if (isNaN(minutes) || isNaN(seconds) || seconds >= 60) return -1;
  
  return minutes * 60 + seconds;
}

function loadSavedFilters() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com')) {
      const tabId = tabs[0].id;
      const storageKey = `tubeFilters_${tabId}`;
      
      chrome.storage.local.get(storageKey, function(data) {
        if (data[storageKey]) {
          const filters = data[storageKey];
          
          // Restore view filter
          document.querySelector(`input[name="viewFilter"][value="${filters.viewFilter.type}"]`).checked = true;
          document.getElementById('viewMin').value = filters.viewFilter.min || '';
          document.getElementById('viewMax').value = filters.viewFilter.max || '';
          document.getElementById('viewBetweenMin').value = filters.viewFilter.betweenMin || '';
          document.getElementById('viewBetweenMax').value = filters.viewFilter.betweenMax || '';
          
          // Restore duration filter
          document.querySelector(`input[name="durationFilter"][value="${filters.durationFilter.type}"]`).checked = true;
          if (document.getElementById('durationLess')) {
            document.getElementById('durationLess').value = filters.durationFilter.lessValue || '';
          }
          if (document.getElementById('durationGreater')) {
            document.getElementById('durationGreater').value = filters.durationFilter.greaterValue || '';
          }
          document.getElementById('durationMin').value = filters.durationFilter.customMin || '';
          document.getElementById('durationMax').value = filters.durationFilter.customMax || '';
          
          // Restore title keywords (handle both old and new format)
          if (filters.titleKeywords && Array.isArray(filters.titleKeywords)) {
            // New format with array of keywords
            document.getElementById('titleKeywords').value = filters.titleKeywords.join(', ');
          } else if (filters.titleKeyword) {
            // Old format with single keyword - convert to new format
            document.getElementById('titleKeywords').value = filters.titleKeyword;
          }
          
          // Restore keyword logic (default to 'AND' if not set)
          const keywordLogic = filters.keywordLogic || 'AND';
          document.querySelector(`input[name="keywordLogic"][value="${keywordLogic}"]`).checked = true;
          
          // Restore keyword mode (default to 'include' if not set for backward compatibility)
          const keywordMode = filters.keywordMode || 'include';
          document.querySelector(`input[name="keywordMode"][value="${keywordMode}"]`).checked = true;
          
          // Update input states
          updateViewInputs(filters.viewFilter.type);
          updateDurationInputs(filters.durationFilter.type);
          
          // Show keyword preview if multiple keywords are present
          const keywords = parseKeywords(document.getElementById('titleKeywords').value);
          if (keywords.length > 1) {
            showKeywordPreview(keywords);
          }
        }
        // If no saved filters for this tab, form will remain in default state
      });
    }
  });
}

function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
  
  // Clear status after 3 seconds
  setTimeout(() => {
    statusElement.textContent = '';
    statusElement.className = 'status';
  }, 3000);
}

// Helper function to parse multiple keywords from input
function parseKeywords(input) {
  if (!input || !input.trim()) {
    return [];
  }
  
  return input
    .split(',')
    .map(keyword => keyword.trim())
    .filter(keyword => keyword.length > 0)
    .map(keyword => keyword.toLowerCase());
}

// Show preview of parsed keywords
function showKeywordPreview(keywords) {
  let previewElement = document.getElementById('keyword-preview');
  
  if (!previewElement) {
    previewElement = document.createElement('div');
    previewElement.id = 'keyword-preview';
    previewElement.className = 'keyword-preview';
    
    const keywordSection = document.querySelector('#titleKeywords').parentNode;
    keywordSection.appendChild(previewElement);
  }
  
  const logic = document.querySelector('input[name="keywordLogic"]:checked').value;
  const mode = document.querySelector('input[name="keywordMode"]:checked').value;
  
  previewElement.innerHTML = `
    <small>
      <strong>Preview:</strong> Will ${mode} videos that contain 
      <strong>${logic === 'AND' ? 'ALL' : 'ANY'}</strong> of: 
      ${keywords.map(k => `<span class="keyword-tag">${k}</span>`).join(logic === 'AND' ? ' AND ' : ' OR ')}
    </small>
  `;
}

// Hide keyword preview
function hideKeywordPreview() {
  const previewElement = document.getElementById('keyword-preview');
  if (previewElement) {
    previewElement.remove();
  }
}

// Optional: Clean up old tab filter data periodically
function cleanupOldTabFilters() {
  chrome.storage.local.get(null, function(items) {
    const filterKeys = Object.keys(items).filter(key => key.startsWith('tubeFilters_'));
    
    // Get all current tab IDs
    chrome.tabs.query({}, function(tabs) {
      const currentTabIds = new Set(tabs.map(tab => tab.id.toString()));
      
      // Remove filters for tabs that no longer exist
      const keysToRemove = filterKeys.filter(key => {
        const tabId = key.replace('tubeFilters_', '');
        return !currentTabIds.has(tabId);
      });
      
      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, function() {
          console.log('TubeFilter: Cleaned up', keysToRemove.length, 'old tab filters');
        });
      }
    });
  });
}
