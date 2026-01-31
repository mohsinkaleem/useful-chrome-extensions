// Popup JavaScript for TubeFilter Extension

document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status');
  
  // Initialize UI
  setupCollapsibleSections();
  setupRadioButtonListeners();
  setupRegexGuide();
  setupKeywordListeners();
  
  // Check URL and load saved filters
  checkUrlAndLoadFilters();
  
  // Apply filters button
  document.getElementById('applyFilters').addEventListener('click', applyFilters);
  
  // Clear filters button
  document.getElementById('clearFilters').addEventListener('click', clearFilters);
});

function setupCollapsibleSections() {
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', function() {
      const section = this.closest('.section');
      section.classList.toggle('collapsed');
    });
  });
}

function setupRegexGuide() {
  const regexHelpBtn = document.getElementById('regexHelpBtn');
  const regexGuide = document.getElementById('regexGuide');
  const closeBtn = document.getElementById('closeRegexGuide');
  
  regexHelpBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    regexGuide.style.display = regexGuide.style.display === 'none' ? 'block' : 'none';
  });
  
  closeBtn.addEventListener('click', function() {
    regexGuide.style.display = 'none';
  });
}

function setupKeywordListeners() {
  const titleKeywords = document.getElementById('titleKeywords');
  const useRegex = document.getElementById('useRegex');
  const keywordLogicGroup = document.getElementById('keywordLogicGroup');
  
  // Keyword input listener
  titleKeywords.addEventListener('input', function() {
    if (!useRegex.checked) {
      const keywords = parseKeywords(this.value);
      if (keywords.length > 1) {
        showKeywordPreview(keywords);
      } else {
        hideKeywordPreview();
      }
    }
    updateSectionIndicators();
  });
  
  // Logic and mode change listeners
  document.querySelectorAll('input[name="keywordLogic"], input[name="keywordMode"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const keywords = parseKeywords(titleKeywords.value);
      if (keywords.length > 1 && !useRegex.checked) {
        showKeywordPreview(keywords);
      }
    });
  });
  
  // Regex toggle
  useRegex.addEventListener('change', function() {
    if (this.checked) {
      keywordLogicGroup.style.display = 'none';
      titleKeywords.placeholder = 'Regex pattern (e.g., ^How|tutorial)';
      hideKeywordPreview();
    } else {
      keywordLogicGroup.style.display = 'flex';
      titleKeywords.placeholder = 'music, tutorial, review...';
      titleKeywords.dispatchEvent(new Event('input'));
    }
  });
}

function checkUrlAndLoadFilters() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs[0]) return;
    
    const currentUrl = tabs[0].url || '';
    const urlIndicator = document.getElementById('urlIndicator');
    
    // Extract video ID or page type for display
    let displayText = '';
    if (currentUrl.includes('youtube.com/watch')) {
      const match = currentUrl.match(/[?&]v=([^&]+)/);
      displayText = match ? `Video: ${match[1].substring(0, 8)}...` : 'Video';
    } else if (currentUrl.includes('youtube.com/results')) {
      displayText = 'Search';
    } else if (currentUrl.includes('youtube.com/@')) {
      displayText = 'Channel';
    } else if (currentUrl.includes('youtube.com')) {
      displayText = 'Home';
    } else {
      displayText = 'Not YouTube';
    }
    urlIndicator.textContent = displayText;
    
    // Query the current tab's content script for its filters (tab-specific)
    chrome.tabs.sendMessage(tabs[0].id, {action: 'getFilters'}, function(response) {
      if (chrome.runtime.lastError) {
        // Content script not ready or no filters
        return;
      }
      if (response && response.filters) {
        loadFiltersFromData(response.filters);
      }
    });
  });
}

function getBaseUrl(url) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    // For YouTube, consider the page type as base
    if (urlObj.hostname.includes('youtube.com')) {
      if (urlObj.pathname.includes('/watch')) return 'youtube-watch';
      if (urlObj.pathname.includes('/results')) return 'youtube-search';
      if (urlObj.pathname.includes('/@')) return 'youtube-channel:' + urlObj.pathname.split('/')[1];
      return 'youtube-home';
    }
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    return url;
  }
}

