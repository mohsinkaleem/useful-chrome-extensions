# Bookmark Insights - Chrome Extension

A powerful, privacy-first bookmark intelligence system with smart search, enrichment, insights, and maintenance tools.

## 🚀 What's New in v2.2

Version 2.2 brings a completely revamped search experience:

- **Advanced Search Syntax** - Support for `+term` (must include), `-term` (exclude), and `"exact phrases"`
- **Dynamic Sidebar** - Domains and folders update based on search results
- **Relevance Ranking** - Smart scoring prioritizing title > domain > category > description
- **Visual Query Feedback** - Color-coded tags show active search modifiers
- **Simplified UI** - Removed autocomplete for cleaner, faster search
- **Optimized Performance** - Single-pass filtering with pre-computed relevance scores

### Search Syntax Examples
```
javascript tutorial       # Find bookmarks with "javascript" OR "tutorial"
+javascript +tutorial     # MUST contain both terms
javascript -video         # Find "javascript" but exclude "video"
"react hooks"             # Find exact phrase "react hooks"
+react "best practices" -beginner  # Complex query combining all
```

### Previous in v2.1

- **Consolidated Database Layer** - Single `db.js` module with all database operations
- **Smart Bookmark Merging** - Preserves enrichment data during Chrome sync (fixes data loss bug)
- **Metrics Caching System** - Intelligent caching with configurable TTL and smart invalidation
- **Reactive Svelte Stores** - New `stores.js` with auto-refreshing stats and domain explorer
- **Improved Similarity Algorithm** - Pre-filtering by domain/category reduces O(n²) complexity
- **On-Demand Similarity** - Similarities computed and cached after enrichment
- **Schema v3** - New `similarities` and `computedMetrics` tables for caching

### Previous in v2.0

- **IndexedDB Storage** - Lightning-fast queries with Dexie.js
- **FlexSearch Integration** - Fuzzy search with intelligent ranking
- **Background Enrichment** - Metadata extraction with real-time progress tracking
- **Raw Metadata Storage** - Comprehensive data capture for future AI analysis
- **Parallel Processing** - Configurable concurrency (3-10x faster enrichment)
- **Smart Re-enrichment** - Automatic freshness detection with configurable periods
- **Dead Link Detection** - Identifies broken bookmarks automatically
- **Auto-Categorization** - Smart categorization based on domain, URL, and content
- **TF-IDF Similarity** - Advanced semantic matching for duplicate and related bookmarks
- **Domain Visualization** - Hierarchical treemap view of your bookmark domains
- **Behavioral Analytics** - Track bookmark usage patterns (opt-in only)

## Features

### 🔍 Advanced Search
- **Boolean operators**: `+term` (must include), `-term` (must exclude)
- **Exact phrases**: `"quoted phrases"` for precise matching
- **Multi-field search** across title, URL, description, keywords, category, domain
- **Smart relevance ranking** - title matches rank highest
- **Visual query feedback** - colored tags show positive/negative/phrase terms
- **Dynamic filtering** - sidebar updates to show matching domains and folders
- **Keyboard shortcuts** - Enter for instant search, Escape to clear

### 📊 Visual Analytics & Insights
- **Domain Analysis**: Most bookmarked domains with distribution charts
- **Domain Hierarchy**: Interactive domain → subdomain → path visualization
- **Content Analysis**: Word frequency and title pattern detection
- **Temporal Analysis**: Activity timeline, age distribution, creation patterns
- **URL Structure**: TLD distribution and parameter usage analysis
- **Category Trends**: Track how your interests evolve over time
- **Expertise Areas**: Discover your knowledge domains based on bookmarks

### 🔧 Enrichment Pipeline
- **Real-Time Progress Tracking**: Live progress bar, current bookmark display, and detailed logs
- **Comprehensive Metadata Storage**: Captures all meta tags, Open Graph, Twitter Cards, and JSON-LD as raw JSON
- **Parallel Processing**: Configurable concurrency (1-10 workers) for 3-10x faster processing
- **Smart Freshness Detection**: Uses `lastChecked` timestamp with configurable re-enrichment period (default: 30 days)
- **Manual Trigger**: Click "Run Enrichment" button when you want (never automatic)
- **Metadata Extraction**: Title, description, Open Graph tags, keywords, and complete raw metadata
- **Auto-Categorization**: 15+ categories based on domain, URL, and content
- **Favicon Caching**: Visual identification at a glance
- **Respectful Rate Limiting**: 100ms delay between requests with batch processing

