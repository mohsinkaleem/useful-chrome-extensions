# Technical Documentation

## Architecture Overview

The extension follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                         │
├─────────────────────────────────────────────────────────────┤
│  Background (Service Worker)                                │
│  ├── service-worker.ts    Context menus, event coordination│
│  └── auto-grouper.ts      Rule-based tab grouping          │
├─────────────────────────────────────────────────────────────┤
│  Popup / Side Panel                                         │
│  ├── popup.ts             Main controller                   │
│  ├── sidepanel.ts         Side panel controller (Chrome 114+)│
│  └── components/          UI components (7 modules)         │
├─────────────────────────────────────────────────────────────┤
│  Content Script                                             │
│  └── content-script.ts    Media control on specific sites  │
├─────────────────────────────────────────────────────────────┤
│  Shared Utilities                                           │
│  ├── tab-utils.ts         Tab queries, events              │
│  ├── url-utils.ts         URL normalization, duplicates    │
│  └── bookmark-utils.ts    Bookmark operations              │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### Background Layer

#### service-worker.ts
- Initializes on extension install
- Creates context menu items
- Handles context menu clicks
- Forwards tab events to AutoGrouper
- Keeps service worker alive via message listener

#### auto-grouper.ts
- Manages grouping rules (stored in `chrome.storage.sync`)
- Supports three rule types: `domain`, `pattern`, `keyword`
- Waits for initialization before processing tabs (fixes race condition)
- Default rules: YouTube (red), GitHub (grey), Google Docs (blue), Gmail (yellow)

### Popup Layer

#### popup.ts (Main Controller)
- Coordinates all UI components
- Manages view modes (list/compact/grid)
- Handles tab selection state
- Orchestrates search, filtering, and duplicate detection

#### sidepanel.ts (Side Panel Controller)
- Persistent side panel interface (Chrome 114+)
- Two view modes: **By Window** or **By Domain**
- Shares components with popup (TabList, SearchBar)
- Real-time duplicate highlighting
- Auto-grouping integration via ✨ button
- Dark mode with persistent theme storage
- Automatically updates on tab changes

#### Components

| Component | Responsibility |
|-----------|----------------|
| `TabList.ts` | Renders tabs grouped by window, tooltips, selection |
| `SearchBar.ts` | Search input with debounce, filter checkboxes |
| `QuickActions.ts` | Close/bookmark/group buttons for selected tabs |
| `MediaControls.ts` | Playing tabs list with mute/navigation |
| `SessionManager.ts` | Modal for save/restore sessions |

### Content Script

#### content-script.ts
- **Only injected on media sites** (YouTube, Spotify, Twitch, SoundCloud, Vimeo, Netflix)
- Listens for `stopMedia` message
- Pauses all `<video>` and `<audio>` elements
- Special handling for YouTube and Spotify players

### Shared Utilities

#### tab-utils.ts
```typescript
// Key exports:
getAllTabs()              // Get all tabs across windows
getTabsByWindow()         // Get tabs grouped by window ID
getActiveTab()            // Get currently focused tab
TabEventManager           // Debounced tab event listener
```

**TabEventManager** - Debounced event handling:
- 150ms debounce prevents UI thrashing
- Only triggers on meaningful changes (status, title, url, audible, pinned, discarded)
- Ignores noisy events like favicon updates

**estimateTabMemory()** - Centralized memory estimation:
- Base: 30MB for active tabs, 5MB for discarded
- Bonuses by domain: YouTube (+150MB), Meet/Zoom (+200MB), Gmail (+80MB), etc.
- Bonuses by state: active (+20MB), audible (+50MB), old (+30MB)

#### url-utils.ts
```typescript
// Key exports:
extractDomain(url)        // Get hostname from URL
normalizeUrl(url)         // Remove fragments for comparison
findDuplicatesByUrl(tabs) // Map of URL -> duplicate tabs
getDuplicateGroups(tabs)  // Structured duplicate info
```

#### bookmark-utils.ts
```typescript
// Key exports:
getBookmarksBarId()       // Dynamic folder ID lookup
createBookmark(tab)       // Create single bookmark
bulkBookmarkTabs(tabs)    // Batch create with folder
bookmarkWindow(windowId)  // Bookmark all tabs in window
```

## Chrome API Usage

### Tab Management
```typescript
// Query tabs
const tabs = await chrome.tabs.query({});
const [active] = await chrome.tabs.query({ active: true, currentWindow: true });

// Modify tabs
await chrome.tabs.update(tabId, { active: true, pinned: true });
await chrome.tabs.remove([tabId1, tabId2]);
await chrome.tabs.discard(tabId);  // Hibernate
await chrome.tabs.reload(tabId);
```

### Tab Groups
```typescript
// Create group
const groupId = await chrome.tabs.group({ tabIds: [1, 2, 3] });

// Update group appearance
await chrome.tabGroups.update(groupId, { 
  title: 'My Group',
  color: 'blue',  // grey, blue, red, yellow, green, pink, purple, cyan, orange
  collapsed: false 
});

// Query existing groups
const groups = await chrome.tabGroups.query({ windowId });
```

### Storage
```typescript
// Local storage (device-specific)
await chrome.storage.local.set({ sessions: [...] });
const { sessions } = await chrome.storage.local.get('sessions');

// Sync storage (across Chrome accounts)
await chrome.storage.sync.set({ groupingRules: [...] });
const { groupingRules } = await chrome.storage.sync.get('groupingRules');
```

