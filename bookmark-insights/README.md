# Bookmark Insight - Chrome Extension

A powerful bookmark manager Chrome extension with smart search, insights, and maintenance tools.

## Features

### Phase 1 - MVP (Implemented)
- **Smart Bookmark Search**: Fast search through all your bookmarks by title, URL, or domain
- **Rich Bookmark Cards**: View bookmarks with favicons, domain info, folder paths, and dates
- **Advanced Filters**: Filter by domain, date range, or folder
- **Popup Interface**: Quick access to bookmarks through browser action
- **Full Dashboard**: Comprehensive view with all features

### Phase 2 - Visual Analytics & Insights (Implemented)
- **Domain Analysis**: 
  - Most frequently bookmarked domains
  - Distribution of bookmarks across top domains with percentages
- **Content Analysis**:
  - Most frequent words in bookmark titles (with stop-word filtering)
  - Common title patterns and content types (tutorials, documentation, etc.)
- **Temporal Analysis**:
  - Bookmark age distribution (time since dateAdded)
  - Bookmark creation patterns over time (monthly timeline)
  - Creation patterns by day of week
- **URL Structure Analysis**:
  - Common URL patterns and structures
  - Top-level domain distribution
  - Parameter usage frequency in bookmarked URLs
  - Protocol and subdomain analysis
- **Activity Timeline**: Track your bookmarking activity over time
- **Quick Stats**: Total bookmarks, duplicates, orphans, and unique domains count

### Phase 3 - Health & Maintenance (Implemented)
- **Duplicate Detection**: Find and remove duplicate bookmarks
- **Orphan Finder**: Locate bookmarks without proper folder organization
- **Malformed URL Detection**: Find bookmarks with invalid URLs

## Installation

### For Development
1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the `bookmark-insights` folder

### For Production
The extension will be available on the Chrome Web Store once published.

## Usage

### Popup Interface
- Click the extension icon in the toolbar
- Use the search bar to find bookmarks quickly
- Toggle the sidebar to access filters
- Click "Dashboard" for the full interface

### Dashboard
- Access through the popup or by right-clicking the extension icon
- **Bookmarks Tab**: Browse and search all bookmarks with advanced filters
- **Insights Tab**: View statistics and charts about your bookmarking habits
- **Health Tab**: Find and fix issues with your bookmark collection

### Filters
- **Date Filters**: This Week, This Month, This Year
- **Domain Filters**: Click any domain to see all bookmarks from that site
- **Folder Filters**: Browse bookmarks by folder structure

## Technical Details

### Technology Stack
- **UI Framework**: Svelte (compiled to vanilla JavaScript)
- **Storage**: Chrome Storage API (for compatibility)
- **Charts**: Chart.js for insights visualization
- **Styling**: Tailwind CSS
- **Build Tool**: Rollup

### Architecture
- **Background Script**: Handles bookmark synchronization and Chrome API interactions
- **Popup**: Quick access interface (384x384px)
- **Dashboard**: Full-featured interface with tabs for different functions
- **Database**: Uses Chrome Storage API for cross-device sync compatibility

### Performance
- Local-first architecture for instant search and filtering
- Debounced search to avoid excessive queries
- Efficient bookmark synchronization with change detection
- Optimized bundle size through Svelte compilation

## Development

### Scripts
- `npm run build`: Build the extension for production
- `npm run dev`: Build with file watching for development

### File Structure
```
bookmark-insights/
├── manifest.json           # Extension manifest
├── background.js          # Service worker
├── popup.html            # Popup interface HTML
├── dashboard.html        # Dashboard HTML
├── icons/               # Extension icons
├── public/              # Built files
├── src/                 # Source code
│   ├── App.svelte      # Main popup component
│   ├── Dashboard.svelte # Dashboard component
│   ├── BookmarkCard.svelte
│   ├── SearchBar.svelte
│   ├── Sidebar.svelte
│   ├── database.js     # Data access layer
│   ├── popup.js        # Popup entry point
│   └── dashboard.js    # Dashboard entry point
└── rollup.config.js    # Build configuration
```

## Permissions

The extension requires the following permissions:
- `bookmarks`: To read and manage your bookmarks
- `storage`: To store processed bookmark data locally
- `favicon`: To display website icons

## Privacy

This extension:
- ✅ Works entirely locally - no data is sent to external servers
- ✅ Only accesses your bookmark data through Chrome's official APIs
- ✅ Stores processed data locally for performance
- ✅ Does not track or collect any personal information

## Roadmap

Future enhancements could include:
- Export/import functionality
- Bookmark backup and restore
- Advanced search with regex support
- Custom tagging system
- Integration with external bookmark services
- Bookmark sharing capabilities

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Build and test the extension
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues, feature requests, or questions:
- Create an issue on GitHub
- Include Chrome version and extension version
- Provide detailed steps to reproduce any bugs
