// Batch selection for the dead-link re-check.
//
// The re-check runs in capped chunks so a pass over a few hundred links does not
// outlive the service worker's idle budget. The checkpoint used to be a numeric
// index into getDeadLinks(), but that list is recomputed on every invocation and
// shrinks as links revive: a run that processed indices 0-99 and revived 30 left
// a 470-entry list and a cursor of 100, silently skipping 30 links that were
// never checked. Tracking ids instead is immune to the list moving underneath.

/**
 * @param {Array<{id: string}>} allDeadLinks Freshly recomputed dead links.
 * @param {Set<string>} processedIds Ids already handled in this pass.
 * @param {number} batchSize Maximum links to process this invocation.
 * @returns {{batch: Array<{id: string}>, pending: number}} `pending` is how many
 *   remain after this batch - zero means the pass is complete.
 */
export function selectDeadLinkBatch(allDeadLinks, processedIds, batchSize) {
  const remaining = allDeadLinks.filter((bookmark) => !processedIds.has(bookmark.id));
  const batch = remaining.slice(0, batchSize);
  return { batch, pending: remaining.length - batch.length };
}
