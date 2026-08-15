# Changelog

All notable changes to Bookmark Insight.

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