# Development Notes

## Architecture Overview

### Service Worker (Background)
- **Purpose**: Runs in the background, handles context menus, auto-grouping
- **File**: `src/background/service-worker.ts`
- **Key Features**:
  - Context menu setup and handlers
  - Tab event listeners for auto-grouping
  - Background task coordination

### Popup/Side Panel
- **Purpose**: Main UI for managing tabs
- **Files**: `popup.html`, `src/popup/popup.ts`, `styles.css`
- **Components**: Modular architecture with separate components
- **State Management**: Uses Chrome APIs directly, no framework overhead

### Content Script
- **Purpose**: Injected into pages for media control
- **File**: `src/content/content-script.ts`
- **Features**: Pause/stop video and audio elements

### Shared Utilities
- **tab-utils.ts**: Tab and window queries, event management
- **url-utils.ts**: Duplicate detection, domain extraction
- **bookmark-utils.ts**: Bookmarking operations

## Component Architecture

Each UI component is self-contained:
- **TabList**: Renders tabs grouped by window, handles selection
- **SearchBar**: Search input with filters, debounced updates
- **QuickActions**: Batch operations on selected tabs
- **ResourcePanel**: Memory/resource statistics and hibernation
- **MediaControls**: Media tab detection and playback control
- **SessionManager**: Session save/restore with modal UI

## Chrome API Patterns

### Tab Queries
```typescript
// Get all tabs
const tabs = await chrome.tabs.query({});

// Get tabs in current window
const tabs = await chrome.tabs.query({ currentWindow: true });

// Get active tab
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
```

### Tab Groups
```typescript
// Create group
const groupId = await chrome.tabs.group({ tabIds: [1, 2, 3] });

// Update group
await chrome.tabGroups.update(groupId, { 
  title: 'My Group',
  color: 'blue',
  collapsed: false 
});
```

### Storage
```typescript
// Save to local storage
await chrome.storage.local.set({ sessions: [...] });

// Save to sync storage (syncs across devices)
await chrome.storage.sync.set({ groupingRules: [...] });

// Retrieve
const { sessions } = await chrome.storage.local.get('sessions');
```

### Bookmarks
```typescript
// Create bookmark
await chrome.bookmarks.create({
  parentId: '1', // Bookmarks Bar
  title: 'My Bookmark',
  url: 'https://example.com'
});
```

## Event Handling

### Tab Events
- `onCreated`: New tab created
- `onUpdated`: Tab properties changed (URL, title, etc.)
- `onRemoved`: Tab closed
- `onMoved`: Tab reordered
- `onActivated`: Different tab became active

### Debouncing
Search input uses 300ms debounce to avoid excessive re-renders.

## Performance Considerations

1. **Lazy Loading**: Components only render when needed
2. **Event Batching**: Multiple tab changes trigger single re-render
3. **Tab Discard**: Use `chrome.tabs.discard()` to hibernate tabs
4. **Efficient Queries**: Use specific queries instead of getting all tabs

## Build System

Uses esbuild for:
- Fast compilation
- TypeScript transpilation
- Code bundling
- ESM modules
- Code splitting (shared chunks)

## Testing Locally

1. Make changes to source files
2. Run `npm run build` or `npm run watch`
3. Go to `chrome://extensions/`
4. Click refresh icon on the extension card
5. Test the changes

## Debugging

### Service Worker
- Go to `chrome://extensions/`
- Click "Service Worker" link under your extension
- Console logs appear there

### Popup
- Right-click the popup
- Select "Inspect"
- Console and DOM inspector available

### Content Script
- Open DevTools on any page (F12)
- Console logs from content script appear there

## Common Issues

### Module Resolution
- Use `.js` extension in imports (esbuild requires it)
- TypeScript files use `.ts` but imports reference `.js`

### Chrome API Types
- Install `@types/chrome` for TypeScript support
- Some APIs may not have complete types

### Permissions
- Ensure all required permissions are in manifest.json
- Test with minimal permissions first, add as needed

## Extension Manifest V3 Notes

### Service Worker vs Background Page
- MV3 uses service workers (event-driven)
- No persistent background page
- Keep tasks short, use alarms for scheduled tasks

### Content Script Injection
- Declared in manifest for all URLs
- Can also inject programmatically with `scripting` API

### Host Permissions
- `<all_urls>` required for content script injection
- More restrictive permissions possible for specific domains

## Future Improvements

### Performance
- Virtual scrolling for large tab lists
- IndexedDB for session history
- Web Workers for intensive operations

### Features
- Keyboard shortcuts (commands API)
- Tab search history
- Analytics and insights
- Cloud sync for sessions
- Custom themes

### UX
- Drag-and-drop tab reordering
- Bulk operations UI improvements
- Settings page
- Onboarding tutorial

## Resources

- [Chrome Extensions Docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome APIs Reference](https://developer.chrome.com/docs/extensions/reference/)
- [TypeScript Chrome Types](https://www.npmjs.com/package/@types/chrome)
