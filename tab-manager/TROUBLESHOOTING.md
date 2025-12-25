# Troubleshooting Guide

## Common Issues

### Extension Shows 50+ MB Size

**Problem**: Chrome shows the extension as 50+ MB in size.

**Cause**: You loaded the root project folder which includes `node_modules` (33MB) and source files.

**Solution**: 
1. Run `npm run package`
2. Reload extension from the `extension/` folder (not root)
3. Size should be ~124KB

---

### Tabs Not Updating in Real-Time

**Problem**: Tab list doesn't reflect changes immediately.

**Cause**: Events are debounced to prevent UI thrashing.

**Solution**: This is intentional. Changes appear within 150ms. If tabs still don't update:
1. Check browser console for errors
2. Try reloading the extension
3. Verify service worker is running (chrome://extensions → Service Worker link)

---

### Content Script Not Working

**Problem**: Media controls don't stop YouTube/Spotify playback.

**Cause**: Content script only runs on specific media sites.

**Current supported sites**:
- youtube.com
- spotify.com
- twitch.tv
- soundcloud.com
- vimeo.com
- netflix.com
- music.youtube.com

**Solution**: If you need support for another site, add it to `manifest.json`:
```json
"content_scripts": [{
  "matches": ["*://*.newsite.com/*", ...]
}]
```

---

### Session Restore Missing Tabs

**Problem**: Some tabs don't restore when loading a session.

**Cause**: 
- Chrome internal pages (`chrome://`) can't be opened programmatically
- Some URLs may have changed or be invalid

**Solution**: Sessions skip `chrome://` URLs. This is a Chrome security restriction.

---

### Auto-Grouping Not Working

**Problem**: New tabs aren't automatically grouped.

**Cause**: Auto-grouping is **disabled by default**.

**Solution**:
1. Auto-grouping must be enabled in code (no UI toggle yet)
2. Check `auto-grouper.ts` → `setEnabled(true)`
3. Verify rules match your domains

---

### Memory Estimates Seem Wrong

**Problem**: Estimated memory doesn't match Task Manager.

**Explanation**: Chrome removed the `chrome.processes` API. We use intelligent estimation based on:

| Factor | Memory Impact |
|--------|--------------|
| Base active tab | 30 MB |
| Discarded tab | 5 MB |
| YouTube (playing) | +150 MB |
| Google Meet/Zoom | +200 MB |
| Gmail | +80 MB |
| Active tab | +20 MB |
| Audible tab | +50 MB |
| Tab open > 24h | +30 MB |

These are approximations based on typical Chrome memory usage patterns.

---

### Bookmark Folder Not Found

**Problem**: Bookmarks created in wrong location.

**Previous cause**: Hardcoded folder ID `'1'` which may not exist.

**Current fix**: We dynamically detect the Bookmarks Bar folder. If it still fails:
1. Check browser console for errors
2. Bookmarks should appear in the first available folder

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
