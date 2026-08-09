# Technical Documentation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension (MV3)                   │
├─────────────────────────────────────────────────────────────┤
│  Background (Service Worker)                                │
│  └── service-worker.ts     Context menus, badge, commands   │
├─────────────────────────────────────────────────────────────┤
│  Popup / Side Panel                                         │
│  ├── popup.ts              Popup controller                 │
│  ├── sidepanel.ts          Side panel controller (Chrome 114+)│
│  └── components/           UI components (5 modules)        │
├─────────────────────────────────────────────────────────────┤
│  Shared Utilities                                           │
│  ├── tab-utils.ts          Tab queries, debounced events    │
│  ├── url-utils.ts          URL normalization, duplicates    │
│  ├── grouping.ts           Domain + title-similarity grouping│
│  ├── tab-balancer.ts       Window balancing                 │
│  ├── bookmark-utils.ts     Bookmark operations              │
│  ├── window-utils.ts       Window merging                   │
│  └── dialogs.ts            In-page confirm/prompt/toast     │
└─────────────────────────────────────────────────────────────┘
```

There is **no content script layer**. Media control is done with `chrome.tabs.update({ muted })`, so the extension declares no host permissions and injects nothing into pages.

## Component Details

### Background Layer

#### service-worker.ts
- Creates the three context menu items on install
- Handles context menu clicks: close duplicates, bookmark tab, group by domain
- Maintains the action badge tab count (debounced 200 ms), recomputed on `onStartup` because badge text does not survive a browser restart
- Handles the `open_side_panel` command
- Sets `sidePanel.setPanelBehavior({ openPanelOnActionClick: false })` so the toolbar icon still opens the popup

The service worker registers **no** `chrome.runtime.onMessage` listener. Message-pinging does not keep an MV3 worker alive, and an unconditional `return true` leaks the response port for every message in the extension.

### Popup Layer

#### popup.ts (Main Controller)
- Coordinates all UI components
- Manages view modes (list/compact/grid) — switching preserves the active search and filters
- Owns tab selection state and clears both its own and `TabList`'s copy after a bulk close
- Coalesces renders: a tab event arriving during a render sets `pendingRender` and one follow-up render runs in the `finally` block

#### sidepanel.ts (Side Panel Controller)
- Persistent side panel (Chrome 114+)
- Two view modes: **By Window** or **By Domain** (domain view sorted by tab count)
- Shares `TabList` and `SearchBar` with the popup
- Calls `groupAllBySimilarity()` from `shared/grouping.ts` directly — it does not instantiate any background-layer class

#### Components

| Component | Responsibility |
|-----------|----------------|
| `TabList.ts` | Renders tabs by window or domain, selection, collapse state, drag & drop, group chips |
| `SearchBar.ts` | Search input with 300 ms debounce, filter checkboxes |
| `QuickActions.ts` | Close/bookmark/group buttons, enabled only with a selection |
| `MediaControls.ts` | Audible tab list with mute and jump-to-tab |
| `SessionManager.ts` | Modal for saving and restoring sessions |

`TabList` keeps `collapsedGroups` across renders, so a group the user collapsed stays collapsed when the debounced re-render fires.

### Shared Utilities

#### tab-utils.ts
```typescript
getAllTabs()              // All tabs across all windows
getAllWindows()           // All windows with tabs populated
getTabsByWindow()         // Map<windowId, TabInfo[]>
TabEventManager           // Debounced tab event listener
```

**TabEventManager** — debounced event handling:
- 300 ms debounce prevents UI thrashing
- Fires only on `title`, `url`, `audible`, `pinned` and `discarded` changes
- `status` is deliberately excluded: it fires on every load completion and caused a full re-render per page load

#### url-utils.ts
```typescript
extractDomain(url)        // hostname
extractBaseDomain(url)    // registrable domain, with hosting-platform exceptions
normalizeUrl(url)         // strips the fragment, for duplicate comparison
findDuplicatesByUrl(tabs) // Map<normalizedUrl, tabs[]>
getDuplicateGroups(tabs)  // structured duplicate info, sorted by count
isChromeInternalUrl(url)  // chrome://, chrome-extension://, edge://, about:
```

`isChromeInternalUrl` is the single source of truth for "can this tab be bookmarked / grouped / restored" — the check is not re-inlined anywhere.

#### grouping.ts
```typescript
groupAllByDomain()        // group ungrouped tabs by base domain
groupAllBySimilarity()    // domain first, then title clusters on the remainder
groupWindowByDomain(id, tabs)
applyCluster(windowId, label, tabIds)
ungroupAll()
colorForLabel(label)      // deterministic colour from the label
```

Pure helpers, usable without the Chrome APIs and the natural place to add unit tests:

```typescript
clusterByDomain(tabs)     // Map<domain, tabIds>
clusterByTitle(tabs)      // Map<label, tabIds>, Jaccard similarity > 0.6
tokenize(str)             // lowercase words longer than 2 chars
calculateSimilarity(a, b) // Jaccard index over token sets
generateClusterName(titles)
```

Behavioural rules that matter:
- **Existing groups are never touched.** Only tabs with `groupId === TAB_GROUP_ID_NONE` are considered.
- **Pinned and internal tabs are skipped.**
- **`applyCluster` merges** into an existing group with the same title in that window rather than creating a second one.
- **Duplicate cluster labels are disambiguated** with a numeric suffix, so two unrelated clusters that both generate `Group` do not overwrite each other.

#### tab-balancer.ts

`balanceWindows()` runs in three phases and returns the number of tabs moved:

1. **Relieve** windows over `maxTabs` by moving out their outlier domains, smallest unit first. The window's dominant domain is never split.
2. **Consolidate** windows under `minTabs`. If every unit can go to an existing window, the window is marked doomed and emptied; otherwise it is topped up from donor windows that hold matching domains.
3. **Execute** the planned moves.

Key implementation details:
- A **moveable unit** is a tab group, or all loose tabs sharing a base domain. Pinned tabs are excluded.
- `findBestTarget()` is genuine best-fit: it filters to windows that fit, prefers ones already holding the unit's domain, and among candidates picks the **emptiest** — not `Array.find()`'s first match.
- `WindowState.domains` is a precomputed `Set`, so `findBestTarget` is O(1) per candidate rather than re-parsing every URL in every window.
- Planning runs entirely against a simulation (`applyToSim`), so later decisions see the effect of earlier ones before anything actually moves.
- `executeMoves()` reads each source group's `{ title, color }` **before** moving, because `chrome.tabs.move` to another window drops the group, then re-creates and re-applies it in the destination.

#### dialogs.ts
```typescript
showToast(message, kind)  // 'info' | 'success' | 'error'
confirmDialog(options)    // Promise<boolean>
promptDialog(options)     // Promise<string | null>
```

Native `alert`/`confirm`/`prompt` are unreliable in a browser-action popup: the popup loses focus and can be torn down mid-dialog, taking any pending `await` with it. These build DOM into `document.body`, support Escape/outside-click to cancel and Enter to submit, and are styled from `styles.css` so they follow the dark theme.

#### bookmark-utils.ts
```typescript
createBookmark(tab, parentId?)
bulkBookmarkTabs(tabs, folderName?)
```

`getBookmarksBarId()` resolves the bar as the **first child of the bookmark root**. Matching on the folder title (`includes('bookmark')`) breaks on any non-English Chrome build.

## Chrome API Usage

### Tab Management
```typescript
const tabs = await chrome.tabs.query({});
await chrome.tabs.update(tabId, { active: true, pinned: true });
await chrome.tabs.move(tabIds, { windowId, index: -1 });
await chrome.tabs.remove([tabId1, tabId2]);
```

### Tab Groups
```typescript
// Create in a specific window (required when the tabs just moved there)
const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });

