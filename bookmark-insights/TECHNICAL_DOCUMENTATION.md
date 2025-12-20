# Bookmark Insights - Technical Documentation

**Version:** 2.0  
**Last Updated:** December 20, 2025

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Database Schema](#database-schema)
- [Enrichment System](#enrichment-system)
- [Search & Similarity](#search--similarity)
- [Insights & Analytics](#insights--analytics)
- [Performance & Optimization](#performance--optimization)
- [Privacy & Security](#privacy--security)

---

## Architecture Overview

### Technology Stack
- **UI Framework**: Svelte 4.0 (compiled to vanilla JavaScript)
- **Database**: IndexedDB via Dexie.js v3.x
- **Search**: FlexSearch.js (document-based with weighted fields)
- **Similarity**: Custom TF-IDF with cosine similarity
- **Charts**: Chart.js 4.x for visualizations
- **Styling**: Tailwind CSS 3.x
- **Build System**: Rollup with ES modules

### Component Architecture
```
┌─────────────────────────────────────────────────┐
│              Chrome Extension                    │
├─────────────────────────────────────────────────┤
│  Popup (384x384)    │    Dashboard (Full Page)  │
│  - Quick Search     │    - Bookmarks Tab        │
│  - Recent Items     │    - Insights Tab         │
│  - Dashboard Link   │    - Health Tab           │
├─────────────────────────────────────────────────┤
│         Background Service Worker                │
│  - Bookmark Event Listeners                      │
│  - Enrichment Queue Manager                      │
│  - Tab Monitoring (opt-in)                       │
│  - Message Router                                │
├─────────────────────────────────────────────────┤
│              IndexedDB Layer (Dexie)            │
│  - bookmarks, enrichmentQueue, events           │
│  - cache, settings                              │
└─────────────────────────────────────────────────┘
```

### File Structure
```
src/
├── db.js                   # IndexedDB schema & core operations
├── enrichment.js           # Enrichment pipeline & metadata fetching
├── search.js               # FlexSearch integration
├── similarity.js           # TF-IDF similarity engine
├── insights.js             # Analytics & insights generation
├── utils.js                # Shared utilities
├── *.svelte                # UI components
├── popup.js                # Popup entry point
└── dashboard.js            # Dashboard entry point

background-new.js            # Service worker source
rollup.config.js            # Build configuration
tailwind.config.js          # Tailwind CSS configuration
```

---

## Database Schema

### Version History
- **v1**: Initial schema with basic tables
- **v2**: Added `rawMetadata` field for comprehensive metadata storage

### Tables

#### `bookmarks`
Primary bookmark storage with enrichment data.

**Indexes:** `id` (primary), `url`, `title`, `domain`, `category`, `dateAdded`, `lastAccessed`, `lastChecked`, `isAlive`, `parentId`

**Schema:**
```javascript
{
  // Core Chrome bookmark fields
  id: String,                    // Chrome bookmark ID
  url: String,                   // Bookmark URL
  title: String,                 // Bookmark title
  domain: String,                // Extracted domain (e.g., "github.com")
  dateAdded: Number,             // Timestamp (ms)
  folderPath: String,            // Full folder path
  parentId: String,              // Parent folder ID
  
  // Enrichment fields
  description: String | null,    // Meta description
  keywords: String[],            // Meta keywords (max 10)
  category: String | null,       // Auto-categorized type
  tags: String[],                // User tags (future)
  isAlive: Boolean | null,       // Link health: true/false/null
  lastChecked: Number | null,    // Last enrichment timestamp
  faviconUrl: String | null,     // Cached favicon URL
  contentSnippet: String | null, // First paragraph (200 chars max)
  
  // Behavioral tracking (opt-in)
  lastAccessed: Number | null,   // Last visit timestamp
  accessCount: Number,           // Visit counter
  
  // Raw metadata storage (v2+)
  rawMetadata: {
    meta: Object,                // All meta tags
    openGraph: Object,           // og:* properties
    twitterCard: Object,         // twitter:* properties
    jsonLd: Array,               // JSON-LD structured data
    other: {
      title: String,
      canonical: String,
      language: String,
      author: String
    }
  }
}
```

#### `enrichmentQueue`
Queue for pending enrichment tasks.

**Indexes:** `queueId` (auto-increment), `bookmarkId`, `priority`

**Schema:**
```javascript
{
  queueId: Number,               // Auto-increment
  bookmarkId: String,            // Reference to bookmark
  addedAt: Number,               // Timestamp
  priority: Number               // Higher = processed first (0-10)
}
```

#### `events`
Event logging for analytics.

**Indexes:** `eventId` (auto-increment), `bookmarkId`, `type`, `timestamp`

**Schema:**
```javascript
{
  eventId: Number,               // Auto-increment
  bookmarkId: String,            // Reference to bookmark
  type: String,                  // 'create', 'delete', 'update', 'access', 'enrichment'
  timestamp: Number,             // Event timestamp
  ...metadata                    // Additional event-specific data
}
```

#### `cache`
Performance caching for computed results.

**Indexes:** `key` (primary)

**Schema:**
```javascript
{
  key: String,                   // Cache key
  value: Any,                    // Cached value
  timestamp: Number,             // Cache creation time
  ttl: Number | null             // Time-to-live (ms), null = no expiry
}
```

#### `settings`
User preferences and configuration.

**Indexes:** `key` (primary)

**Schema:**
```javascript
{
  key: String,                   // Setting key (e.g., 'app')
  
  // Enrichment settings
  enrichmentEnabled: Boolean,
  enrichmentSchedule: String,    // 'manual' only
  enrichmentBatchSize: Number,   // 5-100
  enrichmentConcurrency: Number, // 1-10 parallel requests
  enrichmentRateLimit: Number,   // Deprecated (legacy)
  enrichmentFreshnessDays: Number, // Re-enrich after N days (0 = always)
  
  // Feature toggles
  autoCategorizationEnabled: Boolean,
  deadLinkCheckEnabled: Boolean,
  privacyMode: Boolean,
  trackBrowsingBehavior: Boolean,
  
  ...other settings
}
```

**Defaults:**
```javascript
{
  enrichmentEnabled: true,
  enrichmentSchedule: 'manual',
  enrichmentBatchSize: 20,
  enrichmentConcurrency: 3,
  enrichmentRateLimit: 1000,
  enrichmentFreshnessDays: 30,
  autoCategorizationEnabled: true,
  deadLinkCheckEnabled: true,
  privacyMode: false,
  trackBrowsingBehavior: false
}
```

---

## Enrichment System

### How It Works

1. **Queue Management**
   - New bookmarks automatically added to `enrichmentQueue` with priority 10
   - Updated bookmarks re-queued with priority 5
   - Manual enrichment processes highest priority first

2. **Enrichment Pipeline** (src/enrichment.js)
   ```
   Get Bookmark → Check Freshness → Check Link Health → Fetch Metadata → Categorize → Store
   ```

3. **Parallel Processing**
   - Worker pool pattern with configurable concurrency (1-10)
   - Default: 3 parallel workers
   - 100ms delay between starting new requests
   - Graceful error handling per bookmark

### Enrichment Process Details

#### Step 1: Freshness Check
```javascript
// Skip if enriched within freshness period
const freshnessDays = settings.enrichmentFreshnessDays || 30;
const threshold = Date.now() - (freshnessDays * 24 * 60 * 60 * 1000);

if (bookmark.lastChecked && bookmark.lastChecked > threshold) {
  return { skipped: true, alreadyEnriched: true };
}
```

**Why `lastChecked` instead of `description || category`?**
- ✅ More reliable - dedicated tracking field
- ✅ Allows periodic re-enrichment (configurable)
- ✅ Handles partial failures gracefully
- ✅ Consistent with dead-link checking pattern
- ✅ Can force re-enrichment by clearing field or setting freshnessDays=0

#### Step 2: Dead Link Detection
```javascript
// Quick HEAD request (5s timeout)
const response = await fetch(url, { method: 'HEAD', signal: abortSignal });

if (response.ok || (response.status >= 300 && response.status < 400)) {
  return true; // Alive
}

// Fallback to GET with no-cors mode
const fallback = await fetch(url, { method: 'GET', mode: 'no-cors' });
return null; // Unknown (CORS blocked but reachable)
```

**Three-state system:**
- `true` - Link is alive (2xx or 3xx response)
- `false` - Link is dead (timeout or error)
- `null` - Unknown (CORS blocked but request succeeded)

#### Step 3: Metadata Extraction
Fetches page HTML and extracts:

**Processed fields:**
- `description` - Priority: og:description > meta description > twitter:description
- `keywords` - From meta keywords tag (max 10, comma-separated)
- `faviconUrl` - Resolved favicon link href
- `snippet` - First `<p>` tag content (200 chars, HTML entities decoded)

**Raw metadata object:**
```javascript
rawMetadata: {
  meta: {
    "description": "...",
    "keywords": "...",
    "author": "...",
    "viewport": "...",
    // ... all meta tags
  },
  openGraph: {
    "og:title": "...",
    "og:description": "...",
    "og:image": "...",
    "og:type": "...",
    // ... all og:* tags
  },
  twitterCard: {
    "twitter:card": "summary_large_image",
    "twitter:title": "...",
    // ... all twitter:* tags
  },
  jsonLd: [
    { "@type": "Article", ... },
    // ... all JSON-LD scripts
  ],
  other: {
    title: "Page <title>",
    canonical: "https://...",
    language: "en",
    author: "..."
  }
}
```

**Why store raw metadata?**
- Future AI/LLM analysis
- Richer categorization models
- Content change detection
- Advanced insights generation

**Extraction method:**
- Uses regex patterns (no DOM parser in service workers)
- Handles malformed HTML gracefully
- 5-second timeout per request
- Minimal memory footprint

#### Step 4: Auto-Categorization

**Three-tier detection system:**

1. **Domain Rules** (highest priority)
   ```javascript
   {
     'github.com': 'code',
     'youtube.com': 'video',
     'twitter.com': 'social',
     'medium.com': 'blog',
     'wikipedia.org': 'reference',
     // ... 20+ domain patterns
   }
   ```

2. **URL Path Patterns**
   ```javascript
   {
     '/docs': 'documentation',
     '/api': 'api',
     '/tutorial': 'tutorial',
     '/blog': 'blog',
     // ... 10+ path patterns
   }
   ```

3. **Content Keywords** (in title + description)
   ```javascript
   {
     'tutorial': 'tutorial',
     'documentation': 'documentation',
     'api': 'api',
     'video': 'video',
     'course': 'education',
     // ... 15+ keyword patterns
   }
   ```

**Categories:** code, video, social, blog, reference, documentation, api, tutorial, news, education, tool, shopping, and more.

### Performance Characteristics

**Sequential Processing:**
- Speed: ~1 bookmark/second
- 20 bookmarks: ~20 seconds
- 100 bookmarks: ~100 seconds

**Parallel Processing (concurrency=3):**
- Speed: ~3 bookmarks/second
- 20 bookmarks: ~7 seconds
- 100 bookmarks: ~33 seconds

**Parallel Processing (concurrency=5):**
- Speed: ~5 bookmarks/second
- 20 bookmarks: ~4 seconds
- 100 bookmarks: ~20 seconds

**Recommendations:**
- Concurrency 3: Balanced performance (default)
- Concurrency 5: Fast bulk processing
- Concurrency 10: Maximum speed (resource intensive)

### Real-Time Progress Tracking

**Progress callback structure:**
```javascript
{
  current: Number,        // Current bookmark (1-based)
  total: Number,          // Total in batch
  completed: Number,      // Completed so far
  bookmarkId: String,     // Current bookmark ID
  url: String,            // Current URL
  title: String,          // Current title
  status: String,         // 'processing' | 'completed' | 'failed' | 'error'
  result: Object          // Enrichment result
}
```

**UI Components:**
- Progress bar with percentage
- Current bookmark display (title + URL)
- Results summary (success/failed/skipped counts)
- Detailed logs (collapsible, last 100 entries)
- Status icons (⏳ processing, ✓ completed, ✗ failed)

---

## Search & Similarity

### FlexSearch Integration

**Index Configuration:**
```javascript
{
  tokenize: 'forward',
  threshold: 0,
  resolution: 9,
  depth: 2,
  doc: {
    id: 'id',
    field: ['title', 'url', 'description', 'keywords', 'category', 'domain']
  }
}
```

**Field Boosting:**
- `title`: 3x weight (most important)
- `category`: 2x weight
- `keywords`: 2x weight
- Others: 1x weight

**Features:**
- Fuzzy matching with typo tolerance
- Multi-field search across all indexed fields
- Real-time suggestions (top 10 results)
- Keyboard navigation (↑/↓/Enter/Esc)
- Index caching in IndexedDB (5-minute TTL)
- Fallback to basic search if FlexSearch unavailable

**Search Performance:**
- Index build: ~100ms for 1000 bookmarks
- Query: <10ms for most searches
- Cached: <1ms for repeated searches

### TF-IDF Similarity Engine

**Algorithm:**
1. Tokenize bookmark content (title + description + keywords)
2. Calculate Term Frequency (TF) for each term in each document
3. Calculate Inverse Document Frequency (IDF) across all documents
4. Compute TF-IDF vectors for each bookmark
5. Calculate cosine similarity between vectors

**Vector Computation:**
```javascript
TF(term) = (term occurrences in document) / (total terms in document)
IDF(term) = log(total documents / documents containing term)
TF-IDF(term) = TF(term) × IDF(term)
```

**Similarity Threshold:**
- Similar bookmarks: >0.3 cosine similarity
- Duplicates: >0.7 similarity + URL normalization check

**Performance:**
- Vector computation: ~5ms per bookmark
- Similarity comparison: <1ms per pair
- Full scan (1000 bookmarks): ~500ms
- Cached for 5 minutes

**Use Cases:**
- Find similar bookmarks (content-based recommendations)
- Enhanced duplicate detection
- Related bookmark discovery
- Cluster analysis (future feature)

---

## Insights & Analytics

### Domain Hierarchy

**Structure:**
```javascript
domain → subdomain → paths
  ↓
{
  name: "github.com",
  count: 150,
  subdomains: [
    {
      name: "www",
      count: 100,
      paths: [
        { name: "torvalds", count: 15 },
        { name: "microsoft", count: 12 }
      ]
    },
    {
      name: "gist",
      count: 50,
      paths: [...]
    }
  ]
}
```

**Visualization:**
- Treemap chart showing top 20 domains
- Interactive breakdown panel
- Click to drill down into subdomains

### Behavioral Analytics

**Metrics Tracked:**

1. **Access Patterns**
   - `accessCount` - Total bookmark visits
   - `lastAccessed` - Last visit timestamp
   - Hourly access patterns (24-hour histogram)

2. **Engagement Metrics**
   - Never accessed bookmarks
   - Stale bookmarks (90+ days old, never accessed)
   - "Bookmark and Forget" (180+ days, never accessed)
   - Reading list (recent but unread)

3. **Event Statistics**
   - Create/delete/update/access events
   - Event timeline (last 30 days)
   - Event type distribution

**Privacy:**
- **Disabled by default** - `trackBrowsingBehavior: false`
- Requires explicit opt-in
- All data stored locally (IndexedDB)
- No external tracking or telemetry

### Insights Computed

#### Category Distribution & Trends
- Current category breakdown
- Category trends over time (monthly)
- Top 5 categories with percentages

#### Expertise Areas
- Weighted by access count and category
- Normalized percentages
- Polar chart visualization

#### Content Freshness
- Age distribution: 7/30/90/365 days, older
- Doughnut chart visualization
- Stale bookmark detection

#### Summary Statistics
```javascript
{
  totalBookmarks: Number,
  categorized: Number,
  categorizedPercentage: String,
  enriched: Number,
  enrichedPercentage: String,
  aliveChecked: Number,
  deadLinks: Number,
  neverAccessed: Number,
  neverAccessedPercentage: String,
  addedThisWeek: Number,
  addedThisMonth: Number,
  accessEventsThisWeek: Number,
  uniqueDomains: Number,
  topCategories: Array
}
```

---

## Performance & Optimization

### Indexing Strategy
```javascript
// Composite indexes for common queries
bookmarks: 'id, url, domain, category, dateAdded, lastAccessed, isAlive'

// Query examples leveraging indexes:
db.bookmarks.where('domain').equals('github.com').toArray()
db.bookmarks.where('category').equals('code').toArray()
db.bookmarks.where('dateAdded').above(timestamp).toArray()
db.bookmarks.where('isAlive').equals(false).toArray()
```

### Caching Strategy

**FlexSearch Index:**
- Cache key: `flexsearch_index_v1`
- TTL: 5 minutes
- Invalidated on bookmark changes

**TF-IDF Vectors:**
- Cache key: `tfidf_vectors_v1`
- TTL: 5 minutes
- Recomputed when bookmarks change

**Analytics Results:**
- Cache key: `insights_summary`, `domain_hierarchy`, etc.
- TTL: Varies by metric (5-60 minutes)
- Manual invalidation on data changes

### Memory Management

**Batch Processing:**
- Enrichment: Configurable batch size (5-100)
- Parallel workers: Limit concurrent promises (1-10)
- Queue processing: Sequential batches, not all at once

**Large Dataset Handling:**
- Virtual scrolling (future: for 10k+ bookmarks)
- Pagination for search results
- Lazy loading of analytics charts
- Incremental sync (only changed bookmarks)

### Build Optimization

**Rollup Configuration:**
```javascript
{
  treeshake: true,           // Remove unused code
  output: {
    format: 'iife',          // Single bundle
    inlineDynamicImports: true
  },
  plugins: [
    svelte({ compilerOptions: { dev: false } }),
    resolve({ browser: true }),
    commonjs(),
    terser()                 // Minification
  ]
}
```

**Bundle Sizes:**
- popup.js: ~150KB (minified)
- dashboard.js: ~300KB (minified)
- tailwind.css: ~50KB (purged)

---

## Privacy & Security

### Data Storage
- ✅ **100% local** - All data in browser IndexedDB
- ✅ **No cloud sync** - Never leaves your device
- ✅ **No external APIs** - Direct page fetches only
- ✅ **CORS-safe** - Graceful handling of blocked requests

### Permissions

**Required:**
- `bookmarks` - Read/write Chrome bookmarks
- `storage` - Store settings in chrome.storage.local

**Optional (user-triggered):**
- `host_permissions: <all_urls>` - Fetch metadata when enrichment runs
  - Only used when user clicks "Run Enrichment"
  - Never automatic background requests
  - Each fetch is visible in network tab

**Opt-in:**
- `tabs` - Track bookmark access (disabled by default)
  - `trackBrowsingBehavior: false` by default
  - Must be explicitly enabled by user
  - No tracking without consent

### Security Considerations

**Content Security Policy:**
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

**Metadata Fetching:**
- 5-second timeout per request
- Graceful error handling
- No JavaScript execution (HTML parsing only)
- Regex-based extraction (no eval or DOM parsing)

**User Control:**
- `privacyMode: true` - Disables all enrichment
- Manual enrichment trigger only
- No automatic background fetching
- Clear consent for all tracking features

### GDPR Compliance
- No personal data collection
- No external data transmission
- User controls all processing
- Data export available (JSON)
- Data deletion via Chrome bookmark deletion

---

## API Reference

### Database Operations (db.js)

```javascript
// Bookmark CRUD
await getAllBookmarks()
await getBookmark(id)
await upsertBookmark(bookmark)
await bulkUpsertBookmarks(bookmarks)
await deleteBookmark(id)

// Queries
await searchBookmarks(query)
await getBookmarksByDomain(domain)
await getBookmarksByCategory(category)
await getBookmarksByDateRange(startDate, endDate)

// Statistics
await getDomainStats()
await getActivityTimeline()
await getUniqueDomains()
await getUniqueCategories()

// Enrichment queue
await addToEnrichmentQueue(bookmarkId, priority)
await getNextEnrichmentBatch(batchSize)
await removeFromEnrichmentQueue(queueId)
await clearEnrichmentQueue()
await getEnrichmentQueueSize()

// Events
await logEvent(bookmarkId, type, metadata)
await getBookmarkEvents(bookmarkId, limit)
await getRecentEvents(limit)

// Settings
await getSettings()
await updateSettings(newSettings)
await initializeSettings()

// Cache
await setCache(key, value, ttl)
await getCache(key)
await clearCache(keyPattern)
```

### Enrichment API (enrichment.js)

```javascript
// Single bookmark enrichment
await enrichBookmark(bookmarkId)
// Returns: { success, category, description, isAlive, skipped, error }

// Batch processing
await processEnrichmentBatch(batchSize, progressCallback, concurrency)
// Returns: { processed, success, failed, skipped }

// Metadata fetching
await fetchPageMetadata(url)
// Returns: { description, keywords[], faviconUrl, snippet, rawMetadata }

// Dead link check
await checkBookmarkAlive(url)
// Returns: true | false | null

// Categorization
categorizeBookmark(bookmark, metadata)
// Returns: String (category) | null
```

### Search API (search.js)

```javascript
// FlexSearch
await searchBookmarks(query)
// Returns: Bookmark[]

await advancedSearch(query, filters)
// Returns: { results: Bookmark[], suggestions: String[] }

await getSearchSuggestions(query)
// Returns: String[]

// Index management
await buildSearchIndex()
await rebuildSearchIndex()
```

### Similarity API (similarity.js)

```javascript
// TF-IDF similarity
await findSimilarBookmarksEnhanced(bookmarkId, threshold)
// Returns: Array<{ bookmark, similarity }>

await findDuplicatesEnhanced()
// Returns: Array<{ original, duplicates[] }>

await findRelatedBookmarks(bookmarkId, limit)
// Returns: Bookmark[]
```

### Insights API (insights.js)

```javascript
// Domain analytics
await getDomainHierarchy()
// Returns: Domain tree with subdomains and paths

await getDomainTreemapData()
// Returns: Chart.js treemap dataset

// Behavioral analytics
await getStaleBookmarks(daysThreshold)
await getReadingListSuggestions(limit)
await getMostAccessedBookmarks(limit)
await getBookmarkAndForget()
await getHourlyAccessPatterns()

// Category analytics
await getCategoryTrends()
await getExpertiseAreas()

// Summary
await getInsightsSummary()
await getContentFreshness()
await getEventStatistics()

// Access tracking
await recordBookmarkAccess(bookmarkId, url)
await findBookmarkByUrl(url)
```

---

## Troubleshooting

### Common Issues

**Enrichment not running:**
- Check `enrichmentEnabled: true` in settings
- Verify queue has bookmarks: `getEnrichmentQueueSize()`
- Check browser console for errors
- Ensure host permissions granted

**Search not working:**
- Rebuild index: `rebuildSearchIndex()`
- Check if bookmarks loaded: `getAllBookmarks()`
- Try clearing cache: `clearCache('flexsearch')`

**Performance issues:**
- Reduce batch size (20 → 10)
- Lower concurrency (3 → 2)
- Clear old events: Truncate events table
- Clear cache: `clearCache()`

**Migration issues:**
- Check migration status: `db.settings.get('migration')`
- Manual migration: `migrateFromChromeStorage()`
- Export data before re-installing

### Debug Commands

```javascript
// Open console in dashboard/popup

// Check database
await db.bookmarks.count()
await db.enrichmentQueue.count()
await db.events.count()

// View settings
await db.settings.get('app')

// Check migration
await db.settings.get('migration')

// Clear all data (use with caution!)
await db.delete()
location.reload()
```

---

## Future Enhancements

### Planned Features
- [ ] Settings UI for all configuration options
- [ ] AI-powered categorization using raw metadata
- [ ] Custom tagging system with autocomplete
- [ ] Advanced search with regex support
- [ ] Content change detection and notifications
- [ ] Backup/restore via dexie-export-import
- [ ] Chrome sync for settings (cross-device)
- [ ] Bookmark health monitoring dashboard
- [ ] Duplicate merge assistant
- [ ] Folder organization suggestions
- [ ] Reading time estimation
- [ ] Archive.org integration for dead links

### Research Areas
- LLM integration for semantic categorization
- Knowledge graph construction from bookmarks
- Automated folder organization via ML
- Content summarization using raw metadata
- Collaborative filtering recommendations

---

## Contributing

### Development Setup
```bash
git clone <repo>
cd bookmark-insights
npm install
npm run build
```

Load extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the project folder

### Development Workflow
```bash
npm run dev        # Watch mode (rebuilds on change)
npm run build:css  # Rebuild Tailwind only
npm run build:js   # Rebuild JavaScript only
npm run build      # Full production build
```

### Code Style
- ES6+ JavaScript (no TypeScript currently)
- Svelte components for UI
- Functional programming preferred
- Comprehensive error handling
- JSDoc comments for public APIs

### Testing Guidelines
- Test with small (10) and large (1000+) bookmark collections
- Verify migration from v1.x
- Test enrichment with various site types
- Check performance with concurrency 1-10
- Validate privacy settings work correctly

---

## License

MIT License - See LICENSE file for details.

## Version History

**v2.0.0** (December 2025)
- IndexedDB migration with Dexie.js
- FlexSearch integration
- Background enrichment pipeline
- Raw metadata storage
- Real-time progress tracking
- Parallel processing with worker pools
- Dead link detection
- Auto-categorization
- TF-IDF similarity
- Domain hierarchy visualization
- Behavioral analytics

**v1.x** (Earlier)
- Basic bookmark management
- chrome.storage.local backend
- Simple search
- Domain statistics

---

**Documentation maintained by:** Bookmark Insights Development Team  
**Last reviewed:** December 20, 2025
