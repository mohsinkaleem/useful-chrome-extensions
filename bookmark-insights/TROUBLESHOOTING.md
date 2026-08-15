# Troubleshooting

The extension has **no popup and no options page**. The primary UI is the **side panel**, opened by clicking the toolbar icon. The full **dashboard** opens from the side panel or at `chrome-extension://<id>/dashboard.html`.

## Where to look for errors

| Surface | How to inspect |
|---|---|
| Service worker | `chrome://extensions/` → Bookmark Insight → **Service worker** link |
| Side panel | Right-click inside the side panel → **Inspect** |
| Dashboard | Open the dashboard tab → `Cmd/Ctrl + Option + I` |
| Database | Dashboard → **Data** tab, or DevTools → Application → IndexedDB → `BookmarkInsightsDB` |

## Common problems

### The side panel does not open

Click the toolbar icon; the panel is configured to open on action click. If nothing happens, reload the extension from `chrome://extensions/` and check the service worker console for errors during `onInstalled`.

### Bookmarks are missing or stale

The database syncs on install, on update, on browser startup, and on every Chrome bookmark event.

1. Dashboard → **Data** tab → check the `bookmarks` table row count against your Chrome bookmark count.
2. Reload the extension to force a fresh sync.
3. If the counts still disagree, restore from a backup (Health → Backup) rather than clearing the database — enrichment data is not recoverable from Chrome.

### Enrichment does nothing / makes no progress

Enrichment is **manual only** — nothing runs on a schedule.

- Check `enrichmentEnabled` is true (Health → Enrichment).
- Bookmarks enriched within `enrichmentFreshnessDays` (default 30) are skipped. Use **Force re-enrich** to bypass this.
- Only **public http/https** URLs are fetched. `file://`, `chrome://`, `javascript:`, `data:`, `localhost`, and private/loopback/link-local addresses are deliberately skipped and will never enrich.
- Pages that do not return an HTML content type are skipped, and only the first 512 KB of a response is read.

### Everything shows as a dead link

Dead-link detection issues a `HEAD` request and falls back to a small ranged `GET`. Sites behind Cloudflare-style bot protection, or that require authentication, will return errors. Requests deliberately omit cookies, so pages that need your login will look unreachable.

Re-check from Health → Dead Links, and delete only after spot-checking a few with the **Try** link.

### Deep analysis returns nothing

Deep analysis reads the `rawMetadata` already stored on each bookmark — it makes no network requests. If a bookmark was never enriched, there is nothing to analyse. Run enrichment first.

### Search returns no results after deleting bookmarks

The FlexSearch index is persisted separately from the bookmark table. If results look stale, reload the extension — the index is rebuilt on update.

### The dashboard shows "Something went wrong"

An uncaught error crashed the Svelte app. Click **Reload**, then open DevTools on the dashboard tab and reproduce to capture the stack trace.

### Behaviour tracking records nothing

`trackBrowsingBehavior` is off by default and requires the **optional** `tabs` permission. Without that permission granted, tab URLs are unreadable and tracking stays disabled — the service worker logs a warning saying so.

## Resetting

1. **Back up first**: Dashboard → Health → Backup → Download.
2. Remove the extension from `chrome://extensions/`, or delete the `BookmarkInsightsDB` database from DevTools → Application → IndexedDB.
3. Reinstall and restore from your backup.

Removing the extension does **not** delete your Chrome bookmarks — only the enrichment data layered on top of them.

## Reporting an issue

Include:

- Chrome version and OS
- Which surface failed (service worker / side panel / dashboard)
- The console error with its stack trace
- Bookmark count, from Data → `bookmarks` table
