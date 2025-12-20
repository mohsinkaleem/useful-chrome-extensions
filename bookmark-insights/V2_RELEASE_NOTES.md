# Bookmark Insights v2.0 - What's New

## 🚀 Major Enhancements

### IndexedDB Storage with Dexie.js
The extension now uses a powerful IndexedDB database instead of Chrome's `storage.local` API, providing:
- **Faster queries** with proper indexes on domain, category, date, and health status
- **Structured schema** with support for enrichment metadata
- **Automatic migration** from your existing bookmarks (seamless upgrade)
- **Scalability** for thousands of bookmarks without performance degradation

### FlexSearch-Powered Search
Powerful fuzzy search with intelligent ranking:
- **Multi-field indexing** on title, URL, description, keywords, category, domain
- **Weighted boosting** for title (3x), category (2x), keywords (2x)
- **Real-time suggestions** with autocomplete dropdown
- **Keyboard navigation** (up/down arrows, enter, escape)
- **Cached index** in IndexedDB for fast startup
- **Fallback search** if FlexSearch unavailable

### Background Enrichment Pipeline
Bookmarks are now automatically enriched with metadata:
- **Descriptions** extracted from page meta tags (Open Graph, Twitter cards, etc.)
- **Keywords** for improved search relevance
- **Auto-categorization** based on domain, URL patterns, and content
- **Favicon caching** for visual identification
- **Content snippets** from page text

### Dead Link Detection
The extension automatically monitors bookmark health:
- **Periodic checks** to identify broken links
- **Three-state system**: Alive, Dead, or Unknown (for CORS-blocked sites)
- **Graceful handling** of timeouts and network errors
- **Manual re-check** option in Health dashboard

### Smart Auto-Categorization
Bookmarks are intelligently categorized into types:
- **15+ categories**: code, video, social, blog, reference, documentation, API, tutorial, news, education, tool, shopping, and more
- **Multi-tier detection**:
  1. Domain-based rules (github.com → code)
  2. URL path patterns (/docs → documentation)
  3. Content keyword analysis

### TF-IDF Similarity Detection
Advanced semantic similarity matching:
- **TF-IDF vectors** for bookmark content
- **Cosine similarity** scoring for accurate matching
- **Enhanced duplicate detection** (exact + normalized URL)
- **Related bookmarks** discovery
- **5-minute caching** for performance

### Domain Hierarchy Visualization
Visual exploration of your bookmark domains:
- **Hierarchical breakdown**: domain → subdomain → path
- **Interactive chart** showing top 15 domains
- **Detailed breakdown panel** with subdomain statistics

### Data Insights Dashboard
Comprehensive analytics and insights:
- **Insights summary cards**: categorized %, enriched %, dead links, etc.
- **Category trends** over time (line chart)
- **Expertise areas** based on bookmark patterns (polar chart)
- **Content freshness** age distribution (doughnut chart)
- **Top categories** with progress bars
- **Stale bookmarks** (90+ days old, never accessed)
- **Reading list** suggestions (recently added, not visited)
- **Most accessed** bookmarks ranking
- **"Bookmark and Forget"** detection (6+ months, never accessed)

### Behavioral Analytics
Track bookmark usage patterns:
- **Tab monitoring** to detect when you visit bookmarked URLs
- **Access count** tracking per bookmark
- **Event logging** for create, delete, update, access events
- **Hourly access patterns** analytics

### Scheduled Enrichment
Configurable background processing:
- **Schedule options**: Hourly, Daily, Weekly, or Manual
- **Batch processing** with rate limiting (1 req/sec default)
- **Privacy-first**: All processing happens locally
- **Opt-in**: Enrichment can be fully disabled

---

## 📊 Database Schema

### Bookmarks Table
All bookmarks with enrichment fields:
```javascript
{
  id: String,
  url: String,
  title: String,
  domain: String,
  dateAdded: Number,
  folderPath: String,
  parentId: String,
  
  // Enrichment fields (new in v2.0)
  description: String?,
  keywords: String[],
  category: String?,
  tags: String[],
  isAlive: Boolean?,
  lastChecked: Number?,
  faviconUrl: String?,
  contentSnippet: String?,
  lastAccessed: Number?,
  accessCount: Number
}
```

### Supporting Tables
- **enrichmentQueue** - Pending enrichment tasks with priority
- **events** - Event log for analytics (create, delete, update, access)
- **cache** - Cached analytics results with TTL
- **settings** - User preferences and configuration

---

## ⚙️ Settings

