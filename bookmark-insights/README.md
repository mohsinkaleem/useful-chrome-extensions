# Bookmark Insight — Chrome Extension

A privacy-first bookmark manager with advanced search, platform-aware enrichment, visual analytics, and maintenance tools. All processing happens locally in your browser.

## Features

### 🔍 Advanced search

- **FlexSearch** fuzzy matching combined with a custom query parser
- **Boolean operators**: `+term` (must include), `-term` (must exclude)
- **Exact phrases**: `"quoted phrases"`
- **Regex patterns**: `/pattern/` or `/pattern/flags`
- **Special filters**: `category:`, `domain:`, `folder:`, `accessed:`, `stale:`, `dead:`, `enriched:`
- **Platform filters**: `platform:`, `channel:`, `repo:`, `author:`, `type:`, `hasimage:`, `playlist:`
- **Visual filter builder** with quick-access buttons for common filters
- **Search history** in a dropdown
- **Keyword highlighting** in titles, URLs and descriptions
- **Dynamic sidebar** — domain, folder and topic counts update with the result set

### 📱 Platform enrichment

Structured data is extracted from the URL alone, with no network request:

- **YouTube** — video IDs, channel handles, playlists, shorts
- **GitHub** — repositories, issues, PRs, files, wikis, gists
- **Medium / dev.to / Substack** — authors, publications, article metadata
- **Twitter/X**, **Reddit**, **Stack Overflow**, **npm**

### 📊 Visual insights

The Insights tab renders Chart.js visualisations over your collection: platform distribution, creator leaderboard, content types, topic clusters, and time-based patterns.

### 🔧 Enrichment pipeline

- **Manual only** — enrichment never runs on a schedule
- **Parallel processing** with configurable concurrency
- **Metadata extraction** — Open Graph, Twitter Card, JSON-LD, meta tags, favicons
- **Deep analysis** — reading time, published date, content quality and smart tags, derived from already-stored metadata without refetching
- **Auto-categorization** from domain, URL path and content keywords
- **Real-time progress** with detailed logs

### 🏥 Health & maintenance

- **Dead links** — view, re-check or delete unreachable bookmarks
- **Duplicates & similar content** — unified panel with side-by-side comparison
- **Cleanup candidates** — dead, old and unused, generic titles, temporary/dev URLs, low quality score
- **Malformed URL detection**
- **Backup & restore** — full JSON or compressed `.db` export

### 💾 Data explorer

Browse every IndexedDB table, inspect field coverage, review cached metrics and their TTLs, and export any table as JSON.

### 🔒 Privacy

- **100% local** — no analytics, no telemetry, no third-party services. Favicons are rendered locally rather than fetched from a favicon service.
- **Network requests only during enrichment**, only to your own bookmarked URLs, and only when you trigger it. Requests omit credentials, refuse private/loopback/link-local addresses, cap the response body, and require an HTML content type.
- **No browsing tracking by default** — tab monitoring is off and requires the optional `tabs` permission.

## Search syntax

```
javascript tutorial       # Find "javascript" OR "tutorial"
+javascript +tutorial     # MUST contain both terms
javascript -video         # Find "javascript" but exclude "video"
"react hooks"             # Exact phrase
/react.*hooks?/           # Regex pattern

# Special filters
category:code
domain:github.com
accessed:yes | accessed:no
stale:yes                 # Old and never accessed
enriched:yes | enriched:no
dead:yes
folder:"My Folder"

# Platform filters
platform:youtube
channel:@mkbhd
repo:facebook/react
author:username
type:video | type:issue|pr
hasimage:yes
playlist:PLxxxxxxx

# Combined
domain:github.com +tutorial -video enriched:yes
platform:youtube channel:@fireship type:video
```

## Getting started

```bash
npm install
npm run build
```

Then load the extension:

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project directory

## Interface

The extension has no popup. Clicking the toolbar icon opens the **side panel** for quick search and recent bookmarks. From there, "Open Dashboard" opens the full interface with four tabs:

- **Bookmarks** — browse, search and filter with the sidebar
- **Insights** — visual analytics
- **Health** — enrichment, dead links, duplicates, cleanup, backup
- **Data** — database explorer and cache management

## Configuration

```javascript
{
  enrichmentEnabled: true,           // Enable the enrichment feature
  enrichmentConcurrency: 3,          // Parallel workers (1-10)
  enrichmentFreshnessDays: 30,       // Re-enrich after N days (0 = always)
  trackBrowsingBehavior: false       // Off by default; needs the optional tabs permission
}
```

## Development

```bash
npm run dev          # Watch mode
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier
npm run test         # Vitest
npm run knip         # Unused files, exports and dependencies
```

CI runs lint, format check, tests, knip and a build on every push and pull request.

## Tech stack

- **UI**: Svelte 4, Tailwind CSS 3
- **Database**: IndexedDB via Dexie.js
- **Search**: FlexSearch.js
- **Charts**: Chart.js 4 (Insights tab only)
- **Build**: Rollup
- **Tooling**: ESLint 9, Prettier, Vitest, Knip

## File structure

```
.
├── public/                    # Compiled dashboard and side panel assets
├── test/                      # Vitest unit tests for the pure functions
├── src/
│   ├── background.js          # Service worker: sync, message router, tracking
│   ├── db.js                  # Dexie schema, queries, metric cache, backup
│   ├── db-explorer.js         # Data Explorer queries
│   ├── enrichment.js          # Metadata fetching and categorization
│   ├── url-safety.js          # SSRF blocklist, scheme allowlists, safeFetch
│   ├── url-parsers.js         # Platform-specific URL parsing
│   ├── metadata-analyzer.js   # Reading time, published date, quality, tags
│   ├── search.js              # FlexSearch index and query parsing
│   ├── similarity.js          # Duplicate and near-duplicate detection
│   ├── insights.js            # Analytics aggregations
│   ├── topics.js              # Topic taxonomy and detection
│   ├── stores.js              # Svelte stores for filters, search, selection
│   ├── darkModeStore.js       # Dark mode persistence
│   ├── utils.js               # Shared helpers and constants
│   ├── error-boundary.js      # CSP-safe crash fallback
│   ├── Dashboard.svelte       # Dashboard shell
│   ├── DashboardHeader.svelte
│   ├── SidePanel.svelte
│   ├── Sidebar.svelte         # Filter sidebar
│   ├── SearchBar.svelte
│   ├── BookmarkCard.svelte / BookmarkListItem.svelte
│   ├── ActiveFilterChips.svelte
│   ├── UselessCategory.svelte
│   ├── Highlight.svelte       # Search-term highlighting without {@html}
│   ├── InsightCard.svelte
│   ├── VisualInsights.svelte  # Insights tab charts
│   └── DataExplorer.svelte
├── background.js              # Compiled service worker
├── manifest.json
└── rollup.config.js
```

## Permissions

| Permission | Why |
|---|---|
| `bookmarks` | Read and manage bookmarks |
| `storage` | Settings and dark mode preference |
| `sidePanel` | The primary UI surface |
| `readingList` | Show and manage Chrome reading list items |
| `<all_urls>` (host) | Fetch metadata from bookmarked URLs during enrichment |
| `tabs` *(optional)* | Record bookmark access; only requested when you enable browsing behaviour tracking |

## Documentation

📖 **[Technical Documentation](TECHNICAL_DOCUMENTATION.md)** — architecture and implementation details

🛠 **[Troubleshooting](TROUBLESHOOTING.md)**

## License

MIT — see [LICENSE](LICENSE).