### 🏥 Health & Maintenance
- **Dead Links List**: View bookmarks detected as unreachable during enrichment
- **Duplicate Detection**: Exact and normalized URL matching
- **Similar Bookmarks**: TF-IDF similarity with cosine scoring (instant deletion, no recomputation)
- **Malformed URL Detection**: Find invalid bookmark URLs

### 📈 Behavioral Analytics (Opt-In)
- **Disabled by default** - Your browsing is NOT tracked unless you enable it
- **Access Tracking**: Know which bookmarks you actually visit (if enabled)
- **Event Logging**: Track create, delete, update events (access events only if enabled)

### 💾 Data Management
- **Export to JSON**: Full bookmark export with metadata
- **IndexedDB Storage**: Fast, scalable local database (schema v3)
- **Automatic Migration**: Seamless upgrade from v1.x/v2.x
- **Smart Metrics Caching**: Configurable TTL with intelligent invalidation
- **Reactive State Management**: Auto-refreshing stats via Svelte stores

## Installation

### For Development
1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the `bookmark-insights` folder

### For Production
The extension will be available on the Chrome Web Store once published.

## Usage

### Popup Interface
- Click the extension icon in the toolbar
- Use the search bar to find bookmarks quickly
- Toggle the sidebar to access filters
- Click "Dashboard" for the full interface

### Dashboard
- Access through the popup or by right-clicking the extension icon
- **Bookmarks Tab**: Browse and search all bookmarks with advanced filters
- **Insights Tab**: View statistics and charts about your bookmarking habits
- **Health Tab**: Find and fix issues with your bookmark collection
  - **Enrichment**: Real-time progress tracking with live updates
  - **Dead Links**: View bookmarks detected as unreachable
  - **Duplicates & Similar**: Find and manage duplicate bookmarks
  - **Maintenance**: Clean up malformed URLs

### Filters
- **Date Filters**: This Week, This Month, This Year
- **Domain Filters**: Click any domain to filter; shows matching domains when searching
- **Folder Filters**: Browse bookmarks by folder; updates based on search results
- **Combined Filtering**: Chain search with domain/folder/date filters

## Technical Details

### Technology Stack
- **UI Framework**: Svelte 4.0 (compiled to vanilla JavaScript)
- **Database**: IndexedDB via Dexie.js v3.x
- **Search**: FlexSearch.js with weighted fields
- **Similarity**: Custom TF-IDF with cosine similarity
- **Charts**: Chart.js 4.x
- **Styling**: Tailwind CSS 3.x
- **Build Tool**: Rollup with ES modules

### Architecture
- **Background Script**: Service worker with bookmark sync, enrichment pipeline, and tab monitoring (opt-in)
- **IndexedDB Schema**: bookmarks, enrichmentQueue, events, cache, settings tables
- **Popup**: Quick access interface (384x384px)
- **Dashboard**: Full-featured interface with Bookmarks, Insights, and Health tabs

### Database Schema (v3)
```javascript
// Bookmarks with enrichment fields
{
  id, url, title, domain, dateAdded, folderPath, parentId,
  description, keywords[], category, tags[],
  isAlive, lastChecked, faviconUrl, contentSnippet,
  rawMetadata: { meta, openGraph, twitterCard, jsonLd, other },
  lastAccessed, accessCount
}

// Supporting tables
enrichmentQueue: { queueId, bookmarkId, addedAt, priority }
events: { eventId, bookmarkId, type, timestamp, ...metadata }
cache: { key, value, timestamp, ttl }
settings: { key, enrichmentEnabled, enrichmentBatchSize, ... }

// New in v3 - Caching tables
similarities: { id, bookmark1Id, bookmark2Id, score, computedAt }
computedMetrics: { key, value, computedAt, ttl }
```

> 📖 **[See Technical Documentation](TECHNICAL_DOCUMENTATION.md)** for complete API reference, architecture details, and implementation guide

### Performance
- **Parallel enrichment** with worker pools (3-10x faster)
- **Indexed queries** on domain, category, dateAdded, isAlive, lastChecked
- **Cached search index** with 5-minute TTL
- **Freshness-based re-enrichment** (configurable 0-365 days)
- **Scalable** to 5000+ bookmarks

