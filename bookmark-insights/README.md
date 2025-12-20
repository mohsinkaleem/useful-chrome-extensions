# Bookmark Insight - Chrome Extension

A powerful, local-first bookmark intelligence system with smart search, enrichment, insights, and maintenance tools.

## 🚀 What's New in v2.0

Version 2.0 transforms Bookmark Insight into a smart bookmark intelligence system:

- **IndexedDB Storage** - Faster queries with Dexie.js (replaces chrome.storage.local)
- **FlexSearch Integration** - Powerful fuzzy search with ranking and suggestions
- **Background Enrichment** - Automatic metadata extraction from bookmarked pages
- **Real-Time Progress Tracking** - Live progress bar and detailed enrichment logs 🆕
- **Raw Metadata Storage** - Comprehensive JSON storage of all meta tags, Open Graph, Twitter Cards, and structured data for future AI analysis 🆕
- **Dead Link Detection** - Identifies broken bookmarks automatically
- **Auto-Categorization** - Smart categorization based on domain, URL, and content
- **TF-IDF Similarity** - Advanced semantic matching for similar bookmarks
- **Domain Visualization** - Hierarchical view of your bookmark domains
- **Data Insights Dashboard** - Stale bookmarks, reading lists, expertise areas
- **Behavioral Analytics** - Track which bookmarks you actually use

> 📖 **Latest Updates:**
> - [Enrichment Enhancements](ENRICHMENT_ENHANCEMENTS.md) - Real-time progress UI and comprehensive metadata storage
> - [Enrichment UI Guide](ENRICHMENT_UI_GUIDE.md) - Visual guide to the new progress interface

## Features

### 🔍 Smart Search (FlexSearch-Powered)
- **Fuzzy matching** with intelligent ranking
- **Multi-field search** across title, URL, description, keywords, category
- **Real-time suggestions** with autocomplete dropdown
- **Keyboard navigation** (up/down arrows, enter, escape)
- **Weighted boosting** - title matches rank higher

### 📊 Visual Analytics & Insights
- **Domain Analysis**: Most bookmarked domains with distribution charts
- **Domain Hierarchy**: Interactive domain → subdomain → path visualization
- **Content Analysis**: Word frequency and title pattern detection
- **Temporal Analysis**: Activity timeline, age distribution, creation patterns
- **URL Structure**: TLD distribution and parameter usage analysis
- **Category Trends**: Track how your interests evolve over time
- **Expertise Areas**: Discover your knowledge domains based on bookmarks

### 🔧 Enrichment Pipeline
- **Real-Time Progress Tracking**: Live progress bar, current bookmark display, and detailed logs 🆕
- **Comprehensive Metadata Storage**: Captures all meta tags, Open Graph, Twitter Cards, and JSON-LD structured data as raw JSON for future AI analysis 🆕
- **Manual Trigger**: Click "Run Enrichment" button when you want
- **Smart Skipping**: Already enriched bookmarks are automatically skipped
- **Metadata Extraction**: Title, description, Open Graph tags, keywords, and complete raw metadata
- **Auto-Categorization**: 15+ categories based on domain, URL, and content
- **Favicon Caching**: Visual identification at a glance
- **Rate Limiting**: Respectful 1 request/second with configurable batch size

> 📖 **[See Enrichment Enhancements Documentation](ENRICHMENT_ENHANCEMENTS.md)** for details on real-time progress UI and raw metadata storage

### 🏥 Health & Maintenance
- **Dead Link Checker**: HEAD/GET requests to verify bookmark health
- **Duplicate Detection**: Exact and normalized URL matching
- **Similar Bookmarks**: TF-IDF similarity with cosine scoring
- **Uncategorized Finder**: Locate bookmarks without organization
- **Malformed URL Detection**: Find invalid bookmark URLs

### 📈 Behavioral Analytics (Opt-In)
- **Disabled by default** - Your browsing is NOT tracked unless you enable it
- **Access Tracking**: Know which bookmarks you actually visit (if enabled)
- **Stale Detection**: Find bookmarks 90+ days old, never accessed
- **"Bookmark and Forget"**: Identify 6+ months old unused bookmarks
- **Reading List**: Recently added bookmarks you haven't visited yet
- **Most Accessed**: Your top bookmarks by usage
- **Event Logging**: Track create, delete, update events (access events only if enabled)

