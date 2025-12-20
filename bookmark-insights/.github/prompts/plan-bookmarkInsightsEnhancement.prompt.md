## Plan: Bookmark Insights Enhancement — Enrichment, Search & Visualization

A phased approach to transform the extension into a smart, local-first bookmark intelligence system. The core strategy is: migrate to IndexedDB via Dexie.js, build a background enrichment pipeline with scheduling, implement powerful search via FlexSearch, and layer in visualization + insights incrementally.

---

### Steps

1. **Migrate storage to IndexedDB via Dexie.js** — Replace `chrome.storage.local` in [database.js](src/database.js) with Dexie.js. Define schema with tables: `bookmarks` (expanded fields), `enrichmentQueue` (pending items), `events` (access/create/delete logs), `cache` (analytics results). Add migration logic to import existing `chrome.storage.local` data on first run. Dexie handles versioning and schema upgrades cleanly.

2. **Expand bookmark schema with enrichment fields** — New fields: `description`, `keywords[]`, `category`, `tags[]`, `isAlive`, `lastChecked`, `faviconUrl`, `contentSnippet`, `lastAccessed`, `accessCount`. Define Dexie indexes on `category`, `domain`, `isAlive`, `dateAdded` for efficient queries.

3. **Implement incremental sync mechanism** — Refactor [background.js](background.js) to track changes via Chrome bookmark events. Instead of full re-sync, add changed bookmarks to `enrichmentQueue` table. Process only new/modified items. Store `lastSyncTime` per-bookmark for staleness detection.

4. **Add background enrichment pipeline with alarms** — Use `chrome.alarms` API for scheduled runs (configurable: daily/weekly). Fetch page metadata via `fetch()` with 5-second timeout. Extract `<title>`, `<meta description>`, Open Graph tags, keywords. Rate limit at 1 request/second with configurable batch size (10-50). Add `alarms` permission to [manifest.json](manifest.json).

5. **Request host permissions for fetching** — Add `<all_urls>` or `*://*/*` to [manifest.json](manifest.json). Make enrichment opt-in with clear explanation in settings/README. Allow users to disable if concerned about privacy. Show enrichment status in popup.

6. **Implement dead-link checker** — Integrate into enrichment pipeline using HEAD requests with fallback to GET. Store `isAlive` (true/false/null for unknown) and `lastChecked` timestamp. Handle CORS failures gracefully (mark as "unknown"). Provide manual re-check button in Health view of [Dashboard.svelte](src/Dashboard.svelte).

7. **Add auto-categorization via rule-based classifier** — Parse fetched HTML for category signals. Use domain patterns (github.com → "code", youtube.com → "video"), URL path keywords, meta keywords, and common terms ("tutorial", "docs", "api"). Store in `category` field. Allow manual override via tags.

8. **Implement FlexSearch for powerful search** — Add FlexSearch.js as dependency. Create indexes on `title`, `url`, `description`, `keywords`, `category`. Rebuild index on sync events; persist serialized index to IndexedDB `cache` table. Update [SearchBar.svelte](src/SearchBar.svelte) to use FlexSearch with fuzzy matching and result ranking.

9. **Add domain hierarchy visualization** — Create tree/sunburst chart in [Dashboard.svelte](src/Dashboard.svelte) Insights view showing domain → subdomain → path structure with bookmark counts. Use Chart.js treemap plugin or D3.js. Interactive drill-down for exploring large collections.

10. **Enhance similar-links detection with enriched metadata** — Refactor `findSimilarBookmarks()` in [database.js](src/database.js) to use `keywords[]` and `category` alongside title words. Implement TF-IDF vectors with cosine similarity for semantic matching. Cache similarity scores in IndexedDB.

11. **Build data insights dashboard panel** — New section in Insights view: top categories over time, content trends, "stale bookmarks" (old + zero access), reading list suggestions, expertise areas based on category distribution. Use `events` table data for behavioral insights.

12. **Add event logging for behavioral analytics** — Log bookmark create/delete/access events to `events` table in IndexedDB. Track via `chrome.tabs` API (requires `tabs` permission) to detect when user visits a bookmarked URL. Power "bookmark and forget" detection and usage patterns.

---

### Further Considerations

1. **Dexie.js integration approach**: Bundle Dexie.js via npm/rollup (already have [rollup.config.js](rollup.config.js)). Use Dexie's `version().stores()` for schema migrations. Consider `dexie-export-import` addon for backup/restore feature.

2. **Graceful degradation for CORS-blocked sites**: Many sites block cross-origin fetches. Implement fallback strategy: try HEAD → try GET with `no-cors` → mark as "enrichment failed". Don't treat CORS failures as dead links.

3. **User control over enrichment**: Add settings panel for: enrichment on/off, batch size, schedule frequency, categories to auto-tag. Store preferences in IndexedDB `settings` table.

4. **Performance at scale**: With 5000+ bookmarks, Dexie's indexed queries will outperform `chrome.storage.local` scanning. Use pagination and virtual scrolling in list views. Lazy-load charts in Insights view.

5. **Privacy-first design**: All data stays local. No external API calls except to the bookmarked URLs themselves. Document this clearly in README. Consider adding "clear all enrichment data" option.