await chrome.tabGroups.update(groupId, {
  title: 'My Group',
  color: 'blue',  // grey, blue, red, yellow, green, pink, purple, cyan, orange
  collapsed: false
});

// Merge into an existing group instead of creating a new one
const [existing] = await chrome.tabGroups.query({ windowId, title: 'My Group' });
if (existing) await chrome.tabs.group({ tabIds, groupId: existing.id });
```

### Favicons
```typescript
// Reads from Chrome's local cache — no request to the third-party origin
const url = new URL(chrome.runtime.getURL('/_favicon/'));
url.searchParams.set('pageUrl', tab.url);
url.searchParams.set('size', '32');
img.src = url.toString();
```
Requires `"favicon"` in `permissions`.

### Storage
```typescript
// Local: sessions (large, device-specific)
await chrome.storage.local.set({ sessions: [...] });

// Sync: theme only (sync caps at 8 KB per item, 512 items)
await chrome.storage.sync.set({ theme: 'dark' });
```

### Context Menus
```typescript
chrome.contextMenus.create({ id: 'my-action', title: 'Do Something', contexts: ['page'] });
chrome.contextMenus.onClicked.addListener((info, tab) => { /* ... */ });
```

## Build System

### esbuild Configuration
```bash
esbuild src/background/service-worker.ts \
        src/popup/popup.ts \
        src/sidepanel/sidepanel.ts \
  --bundle \
  --outdir=dist \
  --target=chrome114 \
  --format=esm \
  --splitting