### Context Menus
```typescript
// Create menu item
chrome.contextMenus.create({
  id: 'my-action',
  title: 'Do Something',
  contexts: ['page']  // page, selection, link, image, etc.
});

// Handle clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'my-action') {
    // Handle action
  }
});
```

## Build System

### esbuild Configuration
```bash
esbuild src/background/service-worker.ts \
        src/popup/popup.ts \
        src/content/content-script.ts \
  --bundle \
  --outdir=dist \
  --target=chrome114 \
  --format=esm \
  --splitting
```

Key options:
- `--bundle`: Bundle all imports into output files
- `--splitting`: Create shared chunks for common code
- `--format=esm`: ES modules (required for service workers)
- `--target=chrome114`: Target Chrome 114+ features

### Output Structure
```
dist/
├── background/
│   └── service-worker.js      # Background entry
├── popup/
│   └── popup.js               # Popup entry
├── content/
│   └── content-script.js      # Content script entry
├── chunk-*.js                 # Shared code chunks
└── bookmark-utils-*.js        # Dynamic import chunk
```

### Build Scripts
```bash
npm run build    # Single build
npm run watch    # Rebuild on file changes
npm run package  # Build + create clean extension folder
npm run clean    # Remove dist/ and extension/
```

## Folder Structure & Workflow

The project has **two dist folders** and **two manifest files** by design:

| Folder | Purpose | Git Tracked? |
|--------|---------|--------------|
| **Root** (`src/`, `manifest.json`, etc.) | Source files you edit | ✅ Yes |
| **`dist/`** | Compiled JavaScript from esbuild | ❌ No (.gitignore) |
| **`extension/`** | Clean copy for loading into Chrome | ❌ No (.gitignore) |

### Why Two Folders?

Chrome counts **everything** in the loaded folder toward extension size. If you load the root folder:
- `node_modules/` = 33MB
- `src/` = 104KB
- Dev config files = extra bloat
- **Total: ~51MB** ❌

The `extension/` folder contains only what Chrome needs:
- `manifest.json`, HTML, CSS
- `dist/` (compiled JS)
- `icons/`
- **Total: ~124KB** ✅

### Development Workflow

```bash
# 1. Make changes to source files in src/

# 2. Build and package
npm run package

# 3. In Chrome (chrome://extensions/):
#    - If first time: "Load unpacked" → select extension/ folder
#    - If updating: Click refresh icon on extension card

# 4. Test your changes
```

**Important:** Always load Chrome from the `extension/` folder, not the root folder!

## Performance Considerations

### 1. Event Debouncing
Tab events fire frequently (favicon changes, loading states, etc.). The `TabEventManager` debounces these to 150ms and filters to meaningful changes only.

### 2. Content Script Scope
Previously: Injected on `<all_urls>` (every page)
Now: Only on media sites (YouTube, Spotify, Twitch, etc.)

This eliminates memory overhead on non-media pages.

### 4. Clean Extension Folder
The `npm run package` command creates an `extension/` folder with only:
- manifest.json
- HTML files
- CSS
- Compiled JS (dist/)
- Icons

This excludes node_modules (33MB), source files, and config files.

## Debugging

### Service Worker
1. Go to `chrome://extensions/`
2. Find "Advanced Tab Manager"
3. Click "Service Worker" link
4. Console and debugger available

### Popup
1. Open the extension popup
2. Right-click inside popup
3. Select "Inspect"
4. DevTools opens for popup context

### Content Script
1. Open a media site (e.g., youtube.com)
2. Open DevTools (F12)
3. Content script logs appear in Console
4. Filter by "content-script.js" if needed

## Common Patterns

### Async Initialization
```typescript
// Problem: Constructor can't be async
class AutoGrouper {
  private initialized: Promise<void>;
  
  constructor() {
    this.initialized = this.init();
  }
  
  private async init() {
    await this.loadRules();
  }
  
  async onTabCreated(tab) {
    await this.initialized;  // Wait before processing
    // Now safe to use rules
  }
}
```

### Dynamic Imports
```typescript
// Only load bookmark utils when needed
const { bulkBookmarkTabs } = await import('../shared/bookmark-utils.js');
await bulkBookmarkTabs(tabs);
```

### Type Safety with Chrome APIs
```typescript
// Filter out undefined IDs
const ids = tabs.map(t => t.id).filter(Boolean) as number[];

// Safe property access
if (tab?.url && tab?.id) {
  // Both exist
}
```

## Manifest V3 Notes

### Service Worker Lifecycle
- Service workers are event-driven (not persistent)
- They shut down after ~30 seconds of inactivity
- Use `chrome.alarms` for scheduled tasks
- Current extension uses message listener to stay responsive

### Content Script Declaration
```json
{
  "content_scripts": [{
    "matches": ["*://*.youtube.com/*", "*://*.spotify.com/*"],
    "js": ["dist/content/content-script.js"],
    "run_at": "document_idle"
  }]
}
```

### Permissions Model
- Declare minimal permissions in manifest
- Request additional permissions at runtime if needed
- `host_permissions` separated from regular `permissions`

## Testing Checklist

- [ ] Extension loads without errors
- [ ] All tabs display correctly
- [ ] Search filters tabs in real-time
- [ ] Duplicate detection highlights correctly
- [ ] Close duplicates keeps newest tab
- [ ] Session save/restore works
- [ ] Pinned state restored with sessions
- [ ] Media controls show for playing tabs
- [ ] Context menu items work
- [ ] Auto-grouping works when enabled
- [ ] Jump-to-tab navigation works
