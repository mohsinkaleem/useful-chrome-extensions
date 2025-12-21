# Bookmark Insights - Chrome Extension

A powerful, privacy-first bookmark intelligence system with smart search, enrichment, insights, and maintenance tools.

## Features

### 🔍 Advanced Search

- **Boolean operators**: `+term` (must include), `-term` (must exclude)
- **Exact phrases**: `"quoted phrases"` for precise matching
- **Regex patterns**: `/pattern/` or `/pattern/flags` for advanced matching
- **Special filters**: `category:code`, `domain:github`, `accessed:yes`, `stale:yes`, `dead:yes`, `enriched:yes`, `folder:"path"`
- **Smart relevance ranking** - title matches rank highest
- **Dynamic filtering** - sidebar updates to show matching domains and folders
- **Visual query feedback** - parsed terms displayed as colored tags

### 📊 Visual Analytics Dashboard

Five interactive tabs with actionable insights:

- **❤️ Health** - Collection health score, bookmark ROI, decay rate, dead link ratio
- **📚 Content** - Category distribution, topic clusters, content type analysis
- **⚡ Actions** - Stale queue, cleanup candidates, rediscovery feed
- **🌐 Domains** - Domain reliability, valuable domains, concentration warnings
- **⏰ Time** - Hourly/daily patterns, collection age, monthly trends

### 🔧 Enrichment Pipeline

- **Manual enrichment** - Click to fetch metadata (never automatic)
- **Force re-enrich** - Option to bypass freshness check for on-demand refresh
- **Parallel processing** - Configurable concurrency (3-10x faster)
- **Metadata extraction** - Title, description, Open Graph, keywords, favicons
- **Auto-categorization** - 15+ categories based on domain, URL, and content
- **Real-time progress** - Live progress bar with detailed logs

### 🏥 Health & Maintenance

- **Dead links** - View, re-check, or delete unreachable bookmarks
- **Smart similar detection** - On-demand fuzzy matching with side-by-side comparison
- **Cached results** - Shows cache status with option to force refresh
- **Duplicate detection** - Exact and normalized URL matching
- **Malformed URL detection** - Find invalid bookmark URLs

### 📚 Bookmark Display

- **Status icons** - Visual indicators for dead links, enriched status, access count
- **Category tags** - Category labels displayed on bookmarks
- **Favicon display** - Website icons for quick recognition
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

# Combined example
domain:github.com +tutorial -video enriched:yes
```

## Installation

### Development

```bash
npm install
npm run build
```

Then load in Chrome:

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder

### Production Build

For a lightweight distribution (~1MB vs 100MB+ with node_modules):

```bash
npm run dist
```

This creates a `dist/` folder with only the required files. Load this folder in Chrome for a minimal footprint.

## Usage

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
npm run dev        # Watch mode with sourcemaps
npm run build      # Production build (minified, no sourcemaps)
npm run build:css  # Tailwind only
npm run build:js   # JavaScript only
npm run dist       # Create lightweight dist/ folder (~1MB)
```

## Tech Stack

- **UI**: Svelte 4, Tailwind CSS 3
- **Database**: IndexedDB via Dexie.js
- **Search**: FlexSearch.js
- **Charts**: Chart.js 4
- **Build**: Rollup (with terser minification)
- **Production size**: ~1MB

## File Structure

```
src/
├── db.js           # IndexedDB operations & caching
├── enrichment.js   # Metadata fetching pipeline
├── search.js       # FlexSearch integration
├── similarity.js   # TF-IDF similarity engine
├── insights.js     # Analytics generation
├── stores.js       # Svelte state management
├── Dashboard.svelte
├── Sidebar.svelte
├── VisualInsights.svelte
└── ...
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
