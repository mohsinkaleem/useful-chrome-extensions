// Content Script for TubeFilter Extension
// This script runs on YouTube pages and handles video filtering

(function() {
  'use strict';
  
  let currentFilters = null;
  let observer = null;
  let isFilteringActive = false;
  
  // Initialize the content script
  initialize();
  
  function initialize() {
    // Don't load saved filters automatically - wait for user to apply them
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(handleMessage);
    
    // Set up mutation observer to handle dynamically loaded content
    setupMutationObserver();

    // Optimize for background tabs
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    console.log('TubeFilter: Content script initialized (tab-specific mode)');
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      // Tab is hidden, disconnect observer to save resources
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    } else {
      // Tab is visible, re-enable observer and re-apply filters
      if (!observer && isFilteringActive) {
        setupMutationObserver();
        applyFilters();
      }
    }
  }
  
  function handleMessage(request, sender, sendResponse) {
    if (request.action === 'applyFilters') {
      currentFilters = request.filters;
      // Clear processed cache when filters change
      processedElements = new WeakSet(); 
      const hiddenCount = applyFilters();
      sendResponse({success: true, hiddenCount: hiddenCount});
    } else if (request.action === 'clearFilters') {
      currentFilters = null;
      processedElements = new WeakSet();
      clearFilters();
      sendResponse({success: true});
    }
  }
  
  let processedElements = new WeakSet();
  let filterTimeout = null;

  function setupMutationObserver() {
    // Disconnect existing observer if any
    if (observer) {
      observer.disconnect();
    }
    
    observer = new MutationObserver(function(mutations) {
      if (!isFilteringActive || !currentFilters || document.hidden) return;
      
      let shouldFilter = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.nodeName === 'YTD-RICH-ITEM-RENDERER' || 
                  (node.querySelector && node.querySelector('ytd-rich-item-renderer'))) {
                shouldFilter = true;
                break;
              }
            }
          }
        }
        if (shouldFilter) break;
      }
      
      if (shouldFilter) {
        // Debounce the filtering to avoid excessive processing
        if (filterTimeout) clearTimeout(filterTimeout);
        filterTimeout = setTimeout(applyFilters, 500);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  function applyFilters() {
    if (!currentFilters) return 0;
    
    isFilteringActive = true;
    let hiddenCount = 0;
    
    // Find all video elements
    const videoElements = document.querySelectorAll('ytd-rich-item-renderer');
    const updates = [];
    
    // Phase 1: Read and Decide
    videoElements.forEach(function(element) {
      // Optimization: Check if we already processed this element for the current filter set
      if (processedElements.has(element)) {
         if (element.getAttribute('data-tubefilter-hidden') === 'true') {
           hiddenCount++;
         }
         return;
      }

      const videoData = extractVideoData(element);
      
      if (videoData) {
        const shouldHide = shouldHideVideo(videoData, currentFilters);
        updates.push({element, shouldHide});
        
        if (shouldHide) {
          hiddenCount++;
        }
        processedElements.add(element);
      }
    });
    
    // Phase 2: Write (Batch DOM updates)
    if (updates.length > 0) {
      requestAnimationFrame(() => {
        updates.forEach(({element, shouldHide}) => {
          if (shouldHide) {
            hideVideoElement(element);
          } else {
            showVideoElement(element);
          }
        });
      });
    }
    
    console.log(`TubeFilter: Filtered ${hiddenCount} videos`);
    return hiddenCount;
  }
  
  function clearFilters() {
    isFilteringActive = false;
    currentFilters = null;
    
    const videoElements = document.querySelectorAll('ytd-rich-item-renderer');
    videoElements.forEach(function(element) {
      showVideoElement(element);
    });
    
    console.log('TubeFilter: All filters cleared');
  }
  
  function extractVideoData(element) {
    try {
      // Extract title
      const titleElement = element.querySelector('#video-title');
      const title = titleElement ? titleElement.textContent.trim() : '';
      
      // Extract duration
      const durationElement = element.querySelector('.badge-shape-wiz__text') || 
                             element.querySelector('#text[aria-label*="minute"], #text[aria-label*="second"]');
      const duration = durationElement ? durationElement.textContent.trim() : '';
      
      // Extract view count and upload time
      const viewElements = element.querySelectorAll('.inline-metadata-item');
      let viewCount = '';
      let uploadTime = '';
      viewElements.forEach(function(el) {
        const text = el.textContent.trim();
        if (text.includes('view')) {
          viewCount = text;
        } else if (text.includes('ago') || text.includes('Streamed')) {
          uploadTime = text;
        }
      });
      
      if (!title && !duration && !viewCount) {
        return null; // Skip if we can't extract any meaningful data
      }
      
      return {
        title: title,
        duration: duration,
        viewCount: viewCount,
        uploadTime: uploadTime,
        element: element
      };
    } catch (error) {
      console.log('TubeFilter: Error extracting video data:', error);
      return null;
    }
  }
  
  function shouldHideVideo(videoData, filters) {
    // Check title keyword filter (enhanced for multiple keywords and regex)
    if (filters.titleKeywords && Array.isArray(filters.titleKeywords) && filters.titleKeywords.length > 0) {
      const title = videoData.title;
      const titleLower = title.toLowerCase();
      const keywordMode = filters.keywordMode || 'include';
      
      let keywordMatch = false;
      
      if (filters.useRegex) {
        try {
          const pattern = filters.titleKeywords[0];
          // Check if pattern looks like /pattern/flags
          const match = pattern.match(/^\/(.*?)\/([gimsuy]*)$/);
          let regex;
          if (match) {
            regex = new RegExp(match[1], match[2]);
          } else {
            // Default to case-insensitive search if no flags provided
            regex = new RegExp(pattern, 'i');
          }
          keywordMatch = regex.test(title);
        } catch (e) {
          console.error('TubeFilter: Invalid Regex', e);
          keywordMatch = false;
        }
      } else {
        const keywordLogic = filters.keywordLogic || 'AND';
        if (keywordLogic === 'AND') {
          // ALL keywords must be present
          keywordMatch = filters.titleKeywords.every(keyword => titleLower.includes(keyword.toLowerCase()));
        } else {
          // ANY keyword must be present (OR logic)
          keywordMatch = filters.titleKeywords.some(keyword => titleLower.includes(keyword.toLowerCase()));
        }
      }
      
      if (keywordMode === 'include') {
        // Include mode: hide if keywords don't match the logic
        if (!keywordMatch) {
          return true;
        }
      } else if (keywordMode === 'exclude') {
        // Exclude mode: hide if keywords match the logic
        if (keywordMatch) {
          return true;
        }
      }
    } 
    // Fallback for backward compatibility with old single keyword format
    else if (filters.titleKeyword && filters.titleKeyword.length > 0) {
      const titleLower = videoData.title.toLowerCase();
      const keywordLower = filters.titleKeyword.toLowerCase();
      const containsKeyword = titleLower.includes(keywordLower);
      
      // Default to 'include' mode for backward compatibility
      const keywordMode = filters.keywordMode || 'include';
      
      if (keywordMode === 'include') {
        // Include mode: hide if keyword is NOT found
        if (!containsKeyword) {
          return true;
        }
      } else if (keywordMode === 'exclude') {
        // Exclude mode: hide if keyword IS found
        if (containsKeyword) {
          return true;
        }
      }
    }
    
    // Check view count filter
    if (filters.viewFilter.type !== 'none') {
      const viewCount = parseViewCount(videoData.viewCount);
      if (viewCount !== -1) {
        switch (filters.viewFilter.type) {
          case 'greater':
            if (viewCount <= filters.viewFilter.min) return true;
            break;
          case 'less':
            if (viewCount >= filters.viewFilter.max) return true;
            break;
          case 'between':
            if (viewCount < filters.viewFilter.betweenMin || viewCount > filters.viewFilter.betweenMax) {
              return true;
            }
            break;
        }
      }
    }
    
    // Check duration filter
    if (filters.durationFilter.type !== 'none') {
      const durationSeconds = parseTime(videoData.duration);
      if (durationSeconds !== -1) {
        switch (filters.durationFilter.type) {
          case 'less':
            const maxSeconds = parseTime(filters.durationFilter.lessValue);
            if (maxSeconds !== -1 && durationSeconds >= maxSeconds) return true;
            break;
          case 'greater':
            const minSeconds = parseTime(filters.durationFilter.greaterValue);
            if (minSeconds !== -1 && durationSeconds <= minSeconds) return true;
            break;
          case 'custom':
            const customMinSeconds = parseTime(filters.durationFilter.customMin);
            const customMaxSeconds = parseTime(filters.durationFilter.customMax);
            if (customMinSeconds !== -1 && customMaxSeconds !== -1) {
              if (durationSeconds < customMinSeconds || durationSeconds > customMaxSeconds) {
                return true;
              }
            }
            break;
        }
      }
    }
    
    // Check time filter (upload date)
    if (filters.timeFilter && filters.timeFilter.type !== 'none') {
      const uploadHoursAgo = parseUploadTimeToHours(videoData.uploadTime);
      if (uploadHoursAgo !== -1) {
        switch (filters.timeFilter.type) {
          case 'less':
            const maxHours = convertTimeToHours(filters.timeFilter.lessValue, filters.timeFilter.lessUnit);
            if (uploadHoursAgo >= maxHours) return true;
            break;
          case 'greater':
            const minHours = convertTimeToHours(filters.timeFilter.greaterValue, filters.timeFilter.greaterUnit);
            if (uploadHoursAgo <= minHours) return true;
            break;
          case 'between':
            const betweenMinHours = convertTimeToHours(filters.timeFilter.betweenMin, filters.timeFilter.betweenMinUnit);
            const betweenMaxHours = convertTimeToHours(filters.timeFilter.betweenMax, filters.timeFilter.betweenMaxUnit);
            if (uploadHoursAgo < betweenMinHours || uploadHoursAgo > betweenMaxHours) {
              return true;
            }
            break;
        }
      }
    }
    
    return false;
  }
  
  function parseViewCount(viewText) {
    if (!viewText) return -1;
    
    const text = viewText.toLowerCase().replace(/,/g, '');
    const match = text.match(/([\d.]+)\s*([kmb])?.*view/);
    
    if (!match) return -1;
    
    let number = parseFloat(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'k':
        number *= 1000;
        break;
      case 'm':
        number *= 1000000;
        break;
      case 'b':
        number *= 1000000000;
        break;
    }
    
    return Math.floor(number);
  }
  
  function parseTime(timeText) {
    if (!timeText) return -1;
    
    const parts = timeText.split(':');
    let seconds = 0;
    
    try {
      if (parts.length === 2) {
        // mm:ss format
        seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else if (parts.length === 3) {
        // hh:mm:ss format
        seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
      } else {
        return -1;
      }
      
      return isNaN(seconds) ? -1 : seconds;
    } catch (error) {
      return -1;
    }
  }
  
  function parseUploadTimeToHours(uploadText) {
    if (!uploadText) return -1;
    
    const text = uploadText.toLowerCase();
    const match = text.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/);
    
    if (!match) return -1;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    return convertTimeToHours(value, unit + 's');
  }
  
  function convertTimeToHours(value, unit) {
    switch(unit) {
      case 'seconds':
        return value / 3600;
      case 'minutes':
        return value / 60;
      case 'hours':
        return value;
      case 'days':
        return value * 24;
      case 'weeks':
        return value * 24 * 7;
      case 'months':
        return value * 24 * 30;
      case 'years':
        return value * 24 * 365;
      default:
        return value;
    }
  }
  
  function hideVideoElement(element) {
    element.style.display = 'none';
    element.setAttribute('data-tubefilter-hidden', 'true');
  }
  
  function showVideoElement(element) {
    if (element.getAttribute('data-tubefilter-hidden') === 'true') {
      element.style.display = '';
      element.removeAttribute('data-tubefilter-hidden');
    }
  }
  
})();