function setupRadioButtonListeners() {
  ['viewFilter', 'durationFilter', 'timeFilter'].forEach(filterName => {
    const radios = document.querySelectorAll(`input[name="${filterName}"]`);
    radios.forEach(radio => {
      radio.addEventListener('change', function() {
        updateInputs(filterName, this.value);
        updateSectionIndicators();
      });
    });
  });
  
  // Also listen to input changes to update indicators
  document.querySelectorAll('input[type="number"], input[type="text"]').forEach(input => {
    input.addEventListener('input', updateSectionIndicators);
  });
}

function updateSectionIndicators() {
  // Views section
  const viewType = document.querySelector('input[name="viewFilter"]:checked').value;
  const viewSection = document.querySelector('[data-section="views"]');
  viewSection.classList.toggle('has-filter', viewType !== 'none');
  
  // Duration section
  const durationType = document.querySelector('input[name="durationFilter"]:checked').value;
  const durationSection = document.querySelector('[data-section="duration"]');
  durationSection.classList.toggle('has-filter', durationType !== 'none');
  
  // Time section
  const timeType = document.querySelector('input[name="timeFilter"]:checked').value;
  const timeSection = document.querySelector('[data-section="time"]');
  timeSection.classList.toggle('has-filter', timeType !== 'none');
  
  // Keywords section
  const keywords = document.getElementById('titleKeywords').value.trim();
  const keywordsSection = document.querySelector('[data-section="keywords"]');
  keywordsSection.classList.toggle('has-filter', keywords.length > 0);
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
  
  // Send filters to current tab only (tab-specific, no cross-tab persistence)
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'applyFilters',
        filters: filters
      });

      updateSectionIndicators();
      showStatus('Filters applied!', 'success');
    }
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
  
  // Update section indicators
  updateSectionIndicators();
  
  // Send clear message to current tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
       chrome.tabs.sendMessage(tabs[0].id, {
        action: 'clearFilters'
      });
    }
    showStatus('Filters cleared', 'success');
  });
}

// Parse flexible view count input (e.g., "1.5k", "1.2m", "500000")
function parseViewInput(value) {
  if (!value) return 0;
  const str = value.toString().toLowerCase().replace(/,/g, '').trim();
  const match = str.match(/^([\d.]+)\s*([kmb])?$/);
  if (!match) return parseInt(str) || 0;
  let num = parseFloat(match[1]);
  switch (match[2]) {
    case 'k': num *= 1000; break;
    case 'm': num *= 1000000; break;
    case 'b': num *= 1000000000; break;
  }
  return Math.floor(num);
}

