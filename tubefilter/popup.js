// Popup JavaScript for TubeFilter Extension

document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status');
  
  // Load saved filters from global storage
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

  // Regex checkbox listener
  document.getElementById('useRegex').addEventListener('change', function() {
    const isRegex = this.checked;
    const logicGroup = document.getElementById('keywordLogicGroup');
    const helpText = document.getElementById('keywordHelp');
    const input = document.getElementById('titleKeywords');
    
    if (isRegex) {
      logicGroup.style.display = 'none';
      helpText.textContent = 'Enter a valid Regular Expression (e.g., /pattern/i or just pattern)';
      input.placeholder = 'Enter regex pattern (e.g., ^[A-Z].*tutorial)';
      hideKeywordPreview();
    } else {
      logicGroup.style.display = 'block';
      helpText.textContent = 'Leave empty to disable keyword filtering. Use commas to separate multiple keywords.';
      input.placeholder = 'Enter keywords separated by commas (e.g., music, tutorial, gaming)';
      // Trigger preview update
      input.dispatchEvent(new Event('input'));
    }
  });
});

function setupRadioButtonListeners() {
  ['viewFilter', 'durationFilter', 'timeFilter'].forEach(filterName => {
    const radios = document.querySelectorAll(`input[name="${filterName}"]`);
    radios.forEach(radio => {
      radio.addEventListener('change', function() {
        updateInputs(filterName, this.value);
      });
    });
  });
}

function updateInputs(groupName, selectedValue) {
  const config = {
    viewFilter: {
      all: ['viewMin', 'viewMax', 'viewBetweenMin', 'viewBetweenMax'],
      greater: ['viewMin'],
      less: ['viewMax'],
      between: ['viewBetweenMin', 'viewBetweenMax']
    },
    durationFilter: {
      all: ['durationLess', 'durationGreater', 'durationMin', 'durationMax'],
      less: ['durationLess'],
      greater: ['durationGreater'],
      custom: ['durationMin', 'durationMax']
    },
    timeFilter: {
      all: ['timeLess', 'timeLessUnit', 'timeGreater', 'timeGreaterUnit', 'timeBetweenMin', 'timeBetweenMinUnit', 'timeBetweenMax', 'timeBetweenMaxUnit'],
      less: ['timeLess', 'timeLessUnit'],
      greater: ['timeGreater', 'timeGreaterUnit'],
      between: ['timeBetweenMin', 'timeBetweenMinUnit', 'timeBetweenMax', 'timeBetweenMaxUnit']
    }
  };

  const groupConfig = config[groupName];
  if (!groupConfig) return;

  // Disable all
  groupConfig.all.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  // Enable selected
  const toEnable = groupConfig[selectedValue] || [];
  toEnable.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

function applyFilters() {
  const filters = collectFilters();
  
  if (!validateFilters(filters)) {
    return;
  }

  const storageKey = 'tubeFilters';
  
  // Save filters GLOBAL storage
  chrome.storage.local.set({[storageKey]: filters}, function() {
    if (chrome.runtime.lastError) {
      showStatus('Error saving filters', 'error');
      return;
    }
    
    // Notify current tab only
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
         chrome.tabs.sendMessage(tabs[0].id, {
          action: 'applyFilters',
          filters: filters
        });
      }
    });

    showStatus('Filters saved and applied!', 'success');
  });
}

function clearFilters() {
  // Reset all form elements
  document.querySelector('input[name="viewFilter"][value="none"]').checked = true;
  document.querySelector('input[name="durationFilter"][value="none"]').checked = true;
  document.querySelector('input[name="timeFilter"][value="none"]').checked = true;
  document.getElementById('titleKeywords').value = '';
  document.querySelector('input[name="keywordLogic"][value="AND"]').checked = true;
  document.querySelector('input[name="keywordMode"][value="include"]').checked = true;
  
  // Reset regex
  const regexCheckbox = document.getElementById('useRegex');
  regexCheckbox.checked = false;
  regexCheckbox.dispatchEvent(new Event('change'));

  // Hide keyword preview
  hideKeywordPreview();
  
  // Update inputs
  updateInputs('viewFilter', 'none');
  updateInputs('durationFilter', 'none');
  updateInputs('timeFilter', 'none');
  
  const storageKey = 'tubeFilters';
  
  // Clear storage
  chrome.storage.local.remove(storageKey, function() {
    // Send clear message
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
         chrome.tabs.sendMessage(tabs[0].id, {
          action: 'clearFilters'
        });
      }
    });
    
    showStatus('Filters cleared for this tab', 'success');
  });
}

