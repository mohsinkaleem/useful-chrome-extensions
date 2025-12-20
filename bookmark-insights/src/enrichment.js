// Enrichment engine for bookmark metadata fetching and processing
// Handles background enrichment, dead-link checking, and auto-categorization

import { getSettings, getNextEnrichmentBatch, removeFromEnrichmentQueue, upsertBookmark, getBookmark, logEvent } from './db.js';

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
export async function enrichBookmark(bookmarkId) {
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

    // Skip if already enriched (has description or category)
    if (bookmark.description || bookmark.category) {
      console.log(`Skipping already enriched bookmark: ${bookmark.title}`);
      return { success: true, skipped: true, alreadyEnriched: true };
    }

    console.log(`Enriching bookmark: ${bookmark.title} (${bookmark.url})`);

    // Check dead links first (quick HEAD request)
    const isAlive = await checkBookmarkAlive(bookmark.url);
    
    // If dead, just update the isAlive status and skip metadata fetching
    if (isAlive === false) {
      bookmark.isAlive = false;
      bookmark.lastChecked = Date.now();
      await upsertBookmark(bookmark);
      await logEvent(bookmarkId, 'enrichment', { isAlive: false });
      return { success: true, isAlive: false, skipped: true };
    }

    // Fetch page metadata
    const metadata = await fetchPageMetadata(bookmark.url);
    
    // Auto-categorize
    const category = categorizeBookmark(bookmark, metadata);

    // Update bookmark with enriched data
    bookmark.description = metadata.description || bookmark.description;
    bookmark.keywords = metadata.keywords || bookmark.keywords;
    bookmark.category = category || bookmark.category;
    bookmark.isAlive = isAlive;
    bookmark.lastChecked = Date.now();
    bookmark.faviconUrl = metadata.faviconUrl || bookmark.faviconUrl;
    bookmark.contentSnippet = metadata.snippet || bookmark.contentSnippet;
    bookmark.rawMetadata = metadata.rawMetadata || bookmark.rawMetadata; // Store comprehensive metadata

    await upsertBookmark(bookmark);
    await logEvent(bookmarkId, 'enrichment', { 
      success: true, 
      category, 
      hasDescription: !!metadata.description 
    });

    return { 
      success: true, 
      category, 
      description: metadata.description,
      isAlive 
    };
  } catch (error) {
    console.error(`Error enriching bookmark ${bookmarkId}:`, error);
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
    
    // Parse HTML to extract metadata
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract comprehensive raw metadata for future analysis
    const rawMetadata = {
      meta: {},
      openGraph: {},
      twitterCard: {},
      jsonLd: [],
      other: {}
    };

    // Extract all meta tags
    doc.querySelectorAll('meta').forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property');
      const content = meta.getAttribute('content');
      if (name && content) {
        if (name.startsWith('og:')) {
          rawMetadata.openGraph[name] = content;
        } else if (name.startsWith('twitter:')) {
          rawMetadata.twitterCard[name] = content;
        } else {
          rawMetadata.meta[name] = content;
        }
      }
    });

    // Extract JSON-LD structured data
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        rawMetadata.jsonLd.push(data);
      } catch (e) {
        // Ignore invalid JSON-LD
      }
    });

    // Extract other useful tags
    const titleTag = doc.querySelector('title');
    if (titleTag) rawMetadata.other.title = titleTag.textContent;
    
    const canonicalLink = doc.querySelector('link[rel="canonical"]');
    if (canonicalLink) rawMetadata.other.canonical = canonicalLink.getAttribute('href');
    
    const langAttr = doc.documentElement.getAttribute('lang');
    if (langAttr) rawMetadata.other.language = langAttr;

    const author = doc.querySelector('meta[name="author"]');
    if (author) rawMetadata.other.author = author.getAttribute('content');

    // Extract processed metadata for immediate use
    const metadata = {
      description: null,
      keywords: [],
      faviconUrl: null,
      snippet: null,
      rawMetadata: rawMetadata // Include comprehensive raw data
    };

    // Get description from meta tags
    const ogDescription = doc.querySelector('meta[property="og:description"]');
    const metaDescription = doc.querySelector('meta[name="description"]');
    const twitterDescription = doc.querySelector('meta[name="twitter:description"]');
    
    metadata.description = 
      ogDescription?.content || 
      metaDescription?.content || 
      twitterDescription?.content ||
      null;

    // Get keywords from meta tags
    const metaKeywords = doc.querySelector('meta[name="keywords"]');
    if (metaKeywords && metaKeywords.content) {
      metadata.keywords = metaKeywords.content
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0)
        .slice(0, 10); // Limit to 10 keywords
    }

    // Get favicon
    const faviconLink = doc.querySelector('link[rel="icon"]') || 
                       doc.querySelector('link[rel="shortcut icon"]');
    if (faviconLink) {
      const faviconHref = faviconLink.getAttribute('href');
      if (faviconHref) {
        metadata.faviconUrl = new URL(faviconHref, url).href;
      }
    }

    // Get snippet from first paragraph or text content
    const firstParagraph = doc.querySelector('article p, main p, p');
    if (firstParagraph && firstParagraph.textContent) {
      metadata.snippet = firstParagraph.textContent.trim().substring(0, 200);
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

// Process a batch of bookmarks from the enrichment queue
export async function processEnrichmentBatch(batchSize = 10, progressCallback = null) {
  try {
    const settings = await getSettings();
    if (!settings.enrichmentEnabled) {
      console.log('Enrichment is disabled');
      return { processed: 0, success: 0, failed: 0, skipped: 0 };
    }

    const batch = await getNextEnrichmentBatch(batchSize);
    if (batch.length === 0) {
      console.log('No bookmarks in enrichment queue');
      return { processed: 0, success: 0, failed: 0, skipped: 0 };
    }

    console.log(`Processing ${batch.length} bookmarks from enrichment queue`);

    let success = 0;
    let failed = 0;
    let skipped = 0;
    let currentIndex = 0;

    for (const queueItem of batch) {
      try {
        currentIndex++;
        const bookmark = await import('./db.js').then(m => m.getBookmark(queueItem.bookmarkId));
        
        // Send progress update
        if (progressCallback && bookmark) {
          progressCallback({
            current: currentIndex,
            total: batch.length,
            bookmarkId: queueItem.bookmarkId,
            url: bookmark.url,
            title: bookmark.title,
            status: 'processing'
          });
        }

        // Rate limiting
        await sleep(settings.enrichmentRateLimit || 1000);

        const result = await enrichBookmark(queueItem.bookmarkId);
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

        // Send completion update for this bookmark
        if (progressCallback && bookmark) {
          progressCallback({
            current: currentIndex,
            total: batch.length,
            bookmarkId: queueItem.bookmarkId,
            url: bookmark.url,
            title: bookmark.title,
            status: result.success ? 'completed' : 'failed',
            result: result
          });
        }

        // Remove from queue regardless of success/failure
        await removeFromEnrichmentQueue(queueItem.queueId);
      } catch (error) {
        console.error(`Error processing bookmark ${queueItem.bookmarkId}:`, error);
        failed++;
        await removeFromEnrichmentQueue(queueItem.queueId);
        
        if (progressCallback) {
          progressCallback({
            current: currentIndex,
            total: batch.length,
            bookmarkId: queueItem.bookmarkId,
            status: 'error',
            error: error.message
          });
        }
      }
    }

    console.log(`Processed ${batch.length} bookmarks: ${success} success, ${failed} failed, ${skipped} skipped`);
    return { processed: batch.length, success, failed, skipped };
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