// Parse flexible duration input (e.g., "5m", "1h30m", "90s", "5:30", "1:30:00")
function parseDurationInput(value) {
  if (!value) return '';
  const str = value.toString().trim();
  // Already in mm:ss or hh:mm:ss format
  if (/^\d+:\d+(:\d+)?$/.test(str)) return str;
  // Parse flexible format like "1h30m", "5m", "90s", "1h", "1h30m45s"
  const regex = /(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/i;
  const match = str.match(regex);
  if (!match || (!match[1] && !match[2] && !match[3])) {
    // Try parsing as just a number (assume minutes)
    const num = parseInt(str);
    if (!isNaN(num)) return `${num}:00`;
    return str;
  }
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function collectFilters() {
  const rawKeywords = document.getElementById('titleKeywords').value;
  const useRegex = document.getElementById('useRegex').checked;
  
  // Parse keywords with +/- prefix support
  const parsedKeywords = useRegex ? { include: [rawKeywords], exclude: [] } : parseKeywordsWithPrefixes(rawKeywords);
  
  const filters = {
    viewFilter: {
      type: document.querySelector('input[name="viewFilter"]:checked').value,
      min: parseViewInput(document.getElementById('viewMin').value),
      max: parseViewInput(document.getElementById('viewMax').value),
      betweenMin: parseViewInput(document.getElementById('viewBetweenMin').value),
      betweenMax: parseViewInput(document.getElementById('viewBetweenMax').value)
    },
    durationFilter: {
      type: document.querySelector('input[name="durationFilter"]:checked').value,
      lessValue: parseDurationInput(document.getElementById('durationLess')?.value || ''),
      greaterValue: parseDurationInput(document.getElementById('durationGreater')?.value || ''),
      customMin: parseDurationInput(document.getElementById('durationMin').value || ''),
      customMax: parseDurationInput(document.getElementById('durationMax').value || '')
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
    titleKeywords: parsedKeywords.include,
    excludeKeywords: parsedKeywords.exclude,
    useRegex: useRegex,
    keywordLogic: document.querySelector('input[name="keywordLogic"]:checked').value,
    keywordMode: document.querySelector('input[name="keywordMode"]:checked').value,
    
    // Backward compatibility if needed
    titleKeyword: parsedKeywords.include.length > 0 ? parsedKeywords.include.join(', ') : ''
  };
  
  return filters;
}

// Parse keywords with +/- prefix support
function parseKeywordsWithPrefixes(input) {
  if (!input || !input.trim()) {
    return { include: [], exclude: [] };
  }
  
  const include = [];
  const exclude = [];
  
  input.split(',').forEach(keyword => {
    let k = keyword.trim();
    if (!k) return;
    
    if (k.startsWith('-')) {
      const term = k.substring(1).trim().toLowerCase();
      if (term) exclude.push(term);
    } else if (k.startsWith('+')) {
      const term = k.substring(1).trim().toLowerCase();
      if (term) include.push(term);
    } else {
      include.push(k.toLowerCase());
    }
  });
  
  return { include, exclude };
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

function loadFiltersFromData(filters) {
  if (filters) {
      
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
      
      // Update section indicators
      updateSectionIndicators();
  }
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
    
    const keywordSection = document.querySelector('.keyword-input-wrapper');
    keywordSection.appendChild(previewElement);
  }
  
  const logic = document.querySelector('input[name="keywordLogic"]:checked').value;
  const mode = document.querySelector('input[name="keywordMode"]:checked').value;
  const rawInput = document.getElementById('titleKeywords').value;
  const parsed = parseKeywordsWithPrefixes(rawInput);
  
  previewElement.style.display = 'block';
  
  let html = '<small>';
  
  if (parsed.include.length > 0) {
    html += `<strong>✓</strong> Include (${logic}): `;
    html += parsed.include.slice(0, 3).map(k => `<span class="keyword-tag include-tag">+${k}</span>`).join(' ');
    if (parsed.include.length > 3) html += ` <span class="keyword-tag">+${parsed.include.length - 3} more</span>`;
  }
  
  if (parsed.exclude.length > 0) {
    if (parsed.include.length > 0) html += ' ';
    html += `<strong>✕</strong> Exclude: `;
    html += parsed.exclude.slice(0, 3).map(k => `<span class="keyword-tag exclude-tag">-${k}</span>`).join(' ');
    if (parsed.exclude.length > 3) html += ` <span class="keyword-tag">+${parsed.exclude.length - 3} more</span>`;
  }
  
  // Fallback for simple mode
  if (parsed.include.length === 0 && parsed.exclude.length === 0 && keywords.length > 0) {
    html += `<strong>${mode === 'include' ? '✓' : '✕'}</strong> ${mode === 'include' ? 'Show' : 'Hide'} videos with `;
    html += `<strong>${logic === 'AND' ? 'ALL' : 'ANY'}</strong> of: `;
    html += keywords.slice(0, 5).map(k => `<span class="keyword-tag">${k}</span>`).join(logic === 'AND' ? ' + ' : ' | ');
    if (keywords.length > 5) html += ` <span class="keyword-tag">+${keywords.length - 5} more</span>`;
  }
  
  html += '</small>';
  previewElement.innerHTML = html;
}

function hideKeywordPreview() {
  const previewElement = document.getElementById('keyword-preview');
  if (previewElement) {
    previewElement.style.display = 'none';
  }
}
