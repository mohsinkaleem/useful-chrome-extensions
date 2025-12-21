# Bookmark Insights - Technical Documentation

**Version:** 2.5  
**Last Updated:** December 21, 2025

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Database Schema](#database-schema)
- [Core Systems](#core-systems)
- [API Reference](#api-reference)
- [Performance](#performance)
- [Privacy & Security](#privacy--security)

---

## Architecture Overview

### Technology Stack
| Component | Technology |
|-----------|------------|
| UI Framework | Svelte 4.0 |
| Database | IndexedDB via Dexie.js v3.x |
| Search | FlexSearch.js |
| Similarity | Custom TF-IDF with cosine similarity |
| Charts | Chart.js 4.x |
| Styling | Tailwind CSS 3.x |
| Build | Rollup with ES modules |

### Component Architecture
```
Chrome Extension
├── Popup (384x384)
│   └── Quick search, recent items
├── Dashboard (Full Page)
│   ├── Bookmarks Tab - Browse & filter
│   ├── Insights Tab - VisualInsights component (5 tabs)
│   ├── Health Tab - Enrichment, dead links, similar detection
│   └── Data Tab - Database explorer
├── Background Service Worker
│   ├── Bookmark event listeners
│   ├── Enrichment queue manager
│   ├── Tab monitoring (opt-in)
│   └── Message router
└── IndexedDB Layer (Dexie)
    └── 7 tables: bookmarks, enrichmentQueue, events, cache, settings, similarities, computedMetrics
```

### File Structure
```
src/
├── db.js              # IndexedDB layer (schema, CRUD, analytics, caching)
├── stores.js          # Svelte stores for reactive state
├── enrichment.js      # Enrichment pipeline & metadata fetching
├── search.js          # FlexSearch with special filters
├── similarity.js      # TF-IDF similarity engine (on-demand)
├── insights.js        # Analytics & insights (5 major functions)
├── utils.js           # Shared utilities
├── Dashboard.svelte   # Main dashboard component
├── Sidebar.svelte     # Filter sidebar with load-more pagination
├── VisualInsights.svelte  # Interactive insights (5 tabs)
└── *.svelte           # Other UI components

background-new.js      # Service worker source
```

---

## Database Schema

### Version History
- **v1**: Initial schema with basic tables
- **v2**: Added `rawMetadata` field for comprehensive metadata storage
- **v3**: Added `similarities` and `computedMetrics` tables for caching

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

#### `similarities` (New in v3)
Cached similarity computations between bookmarks.

**Indexes:** `id` (auto-increment), `[bookmark1Id+bookmark2Id]` (unique compound)

**Schema:**
```javascript
{
  id: Number,                    // Auto-increment
  bookmark1Id: String,           // First bookmark ID
  bookmark2Id: String,           // Second bookmark ID
  score: Number,                 // Similarity score (0-1)
  sameDomain: Boolean,           // Whether bookmarks share domain
  sameCategory: Boolean,         // Whether bookmarks share category
  computedAt: Number             // Timestamp of computation
}
```

#### `computedMetrics` (New in v3)
Cached computed metrics with TTL.

**Indexes:** `key` (primary)

**Schema:**
```javascript
{
  key: String,                   // Metric key (e.g., 'quickStats', 'domainStats')
  value: Any,                    // Cached result
  computedAt: Number,            // Timestamp of computation
  ttl: Number                    // Time-to-live (ms)
}
```

---

## Core Systems

### Caching System

Intelligent caching with configurable TTL and smart invalidation.

| Metric | TTL |
|--------|-----|
| quickStats | 5 minutes |
| domainStats | 1 hour |
| duplicates | 1 hour |
| activityTimeline | 6 hours |
| wordFrequency | 24 hours |
| similarities | 24 hours |

**Smart Invalidation:** Cache automatically invalidates based on change type (add/delete/update/enrich).

### Enrichment Pipeline

1. **Queue Management** - New bookmarks queued with priority
2. **Freshness Check** - Skip if enriched within `enrichmentFreshnessDays`
3. **Dead Link Detection** - HEAD request with 5s timeout
4. **Metadata Extraction** - Description, keywords, favicon, Open Graph, Twitter Cards, JSON-LD
5. **Auto-Categorization** - 15+ categories based on domain, URL path, and content keywords
6. **Parallel Processing** - Configurable concurrency (1-10 workers)

**Performance:**
- Sequential: ~1 bookmark/second
- Concurrency 3: ~3 bookmarks/second
- Concurrency 5: ~5 bookmarks/second

### Search System (FlexSearch)

**Field Boosting:**
- `title`: 3x weight
- `category`, `keywords`: 2x weight
- Others: 1x weight

**Special Filters:**
```
category:code     domain:github      accessed:yes
stale:yes         dead:yes           enriched:no
folder:"path"
```

### Similarity Detection (On-Demand)

- **Algorithm:** TF-IDF with cosine similarity
- **Pre-filtering:** Same domain/category candidates first (reduces O(n²))
- **Trigger:** Manual "Run Analysis" button (not automatic)
- **Threshold:** >0.4 similarity for matches

### Dead Link Re-check

Background message handler `reEnrichDeadLinks`:
1. Fetches all dead links
2. Clears `lastChecked` to force re-check
3. Runs enrichment on each
4. Reports: total, now alive, still dead, errors

### Sidebar Pagination

Domain and folder lists now support "Load More" functionality:
- Domains: Initial 30, load 30 more per click
- Folders: Initial 15, load 15 more per click

---

## API Reference

### Database Operations (db.js)

```javascript
// Bookmark CRUD
getAllBookmarks()
getBookmark(id)
upsertBookmark(bookmark)
bulkUpsertBookmarks(bookmarks)
deleteBookmark(id)
deleteBookmarks(ids)

// Queries
searchBookmarks(query)
getBookmarksByDomain(domain)
getBookmarksByCategory(category)
getBookmarksByDateRange(startDate, endDate)
getDeadLinks()

// Statistics
getDomainStats()
getActivityTimeline()
getQuickStats()

// Enrichment
addToEnrichmentQueue(bookmarkId, priority)
getNextEnrichmentBatch(batchSize)
clearEnrichmentQueue()

// Settings
getSettings()
updateSettings(newSettings)

// Cache
getCachedMetric(key, computeFn, ttlMs)
invalidateMetricCaches(changeType)
```

### Background Messages

```javascript
// Sync bookmarks
{ action: 'syncBookmarks' }

// Get enrichment status
{ action: 'getEnrichmentStatus' }

// Run enrichment
{ action: 'runEnrichment', batchSize: 20, concurrency: 3 }

// Re-check dead links
{ action: 'reEnrichDeadLinks' }

// Update settings
{ action: 'updateSettings', settings: {...} }
```

### Enrichment API (enrichment.js)

```javascript
enrichBookmark(bookmarkId)     // Single bookmark
processEnrichmentBatch(size, callback, concurrency)
fetchPageMetadata(url)
checkBookmarkAlive(url)        // Returns true/false/null
categorizeBookmark(bookmark, metadata)
```

### Similarity API (similarity.js)

```javascript
findSimilarBookmarksEnhancedFuzzy(options)  // On-demand
findUselessBookmarks()
getUselessBookmarkIds()
```

### Insights API (insights.js)

```javascript
getCollectionHealthMetrics()
getContentAnalysis()
getActionableInsights()
getDomainIntelligence()
getTimeBasedAnalysis()
getDomainHierarchy()
getDeadLinkInsights()
```

---

## Performance

### Indexing Strategy
- Composite indexes on: `domain`, `category`, `dateAdded`, `lastAccessed`, `isAlive`, `lastChecked`
- Query optimization via Dexie's indexed queries

### Caching
- FlexSearch index: 5-minute TTL
- Analytics: 5 min to 24 hours depending on metric
- Similarities: 24-hour TTL

### Memory Management
- Batch processing with configurable size
- Pagination for large result sets
- Lazy loading of charts

### Bundle Sizes
- popup.js: ~150KB (minified)
- dashboard.js: ~300KB (minified)
- tailwind.css: ~50KB (purged)

---

## Privacy & Security

### Data Storage
- ✅ **100% local** - All data in browser IndexedDB
- ✅ **No cloud sync** - Never leaves your device
- ✅ **No external APIs** - Direct page fetches only

### Permissions
| Permission | Purpose | When Used |
|------------|---------|-----------|
| `bookmarks` | Read/write bookmarks | Always |
| `storage` | Store settings | Always |
| `host_permissions` | Fetch metadata | Manual enrichment only |
| `tabs` | Track access | Opt-in only |

### Security
- Content Security Policy enforced
- 5-second timeout per fetch
- No JavaScript execution (regex parsing only)
- User controls all processing

### GDPR Compliance
- No personal data collection
- No external data transmission
- User controls all processing
- Data export available (JSON)

---

## Troubleshooting

### Common Issues

**Enrichment not running:**
- Check `enrichmentEnabled: true`
- Verify queue has bookmarks
- Check browser console for errors

**Search not working:**
- Rebuild index: `rebuildSearchIndex()`
- Clear cache

**Performance issues:**
- Reduce batch size (20 → 10)
- Lower concurrency (3 → 2)
- Clear cache

### Debug Commands

```javascript
// In dashboard/popup console
await db.bookmarks.count()
await db.enrichmentQueue.count()
await db.settings.get('app')
```

---

## Contributing

```bash
git clone <repo>
cd bookmark-insights
npm install
npm run dev    # Watch mode
```

Load in Chrome:
1. `chrome://extensions/`
2. Enable "Developer mode"
3. "Load unpacked" → select project folder

---

## License

MIT License

---

**Last reviewed:** December 21, 2025
