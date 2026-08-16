# Changelog

All notable changes to Bookmark Insight.

## 2.3.0 — 2026-08-16

Roadmap phases 5-10: correctness, dead-code removal, robustness, UX and features.

### Added

- **Omnibox** — type `bm` then space in the address bar to run the full query language without opening any UI. Unresolved queries hand off to the dashboard.
- **Trash** — every delete now passes through a 30-day holding area with an undo toast. Bulk deletes report progress and can be cancelled mid-run.
- **Saved searches** — store a query plus its filters as a smart folder, with a live count in the sidebar.
- **Merge duplicates** — keeps the richer record and unions tags, keywords, topics and metadata, instead of forcing a survivor to be picked.
- **Folder suggestions** — topics that are well represented but scattered across many folders, with one-click create-and-move.
- **Domain operations** — per-domain totals, dead counts, re-check and delete-all-dead.
- **Export** to Markdown, CSV and Netscape HTML alongside the existing JSON backup.
- **Read Next** reading-time buckets and **content age** filters, which finally drive the `readingTimeRange` and `hasPublishedDate` filters that were already wired into search but had no UI.
- Keyboard shortcuts: `/` and `Ctrl`/`Cmd`+`K` focus search, `j`/`k` walk results, `Enter` opens, `Esc` closes, `Alt`+`Shift`+`B` opens the side panel.
- Field-filter autocomplete in the search box, so the 14 documented filters are discoverable in-app.
- Per-domain rate limiting with `Retry-After` handling in the enrichment pipeline.
- 52 further unit tests (100 total) covering predicates, `safeHref`, the exporters and published-date parsing.

### Fixed

- Deleting a folder orphaned every bookmark inside it; descendants are now collected from `removeInfo.node.children`.
- Sync never pruned, so bookmarks removed while the service worker was suspended survived in every count and search result forever.
- Any text query silently dropped **all** reading-list items, because they are never in the FlexSearch index.
- Failed enrichment counted as successful enrichment, inflating every progress bar and pending count. `enrichedAt` now tracks success; `lastChecked` remains the retry guard.
- `chrome://`, `file://` and bookmarklet bookmarks are marked non-enrichable instead of being re-queued on every sync.
- A user regex with `/g` was stateful across bookmarks, so the same query returned different results on consecutive runs. Pattern length is capped and nested quantifiers are rejected.
- A transient IndexedDB failure could re-queue the entire collection for network enrichment.
- `handleBookmarkMoved` and `handleBookmarkChanged` did not invalidate the metric caches, so folder changes took up to an hour to reach the sidebar.
- Dead-link re-checks are capped and checkpointed, so a service-worker termination costs one chunk rather than the whole run.
- Four `{#each}` blocks over mutated arrays were unkeyed and rendered rows against the wrong record after a delete.
- `chrome.bookmarks.onCreated` overwrote restored records with blank enrichment fields; it now adopts an existing or recently-trashed record.

### Changed

- One `predicates.js` defines `isEnriched`, `isStale`, `isDead` and `isNeverAccessed`; the three conflicting definitions of "enriched" are gone.
- All 20 blocking `confirm()`/`alert()` calls replaced with a dark-mode-aware, focus-trapped dialog and a toast host with `aria-live`.
- Bookmark titles are real anchors in both the list and card views, restoring middle-click, "open in new window" and "copy link address".
- View mode, sort order, filters and query persist across reloads.
- `href` values go through a scheme allowlist at all anchor sites.
- Deep Analysis runs in the existing worker and writes in batches rather than one transaction per record.
- `privacyMode` is now a real guard in `enrichBookmark`.
- The `commands.description` field was removed from the reserved `_execute_action` entry, which Chrome rejects.

### Removed

- 29 unreachable exports in `db.js` (~700 lines) and the `similarities` table, which nothing ever wrote to. `knip` was misconfigured and reported none of it; the root cause was a dynamic `import('./db.js')` that made every export look used.
- Five settings with no readers, and the one-shot `chrome.storage.local` migration that ran on every browser launch.

## 2.2.0 — 2026-08-15

Code review remediation, phases 0-4.

### Security

- Enrichment fetches now omit credentials, so authenticated pages are no longer fetched and stored.
- Added a private/loopback/link-local blocklist, applied to enrichment and dead-link checks, including after redirects.
- Response bodies are capped at 512 KB, gated on an HTML content type, and the timeout now covers body download.
- Meta tags are parsed from cleaned HTML, so values inside <script> bodies or comments can no longer be injected.
- Favicon and og:image URLs go through a scheme allowlist; `javascript:` no longer survives URL resolution.
- Removed the Google favicon service; icons are generated locally, restoring the 100%-local claim.
- Removed `web_accessible_resources`, closing an extension-fingerprinting vector.
- Dropped the `alarms` permission and made `tabs` optional.
- `{@html}` removed from the codebase in favour of a `<Highlight>` component.

