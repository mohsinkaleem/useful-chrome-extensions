# Bookmark Insight — Code Review, Cleanup Plan & Roadmap

**Reviewed:** 2026-08-15
**Scope:** full source tree (~20,700 lines), manifest, build config, docs, repo hygiene
**Method:** static read of `src/**`, cross-checked against the committed 29 MB database backup (3,724 real bookmarks) to confirm which failures are theoretical vs. observed in production data.

---

## 0. Executive summary

The extension is feature-rich and the data model is well thought out, but it has drifted: several shipped features silently do nothing, ~1,500 lines are unreachable, and a personal data export is committed to git.

**Three things are broken in ways users cannot see:**

| | Feature | Evidence |
|---|---|---|
| 1 | Deep metadata analysis (`publishedDate`, `readingTime`, `smartTags`, content quality) | `metadata-analyzer.js` reads `metadata.schemaOrg`; `enrichment.js` writes `rawMetadata.jsonLd`. The key **never exists**. Backup confirms `publishedDate: null` on 3,291/3,291 enriched records. |
| 2 | Insights charts | `Dashboard.svelte` has **zero `<canvas>` elements**, yet `loadInsights()` (~380 lines) runs 13 full-table aggregations and 11 `getElementById` lookups that all return `null` on every visit to the Insights tab. |
| 3 | Metric cache invalidation | `invalidateMetricCaches()` invalidates six key names (`domainStats`, `activityTimeline`, …) that **no code ever writes**. The six real keys (`domainAnalytics`, `quickStats`, …) are never invalidated. |

**Highest-priority item is not a code bug:** `database-bookmark-insights-backup-2026-01-23.json` (29 MB, git-tracked) is a complete personal browsing-interest profile — 3,724 URLs, titles, folder paths, timestamps, access history — permanently in git history.

---

## 1. Critical (fix first)

### C1 — 29 MB personal data export committed to git

`database-bookmark-insights-backup-2026-01-23.json` is tracked (`git ls-files` confirms). It is 99% of the repo's byte weight and contains the author's full bookmark corpus.

```bash
git rm --cached database-bookmark-insights-backup-2026-01-23.json
echo "*backup-*.json" >> .gitignore
# already in history — purge with git filter-repo before any push/publish
```

`src/database.js.backup` also appears in `git rev-list --objects --all`.

---

### C2 — `metadata-analyzer.js` and `url-parsers.js` read a metadata shape that is never produced

`enrichment.js` builds a **nested** object:

```js
const rawMetadata = { meta: {}, openGraph: {}, twitterCard: {}, jsonLd: [], other: {} };
```

Both consumers read **flat top-level keys** plus a `schemaOrg` key that does not exist:

| Consumer | Reads | Actual location |
|---|---|---|
| `metadata-analyzer.js` L25, L76, L128, L206, L286 | `metadata.schemaOrg` | `rawMetadata.jsonLd` |
| `metadata-analyzer.js` L14 | `metadata['og:video:duration']` | `rawMetadata.openGraph[…]` |
| `metadata-analyzer.js` L53-64, L100, L112 | `metadata['article:published_time']`, `.keywords` | `rawMetadata.meta[…]` |
| `metadata-analyzer.js` L179, L191 | `metadata['og:description']`, `['og:image']` | `rawMetadata.openGraph[…]` |
| `url-parsers.js` L61 | `metadata.schemaOrg` guard | — guard always returns early |

**Measured impact** (from the committed backup):

```
"schemaOrg"            →    0 occurrences
"jsonLd"               → 3291 occurrences
"publishedDate": null  → 3291   (100% failure)
"readingTime": null    → 2138   ( 65% failure)
"smartTags": []        → 1773   ( 54% failure)
```

55 of the 100 points in `calculateContentQuality()` are unreachable, so every quality score is silently deflated. The entire 60-line switch in `enhanceWithSchemaOrg` (`url-parsers.js` L67-110) is dead.

**Fix:** normalize once. Either flatten `rawMetadata` at write time, or add an adapter that maps `{meta, openGraph, twitterCard, jsonLd}` → the flat shape the analyzer expects. Then backfill existing records — no refetch needed, `rawMetadata` is already stored.

---

### C3 — Enrichment queue is never drained (wrong primary key)

`db.js` L14 declares `enrichmentQueue: '++queueId, …'`, but `enrichment.js` L691 reads `queueId: item.id` → always `undefined`, so the removal guards at L761 and L771 never fire.

The queue table grows unbounded and `getNextEnrichmentBatch` returns the same rows forever. The code already works around the symptom rather than the cause — `background.js` L418 comments *"Use actual pending count, not queue table size"*.

**Fix:** `queueId: item.queueId`.

---

### C4 — `searchQuery` is undeclared → `ReferenceError` in two handlers

`Dashboard.svelte` L941 and L947 assign a bare `searchQuery`; the store is imported *aliased* as `searchQueryStore` at L62. Svelte components are ESM (strict mode), so both throw. Even if they didn't, `handleSearch()` (L358) reads `event.detail.query` and is being handed a raw string.

```js
searchQuery = 'enriched:no';        // L941 — undeclared
await handleSearch(searchQuery);    // L943 — wrong signature
```

---

### C5 — Two delete paths desynchronize Chrome bookmarks from IndexedDB

`db.js` `deleteBookmark()` (L330) is **IndexedDB-only**. Only `deleteBookmarks()` (L1346) touches both.

- **`handleDeleteSingle()`** (`Dashboard.svelte` L1637) calls `deleteBookmark()` only → the real Chrome bookmark survives, background sync re-inserts the row, and `handleUndoDelete()` (L1681) then calls `chrome.bookmarks.create()` → **creates a genuine duplicate of a bookmark that was never deleted.**
- **`deleteSelectedDuplicates()`** (L1337) and **`deleteAllDuplicates()`** (L1367) call `chrome.bookmarks.remove()` only → orphaned IndexedDB rows. Ironically, the single-item `deleteDuplicate()` (L1268) does it correctly.

**Fix:** route every delete through `deleteBookmarks()`.

---

### C6 — Metric cache invalidation targets keys that don't exist

