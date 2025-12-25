# Advanced Chrome Tab Manager

A powerful Chrome extension for managing tabs, windows, and browser sessions with TypeScript.

## Features

### 🔍 Search & Filter
- Fuzzy search by tab title or URL
- Filter by audible, pinned, or duplicate tabs
- Real-time search with debouncing

### 👁️ View Modes
- **List View**: Detailed tab information with URLs
- **Grid View**: Compact grid layout for quick browsing
- **Compact View**: Minimal view showing just titles

### ⚡ Quick Actions
- Close selected tabs
- Bookmark selected tabs to folders
- Group selected tabs
- Multi-select with checkboxes

### 🎯 Duplicate Detection
- Automatically detects duplicate tabs
- Shows duplicate count by URL
- Quick action to close duplicates (keeps newest)

### 💾 Session Management
- Save current browser session (all windows and tabs)
- Restore saved sessions
- Delete old sessions
- Timestamped session snapshots

### 🎨 Auto-Grouping
- **Disabled by default** (opt-in to avoid interfering with tab placement)
- Automatically group tabs by domain when enabled
- Customizable grouping rules
- Pre-configured rules for YouTube, GitHub, Gmail, Google Docs
- Manual "Group by Domain" for all tabs

### 🔊 Media Controls
- Detect playing media tabs
- Mute/unmute individual tabs
- Stop media playback via content script
- Quick navigation to media tabs

### 💤 Resource Management
- Track discarded/hibernated tabs
- Show active tab count
- Hibernate inactive tabs (not accessed in last hour)
- Respects pinned and audible tabs

### 📊 Resource Monitor
- **Compact overview** in main popup showing total memory and heavy tab count
- **Dedicated resource page** with compact styling matching main popup
- **Lazy loading**: Shows top 10 tabs initially with "Load More" button
- **Jump-to-tab**: Quick navigation to any resource-heavy tab with → button
- **Intelligent memory estimation** per tab based on characteristics
- **Smart heuristics** for different websites (YouTube, Gmail, Google Meet, etc.)
- **Color-coded severity indicators** (green/yellow/orange/red)
- **Top resource consumers** with rank badges (🥇🥈🥉) and visual indicators
- **Live updates** every 5 seconds
- **Quick actions**: Hibernate heavy tabs, reload consuming tabs, jump to tab
- **Memory indicators** shown directly in tab list
- Identify and manage memory-hungry tabs instantly
- **Note**: Uses intelligent estimation based on tab properties (URL, media playback, age) since Chrome removed the Processes API

### 📑 Bookmarking
- Bulk bookmark tabs to folders
- Bookmark entire windows
- Organized folder structure
- Context menu integration

### 🖱️ Context Menu
- Right-click to close duplicate tabs
- Bookmark current tab
- Hibernate current tab
- Group tabs by domain

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `tab-manager` folder

## Development

### Build Commands
```bash
npm run build   # Build once
npm run watch   # Watch mode for development
npm run clean   # Clean build directory
```

### Project Structure
```
tab-manager/
├── manifest.json           # Extension manifest (MV3)
├── popup.html             # Popup/side panel UI
├── resource-monitor.html  # Dedicated resource monitor page
├── styles.css             # Styles
├── src/
│   ├── background/
│   │   ├── service-worker.ts    # Background service worker
│   │   └── auto-grouper.ts      # Auto-grouping engine
│   ├── popup/
│   │   ├── popup.ts                    # Main popup logic
│   │   ├── resource-monitor-page.ts    # Resource monitor page logic
│   │   └── components/                 # UI components
│   │       ├── TabList.ts
│   │       ├── SearchBar.ts
│   │       ├── QuickActions.ts
│   │       ├── ResourcePanel.ts
│   │       ├── ResourceOverview.ts     # Compact overview component
│   │       ├── ResourceMonitor.ts      # Full monitor component
│   │       ├── MediaControls.ts
│   │       └── SessionManager.ts
│   ├── content/
│   │   └── content-script.ts    # Media control injection
│   └── shared/
│       ├── tab-utils.ts         # Tab/window utilities
│       ├── url-utils.ts         # URL/duplicate detection
│       └── bookmark-utils.ts    # Bookmarking utilities
└── icons/                       # Extension icons
```

## API Usage

### Chrome APIs Used
- `chrome.tabs` - Tab management
- `chrome.tabGroups` - Tab grouping
- `chrome.windows` - Window management
- `chrome.storage` - Session persistence
- `chrome.bookmarks` - Bookmarking
- `chrome.contextMenus` - Right-click menus

### Key Features by Chrome Version
- **Chrome 114+**: Side Panel API
- **Chrome 121+**: `lastAccessed` property
- **Chrome 132+**: `frozen` state (future)

## Permissions

The extension requires the following permissions:
- `tabs` - Access tab information
- `tabGroups` - Create and manage tab groups
- `storage` - Save sessions and settings
- `bookmarks` - Create bookmarks
- `contextMenus` - Add right-click options
- `processes` - Monitor memory and CPU usage (NEW)
- `
## Usage Tips

1. **Multi-Select**: Use checkboxes to select multiple tabs for batch operations
2. **Search**: Type in the search box to filter tabs instantly
3. **Duplicates**: Enable the "Duplicates" filter to see only duplicate tabs
4. **Sessions**: Click "Save Session" to snapshot your current workspace
5. **Auto-Group**: New tabs matching configured rules will be automatically grouped
6. **Hibernate**: Click "Hibernate Inactive Tabs" to free up memory
7. **Media**: Playing tabs appear in the Media section with quick controls
8. **Resource Monitor**: Click "📊 Details" to open the compact resource monitoring page
9. **Load More**: Click "Load More" in resource monitor to reveal additional tabs (loads 10 at a time)
10. **Jump to Tab**: Use the → button next to any tab in the resource list to switch to it instantly

## Customization

### Auto-Grouping Rules
Edit rules in `src/background/auto-grouper.ts` or create a settings UI to manage rules dynamically.

Default rules group:
- YouTube tabs (red)
- GitHub tabs (grey)
- Google Docs (blue)
- Gmail (yellow)

### View Modes
Switch between List, Grid, and Compact views using the view toggle buttons.

## Future Enhancements

- [ ] Tab history and analytics
- [ ] Custom keyboard shortcuts
- [ ] Export/import sessions as JSON
- [ ] Tab sorting options
- [ ] Dark mode
- [ ] Sync settings across devices
- [ ] Advanced filtering (by time, size, etc.)
- [ ] Tab suspension scheduling
- [x] Lazy loading for resource monitor (completed)
- [x] Jump-to-tab functionality in resource monitor (completed)
- [x] Compact styling matching main popup (completed)

## License

MIT License

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.
