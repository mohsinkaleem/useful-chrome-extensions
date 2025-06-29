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
    
    console.log('TubeFilter: Content script initialized (tab-specific mode)');
  }
  
  function handleMessage(request, sender, sendResponse) {
    if (request.action === 'applyFilters') {
      currentFilters = request.filters;
      const hiddenCount = applyFilters();
      sendResponse({success: true, hiddenCount: hiddenCount});
    } else if (request.action === 'clearFilters') {
      currentFilters = null;
      clearFilters();
      sendResponse({success: true});
    }
  }
  
  function setupMutationObserver() {
    // Disconnect existing observer if any
    if (observer) {
      observer.disconnect();
    }
    
    observer = new MutationObserver(function(mutations) {
      if (!isFilteringActive || !currentFilters) return;
      
      let shouldFilter = false;
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if new video elements were added
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && node.matches('ytd-rich-item-renderer')) {
                shouldFilter = true;
              } else if (node.querySelector && node.querySelector('ytd-rich-item-renderer')) {
                shouldFilter = true;
              }
            }
          });
        }
      });
      
      if (shouldFilter) {
        // Debounce the filtering to avoid excessive processing
        setTimeout(applyFilters, 100);
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
    
    videoElements.forEach(function(element) {
      const videoData = extractVideoData(element);
      
      if (videoData && shouldHideVideo(videoData, currentFilters)) {
        hideVideoElement(element);
        hiddenCount++;
      } else {
        showVideoElement(element);
      }
    });
    
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
      
      // Extract view count
      const viewElements = element.querySelectorAll('.inline-metadata-item');
      let viewCount = '';
      viewElements.forEach(function(el) {
        const text = el.textContent.trim();
        if (text.includes('view')) {
          viewCount = text;
        }
      });
      
      if (!title && !duration && !viewCount) {
        return null; // Skip if we can't extract any meaningful data
      }
      
      return {
        title: title,
        duration: duration,
        viewCount: viewCount,
        element: element
      };
    } catch (error) {
      console.log('TubeFilter: Error extracting video data:', error);
      return null;
    }
  }
  
  function shouldHideVideo(videoData, filters) {
    // Check title keyword filter
    if (filters.titleKeyword && filters.titleKeyword.length > 0) {
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
      const durationSeconds = parseDurationToSeconds(videoData.duration);
      if (durationSeconds !== -1) {
        switch (filters.durationFilter.type) {
          case 'less':
            const maxSeconds = parseTimeToSeconds(filters.durationFilter.lessValue);
            if (maxSeconds !== -1 && durationSeconds >= maxSeconds) return true;
            break;
          case 'greater':
            const minSeconds = parseTimeToSeconds(filters.durationFilter.greaterValue);
            if (minSeconds !== -1 && durationSeconds <= minSeconds) return true;
            break;
          case 'custom':
            const customMinSeconds = parseTimeToSeconds(filters.durationFilter.customMin);
            const customMaxSeconds = parseTimeToSeconds(filters.durationFilter.customMax);
            if (customMinSeconds !== -1 && customMaxSeconds !== -1) {
              if (durationSeconds < customMinSeconds || durationSeconds > customMaxSeconds) {
                return true;
              }
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
  
  function parseDurationToSeconds(durationText) {
    if (!durationText) return -1;
    
    const parts = durationText.split(':');
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
  
  function parseTimeToSeconds(timeStr) {
    if (!timeStr) return -1;
    
    const parts = timeStr.split(':');
    if (parts.length !== 2) return -1;
    
    const minutes = parseInt(parts[0]);
    const seconds = parseInt(parts[1]);
    
    if (isNaN(minutes) || isNaN(seconds) || seconds >= 60) return -1;
    
    return minutes * 60 + seconds;
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
