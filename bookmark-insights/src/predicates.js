// Shared definitions for the bookmark states the UI talks about.
//
// These predicates used to be re-implemented at every call site with subtly
// different rules, so the same bookmark could show an "enriched" badge, be
// excluded by the `enriched:yes` filter and be counted as pending in the header
// at the same time. Import from here instead of inlining a new variant.

const DAY_MS = 24 * 60 * 60 * 1000;

/** A bookmark is stale once it is this old and has still never been opened. */
export const STALE_AGE_DAYS = 30;

/**
 * True when a successful metadata fetch has been stored.
 *
 * `lastChecked` is deliberately not used: it is the retry guard and is stamped
 * on timeouts and dead links too, which inflated every "enriched" count.
 * Records written before `enrichedAt` existed are inferred from their stored
 * metadata.
 */
export function isEnriched(bookmark) {
  if (!bookmark) return false;
  if (bookmark.enrichedAt) return true;
  if (bookmark.enrichmentError) return false;
  return Boolean(
    bookmark.description ||
    (Array.isArray(bookmark.keywords) && bookmark.keywords.length > 0) ||
    bookmark.contentSnippet,
  );
}

/**
 * True when enrichment could ever succeed for this bookmark. `chrome://`,
 * `file://` and bookmarklets are terminal states, not pending work, and must
 * stay out of the enrichment denominators.
 */
export function isEnrichable(bookmark) {
  if (!bookmark || bookmark.enrichable === false) return false;
  const url = bookmark.url || '';
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Enrichable, not yet successfully enriched, and still worth attempting.
 *
 * Dead and blocked links are deliberately excluded. Neither can ever produce
 * metadata, so counting them left a floor the progress bar could never reach -
 * 218 of 531 "pending" rows in a real profile were already-checked dead links,
 * re-queued on every sync. They belong to the Health re-check flow instead.
 */
export function isPendingEnrichment(bookmark) {
  return (
    isEnrichable(bookmark) && !isEnriched(bookmark) && !isDead(bookmark) && !isBlocked(bookmark)
  );
}

/** Checked and found unreachable. `null`/`undefined` means "never checked". */
export function isDead(bookmark) {
  return bookmark?.isAlive === false;
}

/**
 * Up, but not reachable by an anonymous fetch: login walls, bot protection and
 * VPN-gated internal hosts answer 401/403/406/451. These are not dead and must
 * stay out of anything that offers to delete dead links.
 */
export function isBlocked(bookmark) {
  return bookmark?.accessBlocked === true;
}

/** Never opened since the extension started tracking access. */
export function isNeverAccessed(bookmark) {
  return !bookmark?.accessCount;
}

/**
 * Whether visit tracking has ever produced data for this corpus.
 *
 * `trackBrowsingBehavior` defaults to false for privacy, which leaves
 * `accessCount` at 0 for every bookmark. Read naively, that makes
 * `isNeverAccessed` true for the entire library and turns every
 * access-derived signal - staleness, the "old & never accessed" panel, the
 * usefulness penalty - into a statement about the whole corpus rather than
 * about any particular bookmark. Callers use this to tell "nobody opened it"
 * apart from "nobody was watching".
 */
export function hasAccessData(bookmarks) {
  return Array.isArray(bookmarks) && bookmarks.some((b) => b?.accessCount > 0);
}

/** Old, never opened, and not already known to be dead. */
export function isStale(bookmark, now = Date.now()) {
  if (!bookmark) return false;
  return (
    bookmark.dateAdded < now - STALE_AGE_DAYS * DAY_MS &&
    isNeverAccessed(bookmark) &&
    !isDead(bookmark)
  );
}