### 💾 Data Management
- **Export to JSON**: Full bookmark export with metadata
- **IndexedDB Storage**: Fast, scalable local database
- **Automatic Migration**: Seamless upgrade from v1.x
- **Performance Caching**: Intelligent caching for speed

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
  - **Enrichment**: Real-time progress tracking with live updates 🆕
  - **Dead Link Checker**: Verify bookmark health
  - **Duplicates & Similar**: Find and manage duplicate bookmarks
  - **Maintenance**: Clean up malformed URLs and orphaned bookmarks

### Filters
- **Date Filters**: This Week, This Month, This Year
- **Domain Filters**: Click any domain to see all bookmarks from that site
- **Folder Filters**: Browse bookmarks by folder structure

## Technical Details

### Technology Stack
- **UI Framework**: Svelte 4.0 (compiled to vanilla JavaScript)
- **Database**: IndexedDB via Dexie.js (with chrome.storage.local fallback)
- **Search**: FlexSearch.js for fuzzy matching and ranking
- **Charts**: Chart.js for insights visualization
- **Styling**: Tailwind CSS
- **Build Tool**: Rollup with ES modules

### Architecture
- **Background Script**: Service worker with bookmark sync, enrichment pipeline, and tab monitoring
- **IndexedDB Schema**: bookmarks, enrichmentQueue, events, cache, settings tables
- **Popup**: Quick access interface (384x384px)
- **Dashboard**: Full-featured interface with Bookmarks, Insights, and Health tabs

### Database Schema
```javascript
// Bookmarks with enrichment fields (v2 schema)
{
  id, url, title, domain, dateAdded, folderPath, parentId,
  description, keywords[], category, tags[],
  isAlive, lastChecked, faviconUrl, contentSnippet,
  rawMetadata: {  // 🆕 Comprehensive metadata storage
    meta: {},      // All meta tags
    openGraph: {}, // og:* tags
    twitterCard: {}, // twitter:* tags
    jsonLd: [],    // Structured data
    other: {}      // canonical, language, etc.
  },
  lastAccessed, accessCount
}

// Supporting tables
enrichmentQueue: { queueId, bookmarkId, addedAt, priority }
events: { eventId, bookmarkId, type, timestamp }
cache: { key, value, timestamp, ttl }
settings: { key, ...preferences }
```

### Performance
- **Indexed queries** on domain, category, dateAdded, isAlive
- **Paginated loading** with virtual scrolling
- **Cached search index** persisted to IndexedDB
- **Rate-limited enrichment** (1 req/sec configurable)
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
    ├── db.js               # Dexie IndexedDB layer
    ├── enrichment.js       # Background enrichment pipeline
    ├── search.js           # FlexSearch integration
    ├── similarity.js       # TF-IDF similarity detection
    ├── insights.js         # Domain hierarchy & analytics
    ├── database.js         # Original data access layer
    ├── database-compat.js  # Compatibility wrapper
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
  enrichmentEnabled: true,      // Enable enrichment feature
  enrichmentSchedule: 'manual', // Manual only - no automatic scheduling
  enrichmentBatchSize: 20,      // Bookmarks per batch
  enrichmentRateLimit: 1000,    // ms between requests
  autoCategorizationEnabled: true,
  deadLinkCheckEnabled: true,
  privacyMode: false,           // Disable all enrichment
  trackBrowsingBehavior: false  // OFF by default - no tab monitoring
}
```

### Privacy Controls
- **Behavior Tracking**: Disabled by default. Your browsing is NOT monitored unless you explicitly enable `trackBrowsingBehavior`.
- **Enrichment**: Manual trigger only - runs when YOU click the button, not automatically in the background.

## Documentation

- **[Enrichment Enhancements](ENRICHMENT_ENHANCEMENTS.md)** - Real-time progress tracking and raw metadata storage
- **[Enrichment UI Guide](ENRICHMENT_UI_GUIDE.md)** - Visual guide to the progress interface
- **[V2 Release Notes](V2_RELEASE_NOTES.md)** - Complete changelog for version 2.0
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
