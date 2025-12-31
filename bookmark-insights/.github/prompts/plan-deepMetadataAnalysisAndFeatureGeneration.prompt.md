## Plan: Deep Metadata Analysis & Feature Generation

We will unlock the potential of your bookmark data by extracting deep insights (reading time, freshness, smart tags) and providing an on-demand mechanism to process existing bookmarks.

### Steps
1.  **Upgrade Database Schema** ([src/db.js](src/db.js))
    -   Add schema version 5 with `readingTime`, `publishedDate`, `contentQualityScore`, and `*tags`.
2.  **Create Metadata Analyzer** (New: `src/metadata-analyzer.js`)
    -   Implement logic to extract `readingTime` (word count/video duration), `publishedDate` (smart fallback), and `smartTags` (aggregated keywords) from `rawMetadata`.
    -   Implement `calculateContentQuality(metadata)` to score content completeness.
3.  **Enhance Content Type Detection** ([src/url-parsers.js](src/url-parsers.js))
    -   Refine `parseBookmarkUrl` to use Schema.org types (e.g., `TechArticle` vs `BlogPosting`) for better accuracy.
4.  **Implement Backfill Logic** ([src/enrichment.js](src/enrichment.js))
    -   Add `reanalyzeBookmark(bookmark)` function that re-processes `rawMetadata` without network requests.
    -   Add `batchReanalyze(bookmarks)` for bulk processing.
5.  **Add "Deep Analysis" UI** ([src/Dashboard.svelte](src/Dashboard.svelte))
    -   Add a new panel "Deep Content Analysis" below "Platform Detection".
    -   Include a "Run Analysis" button to trigger the backfill.
    -   Show progress bar and results summary (e.g., "Updated 500 bookmarks with reading times").

### Further Considerations
1.  **Performance**: The backfill should run in chunks (e.g., 50 items) to avoid freezing the UI, as it involves JSON parsing and text analysis.
2.  **Future Navigation**: These new fields will power the future "Smart Filter" sidebar (omitted for now).
