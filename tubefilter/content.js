// Content Script for TubeFilter Extension
// This script runs on YouTube pages and handles video filtering

(function() {
  'use strict';
  
  let currentFilters = null;
  let observer = null;
  let isFilteringActive = false;
  let processedElements = new WeakSet();
  let filterTimeout = null;
  let lastUrl = location.href;
  
  // Initialize the content script
  initialize();
  
  function initialize() {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(handleMessage);
    
    // Watch for URL changes (YouTube SPA navigation)
    setupUrlChangeDetection();
    
    // Check session storage for tab-specific persistence (persists across URL changes)
    try {
      const savedSettings = sessionStorage.getItem('tubeFilterSettings');
      
      if (savedSettings) {
        currentFilters = JSON.parse(savedSettings);
        isFilteringActive = true;
        console.log('TubeFilter: Restored filters from session');
        setupMutationObserver();
        applyFilters(); 
      }
    } catch (e) {
      console.error('TubeFilter: Error restoring session', e);
    }
    
    console.log('TubeFilter: Content script initialized');
  }

  function setupUrlChangeDetection() {
    // YouTube uses History API for navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
      originalPushState.apply(this, arguments);
      handleUrlChange();
    };
    
    history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      handleUrlChange();
    };
    
    window.addEventListener('popstate', handleUrlChange);
    
    // Also check periodically for URL changes (backup)
    setInterval(() => {
      if (location.href !== lastUrl) {
        handleUrlChange();
      }
    }, 1000);
  }
  
  function handleUrlChange() {
    const newUrl = location.href;
    
    // URL changed - reset processed elements to re-evaluate new content
    // but keep filters active (they persist across URL changes)
    processedElements = new WeakSet();
    
    // Reapply filters on new page if filtering is active
    if (isFilteringActive && currentFilters) {
      console.log('TubeFilter: URL changed, reapplying filters');
      // Small delay to let new content load
      setTimeout(() => {
        applyFilters();
      }, 500);
    }
    
    lastUrl = newUrl;
  }
  
  function isSamePageType(url1, url2) {
    try {
      const getPageType = (url) => {
        if (url.includes('/watch')) return 'watch';
        if (url.includes('/results')) return 'search';
        if (url.includes('/@')) return 'channel:' + url.match(/@[^/]+/)?.[0];
        if (url.includes('/channel/')) return 'channel:' + url.match(/channel\/[^/]+/)?.[0];
        return 'home';
      };
      return getPageType(url1) === getPageType(url2);
    } catch (e) {
      return false;
    }
  }

  function handleMessage(request, sender, sendResponse) {
    if (request.action === 'applyFilters') {
      currentFilters = request.filters;
      isFilteringActive = true;
      // Save to session storage for this tab (tab-specific, persists within tab only)
      try { 
        sessionStorage.setItem('tubeFilterSettings', JSON.stringify(currentFilters));
      } catch(e) {}
      
      // Reset processed cache when filters change to re-evaluate everything
      processedElements = new WeakSet(); 
      setupMutationObserver();
      const hiddenCount = applyFilters();
      sendResponse({success: true, hiddenCount: hiddenCount});
    } else if (request.action === 'clearFilters') {
      currentFilters = null;
      isFilteringActive = false;
      // Remove from session storage
      try { 
        sessionStorage.removeItem('tubeFilterSettings');
      } catch(e) {}
      
      processedElements = new WeakSet();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      clearFilters();
      sendResponse({success: true});
    } else if (request.action === 'getFilters') {
      // Return current filters to popup (for loading saved state)
      sendResponse({filters: currentFilters});
    }
    return true; // Keep message channel open for async response
  }

  function setupMutationObserver() {
    // Disconnect existing observer if any
    if (observer) {
      observer.disconnect();
    }
    
    observer = new MutationObserver(function(mutations) {
      if (!isFilteringActive || !currentFilters) return;
      
      let shouldFilter = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check added nodes
          if (mutation.addedNodes.length > 0) {
             shouldFilter = true;
             break;
          }
          // Also check for attribute changes if needed, but childList usually covers scrolling
        }
      }
      
      if (shouldFilter) {
        // Debounce the filtering
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
    if (!currentFilters || !isFilteringActive) return 0;
    
    let hiddenCount = 0;
    
    // Find all potential video containers
    // Targeting main grid, sidebar, and search results
    const videoSelectors = [
      'ytd-rich-item-renderer', // Home feed
      'ytd-compact-video-renderer', // Sidebar
      'ytd-video-renderer', // Search results
      'ytd-grid-video-renderer' // Channel videos
    ];
    
    const videoElements = document.querySelectorAll(videoSelectors.join(','));
    const updates = [];
    
    // Phase 1: Read and Decide
    videoElements.forEach(function(element) {
      // Optimization: Check if we already processed this element
      // However, if element content changes (AJAX), we might need to re-check.
      // YouTube re-uses elements sometimes. 
      // Safe bet: if it's already hidden by us, count it and skip. 
      // If it's visible, check it again just in case content changed (though rare for same element reference).
      
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
    
    return hiddenCount;
  }
  
  function clearFilters() {
    const videoElements = document.querySelectorAll('[data-tubefilter-hidden="true"]');
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
      // different renderers have different duration locations
      const durationElement = element.querySelector('.badge-shape-wiz__text') || 
                             element.querySelector('#text[aria-label*="minute"], #text[aria-label*="second"]') ||
                             element.querySelector('ytd-thumbnail-overlay-time-status-renderer');
                             
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
      
      // Fallback for short view/time text in some views
      if (!viewCount || !uploadTime) {
          const metadata = element.querySelector('#metadata-line');
          if (metadata) {
              const items = metadata.textContent.split('\n').map(t => t.trim()).filter(t => t);
              items.forEach(text => {
                   if (text.includes('view')) viewCount = text;
                   else if (text.includes('ago') || text.includes('Streamed')) uploadTime = text;
              });
          }
      }
      
      if (!title && !duration && !viewCount) {
        return null;
      }
      
      return {
        title: title,
        duration: duration,
        viewCount: viewCount,
        uploadTime: uploadTime,
        element: element
      };
    } catch (error) {
      // creating noise in console? comment out if needed
      // console.log('TubeFilter: Error extracting video data:', error);
      return null;
    }
  }
  
  function shouldHideVideo(videoData, filters) {
    const title = videoData.title;
    const titleLower = title.toLowerCase();
    
    // Check exclude keywords first (always hide if any exclude keyword matches)
    if (filters.excludeKeywords && Array.isArray(filters.excludeKeywords) && filters.excludeKeywords.length > 0) {
      const hasExcluded = filters.excludeKeywords.some(keyword => titleLower.includes(keyword.toLowerCase()));
      if (hasExcluded) {
        return true;
      }
    }
    
    // Check title keyword filter (enhanced for multiple keywords and regex)
    if (filters.titleKeywords && Array.isArray(filters.titleKeywords) && filters.titleKeywords.length > 0) {
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
