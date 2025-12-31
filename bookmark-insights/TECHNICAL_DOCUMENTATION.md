# Bookmark Insights - Technical Documentation

**Version:** 3.0  
**Last Updated:** December 21, 2025

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Database Schema](#database-schema)
- [Platform Enrichment](#platform-enrichment)
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
│   ├── Insights Tab - VisualInsights component (6 tabs)
│   ├── Health Tab - Enrichment, dead links, unified duplicates & similarities
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
├── db.js              # IndexedDB layer (schema v4, CRUD, analytics, caching)
├── stores.js          # Svelte stores for reactive state
├── enrichment.js      # Enrichment pipeline & metadata fetching
├── search.js          # FlexSearch with special filters (incl. platform filters)
├── similarity.js      # TF-IDF similarity engine (on-demand)
├── insights.js        # Analytics & insights (platform + 5 legacy functions)
├── url-parsers.js     # Platform-specific URL parsing (YouTube, GitHub, etc.)
├── utils.js           # Shared utilities
├── Dashboard.svelte   # Main dashboard component
├── Sidebar.svelte     # Filter sidebar with platforms, creators, domains
├── VisualInsights.svelte  # Interactive insights (6 tabs incl. Platforms)
├── CreatorExplorer.svelte # Creator/channel browsing component
└── *.svelte           # Other UI components

background-new.js      # Service worker source
```

---

## Database Schema

### Version History

- **v1**: Initial schema with basic tables
- **v2**: Added `rawMetadata` field for comprehensive metadata storage
- **v3**: Added `similarities` and `computedMetrics` tables for caching
- **v4**: Added platform enrichment fields (`platform`, `creator`, `contentType`, `platformData`)

### Tables

#### `bookmarks`

Primary bookmark storage with enrichment data.

**Indexes:** `id` (primary), `url`, `title`, `domain`, `category`, `dateAdded`, `lastAccessed`, `lastChecked`, `isAlive`, `parentId`, `platform`, `creator`, `contentType`

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
  },
  
  // Platform enrichment (v4+)
  platform: String | null,       // 'youtube', 'github', 'medium', etc.
  creator: String | null,        // Channel name, author, repo owner
  contentType: String | null,    // 'video', 'repo', 'article', 'issue', etc.
  platformData: {
    platform: String,            // Platform identifier
    type: String,                // Content type
    creator: String,             // Creator/channel/author
    identifier: String,          // Video ID, repo name, article slug
    subtype: String | null,      // 'short', 'pr', 'wiki', etc.
    extra: Object                // Platform-specific: playlist, branch, path
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

## Platform Enrichment

### Overview

The platform enrichment system extracts structured data from bookmark URLs without making additional network requests. It identifies platforms (YouTube, GitHub, Medium, etc.) and extracts creator/channel information, content types, and identifiers.

### Supported Platforms

| Platform | Extractable Data | URL Patterns |
|----------|-----------------|--------------|
| **YouTube** | Video ID, Channel (@handle or ID), Playlist ID, Shorts detection | `youtube.com/watch`, `youtu.be/`, `/@channel` |
| **GitHub** | Owner, Repo, Content type (issue/PR/file/wiki), Branch, Path | `github.com/owner/repo` |
| **Medium** | Author (@username), Publication (subdomain) | `medium.com/@author`, `publication.medium.com` |
| **dev.to** | Author username, Article slug | `dev.to/author/article` |
| **Substack** | Publication (subdomain), Author | `publication.substack.com` |
| **Twitter/X** | Username, Tweet ID | `twitter.com/user`, `x.com/user` |
| **Reddit** | Subreddit, Post ID, Comment thread | `reddit.com/r/subreddit` |
| **Stack Overflow** | Question ID, Answer ID | `stackoverflow.com/questions/` |
| **npm** | Package name, Version | `npmjs.com/package/` |

### URL Parser Module (`url-parsers.js`)

```javascript
import { parseBookmarkUrl, getPlatformDisplayName, getPlatformIcon } from './url-parsers.js';

// Parse any bookmark URL
const result = parseBookmarkUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
// Returns:
{
  platform: 'youtube',
  type: 'video',
  creator: null,              // Would be populated if channel URL
  identifier: 'dQw4w9WgXcQ',  // Video ID
  subtype: null,
  extra: { videoId: 'dQw4w9WgXcQ' }
}

// GitHub example
parseBookmarkUrl('https://github.com/facebook/react/issues/123');
// Returns:
{
  platform: 'github',
  type: 'issue',
  creator: 'facebook',
  identifier: 'react',
  subtype: null,
  extra: { owner: 'facebook', repo: 'react', issueNumber: '123' }
}
```

### Helper Functions

```javascript
// Get human-readable platform name
getPlatformDisplayName('github');  // "GitHub"
getPlatformDisplayName('youtube'); // "YouTube"

// Get platform emoji icon
getPlatformIcon('github');         // "💻"
getPlatformIcon('youtube');        // "📺"
getPlatformIcon('medium');         // "📝"

// Get content type display name
getContentTypeDisplayName('pr');      // "Pull Request"
getContentTypeDisplayName('video');   // "Video"
```

### Enrichment Integration

Platform data is populated during enrichment in `enrichment.js`:

1. **URL Parsing** - `parseBookmarkUrl()` is called at the start of enrichment
2. **Metadata Merging** - `mergePlatformDataWithMetadata()` combines URL-derived data with:
   - JSON-LD structured data (YouTube channel names)
   - Open Graph metadata (article authors)
   - Meta tags (GitHub topics)
3. **Storage** - Platform fields are indexed for fast filtering

### Platform-Specific Insights

New functions in `insights.js`:

| Function | Description |
|----------|-------------|
| `getPlatformDistribution()` | Breakdown of bookmarks by platform with counts and percentages |
| `getCreatorLeaderboard(limit)` | Top creators/channels ranked by bookmark count |
| `getRepositoryGroups()` | GitHub repos with issue/PR/file breakdown |
| `getVisualGallery(limit)` | Bookmarks with og:image thumbnails |
| `getPlatformInsightsSummary()` | Summary stats for dashboard cards |
| `getCreatorStats(limit)` | Detailed creator statistics |
| `getChannelClusters()` | Group bookmarks by creator across platforms |

### Platform Search Filters

New search filters in `search.js`:

```
platform:youtube          # Filter by platform
channel:@mkbhd            # YouTube channel (with or without @)
repo:facebook/react       # GitHub repository (owner/repo format)
author:username           # Blog/article author
type:video|issue|article  # Content type (pipe-separated)
hasimage:yes              # Has thumbnail/preview image
playlist:PLxxxxxxx        # YouTube playlist ID
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
- **Trigger:** Manual "Scan for Similarities" button (not automatic)
- **Performance:** Uses `yieldToMain` pattern to prevent UI freezing during heavy computation
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
