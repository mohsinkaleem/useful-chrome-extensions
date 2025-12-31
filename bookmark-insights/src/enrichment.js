// Enrichment engine for bookmark metadata fetching and processing
// Handles background enrichment, dead-link checking, and auto-categorization

import { getSettings, getNextEnrichmentBatch, removeFromEnrichmentQueue, upsertBookmark, getBookmark, logEvent } from './db.js';
import { parseBookmarkUrl } from './url-parsers.js';

// Domain-based categorization rules
const CATEGORY_RULES = {
  'github.com': 'code',
  'gitlab.com': 'code',
  'bitbucket.org': 'code',
  'stackoverflow.com': 'code',
  'stackexchange.com': 'code',
  'youtube.com': 'video',
  'vimeo.com': 'video',
  'youtu.be': 'video',
  'twitter.com': 'social',
  'facebook.com': 'social',
  'linkedin.com': 'social',
  'instagram.com': 'social',
  'reddit.com': 'social',
  'medium.com': 'blog',
  'dev.to': 'blog',
  'hashnode.com': 'blog',
  'substack.com': 'blog',
  'wikipedia.org': 'reference',
  'mdn.mozilla.org': 'reference',
  'w3schools.com': 'reference',
  'amazon.com': 'shopping',
  'ebay.com': 'shopping',
  'etsy.com': 'shopping'
};

// URL path patterns for categorization
const PATH_PATTERNS = {
  '/docs': 'documentation',
  '/documentation': 'documentation',
  '/api': 'api',
  '/reference': 'reference',
  '/tutorial': 'tutorial',
  '/guide': 'tutorial',
  '/blog': 'blog',
  '/article': 'blog',
  '/video': 'video',
  '/watch': 'video'
};

// Content-based keyword detection
const CONTENT_KEYWORDS = {
  'tutorial': 'tutorial',
  'guide': 'tutorial',
  'how to': 'tutorial',
  'documentation': 'documentation',
  'docs': 'documentation',
  'api': 'api',
  'reference': 'reference',
  'blog': 'blog',
  'article': 'blog',
  'news': 'news',
  'video': 'video',
  'course': 'education',
  'learning': 'education',
  'tool': 'tool',
  'app': 'tool',
  'software': 'tool'
};