| Written by `getCachedMetric` | Invalidated by `invalidateMetricCaches` |
|---|---|
| `domainAnalytics`, `ageDistribution`, `creationPatterns`, `wordFrequency`, `duplicates`, `quickStats` | `domainStats`, `activityTimeline`, `insightsSummary`, `similarities`, `categoryTrends`, `expertiseAreas` |

**Zero overlap.** `CACHE_DURATIONS` (`db.js` L730-747) enumerates the same phantom names, so the `'all'` branch (L785) iterates the wrong set.

Consequences:
- `domainAnalytics` (1 h TTL) and `creationPatterns` (6 h TTL) are **never invalidated** — domain stats stay wrong for up to an hour after any add/delete.
- `quickStats` (5 min) is derived from `duplicates` (24 h), which isn't invalidated on `'add'` → freshly-computed stats embed day-old duplicate groups.
- `enrichBookmark()` (`enrichment.js` L155-162) never calls `invalidateMetricCaches` at all, so a full enrichment run leaves `quickStats.enriched` stale for 5 min and `wordFrequency` for 24 h.

`db-explorer.js` `KNOWN_METRICS` (L22-33) hardcodes the *same stale list a third time*, so six metrics permanently display status `'never'` in the Data Explorer UI, and the two real ones show as "Custom metric / TTL Unknown".

**Fix:** export one `CACHE_KEYS` constant from `db.js`; derive `CACHE_DURATIONS`, `invalidateMetricCaches`, and `db-explorer`'s list from it.

---

## 2. High-priority bugs

### Data integrity

| ID | Issue | Location |
|---|---|---|
| B1 | **Search index removals silently dropped on a cold worker.** `removeFromIndex` returns early when `searchIndex === null`, which is always true on a freshly-woken MV3 worker. Deleted bookmarks stay searchable forever. Worse, `updateInIndex` → no-op remove → `addToIndex` lazily loads the *stale cached* index and adds a **second document for the same id**. | `search.js` L337-352, `background.js` L272 |
| B2 | **Deleting a folder orphans its children.** Chrome fires `onRemoved` once for the folder; children live in `removeInfo.node.children` and are never removed from IndexedDB or the index. | `background.js` L192-194, L270-291 |
| B3 | **`smartMergeBookmarks` never prunes.** Only `bulkPut`. Anything deleted in Chrome while the worker was suspended remains in IndexedDB and in every stat/search result indefinitely. | `db.js` L255-325 |
| B4 | **Read-modify-write race on access counters** — `get` then `update` outside a transaction; concurrent tab events lose increments. Use `db.bookmarks.where(…).modify()`. | `background.js` L686-692 |
| B5 | **`chrome.storage.local` dual-write can abort the whole sync.** 10 MB quota, no `unlimitedStorage`. On overflow the promise rejects, the outer catch swallows it, and everything after — including enrichment-queue setup — is skipped. | `background.js` L147-152 |
| B6 | **Error swallowing produces dangerous defaults.** `getAllBookmarks()` → `[]` on error means `enrichedIds` is empty → `clearEnrichmentQueue()` runs → **every** bookmark is re-queued for network enrichment. `getSettings()` → `DEFAULT_SETTINGS` silently re-enables `enrichmentEnabled` even if the user disabled it. | `db.js` L188-195, L102-110 |

### MV3 lifecycle

| ID | Issue | Location |
|---|---|---|
| B7 | **Tab listeners registered asynchronously.** `initBehaviorTracking().then(…)` → `chrome.tabs.onUpdated.addListener` inside a promise. MV3 requires synchronous registration in the first turn; otherwise events in the async gap are lost. Behavior tracking is intermittently unreliable. | `background.js` L762-790 |
| B8 | **No `chrome.runtime.onStartup` listener anywhere.** `initializeDatabase()` runs only on `onInstalled`. | `background.js` L38 |
| B9 | **In-memory state lost on suspend.** `urlToBookmarkCache`/`cacheBuilt`, `accessDebounce` (also unbounded — never pruned), `searchIndex`. The 1-minute access debounce doesn't hold across worker restarts, so access counts inflate. `findMatchingBookmark` has no in-flight dedupe → concurrent tab events each trigger a full `toArray()`. | `background.js` L615-708, `search.js` L10-11 |
| B10 | **Long-running handlers outlive the worker.** `reEnrichDeadLinks` defaults `batchSize` to *all* dead links; no keepalive. If the dashboard tab closes the port drops and the worker can be killed mid-write. The shared `results` object is also mutated concurrently inside `Promise.all`. | `background.js` L430-520 |

### Correctness in analysis