```

Three entry points, all ESM. `--format=esm` matches `"background": { "type": "module" }` in the manifest. There is no separate content-script build — if one is ever reintroduced it must be bundled as **IIFE**, because content scripts run as classic scripts and a top-level `import` fails at runtime.

### Output Structure
```
dist/
├── background/service-worker.js
├── popup/popup.js
├── sidepanel/sidepanel.js
└── chunk-*.js                 # shared code chunks
```

### Build Scripts
```bash
npm run build      # Single build
npm run watch      # Rebuild on file changes
npm run typecheck  # tsc --noEmit
npm run package    # Build + assemble extension/
npm run clean      # Remove dist/ and extension/ (Node-based, cross-platform)
```

## Folder Structure & Workflow

| Folder | Purpose | Git Tracked? |
|--------|---------|--------------|
| Root (`src/`, `manifest.json`, …) | Source files you edit | Yes |
| `dist/` | Compiled JavaScript from esbuild | No |
| `extension/` | Clean copy for loading into Chrome | No |

Chrome counts **everything** in the loaded folder toward extension size, so loading the repository root would include `node_modules`. The `extension/` folder contains only `manifest.json`, the HTML, the CSS, `dist/` and `icons/` — about 172 KB.

```bash
npm run package
# chrome://extensions/ → Load unpacked → select extension/
# on later changes → click the refresh icon on the extension card
```

## Performance Considerations

1. **Event debouncing** — `TabEventManager` debounces to 300 ms and filters to meaningful changes.
2. **Render coalescing** — the `isRendering` guard queues one pending render rather than dropping the update.
3. **Favicon API** — icons come from Chrome's cache, so no outbound request per rendered tab.
4. **Precomputed domain sets** — the balancer avoids O(windows × tabs) URL parsing per move decision.
5. **Lean package** — `extension/` excludes `node_modules`, source and config files.

## Debugging

### Service Worker
`chrome://extensions/` → "Advanced Tab Manager" → click **Service Worker**.

### Popup
Open the popup, right-click inside it, **Inspect**.

### Side Panel
Open the side panel, right-click inside it, **Inspect**.

## Common Patterns

### Coalesced async rendering
```typescript
private async loadAndRenderTabs(...) {
  if (this.isRendering) { this.pendingRender = true; return; }
  this.isRendering = true;
  try {
    // ... render
  } finally {
    this.isRendering = false;
    if (this.pendingRender) {
      this.pendingRender = false;
      await this.loadAndRenderTabs(this.currentSearchQuery, this.currentFilters);
    }
  }
}
```

### Type Safety with Chrome APIs
```typescript
// Use a type predicate, not `filter(Boolean) as number[]`
const ids = tabs.map(t => t.id).filter((id): id is number => id !== undefined);

// TAB_ID_NONE is -1, so `if (tab.id)` happens to work — but this is the correct guard
if (tab.id !== undefined) { /* ... */ }
```

### Preserving a tab group across a window move
```typescript
const { title, color } = await chrome.tabGroups.get(sourceGroupId); // before the move
await chrome.tabs.move(tabIds, { windowId: target, index: -1 });    // group is dropped here
const newId = await chrome.tabs.group({ tabIds, createProperties: { windowId: target } });
await chrome.tabGroups.update(newId, { title, color });
```

## Manifest V3 Notes

### Service Worker Lifecycle
- Event-driven, terminated after roughly 30 s of inactivity
- `setTimeout` in the worker is not durable; the badge debounce accepts this and recomputes on `onStartup`
- `chrome.alarms` is the durable alternative for anything longer-lived

### Permissions Model
- Minimal permissions, no `host_permissions`, no remotely hosted code, default CSP retained
- `minimum_chrome_version: "114"` is declared because `sidePanel` is a hard dependency

## Testing Checklist

- [ ] Extension loads without errors
- [ ] All tabs display correctly in list, compact and grid views
- [ ] Switching view mode preserves the active search and filters
- [ ] Search filters tabs in real time
- [ ] Duplicate detection highlights correctly; close-duplicates keeps the newest
- [ ] Collapsed groups stay collapsed across tab events
- [ ] Favicons render (and no requests to third-party origins appear in DevTools)
- [ ] Confirm/prompt dialogs cancel on Escape and on outside click
- [ ] Balance windows respects min/max and preserves group titles and colours
- [ ] Group by domain merges into existing same-named groups
- [ ] Smart grouping leaves existing groups and pinned tabs alone
- [ ] Session save/restore returns pinned state, tab groups and window geometry
- [ ] Deleting a session asks for confirmation
- [ ] Merging windows moves every tab and focuses the target
- [ ] Media controls appear for audible tabs; mute/unmute works
- [ ] Context menu items work
- [ ] Dark theme applies to dialogs, modals, panels and the side panel