// Enrich a single bookmark by fetching its metadata
// @param {string} bookmarkId - The bookmark ID to enrich
// @param {Object} options - Options for enrichment
// @param {boolean} options.force - Force re-enrichment even if recently enriched
export async function enrichBookmark(bookmarkId, options = {}) {
  const { force = false } = options;
  
  try {
    const bookmark = await getBookmark(bookmarkId);
    if (!bookmark) {
      console.log(`Bookmark ${bookmarkId} not found`);
      return { success: false, error: 'Bookmark not found' };
    }

    // Only enrich http/https URLs
    if (!bookmark.url.startsWith('http://') && !bookmark.url.startsWith('https://')) {
      console.log(`Skipping non-http bookmark: ${bookmark.url}`);
      return { success: false, error: 'Not an HTTP URL', skipped: true };
    }

    // Skip if recently enriched (based on freshness settings) - unless force is true
    if (!force) {
      const settings = await getSettings();
      const freshnessDays = settings.enrichmentFreshnessDays || 30;
      const freshnessThreshold = Date.now() - (freshnessDays * 24 * 60 * 60 * 1000);
      
      if (bookmark.lastChecked && bookmark.lastChecked > freshnessThreshold) {
        console.log(`Skipping recently enriched bookmark: ${bookmark.title} (last checked: ${new Date(bookmark.lastChecked).toLocaleDateString()})`);
        return { success: true, skipped: true, alreadyEnriched: true };
      }
    } else {
      console.log(`Force re-enriching bookmark: ${bookmark.title}`);
    }

    console.log(`Enriching bookmark: ${bookmark.title} (${bookmark.url})`);

    // Parse URL for platform-specific data (fast, no network required)
    const platformData = parseBookmarkUrl(bookmark.url);
    
    // Check dead links first (quick HEAD request)
    const isAlive = await checkBookmarkAlive(bookmark.url);
    
    // If dead, just update the isAlive status and skip metadata fetching
    if (isAlive === false) {
      bookmark.isAlive = false;
      bookmark.lastChecked = Date.now();
      // Still populate platform data even for dead links
      if (platformData) {
        bookmark.platform = platformData.platform;
        bookmark.creator = platformData.creator;
        bookmark.contentType = platformData.type;
        bookmark.platformData = platformData;
      }
      await upsertBookmark(bookmark);
      await logEvent(bookmarkId, 'enrichment', { isAlive: false });
      return { success: true, isAlive: false, skipped: true };
    }

    // Fetch page metadata
    const metadata = await fetchPageMetadata(bookmark.url);
    
    // Auto-categorize
    const category = categorizeBookmark(bookmark, metadata);
    
    // Merge platform data with metadata for enhanced creator detection
    const enrichedPlatformData = mergePlatformDataWithMetadata(platformData, metadata);

    // Update bookmark with enriched data
    bookmark.description = metadata.description || bookmark.description;
    bookmark.keywords = metadata.keywords || bookmark.keywords;
    bookmark.category = category || bookmark.category;
    bookmark.isAlive = isAlive;
    bookmark.lastChecked = Date.now();
    bookmark.faviconUrl = metadata.faviconUrl || bookmark.faviconUrl;
    bookmark.contentSnippet = metadata.snippet || bookmark.contentSnippet;
    bookmark.rawMetadata = metadata.rawMetadata || bookmark.rawMetadata; // Store comprehensive metadata
    
    // Add platform-specific fields
    if (enrichedPlatformData) {
      bookmark.platform = enrichedPlatformData.platform;
      bookmark.creator = enrichedPlatformData.creator;
      bookmark.contentType = enrichedPlatformData.type;
      bookmark.platformData = enrichedPlatformData;
    }

    await upsertBookmark(bookmark);
    await logEvent(bookmarkId, 'enrichment', { 
      success: true, 
      category,
      platform: enrichedPlatformData?.platform,
      hasDescription: !!metadata.description 
    });

    return { 
      success: true, 
      category, 
      description: metadata.description,
      platform: enrichedPlatformData?.platform,
      isAlive 
    };
  } catch (error) {
    console.error(`Error enriching bookmark ${bookmarkId}:`, error);
    
    // IMPORTANT: Update lastChecked even on failure to prevent infinite retry loops
    // We set it to now so it won't be picked up again immediately by the "unenriched" filter
    try {
      const bookmark = await getBookmark(bookmarkId);
      if (bookmark) {
        bookmark.lastChecked = Date.now();
        // Optionally mark as failed so we can filter for them later
        bookmark.enrichmentError = error.message;
        await upsertBookmark(bookmark);
      }
    } catch (dbError) {
      console.error('Error updating bookmark after failure:', dbError);
    }

    await logEvent(bookmarkId, 'enrichment', { success: false, error: error.message });
    return { success: false, error: error.message };
  }
}

