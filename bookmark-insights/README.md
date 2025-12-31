# Bookmark Insights - Chrome Extension

A powerful, privacy-first bookmark intelligence system with smart search, enrichment, insights, and maintenance tools.

## Features

### 🔍 Advanced Search

- **Hybrid Search Engine**: Combines **FlexSearch** for high-performance fuzzy matching with a custom parser for advanced queries.
- **Boolean operators**: `+term` (must include), `-term` (must exclude)
- **Exact phrases**: `"quoted phrases"` for precise matching
- **Regex patterns**: `/pattern/` or `/pattern/flags` for advanced matching
- **Special filters**: `category:code`, `domain:github`, `accessed:yes`, `stale:yes`, `dead:yes`, `enriched:yes`, `folder:"path"`
- **Platform filters**: `platform:youtube`, `channel:@mkbhd`, `repo:facebook/react`, `author:username`, `type:video|issue`
- **Visual Filter Builder**: Quick-access buttons to easily add common filters.
- **Search History**: Saves recent searches for quick access via a dropdown menu.
- **Keyword Highlighting**: Matches are highlighted in Title, URL, and Description for better context.
- **Smart relevance ranking** - title matches rank highest
- **Dynamic filtering** - sidebar updates to show matching domains, folders, and platforms
- **Visual query feedback** - parsed terms displayed as colored tags

### 📱 Platform Enrichment

Automatically detects and extracts structured data from popular platforms:

- **YouTube** - Video IDs, channel handles, playlists, shorts detection
- **GitHub** - Repositories, issues, PRs, files, wiki pages, gists
- **Medium/dev.to/Substack** - Authors, publications, article metadata
- **Twitter/X** - Users, tweets, threads
- **Reddit** - Subreddits, posts, comments
- **Stack Overflow** - Questions, answers
- **npm** - Packages, versions

### 📊 Visual Analytics Dashboard

Six interactive tabs with actionable insights:

- **❤️ Health** - Collection health score, bookmark ROI, decay rate, dead link ratio
- **📱 Platforms** - Platform breakdown chart, creator leaderboard, repository map, visual gallery
- **📚 Content** - Category distribution, topic clusters, content type analysis
- **⚡ Actions** - Stale queue, cleanup candidates, rediscovery feed
- **🌐 Domains** - Domain reliability, valuable domains, concentration warnings
- **⏰ Time** - Hourly/daily patterns, collection age, monthly trends

### 👤 Creator Explorer

- **Creator leaderboard** - Most bookmarked channels and authors
- **YouTube channels** - Group videos by channel with thumbnails
- **GitHub repositories** - Issues, PRs, and files per repo
- **Blog authors** - Articles grouped by author across platforms

### 🔧 Enrichment Pipeline

- **Manual enrichment** - Click to fetch metadata (never automatic)
- **Platform detection** - Extracts structured data from URLs without network requests
- **Force re-enrich** - Option to bypass freshness check for on-demand refresh
- **Parallel processing** - Configurable concurrency (3-10x faster)
- **Metadata extraction** - Title, description, Open Graph, keywords, favicons
- **Auto-categorization** - 15+ categories based on domain, URL, and content
- **Real-time progress** - Live progress bar with detailed logs

### 🏥 Health & Maintenance

- **Dead links** - View, re-check, or delete unreachable bookmarks
- **Duplicates & Similarities** - Unified interface for managing exact duplicates and finding similar content
- **Smart similar detection** - Non-blocking, on-demand fuzzy matching with side-by-side comparison
- **Cached results** - Shows cache status with option to force refresh
- **Malformed URL detection** - Find invalid bookmark URLs

### 📚 Bookmark Display

- **Status icons** - Visual indicators for dead links, enriched status, access count
- **Category tags** - Category labels displayed on bookmarks
- **Favicon display** - Website icons for quick recognition
- **Multi-select** - Select multiple bookmarks for batch operations (persistent across view changes)
- **Reactive filtering** - Sidebar counts update dynamically as you apply filters
- **Clear filters** - One-click button to reset all sidebar filters

### 💾 Data Explorer

- **Database browser** - Explore all 7 database tables interactively
- **Field coverage** - Visual bars showing data completeness
- **Cache inspector** - Monitor cached metrics with validity status
- **JSON export** - Export any table with filtering

### 🔒 Privacy First

- ✅ **100% local processing** - All data stays in your browser
- ✅ **No external APIs** - Only fetches from your bookmarked URLs when you trigger enrichment
- ✅ **No browsing tracking by default** - Tab monitoring is OFF unless you enable it
- ✅ **No analytics/telemetry** - Zero data collection

