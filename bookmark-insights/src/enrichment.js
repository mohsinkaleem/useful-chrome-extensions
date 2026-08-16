// Enrichment engine for bookmark metadata fetching and processing
// Handles background enrichment, dead-link checking, and auto-categorization

import {
  getSettings,
  getNextEnrichmentBatch,
  removeFromEnrichmentQueue,
  upsertBookmark,
  bulkUpsertBookmarks,
  getBookmark,
  getAllBookmarks,
  logEvent,
  invalidateMetricCaches,
} from './db.js';
import { runDeepAnalysis } from './analysis-client.js';
import { isEnrichable, isEnriched, isPendingEnrichment } from './predicates.js';
import { parseBookmarkUrl } from './url-parsers.js';
import { safeFetch, isFetchableUrl, safeImageUrl } from './url-safety.js';

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
  'etsy.com': 'shopping',
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
  '/watch': 'video',
};

// Content-based keyword detection
const CONTENT_KEYWORDS = {
  tutorial: 'tutorial',
  guide: 'tutorial',
  'how to': 'tutorial',
  documentation: 'documentation',
  docs: 'documentation',
  api: 'api',
  reference: 'reference',
  blog: 'blog',
  article: 'blog',
  news: 'news',
  video: 'video',
  course: 'education',
  learning: 'education',
  tool: 'tool',
  app: 'tool',
  software: 'tool',
};

