<script>
  import { onMount } from 'svelte';
  import BookmarkListItem from './BookmarkListItem.svelte';
  import SearchBar from './SearchBar.svelte';
  import { getAllBookmarks, getBookmarksByDomain, getBookmarksByDateRange, getBookmarksByFolder, getQuickStats } from './db.js';
  import { searchBookmarks } from './search.js';
  import { getFaviconUrl, formatDate } from './utils.js';
  
  let bookmarks = [];
  let loading = true;
  let error = null;
  let searchQuery = '';
  let quickStats = null;
  let currentFilter = null;
  let displayLimit = 30;
  
  // Dark mode state
  let darkMode = false;
  
  // View mode: 'bookmarks' | 'recent' | 'domains' | 'folders'
  let viewMode = 'bookmarks';
  
  // Domain/folder data for quick navigation
  let topDomains = [];
  let topFolders = [];
  
  onMount(async () => {
    // Load dark mode preference
    const stored = await chrome.storage.local.get('darkMode');
    darkMode = stored.darkMode || false;
    applyDarkMode(darkMode);
    
    try {
      await loadBookmarks();
      await loadQuickStats();
      await loadNavigationData();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });
  
  function applyDarkMode(enabled) {
    if (enabled) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
  
  async function toggleDarkMode() {
    darkMode = !darkMode;
    applyDarkMode(darkMode);
    await chrome.storage.local.set({ darkMode });
  }
  
  async function loadBookmarks() {
    const allBooks = await getAllBookmarks();
    // Sort by date descending (most recent first)
    bookmarks = allBooks.sort((a, b) => b.dateAdded - a.dateAdded);
  }
  
  async function loadQuickStats() {
    quickStats = await getQuickStats();
  }
  
  async function loadNavigationData() {
    const allBooks = await getAllBookmarks();
    
    // Calculate top domains
    const domainCounts = {};
    const folderCounts = {};
    
    allBooks.forEach(b => {
      if (b.domain) {
        domainCounts[b.domain] = (domainCounts[b.domain] || 0) + 1;
      }
      if (b.folderPath) {
        folderCounts[b.folderPath] = (folderCounts[b.folderPath] || 0) + 1;
      }
    });
    
    topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([domain, count]) => ({ domain, count }));
    
    topFolders = Object.entries(folderCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([folder, count]) => ({ folder, count }));
  }
  
  async function handleSearch(event) {
    const query = event.detail.query;
    searchQuery = query;
    currentFilter = null;
    
    try {
      loading = true;
      if (query) {
        const result = await searchBookmarks(query);
        bookmarks = result.results || [];
      } else {
        await loadBookmarks();
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function filterByDomain(domain) {
    try {
      loading = true;
      currentFilter = { type: 'domain', value: domain };
      searchQuery = '';
      bookmarks = await getBookmarksByDomain(domain);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function filterByFolder(folder) {
    try {
      loading = true;
      currentFilter = { type: 'folder', value: folder };
      searchQuery = '';
      bookmarks = await getBookmarksByFolder(folder);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function filterByRecent(days) {
    try {
      loading = true;
      const endDate = Date.now();
      const startDate = endDate - (days * 24 * 60 * 60 * 1000);
      currentFilter = { type: 'recent', value: `Last ${days} days` };
      searchQuery = '';
      bookmarks = await getBookmarksByDateRange(startDate, endDate);
      bookmarks.sort((a, b) => b.dateAdded - a.dateAdded);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function clearFilter() {
    currentFilter = null;
    searchQuery = '';
    loading = true;
    await loadBookmarks();
    loading = false;
  }
  
  function openDashboard() {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  }
  
  function openBookmark(url, active = true) {
    chrome.tabs.create({ url, active });
  }
  
  function handleBookmarkClick(event, bookmark) {
    const active = !(event && (event.shiftKey || event.metaKey || event.ctrlKey));
    openBookmark(bookmark.url, active);
  }
  
  function loadMore() {
    displayLimit += 30;
  }
  
  $: displayedBookmarks = bookmarks.slice(0, displayLimit);
  $: hasMore = bookmarks.length > displayLimit;
</script>

<div class="w-full h-screen overflow-hidden flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-300 transition-colors">
  <!-- Header -->
  <div class="flex-shrink-0 p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
    <div class="flex items-center justify-between mb-2">
      <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-300 flex items-center gap-2">
        <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/>
        </svg>
        Bookmark Insight
      </h1>
      <div class="flex items-center gap-1">
        <!-- Dark Mode Toggle -->
        <button
          on:click={toggleDarkMode}
          class="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {#if darkMode}
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>
            </svg>
          {:else}
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
            </svg>
          {/if}
        </button>
        <!-- Open Full Dashboard -->
        <button
          on:click={openDashboard}
          class="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex items-center gap-1"
          title="Open full dashboard"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Dashboard
        </button>
      </div>
    </div>
    
    <!-- Search Bar -->
    <SearchBar on:search={handleSearch} placeholder="Search bookmarks..." value={searchQuery} />
    
    <!-- Quick Stats -->
    <!-- Removed as per user request -->
  </div>
  
  <!-- Navigation Tabs -->
  <div class="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
    <button
      class="flex-1 px-3 py-2 text-xs font-medium transition-colors {viewMode === 'bookmarks' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
      on:click={() => viewMode = 'bookmarks'}
    >
      All
    </button>
    <button
      class="flex-1 px-3 py-2 text-xs font-medium transition-colors {viewMode === 'recent' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
      on:click={() => viewMode = 'recent'}
    >
      Recent
    </button>
    <button
      class="flex-1 px-3 py-2 text-xs font-medium transition-colors {viewMode === 'domains' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
      on:click={() => viewMode = 'domains'}
    >
      Domains
    </button>
    <button
      class="flex-1 px-3 py-2 text-xs font-medium transition-colors {viewMode === 'folders' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
      on:click={() => viewMode = 'folders'}
    >
      Folders
    </button>
  </div>
  
  <!-- Active Filter Badge -->
  {#if currentFilter}
    <div class="flex-shrink-0 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-800">
      <div class="flex items-center justify-between">
        <span class="text-xs text-blue-700 dark:text-blue-300">
          {#if currentFilter.type === 'domain'}
            🌐 {currentFilter.value}
          {:else if currentFilter.type === 'folder'}
            📁 {currentFilter.value}
          {:else if currentFilter.type === 'recent'}
            🕐 {currentFilter.value}
          {/if}
          <span class="text-blue-500 dark:text-blue-400">({bookmarks.length})</span>
        </span>
        <button
          on:click={clearFilter}
          class="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
        >
          Clear
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Main Content Area -->
  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="flex items-center justify-center h-32">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    {:else if error}
      <div class="text-center text-red-600 dark:text-red-400 p-4">
        <p class="text-sm">Error: {error}</p>
        <button
          on:click={loadBookmarks}
          class="mt-2 px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    {:else if viewMode === 'bookmarks'}
      <!-- Bookmark List -->
      {#if bookmarks.length === 0}
        <div class="text-center text-gray-500 dark:text-gray-400 p-4 text-sm">
          {#if searchQuery}
            No bookmarks found for "{searchQuery}"
          {:else}
            No bookmarks found
          {/if}
        </div>
      {:else}
        <div class="divide-y divide-gray-100 dark:divide-gray-800">
          {#each displayedBookmarks as bookmark (bookmark.id)}
            <div 
              class="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors group"
              role="button"
              tabindex="0"
              on:click={(e) => handleBookmarkClick(e, bookmark)}
              on:keydown={(e) => e.key === 'Enter' && handleBookmarkClick(e, bookmark)}
            >
              <div class="flex items-start gap-2">
                <img 
                  src={getFaviconUrl(bookmark)}
                  alt=""
                  class="w-4 h-4 mt-0.5 flex-shrink-0 rounded"
                />
                <div class="flex-1 min-w-0">
                  <h3 class="text-sm font-medium text-gray-900 dark:text-gray-300 truncate" title={bookmark.title}>
                    {bookmark.title || 'Untitled'}
                  </h3>
                  <div class="flex items-center gap-2 mt-0.5 text-xs">
                    {#if bookmark.domain}
                      <span class="text-gray-500 dark:text-gray-400 truncate" title={bookmark.url}>
                        {bookmark.domain}
                      </span>
                      <span class="text-gray-300 dark:text-gray-600">•</span>
                    {/if}
                    <span class="text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {formatDate(bookmark.dateAdded)}
                    </span>
                    {#if bookmark.isAlive === false}
                      <span class="ml-1 text-red-500 dark:text-red-400">Dead link</span>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
        
        {#if hasMore}
          <div class="p-3 text-center">
            <button
              on:click={loadMore}
              class="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
            >
              Load more ({bookmarks.length - displayLimit} remaining)
            </button>
          </div>
        {/if}
      {/if}
      
    {:else if viewMode === 'recent'}
      <!-- Recent Time Filters -->
      <div class="p-3 space-y-2">
        <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-200 uppercase tracking-wider mb-3">Quick Filters</h3>
        {#each [
          { days: 1, label: 'Today' },
          { days: 7, label: 'Last 7 days' },
          { days: 14, label: 'Last 2 weeks' },
          { days: 30, label: 'Last month' },
          { days: 90, label: 'Last 3 months' }
        ] as filter}
          <button
            on:click={() => filterByRecent(filter.days)}
            class="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-between"
          >
            <span>{filter.label}</span>
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        {/each}
      </div>
      
    {:else if viewMode === 'domains'}
      <!-- Domain List -->
      <div class="p-3 space-y-1">
        <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-200 uppercase tracking-wider mb-3">Top Domains</h3>
        {#each topDomains as { domain, count }}
          <button
            on:click={() => filterByDomain(domain)}
            class="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-between group"
          >
            <span class="truncate flex-1">{domain}</span>
            <span class="text-xs text-gray-400 dark:text-gray-500 ml-2">{count}</span>
          </button>
        {/each}
      </div>
      
    {:else if viewMode === 'folders'}
      <!-- Folder List -->
      <div class="p-3 space-y-1">
        <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-200 uppercase tracking-wider mb-3">Folders</h3>
        {#each topFolders as { folder, count }}
          <button
            on:click={() => filterByFolder(folder)}
            class="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-between group"
          >
            <span class="truncate flex-1 flex items-center gap-2">
              <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
              </svg>
              {folder}
            </span>
            <span class="text-xs text-gray-400 dark:text-gray-500 ml-2">{count}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Smooth scrollbar for the bookmark list */
  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 3px;
  }
  
  :global(.dark) .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #4b5563;
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
  
  :global(.dark) .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #6b7280;
  }
</style>