Default configuration (customizable in future UI):
```javascript
{
  enrichmentEnabled: true,
  enrichmentSchedule: 'daily',
  enrichmentBatchSize: 20,
  enrichmentRateLimit: 1000,  // ms between requests
  autoCategorizationEnabled: true,
  deadLinkCheckEnabled: true,
  privacyMode: false
}
```

---

## 🔒 Privacy & Security

- ✅ **100% local processing** - All data stays in your browser's IndexedDB
- ✅ **No external APIs** - Only fetches from your bookmarked URLs
- ✅ **Opt-in enrichment** - Can be fully disabled
- ✅ **Transparent permissions** - `<all_urls>` only used for enrichment
- ✅ **CORS-safe** - Gracefully handles blocked requests

---

## 🏗️ Technical Architecture

### File Structure
```
src/
  db.js                - Dexie database layer with schema
  enrichment.js        - Enrichment pipeline engine
  search.js            - FlexSearch integration
  similarity.js        - TF-IDF similarity detection
  insights.js          - Domain hierarchy & analytics
  database-compat.js   - Compatibility wrapper
  database.js          - Original functions (preserved)
  SearchBar.svelte     - Enhanced with suggestions
  Dashboard.svelte     - Enhanced with insights panels
  ...

background-new.js      - Enhanced background script
manifest.json          - v2.0 with new permissions
```

### Build System
- **Rollup** bundles background script with Dexie
- **ES modules** for modern JavaScript support
- **Tailwind CSS** for styling

### Event Flow
```
Chrome Bookmark Event
  ↓
Background Script Listener
  ↓
IndexedDB Update
  ↓
Add to Enrichment Queue (if new/changed)
  ↓
Scheduled Alarm Trigger
  ↓
Batch Processing
  ↓
Metadata Fetch & Categorization
  ↓
IndexedDB Update with Enrichment Data
```

---

## 🧪 Testing & Verification

### Automated Migration
On first run after upgrade:
1. Extension detects existing `chrome.storage.local` data
2. Migrates all bookmarks to IndexedDB
3. Preserves existing fields, adds enrichment fields
4. Marks migration as complete
5. Queues bookmarks for enrichment

### Manual Testing
1. Add a bookmark → Check IndexedDB for new entry
2. Modify bookmark → Verify incremental update
3. Delete bookmark → Confirm removal from IndexedDB
4. Wait for enrichment → Check for description/category
5. Check dead link detection → Verify isAlive status

---

## 📈 Performance Optimizations

- **Indexed queries** on frequently-searched fields
- **Batch processing** for enrichment (20 items default)
- **Rate limiting** to avoid overwhelming the browser
- **Timeout protection** (5s per request)
- **Caching** of analytics results
- **Pagination** support for large datasets (already exists)

---

## 🛣️ Roadmap

### Coming Soon (Steps 8-12)
- [x] Dexie.js migration
- [x] Enrichment pipeline
- [x] Auto-categorization
- [x] Dead link detection
- [ ] **FlexSearch integration** for fuzzy search
- [ ] **Settings UI panel** for user configuration
- [ ] **Domain hierarchy visualization** (treemap/sunburst)
- [ ] **Enhanced similar-links detection** with TF-IDF
- [ ] **Insights dashboard** with trends and analytics
- [ ] **Behavioral analytics** with access tracking

---

## 📦 Installation & Upgrade

### Fresh Install
```bash
npm install
npm run build
```
Load unpacked extension from `bookmark-insights/` folder.

### Upgrading from v1.x
1. Pull latest code
2. Run `npm install` (adds Dexie)
3. Run `npm run build`
4. Reload extension in Chrome
5. Migration happens automatically

---

## 🐛 Troubleshooting

### Migration Issues
If migration fails, check:
- Console logs in background service worker
- IndexedDB tables in DevTools → Application → IndexedDB
- Old data still exists in chrome.storage.local

### Enrichment Not Working
Verify:
- Settings: `enrichmentEnabled: true`
- Permissions: `<all_urls>` granted
- Alarm scheduled: Check `chrome://serviceworker-internals/`
- Queue size: Should have pending items

### CORS Errors
Normal behavior for sites with strict CORS policies:
- Extension marks as "unknown" instead of "dead"
- Doesn't break enrichment for other bookmarks
- Uses fallback GET with `no-cors` mode

---

## 🙏 Credits

Built with:
- [Dexie.js](https://dexie.org/) - IndexedDB wrapper
- [Svelte](https://svelte.dev/) - Reactive UI framework
- [Chart.js](https://www.chartjs.org/) - Data visualization
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS

---

## 📄 License

MIT License - See LICENSE file for details
