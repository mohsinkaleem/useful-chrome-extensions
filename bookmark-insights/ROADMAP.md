# Bookmark Insight — Improvements, Fixes & Feature Roadmap

**Written:** 2026-08-15
**Baseline:** working tree after `CODE_REVIEW.md` phases 0-5
**Scope:** `src/**` (19,122 lines), `manifest.json`, `knip.json`, `package.json`, test suite
**Method:** static read of every module plus targeted greps; every claim below was checked against the current source, not carried over from the previous review.

Current health is good: 66 tests pass, ESLint and Prettier are clean, the security hardening from phase 2 holds up (`url-safety.js` is genuinely solid), and the corpus cache from phase 5 removed the repeated full-table reads. What remains is a mix of **correctness bugs the UI cannot show you**, **one large pocket of dead code the tooling is silently missing**, and a set of **features the data model already supports but nothing surfaces**.

---

## 0. Top five, if you only do five things

| # | Item | Why it's first | Section |
|---|---|---|---|
| 1 | Deleting a folder orphans every bookmark inside it | Silent, permanent data drift between Chrome and IndexedDB. Ghost bookmarks stay searchable forever. | [F1](#f1--deleting-a-folder-orphans-its-children) |
| 2 | Text search silently drops all reading-list items | A shipped, advertised feature that works only when the search box is empty. | [F3](#f3--any-text-query-drops-every-reading-list-item) |
| 3 | Failed enrichment is counted as successful enrichment | Every progress bar, percentage and "pending" count in the app is inflated. | [F4](#f4--failed-enrichment-counts-as-enriched) |
| 4 | ~29 unreachable exports in `db.js` that `knip` does not report | ~700 dead lines *and* a false sense that the tooling is watching. | [D1](#d1--29-unreachable-exports-in-dbjs-that-knip-does-not-report) |
| 5 | Bulk deletes are irreversible; single delete has undo | The safety net covers the one action that barely needs it. | [U2](#u2--undo-covers-the-wrong-delete) |

---

## 1. Correctness — bugs users cannot see

### F1 — Deleting a folder orphans its children

[src/background.js](src/background.js#L306) handles `chrome.bookmarks.onRemoved` by removing exactly one id:

```js
async function handleBookmarkRemoved(id, removeInfo) {
  await removeFromIndex(id);
  await dbDeleteBookmark(id);
```

Chrome fires `onRemoved` **once** for a folder. Its descendants arrive in `removeInfo.node.children` and are never touched. They stay in `bookmarks`, stay in the FlexSearch index, and keep inflating every count, domain stat and search result — permanently, because nothing else ever prunes them (see F2).

**Fix:** walk `removeInfo.node.children` recursively and collect every descendant id, then one `bulkDelete` plus one index removal pass.

---

### F2 — Sync never prunes; it only adds

[`smartMergeBookmarks`](src/db.js#L262) ends in `db.bookmarks.bulkPut(mergedBookmarks)`. There is no delete step. Anything removed in Chrome while the service worker was suspended — or removed on another synced device — survives in IndexedDB indefinitely.

This is the safety net that *would* have caught F1, and it isn't there.

**Fix:** inside the same merge, diff `existingMap` against the incoming id set and `bulkDelete` the difference, then drop those ids from the search index. It's a five-line addition to a function that already has both sides in memory.

---

### F3 — Any text query drops every reading-list item

[src/search.js](src/search.js#L770):

```js
filteredBookmarks = filteredBookmarks.filter((bookmark) => resultIds.has(bookmark.id));
```

`filteredBookmarks` comes from `getAllBookmarksWithReadingList()`, so it contains reading-list rows with synthetic ids (`reading-list-<encoded url>`). The FlexSearch index is built from `db.bookmarks` only — reading-list items are **never indexed**. So `resultIds` can never contain them, and the filter removes 100% of reading-list results the moment the user types anything.

Empty query → reading-list items appear. One character → they vanish. That is exactly the shape of a bug nobody reports because it looks like "no results".

**Fix:** either index reading-list items alongside bookmarks, or exempt `isReadingListItem` rows from the id intersection and match them with `matchesAdvancedQuery` instead.

---

### F4 — Failed enrichment counts as "enriched"

[src/enrichment.js](src/enrichment.js#L191) stamps `lastChecked` in the **error** handler, deliberately, to stop retry loops:

```js
bookmark.lastChecked = Date.now();
bookmark.enrichmentError = error.message;
```

But `lastChecked` is also the definition of "enriched" everywhere else:

- [`getQuickStats`](src/db.js#L1334) → `enriched`, `pending`, `enrichedPercentage`
- [`getEnrichmentStatus`](src/background.js#L434) → `queueSize`, `enrichedCount`, `pendingCount`
- [`getConsolidatedDomainAnalytics`](src/db.js#L1081) → per-domain `enrichedCount`

Timeouts, dead links and skipped URLs all land in the same bucket as successful metadata extraction. The enrichment progress UI is measuring "attempted", labelled "enriched".

**Fix:** separate the two. Keep `lastChecked` as the retry guard; add `enrichedAt` (set only on a successful metadata fetch) and derive every user-facing count from that instead.

---

### F5 — Three different definitions of "enriched"

| Location | Predicate |
|---|---|
| [src/db.js](src/db.js#L1010) `getBookmarksPaginated` | `b.lastChecked` |
| [src/search.js](src/search.js#L538) `enriched:yes` filter | `description \|\| keywords.length \|\| contentSnippet` |
| [src/BookmarkListItem.svelte](src/BookmarkListItem.svelte#L109) badge | `description \|\| keywords.length` |

A bookmark can show the green "enriched" badge, be excluded by `enriched:yes`, and be counted as pending in the header — simultaneously. The same fragmentation exists for **"stale"** (defined three times: [search.js](src/search.js#L530), [search.js](src/search.js#L670), [insights.js](src/insights.js#L327)) and **"never accessed"**.

**Fix:** one `predicates.js` exporting `isEnriched`, `isStale`, `isDead`, `isNeverAccessed`, imported everywhere. This is the single highest-leverage consolidation left in the codebase.

---

### F6 — User regex with `/g` is stateful across bookmarks

[src/search.js](src/search.js#L48) compiles the user's pattern once and keeps the `RegExp` object in `parsedQuery`. It is then reused via `.test()` per bookmark at [L154](src/search.js#L154) and three more times per bookmark at [L209](src/search.js#L209).

With a `g` flag, `.test()` advances `lastIndex` and the next call resumes from there. Results alternate match/no-match down the list, and the same query returns different sets on consecutive runs.

**Fix:** strip `g`/`y` at compile time, or `regex.lastIndex = 0` before each test.

---

### F7 — Unbounded user regex on the UI thread (ReDoS)

Same code path. `/(a+)+$/` compiled from the search box and run against every bookmark's concatenated text freezes the dashboard. There is no pattern-length cap, no timeout, no worker.

**Fix:** cap pattern length (~200 chars), reject nested quantifiers with a cheap heuristic, or move the whole filter pass into the existing `analysis-worker.js` — which already exists and already receives projected bookmark rows.

---

### F8 — `href` was added without a scheme allowlist

Phase 4 correctly converted many titles to real anchors — [Dashboard.svelte L2563](src/Dashboard.svelte#L2563), [L2601](src/Dashboard.svelte#L2601), [L2925](src/Dashboard.svelte#L2925), [L2966](src/Dashboard.svelte#L2966), [L3454](src/Dashboard.svelte#L3454), [L3510](src/Dashboard.svelte#L3510), [L3540](src/Dashboard.svelte#L3540), [L3596](src/Dashboard.svelte#L3596), [UselessCategory.svelte L78](src/UselessCategory.svelte#L78), [VisualInsights.svelte L643](src/VisualInsights.svelte#L643), [SidePanel.svelte L521](src/SidePanel.svelte#L521), [DataExplorer.svelte L551](src/DataExplorer.svelte#L551).

All of them do `href={bookmark.url}` with no validation. The data model explicitly expects `javascript:` bookmarklets ([utils.js L141](src/utils.js#L141) has a dedicated bookmarklet icon). Today MV3's CSP is what stops execution — the code contributes nothing.

**Fix:** a three-line `safeHref(url)` in `url-safety.js` returning the URL for `http:`/`https:` and `null` otherwise, applied at all 12 sites. `safeImageUrl` next to it is already the exact pattern.

---

### F9 — Non-`http` bookmarks are never marked, so they pollute health stats

`enrichBookmark` returns `{ skipped: true }` for non-fetchable URLs without writing anything. So `chrome://`, `file://` and bookmarklets stay `lastChecked: null` forever — permanently "pending enrichment", permanently re-queued on every sync, and permanently counted against `enrichedPercentage`.

**Fix:** write a terminal state (`enrichable: false`) once, and exclude those rows from the enrichment denominators.

---

## 2. Robustness — MV3 lifecycle and data flow

### R1 — `reEnrichDeadLinks` can be killed mid-run

[src/background.js](src/background.js#L452) defaults `batchSize` to **every** dead link and loops with no keepalive. The dashboard holds the port open, but if the user switches tabs or the run exceeds the idle budget, the worker is terminated mid-write. Progress is reported but never checkpointed, so a restart begins from zero.

**Fix:** cap the batch, persist a cursor in `chrome.storage.session`, and resume from it.

### R2 — `handleBookmarkMoved` and `handleBookmarkChanged` skip cache invalidation

[L328](src/background.js#L328) and [L380](src/background.js#L380) call `upsertBookmark` (which drops the corpus cache) but never `invalidateMetricCaches('update')`. `folderPath` changes therefore don't reach `quickStats`, `domainAnalytics` or the folder sidebar for up to an hour.

### R3 — `getAllBookmarks()` returning `[]` on error re-queues the entire corpus

[src/db.js](src/db.js#L193) swallows errors into `[]`. In [`syncBookmarks`](src/background.js#L193) that empty array becomes an empty `enrichedIds` set, `clearEnrichmentQueue()` runs, and **every** bookmark is queued for network enrichment. A transient IndexedDB failure turns into thousands of outbound requests.

**Fix:** let `getAllBookmarks` reject, and make the sync path treat failure as "do nothing" rather than "assume empty".

### R4 — Six read paths bypass the corpus cache

[`getUniqueDomains`](src/db.js#L386), [`getUniqueCategories`](src/db.js#L398), [`getDomainStats`](src/db.js#L410), [`getActivityTimeline`](src/db.js#L431), [`smartMergeBookmarks`](src/db.js#L265) and [`backfillPlatformData`](src/db.js#L2108) still call `db.bookmarks.toArray()` directly. Four of the six are dead code (see D1) — but the pattern is the leak, and the two live ones re-read a multi-MB table the cache already holds.

### R5 — `migrateFromChromeStorage` runs on every startup

[src/db.js](src/db.js#L738) calls it from `initializeDatabase()`, which now runs on both `onInstalled` **and** `onStartup`. It short-circuits on a settings read, so the cost is small — but it is a one-shot migration for a storage format the extension abandoned, still executing at every browser launch. Delete it and the `chrome.storage.local` read with it.

### R6 — Enrichment has no per-domain politeness

`processEnrichmentBatch` runs `concurrency` workers with a flat 50 ms gap. A folder of 200 GitHub links means 200 requests to one host as fast as the pool allows, with no backoff and no `Retry-After` handling. Rate limiting and IP blocks are the predictable outcome.

**Fix:** a per-hostname token bucket, plus honouring `429`/`503` + `Retry-After`.

---

## 3. Dead code & tooling

### D1 — 29 unreachable exports in `db.js` that `knip` does not report

Each of these names appears **exactly once** across `src/` and `test/` — its own definition. Nothing imports them; nothing inside `db.js` calls them:

```
getBookmarksPaginated       findSimilarBookmarks      storeSimilarities
getStoredSimilarities       clearSimilarities         getDomainStats
getActivityTimeline         getTitlePatterns          getUrlPatterns
getUrlParameterUsage        getDomainDistribution     getBookmarkAgeDistribution
getBookmarkCreationPatterns getTitleWordFrequency     checkDeadLinks
backfillPlatformData        getPlatformDataStats      findOrphans
getUniqueDomains            getUniqueCategories       getBookmarksByCategory
getBookmarksByDomain        getBookmarksByDateRange   getBookmarkEvents
getRecentEvents             clearCache                getEnrichmentQueueSize
addToReadingList            getUnreadReadingListCount
```

That is roughly **700 lines**, plus everything they transitively keep alive. Notable consequences:

- **`getBookmarksPaginated` (~100 lines) is a third, unused copy of the filter/sort pipeline** that `searchBookmarks` implements — the duplication flagged in the last review is still there, it's just dead now.
- **The `similarities` table is written by nothing.** `storeSimilarities` is the only writer and has no caller. The table is still declared in the schema, still backed up, still restored, and still shown in the Data Explorer as an always-empty table.
- **`checkDeadLinks` is dead**, so the dead-link path that actually runs is the enrichment one — worth knowing before optimising the wrong function.
- **Reading-list write APIs are dead** (`addToReadingList`, `getUnreadReadingListCount`), which is why the reading list is read-only in the UI. See feature N7.

**And the tooling is not catching any of it.** `npx knip` currently reports zero issues. [knip.json](knip.json#L3) declares a single entry, `src/background.js`, omitting `src/dashboard.js`, `src/sidepanel.js` and `src/analysis-worker.js`. Adding them does not fix the report either, so the exports rule needs `--include-entry-exports` or a `--production` run to be useful here. **Verify the config actually fails on a known-dead export before trusting it again** — a green check from a misconfigured linter is worse than no linter.

### D2 — Six settings that nothing reads

[src/db.js](src/db.js#L28) `DEFAULT_SETTINGS` still ships `enrichmentSchedule`, `enrichmentRateLimit` (self-labelled deprecated), `autoCategorizationEnabled`, `deadLinkCheckEnabled` and — most importantly — **`privacyMode`**, documented as "skip enrichment entirely" with **zero readers**. A privacy control that does nothing is worse than no control.

`enrichmentBatchSize` is a half-case: [Dashboard.svelte L525](src/Dashboard.svelte#L525) reads it into local state, but the write-back path stores the slider value only in the component.

**Fix:** delete four, implement `privacyMode` as a real guard in `enrichBookmark`, persist `enrichmentBatchSize`.

### D3 — Dynamic imports that shadow static ones

[src/enrichment.js L646](src/enrichment.js#L646), [L679](src/enrichment.js#L679), [L731](src/enrichment.js#L731) do `await import('./db.js')` inside functions in a file that already statically imports from `./db.js` at the top. With `inlineDynamicImports: true` they resolve to the same module object — pure noise that forces the surrounding code into promise chains.

### D4 — Leftover section markers

[src/search.js L912-914](src/search.js#L912) ends with two orphaned comments (`// Clear the search index`, `// Export for statistics`) describing code that was removed. [insights.js L130-132](src/insights.js#L130) has an empty `COLLECTION HEALTH METRICS` banner for the same reason.

---

## 4. Performance

| ID | Issue | Location |
|---|---|---|
| P1 | **`reanalyzeBookmark` writes one record per transaction.** Deep Analysis over 3,700 bookmarks is 3,700 `put` calls, each invalidating the corpus cache — so the *next* read re-scans the whole table. Batch into `bulkPut` per 50-item chunk and invalidate once. | [enrichment.js L904](src/enrichment.js#L904) |
| P2 | **Deep Analysis runs on the dashboard's main thread.** `batchReanalyze` chunks with `sleep(100)`, which yields but does not parallelise. `analysis-worker.js` already exists and `metadata-analyzer`/`topics` are pure functions over plain objects — this is the obvious second workload to move there. | [enrichment.js L930](src/enrichment.js#L930) |
| P3 | **`findUselessBookmarks` low-score dedupe is quadratic.** For each bookmark it runs four `.some()` scans over four growing arrays. With many dead links that's O(n·m) on the main thread. Use a `Set` of already-categorised ids. | [similarity.js L271](src/similarity.js#L271) |
| P4 | **Search re-materialises and re-sorts the full corpus on every keystroke.** After the FlexSearch intersection it does `.map()` (full object spread per row, including `rawMetadata` blobs) then `.sort()` over all matches before slicing 50. Score into a parallel array and sort ids instead. | [search.js L792](src/search.js#L792) |
| P5 | **Indexed fields still unused.** `domain`, `category`, `dateAdded`, `platform`, `isAlive` and `publishedDate` are all indexed in the schema; every consumer filters in JS over the cached array. Fine at 3,700 rows, wrong at 30,000. | [db.js L15](src/db.js#L15) |
| P6 | **No list virtualization.** "Load More" appends 50 rows to the DOM without bound. At 2,000 rendered rows the bookmarks view becomes noticeably heavy. | [Dashboard.svelte L1644](src/Dashboard.svelte#L1644) |
| P7 | **Two full searches per filter change.** The reactive block resets `currentPage` and calls the debounced loader; `bookmarksChanged` from the background then triggers a second `loadBookmarks(0, false)`. During enrichment these interleave continuously. | [Dashboard.svelte L281](src/Dashboard.svelte#L281) |

---

## 5. Architecture & consistency

1. **`Dashboard.svelte` is still 3,661 lines.** Phase 4 extracted the header, filter chips and useless-category panel — the right start. The remaining split is the Health view: dead links, duplicates, similar pairs, malformed URLs, backup/restore and the comparison modal are eight independent panels with no shared state beyond `loadHealthData()`. Extracting them lands the file near 1,200.
2. **One predicates module** (F5) — `isEnriched`, `isStale`, `isDead`, `isNeverAccessed`.
3. **One time-constants module.** `24 * 60 * 60 * 1000` still appears **37 times** across 7 files. `DAY_MS`, `WEEK_MS`, `MONTH_MS`, `YEAR_MS`.
4. **One `topN(counts, n)` helper.** The `Object.entries().map().sort().slice()` idiom appears 15+ times in `insights.js` and `db.js` alone.
5. **Use the stored `platform` / `contentType` fields instead of substring guessing.** [insights.js L218](src/insights.js#L218) still classifies content with `url.includes('app.')` — which matches `whatsapp.com` — and [L231](src/insights.js#L231) uses `url.includes('shop')`, which matches "work**shop**". `url-parsers.js` already computed and persisted the correct answer.
6. **Give `analysis-worker.js` a second job.** It currently handles similarity only. Topic detection, deep analysis and regex search filtering are all pure, all CPU-bound, and all currently on a thread that has a UI to paint.

---

## 6. UX & accessibility

| ID | Improvement | Current state |
|---|---|---|
| U1 | **Main bookmark list titles are still not links.** [BookmarkCard.svelte L12](src/BookmarkCard.svelte#L12) and [BookmarkListItem.svelte L21](src/BookmarkListItem.svelte#L21) use `chrome.tabs.create` on a `role="button"` div. Every other surface was converted in phase 4; the primary list was not. No middle-click, no "open in new window", no context menu, no "Copy link address", no status-bar URL preview. | Highest-frequency daily friction left. |
| U2 | **Undo covers the wrong delete.** Single delete has a 5s undo toast ([Dashboard.svelte L1226](src/Dashboard.svelte#L1226)). `deleteAllDeadLinks`, `deleteAllDuplicates`, `deleteSelectedDuplicates`, `deleteAllMalformedUrls`, `deleteSelectedBookmarks` and the useless-category bulk deletes are **all irreversible**, guarded only by a `confirm()`. | Inverted risk. Fix with a `trash` table + 30-day TTL. |
| U3 | **20 blocking `confirm()`/`alert()` calls** in `Dashboard.svelte`. Unstyled, ignore dark mode, block the event loop, and cannot show progress. | Unchanged since the last review. |
| U4 | **No progress or cancel on bulk deletes.** [`deleteBookmarks`](src/db.js#L1485) awaits `chrome.bookmarks.remove` in a serial loop. Deleting 500 duplicates freezes the panel with no feedback and no way out. | |
| U5 | **No modal semantics.** Zero `role="dialog"`, `aria-modal`, focus trap, Escape handler or focus restore anywhere in `src/`. The comparison modal at [Dashboard.svelte L3454](src/Dashboard.svelte#L3454) closes on backdrop click only. | |
| U6 | **No `aria-live`.** The undo toast, enrichment progress and deep-analysis progress are all silent to screen readers. | |
| U7 | **Four `{#each}` blocks over mutated arrays are unkeyed** — dead links [L2556](src/Dashboard.svelte#L2556), duplicates [L2754](src/Dashboard.svelte#L2754), similar pairs [L2862](src/Dashboard.svelte#L2862), malformed URLs [L3142](src/Dashboard.svelte#L3142). All four are filtered/spliced in place, so Svelte reuses DOM nodes by index and rows render against the wrong record after a delete. `ActiveFilterChips` and `UselessCategory` were keyed correctly in phase 4 — copy that. | |
| U8 | **`BookmarkCard` has no favicon `onerror` fallback.** `BookmarkListItem` has `handleImageError` → `getGeneratedFavicon`; the card view does not, so card-mode favicons render as broken images. | |
| U9 | **View state doesn't survive reload.** Only `currentView` persists (via the URL hash). `viewMode` (list/card), `currentSortBy` and all active filters reset on every open, despite `chrome.storage.local` already being wired up for dark mode. | |
| U10 | **No keyboard shortcuts.** No `/` to focus search, no `j`/`k` navigation, no `Esc` to close modals, and no `commands` block in [manifest.json](manifest.json#L1). | |
| U11 | **The query language is undiscoverable.** `+term`, `-term`, `"phrase"`, `/regex/`, and 14 field filters are supported and documented in the README, but there is no in-app syntax hint or autocomplete. | |
| U12 | **No empty states in Health panels.** A clean library shows blank cards rather than "No duplicates found". | |
| U13 | **No i18n.** No `default_locale`, no `_locales/`; all strings hardcoded. | |

---

## 7. New features

Ordered by value ÷ effort. Everything in Tier 1 uses data the extension already collects.

### Tier 1 — high value, low effort

**N1. Omnibox search.** Add `"omnibox": { "keyword": "bm" }` to the manifest and wire `chrome.omnibox.onInputChanged` to `searchBookmarks`. The entire query language — `+`, `-`, `"phrases"`, `domain:`, `platform:`, `channel:` — becomes available from the address bar without opening any UI. This is the single best value-to-effort item available: ~40 lines against a search engine that is already built, indexed and tested.

**N2. Reading-time-aware "Read next" queue.** `readingTime` is populated by Deep Analysis and `readingTimeRange` already exists as a filter in the [activeFilters store](src/stores.js#L48) — but nothing in the UI sets it. Ship "I have 10 minutes / 30 minutes / an hour" chips over unread bookmarks. Near-zero new logic.

**N3. Content-freshness surfacing.** Same unlock: `publishedDate` is populated and `hasPublishedDate` is a wired filter with no UI. Flag bookmarks whose *content* is 5+ years old — distinct from, and far more actionable than, "you saved this 5 years ago".

**N4. Saved searches / smart folders.** The query language already supports everything needed. Persist named queries in `settings`, show live counts in the sidebar next to domains and folders. Pairs naturally with N1.

**N5. Duplicate merge instead of delete.** When two rows are duplicates, keep the richer record (more enrichment, higher `accessCount`) and union their tags/keywords/topics, rather than forcing the user to pick a survivor. The side-by-side comparison modal already renders exactly the data this needs.

**N6. Export to Markdown / CSV / Netscape HTML.** `createBackup()` already materialises everything; three small serializers give real portability and an exit story. Netscape HTML in particular means "import into any other browser".

**N7. Make the reading list writable.** `addToReadingList`, `removeFromReadingList`, `updateReadingListItem` and `getUnreadReadingListCount` all exist in [db.js](src/db.js#L630) and two of the four have no caller at all. Add "send to reading list" / "mark read" / "promote to bookmark" actions and the feature stops being read-only.

**N8. Domain-level bulk operations.** "github.com — 340 bookmarks, 190 dead" → recheck all / delete all dead / move all to a folder. `getDomainIntelligence` already computes every number this needs.

**N9. Trash with 30-day retention.** Implements U2 properly and removes the `chrome.bookmarks.create()` replay hack in [`handleUndoDelete`](src/Dashboard.svelte#L1241), which currently loses the original id and re-parents to `'1'` when `parentId` is missing.

### Tier 2 — high value, medium effort

**N10. Auto-foldering suggestions.** `topics.js` already assigns a taxonomy path to every bookmark. Surface "42 bookmarks look like *DevOps* but live in 9 different folders — create `/DevOps`?" with a preview and one-click apply. This remains the largest latent feature in the codebase: the classification is done, computed and stored; nothing acts on it.

**N11. Content-drift detection.** Hash the extracted title + description at enrichment time. On re-enrichment, flag substantial changes — this catches domain squatting and silent 200-status link rot, which HEAD checks structurally cannot detect. Cheap to add to the existing pipeline.

**N12. Wayback Machine fallback.** For any `isAlive === false`, a one-click `web.archive.org/web/*/{url}` link. Fully compatible with the local-first stance — a single user-initiated navigation, no background requests.

**N13. Rediscovery digest in the side panel.** `getActionableInsights().rediscoveryFeed` already returns a properly shuffled selection ([shuffle](src/utils.js#L236) was fixed to Fisher-Yates in phase 5) and is rendered in [VisualInsights L637](src/VisualInsights.svelte#L637) only. Promote it to a weekly card in the side panel where it will actually be seen.

**N14. Scheduled link-health sweeps.** A weekly `chrome.alarms` job re-checking a rotating slice of the corpus, so dead links are found before the user goes looking. The `alarms` permission was correctly dropped in phase 2 — this is the justification to add it back deliberately.

**N15. Import from Pocket / Raindrop / Netscape HTML.** Complements N6 and is a genuine adoption driver.

**N16. Local semantic search.** A small quantized embedding model via `transformers.js`, vectors in IndexedDB. Better results than the current fuzzy-title stack, keeps the 100%-local promise, and would let the similarity worker retire most of its heuristics. Meaningful effort; highest ceiling.

### Tier 3 — larger scope

**N17. Optional BYO-LLM enrichment.** Strictly opt-in, user-supplied key, per-bookmark consent, off by default. Real summaries and categories instead of substring heuristics. Must be disclosed prominently or it undermines the privacy positioning that is currently a genuine differentiator.

**N18. `chrome.storage.sync` for settings and saved searches only.** Not bookmark data — the quota won't allow it.

**N19. Browsing-history correlation.** With `trackBrowsingBehavior` on: "you visit this site weekly but never bookmarked it". Needs careful consent UX.

**N20. Firefox / Edge port.** The codebase is close to WebExtension-standard; `sidePanel` and `readingList` are the blockers.

---

## 8. Suggested order of work

### Phase 6 — Correctness (do first, all small) ✅ done
- [x] F1 — recurse `removeInfo.node.children` on folder delete
- [x] F2 — prune in `smartMergeBookmarks`
- [x] F3 — reading-list items in text search
- [x] F4 / F9 — split `lastChecked` from `enrichedAt`; mark non-enrichable URLs
- [x] F5 — one predicates module (`isEnriched`, `isStale`, `isDead`, `isNeverAccessed`)
- [x] F6 / F7 — strip `g` from user regex; cap pattern length
- [x] F8 — `safeHref()` at all 12 anchor sites
- [x] U7 — key the four mutated `{#each}` blocks

### Phase 7 — Tooling & deletion ✅ done
- [x] D1 — fix `knip.json`, **verify it fails on a known-dead export**, then delete the ~29 unreachable exports and the `similarities` table
  - Root cause of the false green: `enrichment.js` dynamically imported `db.js` and accessed the namespace object dynamically (`import('./db.js').then(m => m.getBookmark(...))`), so knip treated **every** `db.js` export as used. Fixing D3 is what makes D1 detectable.
- [x] D2 — implement `privacyMode`, delete the other dead settings
- [x] D3 / D4 / R5 — dynamic imports, orphaned comments, `migrateFromChromeStorage`
- [x] Add unit tests for the new predicates module and `safeHref` — both are pure and need zero mocking

### Phase 8 — Robustness & performance ✅ done
- [x] R1, R2, R3, R6 — worker lifecycle, cache invalidation, error propagation, per-domain rate limiting
- [x] P1, P2 — batch Deep Analysis writes, move it into the existing worker
- [x] P3, P4, P7 — quadratic dedupe, search materialisation, double loads

### Phase 9 — UX ✅ done
- [x] U1 — real anchors in `BookmarkCard` / `BookmarkListItem`
- [x] U2 + N9 — trash table, undo for every delete
- [x] U3, U4 — replace `confirm`/`alert`, add progress + cancel
- [x] U5, U6, U8 — modal semantics, `aria-live`, card favicon fallback
- [x] U9, U10, U11 — persist view state, keyboard shortcuts, in-app syntax hints

### Phase 10 — Features ✅ done
- [x] N1 (omnibox) first — best value-to-effort in the document
- [x] N2, N3, N4 — unlock the filters that are already wired but have no UI
- [x] N5, N6, N8 — duplicate merge, Markdown/CSV/Netscape export, domain bulk operations
- [x] N9 — trash with 30-day retention (landed with phase 9)
- [x] N10 (auto-foldering) — topic-driven folder suggestions with preview and one-click apply
- [ ] N7 — writable reading list (deferred)

---

## Appendix — How the claims were verified

| Claim | Check |
|---|---|
| Folder children orphaned | `handleBookmarkRemoved` reads only `id`; `removeInfo.node.children` appears nowhere in `src/` |
| Sync never prunes | `smartMergeBookmarks` contains `bulkPut` and no `delete`/`bulkDelete` |
| Reading-list items dropped by search | index is built from `getBookmarksCached()` in `rebuildSearchIndex`, but `addToIndex` is only ever called with `db.bookmarks` rows; reading-list ids are synthetic |
| Failed enrichment counted as enriched | `lastChecked = Date.now()` in the `catch` block at `enrichment.js` L191; `getQuickStats` and `getEnrichmentStatus` both filter on `b.lastChecked` |
| 29 unreachable `db.js` exports | each name matched exactly once across `src/` + `test/` (its own definition) |
| `knip` reports nothing | `npx knip` and `npx knip --include exports,types,duplicates` both exit clean |
| 37 × `24 * 60 * 60 * 1000` | literal grep across `src/**` |
| 20 blocking dialogs | grep for `confirm(` / `alert(` in `Dashboard.svelte` |
| No dialog/aria semantics | grep for `role="dialog"`, `aria-modal`, `aria-live` across `src/` → 0 matches |
| Tests / lint status | `npm test` → 66 passed (6 files); `npm run lint` and `npm run format:check` clean |
