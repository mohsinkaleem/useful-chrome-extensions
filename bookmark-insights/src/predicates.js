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

/** Enrichable but not yet successfully enriched. */
export function isPendingEnrichment(bookmark) {
  return isEnrichable(bookmark) && !isEnriched(bookmark);
}

/** Checked and found unreachable. `null`/`undefined` means "never checked". */
export function isDead(bookmark) {
  return bookmark?.isAlive === false;
}

/** Never opened since the extension started tracking access. */
export function isNeverAccessed(bookmark) {
  return !bookmark?.accessCount;
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