| ID | Issue | Location |
|---|---|---|
| B11 | **`isAlive !== null` counts unchecked bookmarks as checked** — `undefined !== null` is `true`, so `aliveChecked` ≈ total. The file gets it right at L607, L677, L1066; L356 is the outlier and drives a wrong dashboard figure. | `insights.js` L356 |
| B12 | **`setMonth` overflow.** Run on 31 Mar, `i=1` gives `Feb 31 → Mar 3` — the 12-month trend produces a duplicate March and **drops February entirely**. | `insights.js` L1283-1289 |
| B13 | **Month labels off by one month for all western timezones.** `new Date('2026-03-01')` parses as UTC midnight, then formats in local time → `2026-03` renders as "Feb 26" for every user west of UTC. | `insights.js` L1302 |
| B14 | **Mixed UTC/local day bucketing** — `toISOString().split('T')[0]` (UTC) at L424/L436 vs `getHours()`/`getDay()` (local) at L506/L1194/L1216. The same event lands in different days on different charts. | `insights.js` |
| B15 | **Division-by-zero → `NaN` on an empty collection.** No `total === 0` guard in `getTimeBasedAnalysis` / `getContentAnalysis` (L769, L830, L849, L864, L1233, L1273). With zero bookmarks, `Math.max(...hourCounts)` is 0 → **all 24 hours reported as "peak hours."** | `insights.js` |
| B16 | **Three inconsistent definitions of "never accessed"** — L140 uses OR, L284/L358 use AND, L911/L932 use accessCount only, `similarity.js` L1043 uses AND. `getStaleBookmarks` (OR) flags bookmarks the others consider active. | `insights.js`, `similarity.js` |
| B17 | **`Math.random() - 0.5` as a sort comparator** (2 sites). Non-transitive → undefined behaviour; V8's TimSort yields a heavily biased permutation, so the "random rediscovery feed" resurfaces the same items and the cross-domain similarity sample is not uniform. `similarity.js` L831 also **mutates the shared array** returned by `getAllBookmarks()`. Comment says "pick 5", code slices 10. | `insights.js` L964, `similarity.js` L831 |
| B18 | **`formatTimeAgo` renders "0 years ago"** for days 360-364 (`months = 12` fails the `< 12` check, `years = 0`). L46 `if (days === 0)` is unreachable. No guard for future timestamps → negative strings. | `utils.js` L32-52 |
| B19 | **Substring matching mass-mislabels bookmarks.** `'dev.'` matches every **dev.to** bookmark (−20 "temporary/dev URL"); `'test.'` matches `/latest.html`; `'page'` matches "Home**page**"; `'link'` matches "**Link**edIn"; `'bookmark'` matches this project's own name (−15 each). The same two lists are redefined 50 lines later with **different members and different matching semantics**, so a bookmark is scored one way and bucketed another. | `similarity.js` L960-967 vs L1013-1014 |
| B20 | **User regex with `/g` is stateful across bookmarks.** One `RegExp` reused via `.test()` across every bookmark; `lastIndex` persists → results alternate match/no-match non-deterministically. | `search.js` L48-54, L158, L200 |
| B21 | **`getDomainHierarchy` breaks on multi-part TLDs.** `bbc.co.uk` → `domainKey: "co.uk"`, `subdomain: "bbc"`. Every `.co.uk` / `.com.au` / `.co.jp` site merges into one bogus node. | `insights.js` L30-35 |
| B22 | **Dead-link detection is mostly non-functional.** The HEAD fallback issues a `mode: 'no-cors'` GET whose response is always opaque → returns `null`, yet `lastChecked` is still stamped, excluding the URL from re-checks for 30 days. | `enrichment.js` L217-231, L145 |
| B23 | **Missing `key` on every mutated `{#each}` in the Health view** (deadLinks, duplicates, similar pairs, 5× useless categories, malformed URLs). All are filtered/spliced in place, so Svelte reuses DOM nodes by index and stale rows render against the wrong record. | `Dashboard.svelte` L2910, L3075, L3154, L3305-3461, L3516 |
| B24 | **8 of 10 wired-up insight events never fire**, and 2 dispatched events have no handler. The platform donut chart and the Creator Leaderboard are styled as interactive but nothing is listening. | `Dashboard.svelte` L2277-2287 vs `VisualInsights.svelte` L159, L203, L429, L470 |
| B25 | **Zero `onDestroy` in `Dashboard.svelte`** — `hashchange` listener (L201, anonymous, unremovable), `chrome.runtime.onMessage` (L231), 11 Chart.js instances (L95-105), an uncaptured `setTimeout` (L457). `VisualInsights.svelte` L50-55 does it correctly and is the pattern to copy. `SidePanel.svelte` L58-60 has the same gap. | |
| B26 | **`db-explorer` table name is never validated** before `db[tableName]` bracket access (5 sites). `'constructor'` or `'_dbSchema'` resolves to a Dexie internal. One-line allowlist fixes it. | `db-explorer.js` L83, L104, L163, L175, L215 |

---

## 3. Security

| ID | Severity | Issue |
|---|---|---|
| S1 | 🔴 | **Credentialed cross-origin fetches.** `<all_urls>` host permission + no `credentials: 'omit'` on the enrichment fetches (`enrichment.js` L201, L243). Extension fetches to permitted hosts carry the user's cookies, so **private authenticated pages** (webmail, admin panels, internal wikis) are fetched and their description/snippet/rawMetadata persisted to IndexedDB and rendered in the dashboard. |
| S2 | 🔴 | **No private/loopback/link-local blocklist.** Only the scheme is checked. `http://127.0.0.1:8080`, `http://192.168.1.1/`, `http://169.254.169.254/latest/meta-data/` are fetched and stored, and `redirect: 'follow'` lets a public URL redirect into the private range. `db.js` `checkDeadLinks` L1563 applies **no scheme filter at all** on the `bookmarkIds` branch — `file://`, `chrome://`, `data:` all reach `fetch`. |
| S3 | 🟠 | **No size cap or `Content-Type` check** on `await response.text()`. A 500 MB video is decoded as UTF-8 then fed to backtracking-prone regexes like `/<script\b[^>]*>[\s\S]*?<\/script>/gim` — cheap CPU/memory DoS. Cap via `response.body.getReader()` at ~512 KB and gate on `text/html`. |
| S4 | 🟠 | **Fetch timeout doesn't cover the body.** `clearTimeout` fires right after headers arrive (L248), before `await response.text()` (L254). A server that trickles the body hangs the worker indefinitely. Same at `enrichment.js` L207 and `db.js` L1592. |
| S5 | 🟠 | **Meta tags parsed from raw HTML, not the cleaned copy.** `metaTagRegex` runs against `html`, not the `cleanHtml` built one line earlier — so an `og:description` string inside a `<script>` body or an HTML comment is harvested as real metadata. A site can inject arbitrary values into stored records. |
| S6 | 🟠 | **Unvalidated URLs stored as image sources.** `new URL('javascript:alert(1)', base)` returns `javascript:alert(1)` — the base is ignored for absolute-scheme inputs. Applies to `faviconUrl` (L316-323) and `og:image` → `extra.thumbnail` (L594-597). Add an `http:`/`https:`/`data:image` allowlist. |
| S7 | 🟠 | **Favicon lookups leak every bookmarked domain to Google.** `utils.js` L107 hits `google.com/s2/favicons` per rendered bookmark. This directly contradicts README L206-209 ("100% local", "No external APIs"). `getGeneratedFavicon()` already provides a local alternative — make the remote service opt-in, or use MV3's `favicon` permission + `chrome://favicon2/`. |
| S8 | 🟡 | **`dashboard.html` is web-accessible to `<all_urls>`.** Any web page can frame or probe it — a reliable extension-fingerprinting vector, on a page that renders the user's full bookmark corpus. Remove the `web_accessible_resources` block unless it's intentionally embedded. |
| S9 | 🟡 | **`javascript:` / `data:` URLs rendered as clickable `href`** at 13 sites. Not hypothetical — the data model explicitly expects bookmarklets (`utils.js` L78, L130; `db.js` L1195). Currently mitigated by MV3's CSP rather than by the code. Add a `safeHref()` helper. |
| S10 | 🟡 | **ReDoS from user-supplied search regex.** Arbitrary patterns compiled and run against every bookmark's concatenated text on the UI thread; `/(a+)+$/` freezes the panel. Cap pattern length and/or move search to a worker. |
| S11 | 🟡 | **MV3 CSP breaks the error boundary.** `dashboard.js` L9-15 and `sidepanel.js` L10-16 inject `<button onclick="location.reload()">`. Inline handlers are blocked by `script-src 'self'`, so the crash-screen Reload button does nothing. |
| S12 | 🟡 | **Unnecessary permissions.** `alarms` is declared but the only alarm code *clears* alarms and the `onAlarm` handler is a dead log line. `tabs` is only needed when `trackBrowsingBehavior` is on (default `false`) — make it optional. |

