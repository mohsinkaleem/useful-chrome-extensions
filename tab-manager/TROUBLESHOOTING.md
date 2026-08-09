# Troubleshooting Guide

## Common Issues

### Extension Shows 50+ MB Size

**Problem**: Chrome shows the extension as 50+ MB in size.

**Cause**: You loaded the root project folder which includes `node_modules` (33MB) and source files.

**Solution**: 
1. Run `npm run package`
2. Reload extension from the `extension/` folder (not root)
3. Size should be ~172KB

---

### Tabs Not Updating in Real-Time

**Problem**: Tab list doesn't reflect changes immediately.

**Cause**: Events are debounced to prevent UI thrashing.

**Solution**: This is intentional. Changes appear within 300ms. If tabs still don't update:
1. Check browser console for errors
2. Try reloading the extension
3. Verify service worker is running (chrome://extensions → Service Worker link)

---

### Media Controls Only Mute, They Don't Pause

**Problem**: Clicking mute silences a YouTube/Spotify tab but playback continues.

**Cause**: This is by design. The extension has **no content scripts and no host permissions**, so it cannot reach into a page to call `video.pause()`. It uses `chrome.tabs.update({ muted })`, which is the only thing available without injecting code into third-party sites.

**Solution**: Use the → button to jump to the tab and pause it there.

---

### Session Restore Missing Tabs

**Problem**: Some tabs don't restore when loading a session.

**Cause**: 
- Chrome internal pages (`chrome://`, `edge://`, `about:`) can't be opened programmatically
- Some URLs may have changed or be invalid

**Solution**: Sessions skip internal URLs. This is a Chrome security restriction. Pinned state, tab groups (title and colour) and window geometry are restored for everything else.

---

### Tabs Aren't Grouped Automatically

**Problem**: New tabs are not put into groups as they open.

**Cause**: There is no automatic grouping. Grouping is always an explicit action.

**Solution**: Use one of:
- **Group by domain** button in the popup action bar
- **✨ Smart grouping** in the side panel (domain, then title similarity)
- **Group tabs by domain** in the page right-click menu

All of these leave existing groups and pinned tabs untouched, and merge into a same-named group rather than creating a duplicate.

---

### Balance Windows Didn't Move Anything

**Problem**: Clicking balance reports "Windows are already balanced".

**Cause**: Every window is already within the min/max range (10–30 tabs), or the only tabs available to move belong to a window's dominant domain, which is never split.

**Solution**: Expected behaviour. A single window holding 80 tabs of the same site is deliberately left intact.

---

### Bookmark Folder Not Found

**Problem**: Bookmarks created in wrong location.

**Previous cause**: Hardcoded folder ID `'1'`, and later a folder-title heuristic that failed on non-English Chrome.

**Current fix**: The bookmarks bar is resolved as the first child of the bookmark root, which is locale-independent. If it still fails:
1. Check browser console for errors
2. Bookmarks fall back to folder ID `'1'`

---

### Favicons Are Blank or Generic

**Problem**: Some tabs show a plain grey square or Chrome's default globe.

**Cause**: Favicons are read from Chrome's local cache via the `favicon` permission rather than fetched from each site. A page Chrome has not cached an icon for yet shows the generic icon.

**Solution**: Expected. This is deliberate — fetching `tab.favIconUrl` directly would issue a live request to every third-party origin in the list and leak extension usage to those sites.

---

### Side Panel Shortcut Does Nothing

**Problem**: `Ctrl/Cmd+Shift+E` doesn't open the side panel.

**Cause**: Chrome silently drops a suggested shortcut if another extension already claims it.

**Solution**: Assign a free shortcut at `chrome://extensions/shortcuts`.

---

### Extension Popup is Slow

**Problem**: Popup takes time to open with many tabs.

**Optimizations already in place**:
- Debounced events (150ms)
- Lazy loading in resource monitor
- Code splitting

**Additional tips**:
- Close duplicate tabs to reduce list size
- Use search/filters to limit displayed tabs
- Consider hibernating old tabs

---

### TypeScript Errors in IDE

**Problem**: IDE shows "Property 'tabs' does not exist on type 'typeof chrome'"

**Cause**: `@types/chrome` not recognized by IDE.

**Solution**:
1. Ensure `@types/chrome` is installed: `npm install`
2. Restart TypeScript server in VS Code (Cmd+Shift+P → "TypeScript: Restart TS Server")
3. Check that `tsconfig.json` includes `"types": ["chrome"]`

---

## Debugging Steps

### Check Service Worker Status
1. Go to `chrome://extensions/`
2. Find "Advanced Tab Manager"
3. Check if "Service Worker" shows as "Active"
4. Click link to open DevTools for background

### Check for Console Errors
1. Open popup, right-click → Inspect
2. Check Console tab for errors
3. Common errors:
   - `undefined` is not an object → null check missing
   - Failed to load resource → file path issue

### Verify Build Output
```bash
# Check dist folder exists and has files
ls -la dist/

# Rebuild if needed
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

### Reset Extension State
```bash
# Clear stored data (run in browser console on any page)
chrome.storage.local.clear()
chrome.storage.sync.clear()
```

---

## Feature Requests & Known Limitations

### Current Limitations
- No keyboard shortcuts (planned)
- No dark mode (uses system colors via CSS)
- No export/import sessions as JSON
- No tab sorting options
- Auto-grouping requires code change to enable

### Planned Features
- [ ] Settings page with UI toggles
- [ ] Keyboard shortcuts
- [ ] Session export/import
- [ ] Tab sorting (by age, memory, domain)
- [ ] Dark mode toggle
- [ ] Cross-device session sync

---

## Getting Help

1. Check browser console for errors
2. Verify you're using the `extension/` folder
3. Try `npm run clean && npm run package`
4. Open an issue with:
   - Chrome version
   - Error messages
   - Steps to reproduce