## Search Syntax

```
javascript tutorial       # Find "javascript" OR "tutorial"
+javascript +tutorial     # MUST contain both terms
javascript -video         # Find "javascript" but exclude "video"
"react hooks"             # Find exact phrase
/react.*hooks?/           # Regex pattern matching

# Special filters
category:code             # Filter by category
domain:github.com         # Filter by domain
accessed:yes              # Only accessed bookmarks (yes/no)
accessed:no               # Never accessed bookmarks
stale:yes                 # Old + never accessed
enriched:yes              # Has metadata (yes/no)
dead:yes                  # Dead links only (yes/no)
folder:"My Folder"        # Filter by folder path

# Platform filters (new in v3.0)
platform:youtube          # Filter by platform
platform:github           # GitHub bookmarks only
channel:@mkbhd            # YouTube channel (with or without @)
repo:facebook/react       # GitHub repository
author:username           # Blog/article author
type:video                # Content type (video, issue, article, repo, etc.)
type:issue|pr             # Multiple types with pipe separator
hasimage:yes              # Has thumbnail image
playlist:PLxxxxxxx        # YouTube playlist

# Combined example
domain:github.com +tutorial -video enriched:yes
platform:youtube channel:@fireship type:video
```

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Build & Package
To create a clean extension folder without `node_modules` (recommended for loading into Chrome):
```bash
npm run package
```

### 3. Load into Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the **`extension/`** folder in this project directory

---

## Development

For active development with hot-reloading (CSS) and watch mode (JS):

```bash
npm run dev
```

*Note: When running in dev mode, changes are built to the root directory. For the cleanest experience, use `npm run package` after making changes to refresh the `extension/` folder.*

## Search Syntax

**Popup** - Click extension icon for quick search and recent bookmarks

**Dashboard** - Full interface with four tabs:

- **Bookmarks** - Browse, search, and filter with sidebar
- **Insights** - Visual analytics dashboard
- **Health** - Enrichment, dead links, duplicates, similar bookmarks
- **Data** - Database explorer and cache management

## Configuration

Default settings:

```javascript
{
  enrichmentEnabled: true,           // Enable enrichment feature
  enrichmentBatchSize: 20,           // Bookmarks per batch (5-100)
  enrichmentConcurrency: 3,          // Parallel workers (1-10)
  enrichmentFreshnessDays: 30,       // Re-enrich after N days (0 = always)
  forceReenrich: false,              // Bypass freshness check
  trackBrowsingBehavior: false       // OFF by default
}
```

## Development

```bash
npm run dev        # Watch mode
npm run build      # Production build
npm run build:css  # Tailwind only
npm run build:js   # JavaScript only
```

## Tech Stack

- **UI**: Svelte 4, Tailwind CSS 3
- **Database**: IndexedDB via Dexie.js
- **Search**: FlexSearch.js
- **Charts**: Chart.js 4
- **Build**: Rollup

## Performance Optimizations

- **Centralized Bookmark Cache**: 30-second TTL cache prevents redundant database reads across modules
- **Debounced Search**: 300ms debounce eliminates UI lag during typing
- **Single-Pass Stats**: Search results and statistics computed in one operation
- **Visibility-Aware Refresh**: Background stats refresh pauses when tab is hidden
- **Lazy Loading**: Charts and heavy computations load on-demand

## File Structure

```
.
├── extension/         # Clean extension build (Load this in Chrome)
├── public/            # Compiled assets
├── src/               # Svelte components and logic
│   ├── db.js          # IndexedDB operations
│   ├── enrichment.js  # Metadata fetching pipeline
│   ├── url-parsers.js # Platform-specific URL parsing
│   ├── search.js      # FlexSearch with single-pass stats
│   ├── similarity.js  # TF-IDF similarity engine
│   ├── insights.js    # Analytics & platform insights
│   ├── stores.js      # Svelte state + bookmark cache
│   ├── utils.js       # Shared utilities & constants
│   ├── Dashboard.svelte   # Main dashboard
│   └── Sidebar.svelte     # Filters with platforms & creators
├── background.js      # Compiled background service worker
├── manifest.json      # Extension manifest
└── rollup.config.js   # Build configuration
```

## Permissions

- `bookmarks` - Read and manage bookmarks
- `storage` - Local data storage
- `favicon` - Display website icons
- `tabs` - Track bookmark access (opt-in only)
- `host_permissions` - Fetch metadata from bookmarked URLs

## Documentation

📖 **[Technical Documentation](TECHNICAL_DOCUMENTATION.md)** - Architecture, API reference, and implementation details

## License

MIT License
