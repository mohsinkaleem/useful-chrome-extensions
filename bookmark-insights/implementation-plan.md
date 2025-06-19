### **Draft Plan: Implementing "Bookmark Insight"**

This plan prioritizes a rapid development cycle by starting with a Minimum Viable Product (MVP) and then layering on more advanced features. The technology choices are geared towards performance and ease of development for a browser extension.

#### **High-Level Strategy: Local-First & Lean**

The core principle is to do all the work on the user's machine. We will sync all bookmarks into a high-performance local database once, and then keep it updated with small, incremental changes. The UI will then query this local database, resulting in instantaneous search and filtering.

---

### **Recommended Technology Stack**

This stack is chosen for its performance, small footprint, and excellent developer experience.

* **UI Framework: Svelte**
  * **Why:** Svelte is a compiler, not a runtime library. It produces highly optimized, tiny vanilla JavaScript bundles. This is perfect for a browser extension where performance and a small package size are critical. Its reactivity model is simple and intuitive.

* **Local Database: Dexie.js**
  * **Why:** Dexie.js is a powerful, minimalist wrapper for IndexedDB. It makes working with IndexedDB incredibly simple, providing a clean promise-based API and advanced query capabilities (`where`, `between`, `startsWith`, etc.) that are perfect for our filtering needs.

* **Client-Side Search: FlexSearch.js**
  * **Why:** It is one of the fastest and most memory-efficient full-text search libraries available. It's perfect for indexing thousands of bookmarks on `title` and `url` and delivering sub-millisecond search results.

* **Charting: Chart.js**
  * **Why:** It's simple, lightweight, and has great documentation. It's more than powerful enough for the bar and line charts on the Insights Dashboard.

* **Styling: Tailwind CSS**
  * **Why:** A utility-first CSS framework that allows for rapid UI development without writing custom CSS files. It integrates beautifully with Svelte.

---

### **Implementation Plan: Phased Approach**

#### **Phase 1: The MVP - The Core Experience**

**Goal:** A user can see all their bookmarks in a rich view and use the "Smarter Finder". This delivers the biggest value upfront.

**Steps:**

1. **Project Setup:**
    * Create the `manifest.json` file.
        * **`name`**: "Bookmark Insight"
        * **`permissions`**: `["bookmarks", "storage", "favicon"]`
        * **`action`**: Define a `default_popup` or set it to open a full `dashboard.html` page.
        * **`background`**: Point to the `background.js` service worker.
    * Set up a Svelte project with Tailwind CSS.

2. **The Data Pipeline (Background Script):**
    * In `background.js`, create a function `syncBookmarks()`.
    * This function will:
        * Call `chrome.bookmarks.getTree()`.
        * Write a recursive helper function to flatten the tree into a simple array of bookmark objects.
        * For each bookmark, **enhance** it with `domain` (`new URL(bookmark.url).hostname`) and `folderPath`. Store the folder path by tracing `parentId`s.
        * Use **Dexie.js** to set up a database (`bookmark_insight_db`) with a table (`bookmarks`). Define the schema with indexes on `domain`, `dateAdded`, and `folderPath`.
        * Clear the table and bulk-add the new, enhanced list of bookmarks.
    * Add an `onInstalled` listener to run `syncBookmarks()` the first time the extension is installed.

3. **The Search Index:**
    * In `background.js`, after the initial sync, create a **FlexSearch.js** index.
    * For each bookmark from Dexie, add its `title` and `url` to the index, using the bookmark's `id` as the document key.
    * Export the index and save it to `chrome.storage.local`. This prevents having to rebuild the index every time the browser starts.

4. **The UI (Svelte):**
    * Create a `BookmarkCard.svelte` component. It will accept a bookmark object as a prop and display the `title`, `url`, `dateAdded`, and `folderPath`. Use `<img src="chrome://favicon/size/16@2x/${bookmark.url}">` to display the favicon.
    * Create the main `App.svelte` page.
    * On load, it will use Dexie to fetch all bookmarks and display them as a grid of `BookmarkCard` components.
    * Create a `SearchBar.svelte` component. As the user types, it will query the FlexSearch index (loaded from `chrome.storage`) and emit a list of resulting bookmark IDs.
    * The `App.svelte` page will listen for these results and use Dexie's `where('id').anyOf(ids).toArray()` to fetch the full bookmark objects and update the view.

#### **Phase 2: Filters & Insights**

**Goal:** Enable users to slice and dice their data and see high-level insights.

**Steps:**

1. **Implement Dynamic Filters:**
    * Create a `Sidebar.svelte` component.
    * **Domain Filter:** Use a Dexie query to get all unique domains: `db.bookmarks.orderBy('domain').uniqueKeys()`. Display these in the sidebar. When a user clicks a domain, re-run the main query with a `.where('domain').equals(...)` clause.
    * **Date Added Filter:** Add buttons for "This Week," "This Month," etc. These will trigger Dexie queries with `.where('dateAdded').between(startDate, endDate)`.
    * **Folder Filter:** Get all unique `folderPath` values from Dexie and display them as a clickable list or tree.

2. **Build the Insights Dashboard:**
    * Create a new "Dashboard" view/page.
    * **Top Domains Chart:**
        * Run a Dexie query to get all bookmarks.
        * In JavaScript, iterate over them to create a frequency map of domains (`{'github.com': 50, 'medium.com': 35, ...}`).
        * Sort the map, take the top 10, and feed this data to a `Chart.js` bar chart component.
    * **Activity Timeline:** Do the same, but group bookmarks by month/year of `dateAdded` to create data for a `Chart.js` line chart.

#### **Phase 3: Health & Maintenance**

**Goal:** Add tools to help users clean up their collection.

**Steps:**

1. **Implement Duplicate Finder:**
    * Create a "Health" view/page.
    * This is a data processing task. Use Dexie to get all bookmarks.
    * Group them by `url` in a JavaScript Map. Any URL with more than one bookmark in its group is a duplicate.
    * Present these groups to the user in the UI, allowing them to select and delete duplicates (using `chrome.bookmarks.remove()`).

2. **Implement "Orphans" Filter & Malformed URL Detector:**
    * **Orphans:** Add a special filter button that runs a Dexie query for bookmarks where `folderPath` is empty or a root value (e.g., `Bookmarks Bar`).
    * **Malformed URLs:** Run a one-time check that iterates through bookmarks and flags any where the `url` does not start with `http://` or `https://`.

### **Keeping it in Sync**

For a truly robust tool, the `background.js` script must listen to bookmark changes to keep the local database and search index up-to-date without requiring a full re-sync.

* `chrome.bookmarks.onCreated`: Add the new bookmark to Dexie and FlexSearch.
* `chrome.bookmarks.onRemoved`: Remove the bookmark from Dexie and FlexSearch.
* `chrome.bookmarks.onChanged`: Update the bookmark in Dexie and FlexSearch.
* `chrome.bookmarks.onMoved`: Update the `folderPath` for the bookmark in Dexie.

By following this phased plan, you can rapidly build a functional and powerful prototype, test the core value proposition, and then iteratively add the more complex insight and maintenance features.