## Development

### Scripts
- `npm run build`: Build CSS and JavaScript for production
- `npm run build:css`: Build only Tailwind CSS
- `npm run build:js`: Build only JavaScript with Rollup
- `npm run dev`: Build and watch for development

### File Structure
```
bookmark-insights/
├── manifest.json           # Extension manifest (v2.0)
├── background-new.js       # Enhanced service worker source
├── background.js           # Built service worker
├── popup.html              # Popup interface HTML
├── dashboard.html          # Dashboard HTML
├── tailwind.config.js      # Tailwind CSS configuration
├── rollup.config.js        # Build configuration
├── icons/                  # Extension icons
├── public/                 # Built files
│   ├── tailwind.css        # Built Tailwind CSS
│   ├── popup.js            # Built popup bundle
│   └── dashboard.js        # Built dashboard bundle
└── src/                    # Source code
    ├── db.js               # Consolidated IndexedDB layer (all DB operations)
    ├── stores.js           # Svelte stores for reactive state management
    ├── enrichment.js       # Background enrichment pipeline
    ├── search.js           # FlexSearch integration
    ├── similarity.js       # TF-IDF similarity with caching
    ├── insights.js         # Domain hierarchy & analytics
    ├── utils.js            # Shared utilities
    ├── App.svelte          # Main popup component
    ├── Dashboard.svelte    # Dashboard with insights
    ├── BookmarkCard.svelte # Card view component
    ├── BookmarkListItem.svelte
    ├── SearchBar.svelte    # Enhanced search with suggestions
    ├── Sidebar.svelte      # Filter sidebar
    ├── popup.js            # Popup entry point
    └── dashboard.js        # Dashboard entry point
```

## Permissions

The extension requires the following permissions:
- `bookmarks`: To read and manage your bookmarks
- `storage`: To store processed bookmark data locally
- `favicon`: To display website icons
- `alarms`: For scheduled background enrichment
- `tabs`: To track bookmark access for analytics
- `host_permissions (<all_urls>)`: To fetch metadata from bookmarked URLs (opt-in)

## Privacy

This extension:
- ✅ **100% local processing** - All data stays in your browser's IndexedDB
- ✅ **No external APIs** - Only fetches from your bookmarked URLs (when you click enrich)
- ✅ **No browsing tracking by default** - Tab monitoring is OFF unless you enable it
- ✅ **Manual enrichment** - Metadata fetching only runs when you click the button
- ✅ **Transparent permissions** - `<all_urls>` only used for enrichment when triggered
- ✅ **CORS-safe** - Gracefully handles blocked requests
- ✅ **No analytics/telemetry** - Zero data collection

## Configuration

Default settings (customizable in future settings UI):
```javascript
{
  enrichmentEnabled: true,      //Health tab):
```javascript
{
  enrichmentEnabled: true,           // Enable enrichment feature
  enrichmentSchedule: 'manual',      // Manual only - no automatic scheduling
  enrichmentBatchSize: 20,           // Bookmarks per batch (5-100)
  enrichmentConcurrency: 3,          // Parallel workers (1-10)
  enrichmentFreshnessDays: 30,       // Re-enrich after N days (0 = always)
  autoCategorizationEnabled: true,
  deadLinkCheckEnabled: true,
  privacyMode: false,                // Disable all enrichment
  trackBrowsingBehavior: false       // OFF by default - no tab monitoring
}
```

### Privacy Controls
- **Behavior Tracking**: Disabled by default. Your browsing is NOT monitored unless you explicitly enable it.
- **ETechnical Documentation](TECHNICAL_DOCUMENTATION.md)** - Complete architecture, API reference, and implementation guide
- **[Troubleshooting Guides](V2_RELEASE_NOTES.md)** - Complete changelog for version 2.0
- **[Implementation Progress](IMPLEMENTATION_PROGRESS.md)** - Development status and roadmap
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions

## Roadmap

Future enhancements:
- Settings UI for enrichment configuration
- AI-powered categorization using raw metadata
- Backup/restore via dexie-export-import
- Advanced search with regex support
- Custom tagging system
- Chrome sync for settings
- Content change detection and notifications

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Build and test the extension
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues, feature requests, or questions:
- Create an issue on GitHub
- Include Chrome version and extension version
- Provide detailed steps to reproduce any bugs