**Good news:** `{@html highlightText(...)}` at 4 sites is **safe** — `highlightText` escapes both the between-match text and the matched text and injects only a literal `<mark>`. But the safety is invariant-based, not type-enforced; one edit reopens XSS at four call sites. Prefer a `<Highlight>` component emitting `{#each}` segments so `{@html}` disappears from the codebase entirely.

---

## 4. Dead & stale code (~1,500 lines)

### 4.1 Entirely unreachable

| Item | Lines | Notes |
|---|---|---|
| `Dashboard.svelte` `loadInsights()` | ~380 | **There is no `<canvas>` in the file.** 13 expensive IndexedDB aggregations + 11 `getElementById` that all return `null`. Deleting it also retires the `Chart`/`registerables` import, all 11 chart vars, and 5 write-only state vars — **dropping Chart.js from the dashboard bundle**. |
| `CreatorExplorer.svelte` | 389 | Never imported anywhere. Matches exactly the orphaned `filterByCreator` event — a half-landed feature. |
| `similarity.js` unused exports | ~400 | 6 of 9 exports unused. Their removal makes `calculateTFIDF`, `cosineSimilarity`, `extractWords`, `findSimilarCandidates` and the entire `storeSimilarities` round-trip unreachable. **The `similarities` IndexedDB table is written by nothing** — backup confirms `"similaritiesCount": 0`. |
| `insights.js` unused exports | ~500 | 12 of 29 have zero importers, including `getCollectionHealthMetrics` and `getVisualGallery` — both **advertised in README L42-43 as shipping features**. |
| `stores.js` unused exports | ~230 of 517 | Only `activeFilters`, `searchQuery`, `allBookmarks`, `selectedBookmarks` are ever imported. `startAutoRefresh()` (L87-104) is a well-built visibility-aware interval with zero callers. |
| Retired similarity scaffolding | — | `similarBookmarks`, `loadingSimilar`, `similarDisplayLimit`, `loadMoreSimilar()`, `deleteSimilarBookmark()` (defined, never called), `findSimilarBookmarks` import. |
| `topics.js` / `metadata-analyzer.js` / `utils.js` | — | 4, 4 and 3 unused exports respectively. |

### 4.2 Stale but present

- **Settings that do nothing:** `enrichmentRateLimit` (self-labelled deprecated), `enrichmentSchedule`, `enrichmentBatchSize`, `autoCategorizationEnabled`, `deadLinkCheckEnabled`, and — most concerning — **`privacyMode`, a documented privacy control with zero readers.**
- **Alarm subsystem is a no-op** yet `setupEnrichmentAlarms` is still called from three places.
- **`chrome.storage.local` dual-write "for backward compatibility"** — its only consumer is the one-shot `migrateFromChromeStorage`, which sets `completed: true` and never reads again.
- **14 `await import('./db.js')` sites** where a static import already exists at the top of the same file. With `inlineDynamicImports: true` they resolve to the same module object — pure noise, and they force every handler into a `.then()` chain.
- **Schema versions 1-4** — v2's store definition is *byte-identical* to v1 and its upgrade body only logs; v3's is also a bare log. ~50 lines removable.
- **Three implementations of the same filter predicates** (domain/folder/dead/stale/enriched/date): `search.js` L496, `search.js` L679-760, `db.js` L887-960.
- **Two implementations of similar-bookmark search:** `db.js` `findSimilarBookmarks` duplicates the `similarity.js` fuzzy version the Dashboard actually uses.
- **Dead bindings inside `detectTopics`:** `url` (L428), `metaSection`/`metaTags` (extracted at L448-449, never scored), `META_SECTION_SCORE` (declared, never referenced). `article:section` and `article:tag` — the richest topical signals available — are parsed and thrown away.
- **`getMetadataCoverage`'s `fields` counter is provably always equal to `coverage`** (incremented in lockstep) and unused by callers.
- **`getBookmarksCached()` is a no-op** in all three copies (`insights.js`, `similarity.js`, `search.js`) — the cache call is commented out. Every one of ~25 insight functions therefore does a full table scan; loading the Dashboard = 6 full reads of the bookmarks table.

### 4.3 Duplicated constants

| Constant | Locations |
|---|---|
| `24 * 60 * 60 * 1000` | **54 occurrences** across 8 files |
| `getBookmarksCached()` wrapper | 3 identical no-op copies |
| `tempPatterns` / `genericTitles` | `similarity.js` L960-967 vs L1013-1014 — **divergent members and divergent matching logic** |
| Cache TTLs | `db.js` (numeric) vs `db-explorer.js` (display strings) — already drifted |
| Tech keyword list | `metadata-analyzer.js` L346-353 vs `topics.js` taxonomy |
| Chart colour palette | `insights.js` L96-100 vs `utils.js` L65 |
| `formatDate` / `formatTimeAgo` | re-implemented in `Sidebar.svelte`, `VisualInsights.svelte`, `CreatorExplorer.svelte` instead of imported |

