console.log("YouTube Channel Filter: Content script loaded.");

// Default filter settings
let settings = {
    filterEnabled: false,
    minViews: 10,
    maxViews: 100000000,
    minViewsEnabled: false,
    maxViewsEnabled: false,
    minDuration: 1,
    maxDuration: 15000,
    minDurationEnabled: false,
    maxDurationEnabled: false
};

let debounceTimer;

// --- Helper Functions ---

// Debounce function to limit how often filterVideos runs
function debounce(func, delay) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(func, delay);
}

// Parses view strings like "1.2M views", "5K views", "987 views" into numbers
function parseViewCount(viewString) {
    if (!viewString) return 0;

    // Remove "views" text and commas, handle potential whitespace issues
    viewString = viewString.toLowerCase().replace(/views|,|\s+/g, '').trim();

    // Check for 'k' (thousands) or 'm' (millions)
    const multiplier = viewString.includes('k') ? 1000 : viewString.includes('m') ? 1000000 : 1;
    
    // Remove 'k' or 'm' and parse the number
    const num = parseFloat(viewString.replace(/[km]/, ''));

    // Handle cases like "No views" or parsing errors
    if (isNaN(num)) {
        return 0; 
    }

    return Math.floor(num * multiplier);
}

// Parses duration strings like "5:32", "1:20:15" into minutes
function parseDuration(durationString) {
    if (!durationString) return 0;
    
    // Clean the string and split by colon
    const parts = durationString.trim().split(':');
    
    // Calculate minutes based on format (HH:MM:SS or MM:SS)
    if (parts.length === 3) {
        // Format: HH:MM:SS
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    } else if (parts.length === 2) {
        // Format: MM:SS
        return parseInt(parts[0], 10);
    } else if (parts.length === 1 && !isNaN(parseInt(parts[0], 10))) {
        // Format: SS (just seconds)
        return 0; // Less than a minute
    }
    
    return 0; // Default if parsing fails
}

// Finds the view count element within a video container
function getViewCountElement(videoElement) {
    // Common selectors for view count
    const selectors = [
        '#metadata-line span:first-of-type', // Standard grid view
        '.ytd-video-meta-block span:first-of-type', // Sometimes used in list views
        '.inline-metadata-item:nth-of-type(1)' // Another possible selector
    ];

    for (const selector of selectors) {
        const el = videoElement.querySelector(selector);
        if (el && /\d/.test(el.textContent)) { // Basic check if it contains a digit
             // Check if the text looks like a view count
             const text = el.textContent.toLowerCase();
             if (text.includes('view') || /^\d+(\.\d+)?[km]?$/.test(text.replace(/views|,|\s+/g, '').trim())) {
                 return el;
             }
        }
    }
    return null; // Indicate not found
}

// Finds the duration element within a video container
function getDurationElement(videoElement) {
    // Common selectors for video duration
    const selectors = [
        '#text.ytd-thumbnail-overlay-time-status-renderer', // Common duration overlay
        '.ytd-thumbnail-overlay-time-status-renderer', // Alternative structure
        '.ytp-time-duration', // Sometimes used in different places
        'span.ytd-thumbnail-overlay-time-status-renderer' // Another variant
    ];

    for (const selector of selectors) {
        const el = videoElement.querySelector(selector);
        if (el && /\d+:\d+/.test(el.textContent)) { // Basic check for time format (e.g., 5:32)
            return el;
        }
    }
    return null; // Indicate not found
}

// --- Core Filtering Logic ---

function filterVideos() {
    console.log("Filtering videos with settings:", settings);

    // Find video elements
    const videoElements = document.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer');

    if (!videoElements.length) {
        console.log("No video elements found yet.");
        return;
    }

    let hiddenCount = 0;
    let visibleCount = 0;

    videoElements.forEach(videoElement => {
        // Get view count
        const viewCountElement = getViewCountElement(videoElement);
        const viewCountText = viewCountElement ? viewCountElement.textContent : null;
        const views = parseViewCount(viewCountText);
        
        // Get duration
        const durationElement = getDurationElement(videoElement);
        const durationText = durationElement ? durationElement.textContent : null;
        const durationMinutes = parseDuration(durationText);

        // Element to hide (often the direct container)
        const elementToHide = videoElement.closest('ytd-rich-item-renderer') || videoElement;
        
        // Determine if this video should be hidden based on all criteria
        let shouldHide = false;
        
        // Only apply filters if master filtering is enabled
        if (settings.filterEnabled) {
            // Check view count filters
            if (settings.minViewsEnabled && views < settings.minViews) {
                shouldHide = true;
            }
            if (settings.maxViewsEnabled && views > settings.maxViews) {
                shouldHide = true;
            }
            
            // Check duration filters
            if (settings.minDurationEnabled && durationMinutes < settings.minDuration) {
                shouldHide = true;
            }
            if (settings.maxDurationEnabled && durationMinutes > settings.maxDuration) {
                shouldHide = true;
            }
        }
        
        // Apply visibility change
        if (shouldHide) {
            elementToHide.style.display = 'none';
            elementToHide.dataset.viewFilterHidden = 'true';
            hiddenCount++;
        } else {
            elementToHide.style.display = '';
            elementToHide.dataset.viewFilterHidden = 'false';
            visibleCount++;
        }
    });
    
    console.log(`Filter complete. Visible: ${visibleCount}, Hidden: ${hiddenCount}`);
}

// --- Initialization and Event Handling ---

// Function to load settings and apply filter initially
function initializeFilter() {
    chrome.storage.sync.get(settings, (result) => {
        // Update our settings object with saved values
        settings = result;
        console.log("Settings loaded:", settings);
        
        // Run filter immediately after loading settings
        filterVideos();
        
        // Set up observer only after initial settings are loaded
        setupObserver();
    });
}

// Observer to watch for dynamically loaded videos
let observer = null;
function setupObserver() {
    // Disconnect previous observer if exists
    if (observer) {
        observer.disconnect();
    }

    // Select the node that will be observed for mutations
    const targetNode = document.querySelector('#contents.ytd-rich-grid-renderer, #items.ytd-grid-renderer, #contents.ytd-item-section-renderer');

    if (!targetNode) {
        console.warn('YouTube Channel Filter: Could not find target node for MutationObserver.');
        // Try again after a short delay
        setTimeout(setupObserver, 1000);
        return;
    }

    console.log("Setting up MutationObserver on:", targetNode);

    // Options for the observer
    const config = { childList: true, subtree: true };

    // Callback function for mutations
    const callback = (mutationsList, obs) => {
        let potentiallyNewVideos = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer') || 
                            node.querySelector('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer')) {
                            potentiallyNewVideos = true;
                        }
                    }
                });
            }
            if (potentiallyNewVideos) break;
        }

        if(potentiallyNewVideos) {
            console.log("New videos detected, reapplying filter");
            debounce(filterVideos, 500);
        }
    };

    // Create and start observer
    observer = new MutationObserver(callback);
    observer.observe(targetNode, config);
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received in content script:", request);
    
    if (request.action === "updateSettings") {
        // Update all settings
        settings = request.settings;
        console.log("Settings updated:", settings);
        
        // Re-apply filter with new settings
        filterVideos();
        sendResponse({ status: "Settings applied" });
    }
    
    return true; // Keep the messaging channel open for async response
});

// --- Start Execution ---
initializeFilter();