# Troubleshooting Guide

## Common Issues and Solutions

### Extension Won't Load
**Problem**: "Manifest file is missing or unreadable" error
**Solution**: 
- Ensure you're selecting the root folder containing `manifest.json`
- Check that `manifest.json` is valid JSON (no syntax errors)

### No Bookmarks Showing
**Problem**: Extension loads but shows no bookmarks
**Solutions**:
1. **Check Permissions**: Make sure the extension has bookmark permissions
   - Go to `chrome://extensions/`
   - Find "Bookmark Insight" 
   - Click "Details"
   - Ensure all permissions are granted

2. **Manual Sync**: The extension syncs bookmarks automatically, but you can trigger a manual sync:
   - Open the extension popup
   - Click "Dashboard"
   - The dashboard will attempt to load bookmarks automatically

3. **Check Browser Console**: 
   - Right-click on the extension popup → "Inspect"
   - Look for error messages in the console
   - Right-click on dashboard page → "Inspect" for dashboard errors

### Search Not Working
**Problem**: Search returns no results or errors
**Solutions**:
- Try clearing the search and typing again
- Check if bookmarks are loaded (should show total count)
- Restart Chrome and try again

### Popup Too Small/Large
**Problem**: Interface doesn't fit properly
**Solution**: The popup is designed to be 384x384px. If it looks wrong:
- Try reloading the extension
- Check if CSS files are loading properly
- Clear Chrome cache

### Dashboard Not Opening
**Problem**: "Dashboard" button doesn't work
**Solutions**:
- Check if popup blockers are blocking the new tab
- Try right-clicking the extension icon and selecting "Options" (if available)
- Manually navigate to `chrome-extension://[extension-id]/dashboard.html`

### Build Errors
**Problem**: `npm run build` fails
**Solutions**:
1. **Node.js Version**: Ensure you're using Node.js 16+ 
   ```bash
   node --version
   ```

2. **Clean Install**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   ```

3. **Permission Issues**: On macOS/Linux, you might need:
   ```bash
   sudo npm install
   ```

### Performance Issues
**Problem**: Extension is slow or unresponsive
**Solutions**:

**Recent Optimizations (v3.2):**
- Search is now debounced (300ms) to eliminate typing lag
- Centralized bookmark cache (30s TTL) prevents redundant database reads
- Stats computed in single-pass with search results
- Background refresh pauses when tab is hidden

**If still slow:**
- **Similarity Detection**: The "Scan for Similarities" feature runs in the background without freezing. If slow, try smaller batches.
- Check bookmark count (10,000+ bookmarks may need patience)
- Close and reopen the extension
- Restart Chrome
- Check Chrome's Task Manager (`Shift+Esc`) for memory usage
- Reduce enrichment concurrency in settings (3 → 2)

### Favicon Loading Errors
**Problem**: Console shows "Not allowed to load local resource: chrome://favicon/" or CSP violations
**Solution**: 
- This has been fixed in the latest version
- The extension now generates local favicon icons instead of using external services
- Each domain gets a unique color and letter-based icon
- Rebuild the extension with `npm run build` and reload it

### Bookmark Deletion Errors
**Problem**: "Can't find bookmark for id" errors when deleting duplicates
**Solution**:
- This happens when bookmarks are deleted faster than the sync can keep up
- The extension now checks if bookmarks exist before attempting deletion
- Duplicate detection now validates bookmark existence before showing them

## Getting Help

### Debug Information
When reporting issues, please provide:
1. Chrome version: `chrome://version/`
2. Operating system
3. Number of bookmarks (approximately)
4. Error messages from browser console
5. Steps to reproduce the problem

### Browser Console
To check for errors:
1. **For Popup**: Right-click popup → "Inspect" → "Console" tab
2. **For Dashboard**: F12 on dashboard page → "Console" tab
3. **For Background**: Go to `chrome://extensions/` → "Inspect views: background page"

### Common Error Messages

**"Cannot read properties of undefined (reading 'length')"**
- **Fixed in v3.3**: This was caused by missing filter properties in the store
- If you still see this error, rebuild the extension: `npm run build && npm run package`
- Reload the extension in Chrome

**"Cannot read property of undefined"**
- Usually means data isn't loaded yet
- Try refreshing or waiting a moment

**"Extension context invalidated"**
- Extension was reloaded/updated
- Close and reopen the extension interface

**"Storage quota exceeded"**
- Too much data stored (very large bookmark collections)
- This is rare but contact support if it happens

### Reset Extension
If all else fails:
1. Go to `chrome://extensions/`
2. Find "Bookmark Insight"
3. Click "Remove"
4. Reinstall the extension
5. All data will be synced fresh from your Chrome bookmarks

### Reporting Bugs
Please include:
- Detailed description of the problem
- Steps to reproduce
- Expected vs actual behavior  
- Screenshots if applicable
- Browser console errors