> `STOP_WORDS` is **not** duplicated — defined once in `utils.js` and correctly imported. That one is clean.

---

## 5. Performance

| ID | Issue |
|---|---|
| P1 | **`searchBookmarks` loads the entire corpus on every keystroke.** `getBookmarksCached()` → `getAllBookmarksWithReadingList()` → `db.bookmarks.toArray()` **plus** a `chrome.readingList.query()` round-trip. FlexSearch is then used only to produce an id `Set` that's intersected with the already-materialised array — **the index saves no I/O whatsoever.** Records include `rawMetadata` blobs, so each scan is multi-MB. `store: true` is already enabled; use the index payload instead. |
| P2 | **~30 full-table scans in `db.js` alone.** Indexed fields (`domain`, `category`, `dateAdded`, `platform`, `isAlive`) exist but are largely unused — e.g. `getDeadLinks` scans everything instead of `where('isAlive').equals(0)`. |
| P3 | **Whole-index serialization per single mutation.** Every `onCreated` exports the entire FlexSearch index and writes it as one IndexedDB record. A bulk import via Chrome Sync triggers N full serializations of an O(N) structure — **quadratic**. |
| P4 | **Index rebuilt + full topic migration on every extension update**, unconditionally, with no version guard. `rebuildSearchIndex` awaits `addToIndex` per bookmark in a serial loop. |
| P5 | **Uncapped O(n²) similarity on the main thread.** `findSimilarBookmarksEnhanced` does a full pairwise loop with **no yielding** — at 3,724 bookmarks that's ~6.9M `cosineSimilarity` calls. The early exit only fires once enough matches accumulate, and it makes results **order-dependent**: you get the top 100 of the *first 300 pairs discovered*, not the 100 globally most similar. `findSimilarBookmarksEnhancedFuzzy` Phase 1 has **no same-domain group size cap** — a domain with 500 bookmarks (plausible for github.com) is 124,750 comparisons. |
| P6 | **`cosineSimilarity` recomputes both full vector magnitudes on every call.** Magnitude is a property of the vector, not the pair — precompute once in `calculateTFIDF` to remove an O(V) factor from ~6.9M calls. |
| P7 | **`levenshteinDistance` allocates a full `(m+1)×(n+1)` matrix** — ~3,700 cells per comparison for 60-char titles. Only two rows are needed. This is the single largest GC pressure source in the module. Add a length-ratio early exit before calling it (typically eliminates 70-90% of calls). |
| P8 | **~1.5M regex compilations during topic migration.** `detectTopics` constructs a new `RegExp` *inside* the keyword loop for all 410 static taxonomy keywords, per bookmark. Hoist to a module-level `Map<string, RegExp>` — a ~10× win. Subtopic keywords are also double-counted (scored against `title` and against `allText`, which already contains the title). |
| P9 | **TF-IDF corpus differs per call**, so persisted similarity scores aren't comparable. `computeSimilarityForBookmark` uses N ≤ ~100; with a 2-document corpus `log(N/df)` is exactly 0 for every shared word → cosine similarity 0. Use smoothed IDF. |
| P10 | **`db-explorer` full-table loads + `JSON.stringify` per record per keystroke.** The slow path fires on any search/filter/sort: `toArray()` on a ~29 MB table, then `JSON.stringify(record).toLowerCase().includes(query)` for all 3,724 records — ~30 MB of string allocation per query, no visible debounce. `exportTableAsJSON` pretty-prints 29 MB and will hit string-length limits. |
| P11 | **Serialized per-item writes during sync** — `addToEnrichmentQueue` awaited per bookmark, each doing an indexed lookup + insert (two transactions each). Thousands of sequential round-trips on a fresh install. Use one `bulkAdd` in a single `rw` transaction. |
| P12 | **No list virtualization** — "Load More" appends 50 rows at a time to the DOM unboundedly. |
| P13 | **`navigator.storage.estimate()` reports the entire origin's usage**, presented to the user as "Database size". |

---

## 6. Architecture & simplification

### 6.1 Split `Dashboard.svelte` (3,877 lines)

**Step 0 — delete before restructuring.** Removing `loadInsights()`, the retired similarity scaffolding, the 8 dead event handlers, and the unused imports removes **~700-800 lines with zero behaviour change** and drops Chart.js from the dashboard bundle. Do this first; the file lands around 3,100.

**Step 1 — collapse copy-paste.** The 5 useless-bookmark category blocks are ~40 lines each differing only in title/icon/key → one `<UselessCategory>` collapses ~200 lines to ~40. The 9 filter-chip blocks collapse the same way.

**Step 2 — extract concerns.**

```
Dashboard.svelte          (~150 lines: layout + view switch only)
├── DashboardHeader.svelte
├── views/
│   ├── BookmarksView.svelte    (toolbar, chips, list, load-more)
│   ├── InsightsView.svelte     (existing VisualInsights)
│   └── HealthView.svelte       (composes the 8 panels below)
├── health/   Enrichment | DeepAnalysis | DeadLinks | Duplicates
│            | UselessBookmarks | MalformedUrls | Backup | HealthStats
├── shared/   UndoToast | CompareModal | ConfirmDialog | ActiveFilterChips
└── lib/      viewRouter.js | bookmarkListController.js | undoStore.js
```

### 6.2 Flatten the background message router

`background.js` L393-592 is six near-identical `import(...).then(async m => {…}).catch(…)` blocks. With static imports restored:

```js
const handlers = { syncBookmarks, getEnrichmentStatus, runEnrichment, /* … */ };

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  const h = handlers[req.action];
  if (!h) return false;
  h(req, sender)
    .then(r => sendResponse({ success: true, ...r }))
    .catch(e => sendResponse({ success: false, error: e.message }));
  return true;
});
```

### 6.3 Other consolidations

