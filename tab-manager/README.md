# Advanced Chrome Tab Manager

A lightweight Chrome extension (Manifest V3) for managing tabs, windows, tab groups and browser sessions. Built with TypeScript, bundled with esbuild.

**Packaged size: ~172 KB** (`extension/` folder, of which ~80 KB is compiled JS)

## Features

### Search & Filter
- Real-time search by tab title or URL across every window
- Filter by audible, pinned, or duplicate tabs
- 300 ms debounce on both the search box and tab events

### View Modes
- **List** — title plus hostname
- **Compact** — titles only
- **Grid** — favicon grid for quick visual scanning

### Quick Actions
- Multi-select tabs with checkboxes
- Close, bookmark, or group the selection
- Merge two or more selected windows into one
- Drag a tab onto another window's header to move it

### Duplicate Detection
- Duplicates matched on fragment-normalized URLs
- Visual highlighting, plus a live duplicate counter in the action bar
- One-click "close duplicates" keeps the most recently accessed copy

### Window Balancing
Redistributes tabs so every window sits between a minimum and maximum tab count (10 and 30 by default).

- Moves whole *units* — a tab group, or all loose tabs sharing a base domain — never individual tabs at random
- Never splits a window's dominant domain, so a window of 80 YouTube tabs is left intact
- Prefers a destination window that already holds that domain; among candidates it picks the emptiest
- Consolidates windows that fall below the minimum into existing windows rather than opening new ones
- Preserves tab group titles and colours across the move
- Pinned tabs are never moved

### Grouping
- **Group by domain** — collects ungrouped tabs by base domain (`mail.google.com` and `docs.google.com` both land in `google.com`)
- **Smart grouping** (side panel ✨) — groups by domain first, then clusters whatever is left by title similarity
- Group colours are derived deterministically from the label, so the same domain keeps its colour
- Tabs are merged into an existing group of the same name instead of creating duplicates
- Existing groups and pinned tabs are left untouched
- **Ungroup all** dissolves every group in every window

### Session Management
- Save every normal window with its tabs
- Restores pinned state, **tab groups** (title and colour) and **window geometry**
- Capped at 50 stored sessions to bound storage growth
- Delete requires confirmation

### Media Controls
- Lists tabs currently playing audio
- Mute/unmute and jump-to-tab per entry
- Implemented entirely through `chrome.tabs` — **no content scripts, no host permissions**

### Bookmarking
- Bulk bookmark all tabs, the selection, or a single window into a new folder
- Bookmarks bar resolved by position, so it works on non-English Chrome builds

### Side Panel
- Chrome 114+ persistent side panel (`Ctrl/Cmd+Shift+E`)
- Group **By Window** or **By Domain**
- Shares the search bar and tab list with the popup
- Dark mode synced with the popup via `chrome.storage.sync`

### Context Menu
- Close duplicate tabs
- Bookmark this tab
- Group tabs by domain

## Installation

### From Source

1. Clone and install:
   ```bash
   git clone <repository-url>
   cd tab-manager
   npm install
   ```

2. Build and package:
   ```bash
   npm run package
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the **`extension/`** folder (not the repository root)

> Always load from `extension/`. Loading the repository root pulls in `node_modules` and inflates the extension from ~172 KB to tens of megabytes.

### Development

```bash
npm run build      # Bundle once into dist/
npm run watch      # Rebuild on change
npm run typecheck  # tsc --noEmit
npm run package    # Build + assemble extension/ (run before testing in Chrome)
npm run clean      # Remove dist/ and extension/
```

After changing code: `npm run package`, then click the refresh icon on the extension card in `chrome://extensions/`.

## Project Structure

```
tab-manager/
├── manifest.json              # Extension manifest (MV3)
├── popup.html                 # Popup UI
├── sidepanel.html             # Side panel UI (Chrome 114+)
├── styles.css                 # All styles, incl. dark theme (~28 KB)
├── icons.css                  # Inline SVG icon classes (~10 KB)
├── package.json
├── tsconfig.json
├── src/
│   ├── background/
│   │   └── service-worker.ts  # Context menus, badge, commands
│   ├── popup/
│   │   ├── popup.ts           # Popup controller
│   │   └── components/
│   │       ├── TabList.ts         # Tab rendering, selection, drag & drop
│   │       ├── SearchBar.ts       # Search input + filter checkboxes
│   │       ├── QuickActions.ts    # Batch action buttons
│   │       ├── MediaControls.ts   # Audible tab controls
│   │       └── SessionManager.ts  # Session save/restore modal
│   ├── sidepanel/
│   │   └── sidepanel.ts       # Side panel controller (shares components)
│   └── shared/
│       ├── tab-utils.ts       # Tab/window queries, debounced events
│       ├── url-utils.ts       # URL normalization, duplicate detection
│       ├── grouping.ts        # Domain + title-similarity grouping
│       ├── tab-balancer.ts    # Window balancing / tab redistribution
│       ├── bookmark-utils.ts  # Bookmark operations
│       ├── window-utils.ts    # Window merging
│       └── dialogs.ts         # In-page confirm/prompt/toast
├── icons/                     # Extension icons (PNG: 16, 48, 128)
├── dist/                      # Compiled JavaScript (generated)
└── extension/                 # Loadable extension folder (generated)
```

## Permissions

| Permission | Purpose |
|------------|---------|
| `tabs` | Read tab title, URL and state; move, close and activate tabs |
| `tabGroups` | Create, rename, recolour and dissolve tab groups |
| `storage` | Persist sessions (`local`) and theme (`sync`) |
| `bookmarks` | Create bookmarks and folders |
| `contextMenus` | Right-click menu integration |
| `sidePanel` | Side panel UI (Chrome 114+) |
| `favicon` | Read favicons from Chrome's own cache |

There are **no `host_permissions` and no content scripts**. Nothing is injected into any page, and favicons are read from Chrome's local cache rather than fetched from each site.

## Performance Notes

- **Debounced tab events** — 300 ms, and only for meaningful changes (title, url, audible, pinned, discarded); favicon and load-state churn is ignored
- **Coalesced renders** — a tab event arriving mid-render queues exactly one follow-up render instead of being dropped
- **No third-party favicon requests** — the `favicon` permission serves icons from `chrome://favicon2` locally, so rendering 200 tabs costs zero network requests
- **Precomputed domain sets** — the balancer builds one domain set per window instead of re-parsing every URL per move decision
- **Code splitting** — shared utilities land in separate esbuild chunks
- **Lean package** — `extension/` excludes `node_modules`, source and config files

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+E` / `Cmd+Shift+E` | Open the side panel |

Chrome silently drops a suggested shortcut if another extension already claims it. Reassign it at `chrome://extensions/shortcuts`.

## Usage Tips

1. **Multi-select** — tick checkboxes to close, bookmark or group tabs in bulk
2. **Search** — the popup auto-focuses the search box on open
3. **Duplicates** — use the duplicate filter to review before bulk-closing
4. **Balance** — run it when windows have drifted lopsided; groups survive the move
5. **Collapse** — click a window or domain header to collapse it; the state survives re-renders
6. **Sessions** — save your workspace before closing Chrome; groups and window geometry come back

## Browser Support

- **Chrome 114+** — required (`sidePanel` API), declared as `minimum_chrome_version`
- **Chrome 121+** — `lastAccessed` improves which duplicate is kept
- **Edge (Chromium)** — expected to work; not actively tested

## License

MIT License

## Contributing

Pull requests welcome. Please open an issue first for major changes.
