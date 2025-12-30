## Plan: Cookie Manager Chrome Extension (Detailed)

I will create a minimal Chrome extension to manage cookies, view global statistics, and export data, using the existing `cookies.png` icon.

### Steps
1. Create [manifest.json](manifest.json) with `manifest_version: 3`, `permissions: ["cookies", "activeTab"]`, `host_permissions: ["<all_urls>"]`, and `action` pointing to `popup.html` and `cookies.png`.
2. Create [popup.html](popup.html) with a tabbed layout (`<nav>`), a `#current-site` view (list container), a `#stats` view (table + "Load More" button), and a global `#export-btn`.
3. Implement [popup.css](popup.css) using Flexbox for rows, a "compact" class for tight spacing, and an `.expanded` class to toggle cookie details (value, flags, expiry).
4. Implement [popup.js](popup.js) `init()` to query the active tab via `chrome.tabs.query`, then fetch site cookies using `chrome.cookies.getAll({url})`.
5. Add `renderCookieList()` to [popup.js](popup.js) that generates DOM elements with a "Delete" button (`chrome.cookies.remove`) and click-to-expand details.
6. Implement `calculateStats()` in [popup.js](popup.js) to fetch *all* cookies, group by domain, calculate total size (name+value), and sort by size descending.
7. Add `renderStats()` to [popup.js](popup.js) to show the top 10 domains, implementing a "Load More" handler to append the next batch.
8. Add `exportData()` to [popup.js](popup.js) to convert the current view's data to JSON and trigger a download via a `Blob` and anchor tag.

### Further Considerations
1. **Export Format**: I will use JSON for the export format as it preserves structure best.
2. **Cookie Size**: Size will be calculated as `name.length + value.length` in bytes.
3. **Lazy Loading**: The stats array will be stored in memory, with a pointer index for the "Load More" feature.