1. **One `CACHE_KEYS` constant** in `db.js`; derive `CACHE_DURATIONS`, `invalidateMetricCaches` and `db-explorer`'s `KNOWN_METRICS` from it (fixes C6 structurally).
2. **One time-constants module** — `DAY_MS`, `WEEK_MS`, `MONTH_MS`, `YEAR_MS` replaces 54 magic literals.
3. **One `matchesFilters(bookmark, filters)`** exported from `search.js`, used by both `getBookmarksPaginated` and `searchBookmarks`.
4. **One `topN(counts, n)` helper** — the `Object.entries().map().sort().slice()` idiom appears **17+ times in `insights.js` alone**.
5. **One `bucketize(items, thresholds)`** — the age/time-bucketing ladder is written four times.
6. **One `withFallback(fn, fallback)` wrapper** replaces 29 hand-maintained `try/catch → empty shape` blocks in `insights.js`, several of which have already drifted from their success shape.
7. **Use the already-computed `platform`/`contentType` fields** instead of `getContentAnalysis`'s substring guessing (`url.includes('shop')` matches "work**shop**"; `url.includes('app.')` matches `whatsapp.com`). `url-parsers.js` already does this correctly and persists the result.
8. **Reconnect the bookmark cache** — `stores.allBookmarks.getCached()` already exists and works; the three wrappers just need to call it.
9. **Extract the duplicated 14-line FlexSearch `Document({...})` config** (appears twice in `search.js`).
10. **Move topic detection and similarity to a Web Worker** — both are pure CPU over plain objects with no DOM dependency. The `yieldToMain` hack is a workaround for running them on the UI thread.

---

## 7. Repo hygiene & tooling

### 7.1 Build output is committed, and `.gitignore` is inconsistent

`.gitignore` lists `background.js`, but `git ls-files` shows it **is tracked** (231 KB minified). `.gitignore` has no effect on already-tracked files, so the entry is purely misleading. Meanwhile `public/dashboard.js`, `public/sidepanel.js`, `public/*.css`, `dashboard.html`, `sidepanel.html` are tracked with **no ignore entry at all** — the same `npm run build` produces all of them, but the policy differs per artifact.

**Three copies of the build exist on disk**, verified byte-identical for `background.js`, `manifest.json`, `dashboard.html`, `sidepanel.html`:

- root (3 Mar)
- `extension/` (from `npm run package`)
- `dist/` (21 Dec — **stale**, and still contains `popup.html`, a file that no longer exists anywhere in `src/` or the manifest)

**Recommendation:** build into a single `dist/`, `git rm --cached` the tracked artifacts, drop one of the two packaging scripts.

> ⚠️ This workspace is a **subdirectory of a larger multi-project git repo** (siblings `tab-manager`, `tubefilter`). Root-relative `.gitignore` entries like `background.js` therefore also match `tubefilter/background.js` — the rules aren't scoped as they appear.

### 7.2 Four different answers to "what version is this?"

| Source | Version |
|---|---|
| `manifest.json` | **2.1.0** |
| `package.json` | **1.1.0** |
| `TECHNICAL_DOCUMENTATION.md` | **3.3** |
| README | refers to *"new in v3.0"* |

`package.json` also has no `"private": true`, no `"license"` (README claims MIT but **no `LICENSE` file exists**), and no `"engines"`.

### 7.3 Docs describe things that don't exist

**README**
- L206: *"Centralized Bookmark Cache: 30-second TTL prevents redundant database reads"* — **the cache calls are commented out.**
- L207-209: *"100% local", "No external APIs — Direct page fetches only"* — contradicted by the Google favicon service (S7).
- L248: lists a `favicon` permission that isn't in the manifest; **omits** the declared `alarms`, `sidePanel`, `readingList`.
- L42-43: advertises collection-health and visual-gallery as shipping features — both have zero importers.
- L216-230: File Structure omits `topics.js`, `metadata-analyzer.js`, `db-explorer.js`, `darkModeStore.js`, and 6 of 10 components.

**TECHNICAL_DOCUMENTATION.md**
- L206, L669-672: gives **precise call counts** ("9 calls", "21 calls") for the cache integration that is commented out.
- L927: *"Bundle Sizes: popup.js ~150KB"* — there is no popup; `background.js` is actually 231 KB.
- L682-688: lists `duplicates` TTL as 1 hour; code says 24 hours. Lists `activityTimeline`, a key never written.
- L16-59: reads as a changelog of past bugfixes at the top of reference documentation — belongs in `CHANGELOG.md`.

**TROUBLESHOOTING.md — largely obsolete.** There is no popup (`manifest.json` declares `action.default_title` + `side_panel` only), yet the guide says *"Open the extension popup"*, *"Right-click the popup → Inspect"*, has a section titled **"Popup Too Small/Large"** (*"designed to be 384x384px"*), and references an Options page that doesn't exist. **The side panel — the actual primary UI — is never mentioned.**

### 7.4 No tests, no linting, no formatting, no CI

Absent: `LICENSE`, `test/`, `.eslintrc*`, `.prettierrc*`, `.github/`, `.husky/`, `vitest.config.*`. `package.json` has no `test`, `lint`, or `format` script.

Nearly every §4 finding is something tooling catches for free:

- `getCachedMetric` imported but unused, and the dead `url`/`metaSection`/`metaTags`/`META_SECTION_SCORE`/`fields` bindings → **`no-unused-vars`**
- 12 unused `insights.js` exports + 6 unused `similarity.js` exports → **Knip / ts-prune**

And the §2 algorithm bugs are exactly what unit tests are for. These are pure, dependency-free functions — `formatTimeAgo`, `levenshteinDistance`, `parseISO8601Duration`, `parseBookmarkUrl`, `detectTopics` — testable with **zero mocking**. One assertion catches B18. One fixture from the committed backup catches C2, the bug that has silently nulled 100% of published dates across 3,291 records.

```jsonc
"scripts": {
  "lint":   "eslint src --ext .js,.svelte",
  "format": "prettier --write \"src/**/*.{js,svelte,css}\"",
  "test":   "vitest run",
  "knip":   "knip"
}
```
plus a GitHub Actions workflow running lint + test + build on PR.

---

## 8. UX improvements

