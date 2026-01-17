# Advanced Chrome Tab Manager

A powerful, lightweight Chrome extension for managing tabs, windows, and browser sessions. Built with TypeScript and optimized for performance.

**Extension Size: ~124 KB** (optimized build)

## Features

### 🔍 Search & Filter
- Real-time search by tab title or URL
- Filter by audible, pinned, or duplicate tabs
- Debounced search (150ms) to prevent UI lag

### 👁️ View Modes
- **List View**: Detailed tab information with URLs and memory indicators
- **Compact View**: Minimal view showing just titles
- **Grid View**: Visual grid layout for quick scanning

### ⚡ Quick Actions
- Close selected tabs
- Bookmark selected tabs to auto-created folders
- Group selected tabs with timestamps
- Multi-select with checkboxes

### 🎯 Duplicate Detection
- Automatic duplicate detection by normalized URL
- Visual highlighting of duplicate tabs
- One-click close all duplicates (keeps most recently accessed)

### 💾 Session Management
- Save current browser session (all windows and tabs)
- Restore sessions with preserved pinned tab state
- Delete old sessions
- Timestamped session names

### 🎨 Auto-Grouping
- **Disabled by default** (opt-in to avoid interfering with workflow)
- Automatically group new tabs by domain when enabled
- Pre-configured rules for YouTube, GitHub, Gmail, Google Docs
- Customizable grouping rules (domain, pattern, keyword matching)
- Manual "Group by Domain" via context menu

### 🔊 Media Controls
- Detect tabs playing audio/video
- Mute/unmute individual tabs
- Quick navigation to media tabs
- Content script injection for YouTube, Spotify, Twitch, and other media sites only

### 💤 Resource Management
- Track discarded/hibernated vs active tabs
- Hibernate inactive tabs (not accessed in last hour)
- Respects pinned and audible tabs (won't hibernate)
- Visual count of active vs total tabs

### 📊 Resource Monitor
- **Compact overview** in header showing total memory and heavy tab count
- **Dedicated resource page** with detailed per-tab breakdown
- **Intelligent memory estimation** based on:
  - Website type (YouTube, Gmail, Meet, Figma, etc.)
  - Tab state (active, audible, discarded)
  - Tab age (older tabs accumulate memory)
- **Lazy loading**: Shows top 10 tabs initially, "Load More" for rest
- **Color-coded severity**: Green → Yellow → Orange → Red
- **Quick actions**: Hibernate heavy tabs, navigate to any tab
- **Live updates** every 5 seconds

### 📑 Bookmarking
- Bulk bookmark tabs to timestamped folders
- Bookmark entire windows
- Dynamic bookmark bar detection (no hardcoded folder IDs)
- Context menu integration

### 📌 Side Panel Support
- **Chrome 114+** persistent side panel for tab management
- Two viewing modes: **By Window** (default) or **By Domain**
- Same powerful search and filtering capabilities as popup
- Highlight duplicates with visual indicators
- Smart auto-grouping via ✨ button
- Dark mode support with theme toggle
- Stays open while browsing for quick tab access
- Automatically syncs with tab changes across all windows

### 🖱️ Context Menu
- Close duplicate tabs
- Bookmark current tab
- Hibernate current tab
- Group tabs by domain

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd tab-manager
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build and package:
   ```bash
   npm run package
   ```

4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the **`extension/`** folder (NOT the root folder!)

> ⚠️ **Important:** Always load from `extension/` folder. Loading the root folder includes `node_modules` (33MB) causing 51MB+ extension size instead of ~124KB.

### Development

```bash
npm run build    # Build once
npm run watch    # Watch mode for development
npm run package  # Build + create clean extension folder (run this before testing!)
npm run clean    # Remove build artifacts
```

**After making code changes:**
1. Run `npm run package`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

## Project Structure

```
tab-manager/
├── manifest.json              # Extension manifest (MV3)
├── popup.html                 # Main popup UI
├── sidepanel.html             # Side panel UI (Chrome 114+)
├── resource-monitor.html      # Dedicated resource monitor page
├── styles.css                 # All styles (~23KB)
├── package.json               # npm scripts and dependencies
├── tsconfig.json              # TypeScript configuration
├── src/
│   ├── background/
│   │   ├── service-worker.ts  # Background service worker
│   │   └── auto-grouper.ts    # Auto-grouping engine with rules
│   ├── popup/
│   │   ├── popup.ts           # Main popup controller
│   │   ├── resource-monitor-page.ts  # Resource page controller
│   │   └── components/
│   │       ├── TabList.ts         # Tab rendering with tooltips
│   │       ├── SearchBar.ts       # Search with filters
│   │       ├── QuickActions.ts    # Batch operations
│   │       ├── ResourcePanel.ts   # Hibernation controls
│   │       ├── ResourceOverview.ts # Compact memory stats
│   │       ├── ResourceMonitor.ts  # Full resource monitor
│   │       ├── MediaControls.ts    # Media tab controls
│   │       └── SessionManager.ts   # Session save/restore
│   ├── sidepanel/
│   │   └── sidepanel.ts       # Side panel controller (shares components)
│   ├── content/
│   │   └── content-script.ts  # Media control (YouTube, Spotify, etc.)
│   └── shared/
│       ├── tab-utils.ts       # Tab queries, events, memory estimation
│       ├── url-utils.ts       # URL normalization, duplicate detection
│       └── bookmark-utils.ts  # Bookmark operations
├── icons/                     # Extension icons (SVG)
├── dist/                      # Compiled JavaScript (generated)
└── extension/                 # Clean extension folder (generated)
```

## Permissions

| Permission | Purpose |
|------------|---------|
| `tabs` | Access tab information (title, URL, state) |
| `tabGroups` | Create and manage tab groups |
| `storage` | Persist sessions and settings |
| `bookmarks` | Create bookmarks and folders |
| `contextMenus` | Right-click menu integration |
| `host_permissions: <all_urls>` | Required for content script on media sites |

## Performance Optimizations

- **Debounced tab events**: 150ms debounce prevents excessive re-renders
- **Selective event handling**: Only reacts to meaningful tab changes (not every favicon update)
- **Targeted content script**: Only injected on media sites (YouTube, Spotify, Twitch, etc.), not all URLs
- **Code splitting**: Shared utilities bundled in separate chunks via esbuild
- **Lazy loading**: Resource monitor loads 10 tabs at a time
- **Clean builds**: Production extension excludes node_modules and source files (~124KB vs 51MB)

## Usage Tips

1. **Multi-Select**: Use checkboxes to select multiple tabs for batch operations
2. **Search**: Type to filter tabs instantly across all windows
3. **Duplicates**: Click the ⚠️ filter to highlight and close duplicates
4. **Sessions**: Save your workspace before closing Chrome
5. **Hibernate**: Free up memory by hibernating tabs you haven't used recently
6. **Resource Monitor**: Click "📊 Details" for the full resource breakdown

## Browser Support

- **Chrome 114+**: Full support including Side Panel API
- **Chrome 121+**: `lastAccessed` property for better hibernation decisions
- **Edge (Chromium)**: Should work with minor modifications

## License

MIT License

## Contributing

Pull requests welcome! Please open an issue first for major changes.