### Fixed

- The Cleanup Candidates panel had no trigger and always rendered empty.
- Generic-title and temporary-URL detection matched by substring, mislabelling dev.to, LinkedIn and any title containing "bookmark", "link" or "page". Both rules now have a single definition matching whole titles and hostname labels.
- Tab listeners are registered synchronously and a `runtime.onStartup` handler was added, so the database opens on browser launch.
- `hashchange` and `runtime.onMessage` listeners are now removed on destroy in the dashboard and side panel.
- The crash-screen Reload button used an inline `onclick`, which MV3's CSP blocks.

### Removed

- ~2,960 lines of unreachable code, including `loadInsights()` and its chart layer (the dashboard has no `<canvas>`), `CreatorExplorer.svelte`, ~60 unused exports, and the entire TF-IDF similarity stack they kept alive.
- Dexie schema versions 1-4, whose upgrade bodies only logged.
- The alarm subsystem, which only ever cleared alarms.
- The `chrome.storage.local` dual-write, which had no reader and could abort a sync on quota overflow.

### Added

- ESLint 9, Prettier, Vitest, Knip and a GitHub Actions workflow.
- 48 unit tests covering URL safety, the metadata adapter, URL parsing, topic detection and shared utilities.

---

## Earlier

## Recent Updates (January 2026)

### Dashboard Filter Error Fix & Enrichment UI Improvements (January 28, 2026)

**Issue**: Dashboard page was throwing "Cannot read properties of undefined (reading 'length')" error when loading bookmarks. The SidePanel worked correctly.

**Root Cause & Fix**:

1. **Missing Filter Properties in Store** ([stores.js](src/stores.js))
   - The `activeFilters` store was missing `types` and `creators` arrays in its initial state
   - The `hasActiveFilters()` function in Dashboard.svelte was accessing these undefined properties without null checks
   - Added `types: []` and `creators: []` to the store's initial state, `clearFilters()`, and `reset()` methods

2. **Unsafe Property Access** ([Dashboard.svelte](src/Dashboard.svelte))
   - Updated `hasActiveFilters()` function to check for undefined before accessing `.length` on all filter arrays
   - Fixed UI conditional that displayed active filter chips to use safe property access with `&&` guards

**Enrichment UI Improvements**:

- Added **Concurrency Control** (1-20 parallel requests) input in Advanced Options
- Added **Estimated Time** display based on batch size and concurrency settings
- Added **Activity Log** panel showing real-time enrichment progress with timestamps
- Advanced Options panel now auto-expands when enrichment is running
- Improved input field styling and labels with proper accessibility attributes

---

### Filter Reactivity & State Management Improvements

**Issue**: Sidebar filter counts weren't updating when filters were applied without an active search query.

**Root Causes Identified & Fixed**:

1. **Missing Stats Computation in Filter-Only Mode** ([search.js](src/search.js))
   - The `searchBookmarks()` function had an early return path for filter-only queries (no search text) that didn't compute stats
   - Added `computeStats` check to the filter-only code path to ensure sidebar stats are calculated

2. **Inconsistent Active Filter Detection** ([Dashboard.svelte](src/Dashboard.svelte), [Sidebar.svelte](src/Sidebar.svelte))
   - `hasActiveFilters()` in Dashboard and `activeFiltersExist` in Sidebar checked different filter properties
   - Aligned both to check all filter types: domains, folders, platforms, types, creators, tags, deadLinks, stale, dateRange, readingTimeRange, qualityScoreRange, hasPublishedDate

3. **Missing Filter Implementations** ([search.js](src/search.js))
   - Added support for `readingTimeRange`, `qualityScoreRange`, and `hasPublishedDate` filters
   - These filters were defined in the UI but not applied during search/filtering

4. **Case-Insensitive Filter Matching** ([stores.js](src/stores.js), [search.js](src/search.js))
   - Filter toggle/add/remove operations now use case-insensitive comparison for consistency
   - Search filtering now lowercases both bookmark values and filter values when comparing

5. **Reactive Statement Ordering** ([Sidebar.svelte](src/Sidebar.svelte))
   - Moved `activeFiltersExist` computation before `useFilteredStats` to ensure proper dependency resolution
   - Added intermediate `useFilteredStats` reactive variable to ensure proper prop change detection

6. **Date Filter Toggle Behavior** ([Sidebar.svelte](src/Sidebar.svelte))
   - Added toggle-off functionality: clicking the same date filter again now clears it instead of reapplying

**Result**: Sidebar now correctly updates all filter counts in real-time, whether using search or filters alone.

---