// Check if a bookmark URL is still alive
export async function checkBookmarkAlive(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // Try HEAD request first (faster)
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);
    
    // Consider 2xx and 3xx as alive
    return response.ok || (response.status >= 300 && response.status < 400);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Timeout checking ${url}`);
      return null; // Unknown - timeout
    }
    
    // Try GET request as fallback with no-cors mode
    try {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 5000);
      
      await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller2.signal
      });
      
      clearTimeout(timeoutId2);
      return null; // Unknown - CORS blocked but request went through
    } catch (error2) {
      console.log(`Error checking ${url}:`, error2.message);
      return false; // Likely dead
    }
  }
}

// Fetch metadata from a web page
export async function fetchPageMetadata(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {};
    }

    const html = await response.text();
    
    // Parse HTML using regex (service worker compatible - no DOMParser available)
    
    // Extract comprehensive raw metadata for future analysis
    const rawMetadata = {
      meta: {},
      openGraph: {},
      twitterCard: {},
      jsonLd: [],
      other: {}
    };

    // Clean HTML for better content extraction
    // Remove scripts, styles, navs, headers, footers to avoid noise
    const cleanHtml = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gim, "")
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gim, "")
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gim, "")
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gim, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    // Extract all meta tags using regex
    const metaTagRegex = /<meta\s+([^>]*?)>/gi;
    let metaMatch;
    
    while ((metaMatch = metaTagRegex.exec(html)) !== null) {
      const metaTag = metaMatch[1];
      
      // Extract name/property and content attributes
      const nameMatch = metaTag.match(/(?:name|property)=["']([^"']+)["']/i);
      const contentMatch = metaTag.match(/content=["']([^"']+)["']/i);
      
      if (nameMatch && contentMatch) {
        const name = nameMatch[1];
        const content = contentMatch[1];
        
        if (name.startsWith('og:')) {
          rawMetadata.openGraph[name] = content;
        } else if (name.startsWith('twitter:')) {
          rawMetadata.twitterCard[name] = content;
        } else {
          rawMetadata.meta[name] = content;
        }
      }
    }

    // Extract JSON-LD structured data
    const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']>(.*?)<\/script>/gis;
    let jsonLdMatch;
    
    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        rawMetadata.jsonLd.push(data);
      } catch (e) {
        // Ignore invalid JSON-LD
      }
    }

    // Extract title tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      rawMetadata.other.title = titleMatch[1].trim();
    }
    
    // Extract canonical link
    const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) ||
                          html.match(/<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i);
    if (canonicalMatch) {
      rawMetadata.other.canonical = canonicalMatch[1];
    }
    
    // Extract language attribute
    const langMatch = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
    if (langMatch) {
      rawMetadata.other.language = langMatch[1];
    }

    // Extract author from meta tag (already captured above, but set shortcut)
    if (rawMetadata.meta.author) {
      rawMetadata.other.author = rawMetadata.meta.author;
    }

    // Extract processed metadata for immediate use
    const metadata = {
      description: null,
      keywords: [],
      faviconUrl: null,
      snippet: null,
      rawMetadata: rawMetadata // Include comprehensive raw data
    };

    // Get description from meta tags (priority: og:description > meta description > twitter:description)
    metadata.description = 
      rawMetadata.openGraph['og:description'] || 
      rawMetadata.meta.description || 
      rawMetadata.twitterCard['twitter:description'] ||
      null;

    // Get keywords from meta tags
    if (rawMetadata.meta.keywords) {
      metadata.keywords = rawMetadata.meta.keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0)
        .slice(0, 10); // Limit to 10 keywords
    }

    // Get favicon using regex
    const faviconMatch = html.match(/<link\s+([^>]*rel=["'](?:icon|shortcut icon)["'][^>]*)>/i);
    if (faviconMatch) {
      const hrefMatch = faviconMatch[1].match(/href=["']([^"']+)["']/i);
      if (hrefMatch) {
        try {
          metadata.faviconUrl = new URL(hrefMatch[1], url).href;
        } catch (e) {
          // Invalid URL, skip
        }
      }
    }

    // Get snippet from paragraphs (improved algorithm)
    // Find all paragraphs in the cleaned HTML
    const pRegex = /<p[^>]*>([^<]+)<\/p>/gi;
    let pMatch;
    const paragraphs = [];
    
    while ((pMatch = pRegex.exec(cleanHtml)) !== null) {
      const text = pMatch[1]
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
        
      // Filter out short or empty paragraphs (likely UI elements)
      // And filter out cookie warnings or common UI text
      if (text.length > 50 && 
          !text.toLowerCase().includes('cookie') && 
          !text.toLowerCase().includes('copyright')) {
        paragraphs.push(text);
      }
      
      if (paragraphs.length >= 3) break; // Get top 3 valid paragraphs
    }
    
    if (paragraphs.length > 0) {
      metadata.snippet = paragraphs.join(' ... ').substring(0, 300);
    }

    return metadata;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Timeout fetching metadata for ${url}`);
    } else {
      console.error(`Error fetching metadata for ${url}:`, error);
    }
    return {};
  }
}

// Auto-categorize a bookmark based on domain, URL path, and content
export function categorizeBookmark(bookmark, metadata = {}) {
  try {
    const url = new URL(bookmark.url);
    const domain = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const title = bookmark.title.toLowerCase();
    const description = (metadata.description || '').toLowerCase();

    // 1. Check domain-based rules (highest priority)
    for (const [domainPattern, category] of Object.entries(CATEGORY_RULES)) {
      if (domain.includes(domainPattern)) {
        return category;
      }
    }

    // 2. Check URL path patterns
    for (const [pathPattern, category] of Object.entries(PATH_PATTERNS)) {
      if (path.includes(pathPattern)) {
        return category;
      }
    }

    // 3. Check content keywords in title and description
    const combinedText = `${title} ${description}`;
    for (const [keyword, category] of Object.entries(CONTENT_KEYWORDS)) {
      if (combinedText.includes(keyword)) {
        return category;
      }
    }

    // 4. Check meta keywords
    if (metadata.keywords && metadata.keywords.length > 0) {
      const metaKeywords = metadata.keywords.join(' ').toLowerCase();
      for (const [keyword, category] of Object.entries(CONTENT_KEYWORDS)) {
        if (metaKeywords.includes(keyword)) {
          return category;
        }
      }
    }

    return null; // No category detected
  } catch (error) {
    console.error('Error categorizing bookmark:', error);
    return null;
  }
}