function collectFilters() {
  const rawKeywords = document.getElementById('titleKeywords').value;
  const useRegex = document.getElementById('useRegex').checked;
  
  const keywords = useRegex ? [rawKeywords] : parseKeywords(rawKeywords);
  
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
    timeFilter: {
      type: document.querySelector('input[name="timeFilter"]:checked').value,
      lessValue: parseInt(document.getElementById('timeLess').value) || 0,
      lessUnit: document.getElementById('timeLessUnit').value || 'days',
      greaterValue: parseInt(document.getElementById('timeGreater').value) || 0,
      greaterUnit: document.getElementById('timeGreaterUnit').value || 'days',
      betweenMin: parseInt(document.getElementById('timeBetweenMin').value) || 0,
      betweenMinUnit: document.getElementById('timeBetweenMinUnit').value || 'days',
      betweenMax: parseInt(document.getElementById('timeBetweenMax').value) || 0,
      betweenMaxUnit: document.getElementById('timeBetweenMaxUnit').value || 'days'
    },
    titleKeywords: keywords,
    useRegex: useRegex,
    keywordLogic: document.querySelector('input[name="keywordLogic"]:checked').value,
    keywordMode: document.querySelector('input[name="keywordMode"]:checked').value,
    
    // Backward compatibility if needed
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
  
  // Validate time filters
  if (filters.timeFilter.type === 'less' && filters.timeFilter.lessValue <= 0) {
    showStatus('Please enter a valid time value', 'error');
    return false;
  }
  
  if (filters.timeFilter.type === 'greater' && filters.timeFilter.greaterValue <= 0) {
    showStatus('Please enter a valid time value', 'error');
    return false;
  }
  
  if (filters.timeFilter.type === 'between') {
    if (filters.timeFilter.betweenMin <= 0 || filters.timeFilter.betweenMax <= 0) {
      showStatus('Please enter valid time values', 'error');
      return false;
    }
    
    // Convert to hours for comparison
    const minHours = convertToHours(filters.timeFilter.betweenMin, filters.timeFilter.betweenMinUnit);
    const maxHours = convertToHours(filters.timeFilter.betweenMax, filters.timeFilter.betweenMaxUnit);
    
    if (minHours >= maxHours) {
      showStatus('Minimum time must be less than maximum time', 'error');
      return false;
    }
  }
  
  return true;
}

function convertToHours(value, unit) {
  switch(unit) {
    case 'hours': return value;
    case 'days': return value * 24;
    case 'weeks': return value * 24 * 7;
    case 'months': return value * 24 * 30;
    case 'years': return value * 24 * 365;
    default: return value;
  }
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return -1;
  const parts = timeStr.split(':');
  let seconds = 0;
  
  if (parts.length === 2) {
    seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else if (parts.length === 3) {
    seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  } else {
    return -1;
  }
  
  return (isNaN(seconds) || seconds < 0) ? -1 : seconds;
}

function loadSavedFilters() {
  const storageKey = 'tubeFilters';
  
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
      
      // Restore time filter
      if (filters.timeFilter) {
        document.querySelector(`input[name="timeFilter"][value="${filters.timeFilter.type}"]`).checked = true;
        document.getElementById('timeLess').value = filters.timeFilter.lessValue || '';
        document.getElementById('timeLessUnit').value = filters.timeFilter.lessUnit || 'days';
        document.getElementById('timeGreater').value = filters.timeFilter.greaterValue || '';
        document.getElementById('timeGreaterUnit').value = filters.timeFilter.greaterValue || 'days';
        document.getElementById('timeBetweenMin').value = filters.timeFilter.betweenMin || '';
        document.getElementById('timeBetweenMinUnit').value = filters.timeFilter.betweenMinUnit || 'days';
        document.getElementById('timeBetweenMax').value = filters.timeFilter.betweenMax || '';
        document.getElementById('timeBetweenMaxUnit').value = filters.timeFilter.betweenMaxUnit || 'days';
      }
      
      // Restore title keywords
      if (filters.titleKeywords && Array.isArray(filters.titleKeywords)) {
        if (filters.useRegex) {
            document.getElementById('titleKeywords').value = filters.titleKeywords[0] || '';
        } else {
            document.getElementById('titleKeywords').value = filters.titleKeywords.join(', ');
        }
      } else if (filters.titleKeyword) {
        document.getElementById('titleKeywords').value = filters.titleKeyword;
      }
      
      // Restore regex setting
      if (filters.useRegex) {
        const regexCheckbox = document.getElementById('useRegex');
        regexCheckbox.checked = true;
        regexCheckbox.dispatchEvent(new Event('change'));
      }

      // Restore keyword logic & mode
      const keywordLogic = filters.keywordLogic || 'AND';
      document.querySelector(`input[name="keywordLogic"][value="${keywordLogic}"]`).checked = true;
      
      const keywordMode = filters.keywordMode || 'include';
      document.querySelector(`input[name="keywordMode"][value="${keywordMode}"]`).checked = true;
      
      // Update input states (Enable disabled inputs correctly)
      updateInputs('viewFilter', filters.viewFilter.type);
      updateInputs('durationFilter', filters.durationFilter.type);
      if (filters.timeFilter) {
        updateInputs('timeFilter', filters.timeFilter.type);
      }
      
      // Show keyword preview
      if (!filters.useRegex) {
        const keywords = parseKeywords(document.getElementById('titleKeywords').value);
        if (keywords.length > 1) {
          showKeywordPreview(keywords);
        }
      }
    }
  });
}

function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
  
  setTimeout(() => {
    statusElement.textContent = '';
    statusElement.className = 'status';
  }, 3000);
}

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

function hideKeywordPreview() {
  const previewElement = document.getElementById('keyword-preview');
  if (previewElement) {
    previewElement.remove();
  }
}
