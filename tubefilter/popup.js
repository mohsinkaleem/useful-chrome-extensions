// Popup JavaScript for TubeFilter Extension

document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status');
  
  // Load saved filters from storage
  loadSavedFilters();
  
  // Add event listeners for radio buttons to enable/disable inputs
  setupRadioButtonListeners();
  
  // Apply filters button
  document.getElementById('applyFilters').addEventListener('click', applyFilters);
  
  // Clear filters button
  document.getElementById('clearFilters').addEventListener('click', clearFilters);
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
  
  // Save filters to storage
  chrome.storage.sync.set({tubeFilters: filters}, function() {
    if (chrome.runtime.lastError) {
      showStatus('Error saving filters', 'error');
      return;
    }
    
    // Send filters to content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabs[0].id, {
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
      } else {
        showStatus('Please navigate to YouTube first', 'error');
      }
    });
  });
}

function clearFilters() {
  // Reset all form elements
  document.querySelector('input[name="viewFilter"][value="none"]').checked = true;
  document.querySelector('input[name="durationFilter"][value="none"]').checked = true;
  document.getElementById('titleKeyword').value = '';
  
  // Update inputs
  updateViewInputs('none');
  updateDurationInputs('none');
  
  // Clear storage
  chrome.storage.sync.remove('tubeFilters', function() {
    // Send clear message to content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'clearFilters'
        }, function(response) {
          if (!chrome.runtime.lastError && response && response.success) {
            showStatus('All filters cleared', 'success');
          }
        });
      }
    });
  });
}

function collectFilters() {
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
    titleKeyword: document.getElementById('titleKeyword').value.trim()
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
  chrome.storage.sync.get('tubeFilters', function(data) {
    if (data.tubeFilters) {
      const filters = data.tubeFilters;
      
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
      
      // Restore title keyword
      document.getElementById('titleKeyword').value = filters.titleKeyword || '';
      
      // Update input states
      updateViewInputs(filters.viewFilter.type);
      updateDurationInputs(filters.durationFilter.type);
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