/**
 * Merge URL-parsed platform data with fetched page metadata for enhanced creator detection
 * @param {Object} platformData - Data from URL parser
 * @param {Object} metadata - Data from page fetch (includes rawMetadata)
 * @returns {Object} Enhanced platform data
 */
function mergePlatformDataWithMetadata(platformData, metadata) {
  if (!platformData) return null;
  
  const rawMeta = metadata?.rawMetadata || {};
  const enhanced = { ...platformData };
  
  // YouTube: Extract channel name from JSON-LD or meta tags
  if (platformData.platform === 'youtube') {
    // Try JSON-LD for authoritative channel info
    if (rawMeta.jsonLd && Array.isArray(rawMeta.jsonLd)) {
      for (const ld of rawMeta.jsonLd) {
        // VideoObject has channel info
        if (ld['@type'] === 'VideoObject' && ld.author) {
          const author = Array.isArray(ld.author) ? ld.author[0] : ld.author;
          if (author.name) {
            enhanced.extra = enhanced.extra || {};
            enhanced.extra.channelName = author.name;
            // Use JSON-LD channel name as creator if we only have handle
            if (enhanced.creator && enhanced.creator.startsWith('@')) {
              enhanced.extra.channelHandle = enhanced.creator;
            }
            enhanced.creator = author.name;
          }
          if (author.url) {
            enhanced.extra.channelUrl = author.url;
          }
        }
        // BreadcrumbList can have channel info
        if (ld['@type'] === 'BreadcrumbList' && ld.itemListElement) {
          const channelItem = ld.itemListElement.find(item => 
            item.item && item.item['@id'] && item.item['@id'].includes('/channel/')
          );
          if (channelItem?.item?.name) {
            enhanced.extra = enhanced.extra || {};
            if (!enhanced.extra.channelName) {
              enhanced.extra.channelName = channelItem.item.name;
            }
          }
        }
      }
    }
    
    // Fallback to Open Graph
    if (!enhanced.creator && rawMeta.openGraph) {
      const ogSiteName = rawMeta.openGraph['og:site_name'];
      if (ogSiteName && ogSiteName !== 'YouTube') {
        enhanced.creator = ogSiteName;
      }
    }
  }
  
  // GitHub: Extract topics and additional repo info from meta
  if (platformData.platform === 'github') {
    // GitHub includes topics in meta description sometimes
    if (rawMeta.meta?.description) {
      const desc = rawMeta.meta.description;
      // GitHub topics format: "topic1, topic2, topic3 - Description"
      const topicsMatch = desc.match(/^([^-]+)\s*-/);
      if (topicsMatch) {
        const potentialTopics = topicsMatch[1].split(',').map(t => t.trim()).filter(t => t.length > 0 && t.length < 30);
        if (potentialTopics.length > 0) {
          enhanced.extra = enhanced.extra || {};
          enhanced.extra.topics = potentialTopics;
        }
      }
    }
    
    // Try to get language from og:image URL (GitHub includes it in some social cards)
    if (rawMeta.openGraph?.['og:image']) {
      const imgUrl = rawMeta.openGraph['og:image'];
      // GitHub opengraph images sometimes include language in the URL
      const langMatch = imgUrl.match(/language[=:]([^&]+)/i);
      if (langMatch) {
        enhanced.extra = enhanced.extra || {};
        enhanced.extra.language = decodeURIComponent(langMatch[1]);
      }
    }
  }
  
  // Medium/Blog: Extract author from article metadata
  if (platformData.platform === 'medium' || platformData.platform === 'devto' || platformData.platform === 'substack') {
    // Try og:article:author
    if (!enhanced.creator && rawMeta.openGraph?.['og:article:author']) {
      enhanced.creator = rawMeta.openGraph['og:article:author'];
    }
    
    // Try meta author
    if (!enhanced.creator && rawMeta.other?.author) {
      enhanced.creator = rawMeta.other.author;
    }
    
    // Try JSON-LD Person/Organization author
    if (!enhanced.creator && rawMeta.jsonLd && Array.isArray(rawMeta.jsonLd)) {
      for (const ld of rawMeta.jsonLd) {
        if (ld.author) {
          const author = Array.isArray(ld.author) ? ld.author[0] : ld.author;
          if (typeof author === 'string') {
            enhanced.creator = author;
            break;
          } else if (author.name) {
            enhanced.creator = author.name;
            break;
          }
        }
      }
    }
    
    // Extract published date
    if (rawMeta.openGraph?.['og:article:published_time']) {
      enhanced.extra = enhanced.extra || {};
      enhanced.extra.publishedAt = rawMeta.openGraph['og:article:published_time'];
    }
  }
  
  // Twitter: Get display name from meta
  if (platformData.platform === 'twitter') {
    if (rawMeta.twitterCard?.['twitter:creator']) {
      const twitterCreator = rawMeta.twitterCard['twitter:creator'];
      if (!enhanced.creator || enhanced.creator === '@') {
        enhanced.creator = twitterCreator;
      }
    }
  }
  
  // Generic: Extract og:image for thumbnails
  if (rawMeta.openGraph?.['og:image']) {
    enhanced.extra = enhanced.extra || {};
    enhanced.extra.thumbnail = rawMeta.openGraph['og:image'];
  }
  
  // Extract content type from og:type
  if (rawMeta.openGraph?.['og:type']) {
    enhanced.extra = enhanced.extra || {};
    enhanced.extra.ogType = rawMeta.openGraph['og:type'];
  }
  
  return enhanced;
}

