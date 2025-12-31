# Implementation Plan: UI Redesign & Filter Sync

## Status: ✅ COMPLETED (December 31, 2025)

## Goal
Redesign the UI to improve usability, fix broken/out-of-sync filters, implement bidirectional sync between search and sidebar, and enable multi-select across all views.

## Phase 1: Centralized State Management
**File:** `src/stores.js`

Currently, state is fragmented between `Dashboard.svelte` and `Sidebar.svelte`. We will move the "source of truth" to Svelte stores.

1.  **Create `activeFilters` Store**:
    *   Structure:
        ```javascript
        {
          domains: [],
          folders: [],
          platforms: [],
          types: [],
          deadLinks: false,
          stale: false,
          // ... other filters
        }
        ```
    *   Actions: `addFilter`, `removeFilter`, `clearFilters`, `setFilters`.

2.  **Create `searchQuery` Store**:
    *   Holds the raw text string from the search bar.

3.  **Create `selectedBookmarks` Store**:
    *   Holds a Set or Array of IDs for multi-select functionality.
    *   Actions: `toggleSelection`, `selectAll`, `clearSelection`.

## Phase 2: Advanced Search Parsing
**File:** `src/search.js`

We need to extract structured data from the search string so it can be applied as filters (syncing with the Sidebar).

1.  **Implement `parseSearchQuery(query)`**:
    *   Input: `"spark domain:youtube.com folder:work"`
    *   Output:
        ```javascript
        {
          text: "spark",
          filters: {
            domains: ["youtube.com"],
            folders: ["work"]
          }
        }
        ```
    *   Logic: Regex matching for `prefix:value`.

2.  **Update `searchBookmarks`**:
    *   Accept `activeFilters` as an argument.
    *   Apply these filters *before* or *during* the FlexSearch execution to ensure consistency.

## Phase 3: Sidebar Refactoring
**File:** `src/Sidebar.svelte`

Make the Sidebar a "dumb" component that reflects the global store state.

1.  **Remove Local State**: Delete `let selectedFilters = ...`.
2.  **Subscribe to Store**: Use `$activeFilters` to determine which checkboxes/items are active.
3.  **Update Actions**: Clicking a filter should call `activeFilters.toggle(...)` instead of dispatching an event to the parent (or dispatch an event that the parent uses to update the store).

## Phase 4: Dashboard Orchestration
**File:** `src/Dashboard.svelte`

1.  **Handle Search Input**:
    *   On input, call `parseSearchQuery`.
    *   If structured filters are found (e.g., `domain:youtube.com`), update the `activeFilters` store immediately and strip them from the `searchQuery` store (optional, or keep them for display but sync the UI).
    *   *Decision*: We will strip them from the text view and "light up" the sidebar filter to show the user what happened.

2.  **Reactive Data Loading**:
    *   Use a reactive statement `$: filteredBookmarks = searchBookmarks($allBookmarks, $searchQuery, $activeFilters)` to automatically update the view.

## Phase 5: UI & Multi-Select Enhancements
**Files:** `src/BookmarkCard.svelte`, `src/BookmarkListItem.svelte`

1.  **Card View Selection**:
    *   Add a checkbox overlay to `BookmarkCard.svelte`.
    *   Show it on hover OR when `selectedBookmarks.length > 0`.
    *   Bind to `selectedBookmarks` store.

2.  **Search Results Header**:
    *   Redesign the "Showing X of Y bookmarks" section.
    *   Add "chips" for active filters that allow quick removal (e.g., `[x] Domain: YouTube`).

## Phase 6: Verification & Fixes ✅
1.  **Fix "Broken" Filters**:
    *   Verify `deadLinks` and `stale` logic in `src/search.js` against the actual data structure in `db.js`.
2.  **Test Sync**:
    *   Type `domain:google.com` -> Sidebar "Google" gets selected.
    *   Click Sidebar "Google" -> Filter applies.
3.  **Test Multi-Select**:
    *   Select items in List view -> Switch to Grid view -> Selections persist.

---

## Implementation Summary

All phases have been successfully implemented:

1. **Centralized State Management** (`stores.js`) - Created `activeFilters`, `searchQueryStore`, and `selectedBookmarksStore` stores.
2. **Advanced Search Parsing** (`search.js`) - Implemented `parseSearchQuery()` to extract structured filters and integrated with `searchBookmarks()`.
3. **Sidebar Refactoring** (`Sidebar.svelte`) - Converted to reactive component subscribing to global stores with dynamic count updates.
4. **Dashboard Orchestration** (`Dashboard.svelte`) - Implemented reactive data loading with proper state synchronization.
5. **UI Enhancements** - Added multi-select support with persistent selection across view changes.
6. **Bug Fixes**:
   - Fixed property mapping (`folderPath` instead of `folder`, `contentType` instead of `type`)
   - Fixed sidebar reactivity to update on any filter change
   - Fixed creator filter selection highlighting

**Key Improvements:**
- Sidebar counts now update dynamically when any filter is applied
- Search bar and sidebar filters stay synchronized
- Multi-select works across list and grid views
- All filter types (domains, folders, platforms, creators, content types) work correctly