// Enrich a single bookmark by fetching its metadata
// @param {string} bookmarkId - The bookmark ID to enrich
// @param {Object} options - Options for enrichment
// @param {boolean} options.force - Force re-enrichment even if recently enriched
export async function enrichBookmark(bookmarkId, options = {}) {
  const { force = false } = options;

  try {
    const settings = await getSettings();

    // Privacy mode is a hard stop: no outbound request for any bookmark, and
    // force does not override it.
    if (settings.privacyMode) {
      return { success: false, error: 'Privacy mode enabled', skipped: true };
    }

    const bookmark = await getBookmark(bookmarkId);
    if (!bookmark) {
      console.log(`Bookmark ${bookmarkId} not found`);
      return { success: false, error: 'Bookmark not found' };
    }

    // Only enrich public http/https URLs - never reach into private or loopback ranges
    if (!isFetchableUrl(bookmark.url)) {
      console.log(`Skipping non-fetchable bookmark: ${bookmark.url}`);
      // Write the terminal state once, otherwise this row stays "pending
      // enrichment" forever and is re-queued on every sync.
      if (bookmark.enrichable !== false) {
        bookmark.enrichable = false;
        await upsertBookmark(bookmark);
      }
      return { success: false, error: 'Not a public HTTP URL', skipped: true };
    }

    // Skip if recently enriched (based on freshness settings) - unless force is true
    if (!force) {
      const freshnessDays = settings.enrichmentFreshnessDays || 30;
      const freshnessThreshold = Date.now() - freshnessDays * 24 * 60 * 60 * 1000;

      if (bookmark.lastChecked && bookmark.lastChecked > freshnessThreshold) {
        console.log(
          `Skipping recently enriched bookmark: ${bookmark.title} (last checked: ${new Date(bookmark.lastChecked).toLocaleDateString()})`,
        );
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
      // Topics will be detected separately via Deep Analysis
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
    // lastChecked is the retry guard and is stamped on failures too; enrichedAt
    // marks an actual successful metadata fetch and drives every user-facing count.
    bookmark.enrichedAt = Date.now();
    bookmark.enrichable = true;
    bookmark.enrichmentError = null;
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

    // Topics will be detected separately via Deep Analysis - not during enrichment
    // This keeps enrichment fast and allows users to control when topics are generated

    await upsertBookmark(bookmark);
    await logEvent(bookmarkId, 'enrichment', {
      success: true,
      category,
      platform: enrichedPlatformData?.platform,
      hasDescription: !!metadata.description,
    });

    return {
      success: true,
      category,
      description: metadata.description,
      platform: enrichedPlatformData?.platform,
      isAlive,
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

// Per-hostname politeness. The worker pool used to fire `concurrency` requests
// with a flat 50 ms gap regardless of target, so a folder of 200 GitHub links
// meant 200 requests to one host as fast as the pool allowed. Each host now has
// its own minimum spacing, and 429/503 responses extend it via Retry-After.
const HOST_MIN_INTERVAL_MS = 1000;
const HOST_MAX_BACKOFF_MS = 5 * 60 * 1000;
const hostNextAllowedAt = new Map();

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function awaitHostSlot(url) {
  const host = hostOf(url);
  if (!host) return;

  const now = Date.now();
  const startAt = Math.max(now, hostNextAllowedAt.get(host) || 0);
  // Reserve the slot before yielding, so concurrent workers queue behind each
  // other instead of all reading the same timestamp and firing together.
  hostNextAllowedAt.set(host, startAt + HOST_MIN_INTERVAL_MS);
  if (startAt > now) await sleep(startAt - now);
}

function noteHostResponse(url, response) {
  if (!response || (response.status !== 429 && response.status !== 503)) return;

  const host = hostOf(url);
  if (!host) return;

  const seconds = Number(response.retryAfter);
  const delay =
    Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : HOST_MIN_INTERVAL_MS * 10;
  hostNextAllowedAt.set(host, Date.now() + Math.min(delay, HOST_MAX_BACKOFF_MS));
}

// Check if a bookmark URL is still alive
async function checkBookmarkAlive(url) {
  if (!isFetchableUrl(url)) return null;

  await awaitHostSlot(url);

  try {
    const response = await safeFetch(url, { method: 'HEAD', timeout: 5000, readBody: false });
    noteHostResponse(url, response);
    // Consider 2xx and 3xx as alive
    return response.ok || (response.status >= 300 && response.status < 400);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Timeout checking ${url}`);
      return null; // Unknown - timeout
    }

    // Some servers reject HEAD; retry once with a ranged GET before declaring it dead.
    await awaitHostSlot(url);
    try {
      const response = await safeFetch(url, { method: 'GET', timeout: 5000, maxBytes: 1024 });
      noteHostResponse(url, response);
      return response.ok || (response.status >= 300 && response.status < 400);
    } catch (error2) {
      if (error2.name === 'AbortError') return null;
      console.log(`Error checking ${url}:`, error2.message);
      return false; // Likely dead
    }
  }
}

// Fetch metadata from a web page
async function fetchPageMetadata(url) {
  await awaitHostSlot(url);

  try {
    const response = await safeFetch(url, {
      timeout: 10000,
      expectContentType: /text\/html|application\/xhtml\+xml/i,
    });
    noteHostResponse(url, response);

    if (!response.ok || !response.body) {
      return {};
    }

    const html = response.body;

    // Parse HTML using regex (service worker compatible - no DOMParser available)

    // Extract comprehensive raw metadata for future analysis
    const rawMetadata = {
      meta: {},
      openGraph: {},
      twitterCard: {},
      jsonLd: [],
      other: {},
    };

    // Clean HTML for better content extraction
    // Remove scripts, styles, navs, headers, footers to avoid noise
    const cleanHtml = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gim, '')
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gim, '')
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gim, '')
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gim, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract all meta tags using regex.
    // Read from cleanHtml so values inside <script> bodies or comments can't be injected.
    const metaTagRegex = /<meta\s+([^>]*?)>/gi;
    let metaMatch;

    while ((metaMatch = metaTagRegex.exec(cleanHtml)) !== null) {
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

    // Extract JSON-LD structured data.
    // Must read raw html - cleanHtml has already stripped every <script> block.
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
    const titleMatch = cleanHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      rawMetadata.other.title = titleMatch[1].trim();
    }

    // Extract canonical link
    const canonicalMatch =
      cleanHtml.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) ||
      cleanHtml.match(/<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i);
    if (canonicalMatch) {
      rawMetadata.other.canonical = canonicalMatch[1];
    }

    // Extract language attribute
    const langMatch = cleanHtml.match(/<html[^>]*\slang=["']([^"']+)["']/i);
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
      rawMetadata: rawMetadata, // Include comprehensive raw data
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
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
        .slice(0, 10); // Limit to 10 keywords
    }

    // Get favicon using regex
    const faviconMatch = cleanHtml.match(
      /<link\s+([^>]*rel=["'](?:icon|shortcut icon)["'][^>]*)>/i,
    );
    if (faviconMatch) {
      const hrefMatch = faviconMatch[1].match(/href=["']([^"']+)["']/i);
      if (hrefMatch) {
        metadata.faviconUrl = safeImageUrl(hrefMatch[1], url);
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
      if (
        text.length > 50 &&
        !text.toLowerCase().includes('cookie') &&
        !text.toLowerCase().includes('copyright')
      ) {
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
function categorizeBookmark(bookmark, metadata = {}) {
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
          const channelItem = ld.itemListElement.find(
            (item) => item.item && item.item['@id'] && item.item['@id'].includes('/channel/'),
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
        const potentialTopics = topicsMatch[1]
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0 && t.length < 30);
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
  if (
    platformData.platform === 'medium' ||
    platformData.platform === 'devto' ||
    platformData.platform === 'substack'
  ) {
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
    const thumbnail = safeImageUrl(rawMeta.openGraph['og:image']);
    if (thumbnail) {
      enhanced.extra = enhanced.extra || {};
      enhanced.extra.thumbnail = thumbnail;
    }
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
export async function processEnrichmentBatch(
  batchSize = 10,
  progressCallback = null,
  concurrency = 3,
  options = {},
) {
  const { force = false } = options;

  try {
    const settings = await getSettings();
    if (!settings.enrichmentEnabled || settings.privacyMode) {
      console.log(settings.privacyMode ? 'Privacy mode is on' : 'Enrichment is disabled');
      return { processed: 0, success: 0, failed: 0, skipped: 0 };
    }

    // Use settings concurrency if not explicitly provided
    const maxConcurrency = concurrency || settings.enrichmentConcurrency || 3;
    console.log(
      `Using concurrency: ${maxConcurrency} parallel requests${force ? ' (FORCE mode)' : ''}`,
    );

    let bookmarksToProcess = [];
    let usingQueue = true;

    // In FORCE mode, directly get bookmarks instead of using the queue
    if (force) {
      const allBookmarks = await getAllBookmarks();

      // Get all HTTP/HTTPS bookmarks
      const httpBookmarks = allBookmarks.filter(isEnrichable);

      // Take batchSize number of bookmarks (prioritize unenriched, then oldest enriched)
      const unenriched = httpBookmarks.filter((b) => !isEnriched(b));
      const enriched = httpBookmarks
        .filter(isEnriched)
        .sort(
          (a, b) => (a.enrichedAt || a.lastChecked || 0) - (b.enrichedAt || b.lastChecked || 0),
        ); // Oldest first

      // Combine: unenriched first, then oldest enriched
      const prioritized = [...unenriched, ...enriched].slice(0, batchSize);

      bookmarksToProcess = prioritized.map((b) => ({
        bookmarkId: b.id,
        queueId: null, // Not from queue
        directProcess: true,
      }));
      usingQueue = false;

      console.log(
        `FORCE mode: Selected ${bookmarksToProcess.length} bookmarks directly (${unenriched.length} unenriched, ${Math.max(0, bookmarksToProcess.length - unenriched.length)} for re-enrichment)`,
      );
    } else {
      // Normal mode: use the enrichment queue
      const batch = await getNextEnrichmentBatch(batchSize);

      if (batch.length === 0) {
        // Queue empty - try to get unenriched bookmarks directly
        const allBookmarks = await getAllBookmarks();

        const unenrichedBookmarks = allBookmarks.filter(isPendingEnrichment).slice(0, batchSize);

        if (unenrichedBookmarks.length === 0) {
          console.log('No bookmarks in enrichment queue and no unenriched bookmarks found');
          return { processed: 0, success: 0, failed: 0, skipped: 0 };
        }

        bookmarksToProcess = unenrichedBookmarks.map((b) => ({
          bookmarkId: b.id,
          queueId: null,
          directProcess: true,
        }));
        usingQueue = false;
        console.log(
          `Queue empty, found ${bookmarksToProcess.length} unenriched bookmarks to process`,
        );
      } else {
        bookmarksToProcess = batch.map((item) => ({
          bookmarkId: item.bookmarkId,
          queueId: item.queueId,
          directProcess: false,
        }));
      }
    }

    if (bookmarksToProcess.length === 0) {
      console.log('No bookmarks to process');
      return { processed: 0, success: 0, failed: 0, skipped: 0 };
    }

    console.log(
      `Processing ${bookmarksToProcess.length} bookmarks with ${maxConcurrency} concurrent workers`,
    );

    let success = 0;
    let failed = 0;
    let skipped = 0;
    let completed = 0;

    // Process bookmarks with concurrency control
    const processBookmark = async (item, index) => {
      try {
        const bookmark = await getBookmark(item.bookmarkId);

        // Send progress update
        if (progressCallback && bookmark) {
          progressCallback({
            current: index + 1,
            total: bookmarksToProcess.length,
            completed: completed,
            bookmarkId: item.bookmarkId,
            url: bookmark.url,
            title: bookmark.title,
            status: 'processing',
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
            result: result,
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
            error: error.message,
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

    if (success > 0) {
      await invalidateMetricCaches('enrich');
    }

    console.log(
      `Processed ${bookmarksToProcess.length} bookmarks: ${success} success, ${failed} failed, ${skipped} skipped`,
    );
    return { processed: bookmarksToProcess.length, success, failed, skipped };
  } catch (error) {
    console.error('Error processing enrichment batch:', error);
    return { processed: 0, success: 0, failed: 0, skipped: 0, error: error.message };
  }
}

// Helper function to sleep
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========== Deep Metadata Analysis (Re-analyze existing data without network requests) ==========

/**
 * Batch re-analyze bookmarks (process existing rawMetadata without network requests)
 *
 * Each chunk is scored in the analysis worker and written back with a single
 * bulkPut. The previous version ran the analysis on the UI thread and issued one
 * `put` per bookmark, each of which dropped the corpus cache — so the next read
 * re-scanned the whole table, ~3,700 times over a full run.
 *
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

  const chunkSize = 50;

  for (let i = 0; i < bookmarks.length; i += chunkSize) {
    const chunk = bookmarks.slice(i, i + chunkSize);
    const updates = [];

    let patches;
    try {
      patches = await runDeepAnalysis(chunk);
    } catch (error) {
      console.error('Deep analysis chunk failed:', error);
      patches = chunk.map(() => undefined);
    }

    for (let j = 0; j < chunk.length; j++) {
      const bookmark = chunk[j];
      const patch = patches[j];
      completed++;

      let status;
      if (patch === undefined) {
        failed++;
        status = 'failed';
      } else if (patch === null) {
        skipped++;
        status = 'skipped';
      } else {
        updates.push({ ...bookmark, ...patch });
        success++;
        status = 'completed';
      }

      if (progressCallback) {
        progressCallback({
          current: i + j + 1,
          total: bookmarks.length,
          completed,
          bookmarkId: bookmark.id,
          title: bookmark.title,
          status,
          reason: status === 'skipped' ? 'No metadata to analyze' : undefined,
        });
      }
    }

    if (updates.length > 0) {
      await bulkUpsertBookmarks(updates);
    }

    // Yield so the UI can paint between chunks
    if (i + chunkSize < bookmarks.length) {
      await sleep(0);
    }
  }

  if (success > 0) {
    await invalidateMetricCaches('enrich');
  }

  console.log(`Re-analysis complete: ${success} analyzed, ${failed} failed, ${skipped} skipped`);
  return { processed: bookmarks.length, success, failed, skipped };
}