// Process a batch of bookmarks from the enrichment queue with parallel processing
// @param {number} batchSize - Number of bookmarks to process
// @param {Function} progressCallback - Callback for progress updates
// @param {number} concurrency - Number of parallel requests
// @param {Object} options - Additional options
// @param {boolean} options.force - Force re-enrichment even for recently enriched bookmarks
export async function processEnrichmentBatch(batchSize = 10, progressCallback = null, concurrency = 3, options = {}) {
  const { force = false } = options;
  
  try {
    const settings = await getSettings();
    if (!settings.enrichmentEnabled) {
      console.log('Enrichment is disabled');
      return { processed: 0, success: 0, failed: 0, skipped: 0 };
    }

    // Use settings concurrency if not explicitly provided
    const maxConcurrency = concurrency || settings.enrichmentConcurrency || 3;
    console.log(`Using concurrency: ${maxConcurrency} parallel requests${force ? ' (FORCE mode)' : ''}`);

    let bookmarksToProcess = [];
    let usingQueue = true;
    
    // In FORCE mode, directly get bookmarks instead of using the queue
    if (force) {
      const { getAllBookmarks } = await import('./db.js');
      const allBookmarks = await getAllBookmarks();
      
      // Get all HTTP/HTTPS bookmarks
      const httpBookmarks = allBookmarks.filter(b => 
        b.url && (b.url.startsWith('http://') || b.url.startsWith('https://'))
      );
      
      // Take batchSize number of bookmarks (prioritize unenriched, then oldest enriched)
      const unenriched = httpBookmarks.filter(b => !b.lastChecked);
      const enriched = httpBookmarks.filter(b => b.lastChecked)
        .sort((a, b) => a.lastChecked - b.lastChecked); // Oldest first
      
      // Combine: unenriched first, then oldest enriched
      const prioritized = [...unenriched, ...enriched].slice(0, batchSize);
      
      bookmarksToProcess = prioritized.map(b => ({
        bookmarkId: b.id,
        queueId: null, // Not from queue
        directProcess: true
      }));
      usingQueue = false;
      
      console.log(`FORCE mode: Selected ${bookmarksToProcess.length} bookmarks directly (${unenriched.length} unenriched, ${Math.max(0, bookmarksToProcess.length - unenriched.length)} for re-enrichment)`);
    } else {
      // Normal mode: use the enrichment queue
      const batch = await getNextEnrichmentBatch(batchSize);
      
      if (batch.length === 0) {
        // Queue empty - try to get unenriched bookmarks directly
        const { getAllBookmarks } = await import('./db.js');
        const allBookmarks = await getAllBookmarks();
        
        const unenrichedBookmarks = allBookmarks.filter(b => 
          b.url && 
          (b.url.startsWith('http://') || b.url.startsWith('https://')) &&
          !b.lastChecked
        ).slice(0, batchSize);
        
        if (unenrichedBookmarks.length === 0) {
          console.log('No bookmarks in enrichment queue and no unenriched bookmarks found');
          return { processed: 0, success: 0, failed: 0, skipped: 0 };
        }
        
        bookmarksToProcess = unenrichedBookmarks.map(b => ({
          bookmarkId: b.id,
          queueId: null,
          directProcess: true
        }));
        usingQueue = false;
        console.log(`Queue empty, found ${bookmarksToProcess.length} unenriched bookmarks to process`);
      } else {
        bookmarksToProcess = batch.map(item => ({
          bookmarkId: item.bookmarkId,
          queueId: item.id,
          directProcess: false
        }));
      }
    }
    
    if (bookmarksToProcess.length === 0) {
      console.log('No bookmarks to process');
      return { processed: 0, success: 0, failed: 0, skipped: 0 };
    }

    console.log(`Processing ${bookmarksToProcess.length} bookmarks with ${maxConcurrency} concurrent workers`);

    let success = 0;
    let failed = 0;
    let skipped = 0;
    let completed = 0;

    // Process bookmarks with concurrency control
    const processBookmark = async (item, index) => {
      try {
        const bookmark = await import('./db.js').then(m => m.getBookmark(item.bookmarkId));
        
        // Send progress update
        if (progressCallback && bookmark) {
          progressCallback({
            current: index + 1,
            total: bookmarksToProcess.length,
            completed: completed,
            bookmarkId: item.bookmarkId,
            url: bookmark.url,
            title: bookmark.title,
            status: 'processing'
          });
        }

        const result = await enrichBookmark(item.bookmarkId, { force });
        
        // Update counters
        if (result.success) {
          if (result.alreadyEnriched || result.skipped) {
            skipped++;
          } else {
            success++;
          }
        } else {
          if (result.skipped) {
            skipped++;
          } else {
            failed++;
          }
        }
        
        completed++;

        // Send completion update for this bookmark
        if (progressCallback && bookmark) {
          progressCallback({
            current: index + 1,
            total: bookmarksToProcess.length,
            completed: completed,
            bookmarkId: item.bookmarkId,
            url: bookmark.url,
            title: bookmark.title,
            status: result.success ? 'completed' : 'failed',
            result: result
          });
        }

        // Remove from queue if it was from the queue
        if (item.queueId && usingQueue) {
          await removeFromEnrichmentQueue(item.queueId);
        }
        
        return { success: true, result };
      } catch (error) {
        console.error(`Error processing bookmark ${item.bookmarkId}:`, error);
        failed++;
        completed++;
        
        if (item.queueId && usingQueue) {
          await removeFromEnrichmentQueue(item.queueId);
        }
        
        if (progressCallback) {
          progressCallback({
            current: index + 1,
            total: bookmarksToProcess.length,
            completed: completed,
            bookmarkId: item.bookmarkId,
            status: 'error',
            error: error.message
          });
        }
        
        return { success: false, error: error.message };
      }
    };

    // Process with concurrency limit using a worker pool
    const workers = [];
    let currentIndex = 0;

    const runWorker = async () => {
      while (currentIndex < bookmarksToProcess.length) {
        const index = currentIndex++;
        const item = bookmarksToProcess[index];
        await processBookmark(item, index);
        
        // Small delay between requests to be respectful
        if (currentIndex < bookmarksToProcess.length) {
          await sleep(50); // 50ms delay between starting new requests
        }
      }
    };

    // Start concurrent workers
    for (let i = 0; i < Math.min(maxConcurrency, bookmarksToProcess.length); i++) {
      workers.push(runWorker());
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    console.log(`Processed ${bookmarksToProcess.length} bookmarks: ${success} success, ${failed} failed, ${skipped} skipped`);
    return { processed: bookmarksToProcess.length, success, failed, skipped };
  } catch (error) {
    console.error('Error processing enrichment batch:', error);
    return { processed: 0, success: 0, failed: 0, skipped: 0, error: error.message };
  }
}

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export category rules for use in UI
export { CATEGORY_RULES, PATH_PATTERNS, CONTENT_KEYWORDS };

// ========== Deep Metadata Analysis (Re-analyze existing data without network requests) ==========

import { analyzeBookmarkMetadata } from './metadata-analyzer.js';
import { enhanceWithSchemaOrg } from './url-parsers.js';

/**
 * Re-analyze a bookmark's existing rawMetadata to extract deep insights
 * This does NOT make network requests - it only processes existing data
 * @param {Object} bookmark - Full bookmark object with rawMetadata
 * @returns {Object} - Updated bookmark object with new analysis fields
 */
export async function reanalyzeBookmark(bookmark) {
  if (!bookmark) {
    return { success: false, error: 'No bookmark provided' };
  }

  try {
    // Run deep metadata analysis on existing rawMetadata
    const analysis = analyzeBookmarkMetadata(bookmark);
    
    if (!analysis) {
      return { success: false, error: 'No metadata to analyze', skipped: true };
    }

    // Update bookmark with analyzed fields
    bookmark.readingTime = analysis.readingTime;
    bookmark.publishedDate = analysis.publishedDate;
    bookmark.contentQualityScore = analysis.contentQualityScore;
    bookmark.smartTags = analysis.smartTags;

    // Enhance platform data with Schema.org if available
    if (bookmark.rawMetadata && bookmark.platformData) {
      const enhancedPlatformData = enhanceWithSchemaOrg(bookmark.platformData, bookmark.rawMetadata);
      if (enhancedPlatformData) {
        bookmark.platformData = enhancedPlatformData;
        bookmark.contentType = enhancedPlatformData.type;
      }
    }

    // Save updated bookmark
    await upsertBookmark(bookmark);
    
    console.log(`Re-analyzed bookmark: ${bookmark.title} - Quality: ${analysis.contentQualityScore}, Reading time: ${analysis.readingTime || 'N/A'} min`);
    
    return { 
      success: true, 
      readingTime: analysis.readingTime,
      publishedDate: analysis.publishedDate,
      contentQualityScore: analysis.contentQualityScore,
      smartTagsCount: analysis.smartTags?.length || 0
    };
  } catch (error) {
    console.error(`Error re-analyzing bookmark ${bookmark.id}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Batch re-analyze bookmarks (process existing rawMetadata without network requests)
 * @param {Array<Object>} bookmarks - Array of bookmark objects to re-analyze
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Object} - Summary of re-analysis results
 */
export async function batchReanalyze(bookmarks, progressCallback = null) {
  if (!bookmarks || bookmarks.length === 0) {
    return { processed: 0, success: 0, failed: 0, skipped: 0 };
  }

  console.log(`Starting batch re-analysis of ${bookmarks.length} bookmarks...`);
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  let completed = 0;

  // Process in chunks to avoid blocking
  const chunkSize = 50;
  
  for (let i = 0; i < bookmarks.length; i += chunkSize) {
    const chunk = bookmarks.slice(i, i + chunkSize);
    
    for (let j = 0; j < chunk.length; j++) {
      const bookmark = chunk[j];
      const globalIndex = i + j;
      
      try {
        // Check if bookmark has rawMetadata to analyze
        if (!bookmark.rawMetadata || Object.keys(bookmark.rawMetadata).length === 0) {
          skipped++;
          completed++;
          
          if (progressCallback) {
            progressCallback({
              current: globalIndex + 1,
              total: bookmarks.length,
              completed: completed,
              bookmarkId: bookmark.id,
              title: bookmark.title,
              status: 'skipped',
              reason: 'No metadata to analyze'
            });
          }
          continue;
        }

        const result = await reanalyzeBookmark(bookmark);
        
        if (result.success) {
          success++;
        } else if (result.skipped) {
          skipped++;
        } else {
          failed++;
        }
        completed++;
        
        if (progressCallback) {
          progressCallback({
            current: globalIndex + 1,
            total: bookmarks.length,
            completed: completed,
            bookmarkId: bookmark.id,
            title: bookmark.title,
            status: result.success ? 'completed' : (result.skipped ? 'skipped' : 'failed'),
            result: result
          });
        }
      } catch (error) {
        console.error(`Error re-analyzing bookmark ${bookmark.id}:`, error);
        failed++;
        completed++;
        
        if (progressCallback) {
          progressCallback({
            current: globalIndex + 1,
            total: bookmarks.length,
            completed: completed,
            bookmarkId: bookmark.id,
            title: bookmark.title,
            status: 'error',
            error: error.message
          });
        }
      }
    }
    
    // Small delay between chunks to allow UI to update
    if (i + chunkSize < bookmarks.length) {
      await sleep(100);
    }
  }

  console.log(`Re-analysis complete: ${success} analyzed, ${failed} failed, ${skipped} skipped`);
  return { processed: bookmarks.length, success, failed, skipped };
}