| # | Improvement | Why |
|---|---|---|
| 1 | **Bookmark titles → real `<a href>`** (with a `safeHref()` scheme allowlist) | Currently `<h3>` + `chrome.tabs.create`. No middle-click, no "open in new window", no context menu, no "Copy link address", no status-bar URL preview. The highest-impact daily-friction fix in the codebase, and an a11y fix simultaneously. |
| 2 | **Undo for bulk deletes** | Undo currently covers only the *safest* action (single delete). Every bulk delete — dead links, duplicates, useless categories, malformed URLs, selection — is irreversible. Exactly inverted. |
| 3 | **Replace ~15 `confirm()`/`alert()` calls** | Blocking, unstyled, ignore dark mode. |
| 4 | **Progress + cancel on bulk deletes** | `await` inside `for` loops; deleting 500 duplicates freezes the panel with no feedback. |
| 5 | **Don't reset pagination on background sync** | The `bookmarksChanged` handler calls `loadBookmarks(0, false)`, discarding every "Load More" page and the scroll position whenever the background script syncs. |
| 6 | **Persist `viewMode`, `currentSortBy`, active filters** | Only `currentView` survives reload (via URL hash), despite `chrome.storage.local` already being used for dark mode. |
| 7 | **Keyboard shortcuts** | No `/` to focus search, no `j`/`k` navigation, no `Esc` to close the modal (backdrop click only). |
| 8 | **Make search discoverable** | `+term`, `-term`, `"phrase"`, `/regex/`, `category:`, `domain:`, `folder:`, `stale:yes` are all supported but undocumented in-app. Add a syntax hint popover, search history, and value autocomplete. |
| 9 | **Two-way filter flow** | Health and Insights views can't push a filter into the Bookmarks view — that was `filterByDomain`'s job (dead, B24). |
| 10 | **Empty states in Health panels** | A clean library shows blank cards instead of "No duplicates found 🎉". |
| 11 | **Proper modal semantics** | No `role="dialog"`, `aria-modal`, focus trap, Escape handler, or focus restore. Two `svelte-ignore` comments suppress the warnings rather than fix them. |
| 12 | **List virtualization** | Unbounded DOM growth via "Load More". |
| 13 | **`aria-live` on the undo toast and enrichment progress** | Currently silent to screen readers. |
| 14 | **Favicon `onerror` fallback in `BookmarkCard`** | `BookmarkListItem` has `handleImageError`; `BookmarkCard` doesn't, so its favicons show as broken images. |
| 15 | **i18n** | No `default_locale`, no `_locales/`; all strings hardcoded. |

---

## 9. Feasible new features

Ordered by value ÷ effort. All are achievable with data the extension **already collects**.

### Tier 1 — high value, low effort (data already present)

1. **Reading-time-aware "Read next" queue.** `readingTime` already exists in the schema — it just never populates (C2). Once fixed, offer "I have 10 minutes" / "I have an hour" filters over unread bookmarks. Near-zero new code.
2. **Published-date freshness surfacing.** Same unlock. Flag bookmarks whose *content* is 5+ years old (distinct from when you saved it) — far more actionable than "dead link".
3. **Bulk-action undo with a real undo stack.** Snapshot the affected records into a `trash` table with a 30-day TTL rather than relying on `chrome.bookmarks.create()` replay. Also fixes C5's duplicate-creation bug.
4. **Saved searches / smart folders.** The query language already supports everything needed; persist named queries and show live counts in the sidebar.
5. **Duplicate merge instead of delete.** When two bookmarks are duplicates, keep the richer record (more enrichment, higher access count) and merge tags/folders instead of forcing a pick.
6. **Export to Markdown / CSV / Netscape HTML.** The backup path already materialises everything; three small serializers give real portability and a migration story.
7. **Domain-level bulk operations.** "This domain has 340 bookmarks, 190 dead" → recheck all / delete all dead / move all to a folder, in one action.

### Tier 2 — high value, medium effort

8. **Auto-foldering suggestions.** `topics.js` already produces a taxonomy assignment per bookmark. Surface "42 bookmarks look like *DevOps* but live in 9 different folders — create `/DevOps`?" with a preview and one-click apply. This is the single biggest latent feature in the codebase.
9. **Content-drift detection.** Store a hash of the extracted title/description at enrichment time; on re-enrichment, flag bookmarks whose page content changed substantially — catches domain squatting and silent 200-status link rot that HEAD checks miss entirely.
10. **Wayback Machine fallback for dead links.** For any `isAlive === false`, offer a one-click `web.archive.org` link. Fully compatible with the local-first stance (single opt-in request per user click).
11. **Time-boxed rediscovery digest.** "5 bookmarks you saved 2 years ago and never opened" as a weekly side-panel card. `getBookmarkAndForget` and `getRediscovery*` already exist — they're just unwired. Fix the biased shuffle (B17) first.
12. **Reading-list ↔ bookmark unification.** The reading list is already queried and merged in `getAllBookmarksWithReadingList` but is second-class in the UI. Promote/demote between the two, and show reading-list items in the main list with a badge.
13. **Import from Pocket / Raindrop / Netscape HTML.** Complements #6 and is a genuine adoption driver.
14. **Local semantic search.** Ship a small quantized embedding model via `transformers.js` and store vectors in IndexedDB. Replaces the entire hand-rolled TF-IDF + Levenshtein stack (§5 P5-P9) with something both faster and better, and keeps the 100%-local promise. Meaningful effort, but it retires ~700 lines of fragile similarity code.

### Tier 3 — worthwhile, larger scope

15. **Optional BYO-LLM enrichment.** Strictly opt-in, user-supplied API key, per-bookmark consent. Would produce genuine summaries and categories instead of substring heuristics. Must be off by default and clearly disclosed to preserve the privacy positioning.
16. **Sync via `chrome.storage.sync` for settings + saved searches only** (not bookmark data — quota won't allow it).
17. **Link-health monitoring schedule.** The `alarms` permission is already declared and currently unused; a real weekly background dead-link sweep would finally justify it.
18. **Browsing-history correlation.** With `trackBrowsingBehavior` on, show "you visit this site weekly but never bookmarked it" suggestions. Requires careful consent UX.
19. **Firefox / Edge port.** The codebase is nearly WebExtension-standard already; the main blockers are `sidePanel` and `readingList`.

---

## 10. Suggested order of work

> **Status:** phases 0-5 are complete as of 2026-08-15. Phase 6 remains.

### Phase 0 — Stop the bleeding ✅
- [x] C1 — remove the 29 MB backup from git, purge history, `.gitignore` it
- [x] 7.1 — untrack build output, consolidate to a single `dist/`
- [x] 7.2 — single version source across `manifest.json` / `package.json`
- [x] Add `"private": true`, a `LICENSE` file

### Phase 1 — Fix what's silently broken ✅
- [x] C2 — normalize the metadata shape + backfill from existing `rawMetadata` (no refetch needed)
- [x] C3 — `queueId: item.queueId`
- [x] C4 — `searchQuery` ReferenceError
- [x] C5 — route all deletes through `deleteBookmarks()`
- [x] C6 — single `CACHE_KEYS` source of truth; call `invalidateMetricCaches` from `enrichBookmark`
- [x] B11, B12, B13, B15, B18 — the trivial correctness fixes

### Phase 2 — Security ✅
- [x] S1 — `credentials: 'omit'` on all enrichment fetches
- [x] S2 — private/loopback/link-local blocklist + scheme filter in `checkDeadLinks`
- [x] S3/S4 — `Content-Type` gate, 512 KB body cap, timeout that covers the body
- [x] S5 — parse meta tags from `cleanHtml`, not raw `html`
- [x] S6 — scheme allowlist for `faviconUrl` / `og:image`
- [x] S7 — favicons are now generated locally; the Google service is gone
- [x] S8 — drop `web_accessible_resources`
- [x] S11 — CSP-safe crash fallback; S12 — `alarms` dropped, `tabs` made optional
- [x] Bonus: `{@html}` eliminated via `Highlight.svelte`

### Phase 3 — Delete ✅ (~2,960 lines)
- [x] `loadInsights()` + the dead chart layer
- [x] Unused exports in `similarity.js`, `insights.js`, `stores.js`, `topics.js`, `search.js`, `db-explorer.js`, `url-parsers.js`, `utils.js` — removing similarity's exports made the whole TF-IDF/cosine stack unreachable
- [x] `CreatorExplorer.svelte` — deleted
- [x] Schema v1-v4, the alarm no-op, the `chrome.storage.local` dual-write, the dynamic imports
- [x] Also: B19 (substring mislabelling), and the Cleanup Candidates panel, which had no trigger

### Phase 4 — Structure & tooling ✅
- [x] ESLint + Prettier + Vitest + Knip + a CI workflow (at the monorepo root, path-filtered)
- [x] 48 unit tests for the pure functions
- [x] Flatten the background message router
- [x] Split `Dashboard.svelte` — `DashboardHeader`, `ActiveFilterChips`, `UselessCategory`; B25 `onDestroy` cleanup added
- [x] Rewrite `README` / `TECHNICAL_DOCUMENTATION` / `TROUBLESHOOTING` against reality; changelog moved to `CHANGELOG.md`

### Phase 5 — Performance ✅
- [x] B7, B8 — MV3 lifecycle: synchronous listener registration, `onStartup`
- [x] B9 — worker state now survives suspension: the URL→bookmark map mirrors into `chrome.storage.session` with in-flight build dedupe; the access debounce moved onto the record's own `lastAccessed` inside a Dexie `modify()` transaction (also fixes B4's lost increments and the unbounded `Map`); `removeFromIndex` lazily loads the index instead of no-oping on a cold worker (fixes B1)
- [x] P1 — one 30 s corpus cache in `db.js` behind `getAllBookmarks()`; all ~33 call sites and the `stores.js` wrapper now share a single read. Invalidated by every write path and by the dashboard on `bookmarksChanged` / enrichment progress
- [x] P3/P4 — index serialization coalesced into one debounced save; the update-time rebuild + topic migration now gated on a `dataVersion` setting
- [x] P7/P8 — rolling-row Levenshtein with an exact length-ratio upper-bound early exit; topic regexes hoisted into a module-level `Map` (and the subtopic double-count against `allText` removed)
- [x] Similarity scoring moved to a Web Worker (`analysis-worker.js` + `analysis-core.js` + `analysis-client.js`), with an inline fallback. Bookmarks are projected to the seven fields the scorer reads and pairs come back as ids, so the clone stays small
      - Topic detection deliberately stayed on the main path: its only callers are the enrichment pipeline and the update migration, both of which run in the MV3 service worker, which cannot spawn a worker. P8 covers it instead.
- [x] Also folded in: P5 (same-domain groups capped by a title-sorted comparison window; the biased `Math.random() - 0.5` shuffles replaced with Fisher-Yates in `utils.shuffle`), P11 (`bulkAddToEnrichmentQueue` replaces the per-bookmark queue insert during sync), P10 (Data Explorer search debounced, and the per-record `JSON.stringify` replaced with a scalar-field scan), B26 (table-name allowlist in `db-explorer`)

### Phase 6 — Features
Not started.
- [ ] Tier 1 (items 1-7) — mostly unlocked for free by the C2 fix
- [ ] Tier 2 (items 8-14) — auto-foldering first; it's the biggest latent win

---

## Appendix — Verified claims

Confirmed directly against the source and the committed backup rather than inferred:

| Claim | Verification |
|---|---|
| `schemaOrg` never produced | `grep -rn "schemaOrg" src/` → only *consumers*; `enrichment.js` writes `jsonLd` |
| `publishedDate` 100% null | 3,291 occurrences of `"publishedDate": null` across 3,291 enriched records |
| `searchQuery` undeclared | `Dashboard.svelte` L62 imports it *as* `searchQueryStore`; L941/L947 assign a bare `searchQuery` |
| `queueId` mismatch | `db.js` L14 `'++queueId, …'` vs `enrichment.js` L691 `queueId: item.id` |
| Backup is git-tracked | `git ls-files --error-unmatch` succeeds; 30,425,880 bytes |
| No `<canvas>` in Dashboard | `grep '<canvas'` → 0 matches across 3,877 lines |
| `similarities` table empty | Backup metadata: `"similaritiesCount": 0` |
| Cache keys don't overlap | Written keys vs invalidated keys compared directly — zero intersection |
