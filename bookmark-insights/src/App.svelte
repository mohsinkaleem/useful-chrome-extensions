<script>
  import { onMount } from 'svelte';
  import BookmarkCard from './BookmarkCard.svelte';
  import SearchBar from './SearchBar.svelte';
  import Sidebar from './Sidebar.svelte';
  import { getAllBookmarks, getBookmarksByDomain, getBookmarksByDateRange, getBookmarksByFolder } from './db.js';
  import { searchBookmarks } from './search.js';
  
  let bookmarks = [];
  let loading = true;
  let error = null;
  let searchQuery = '';
  let showSidebar = false;
  
  // Dark mode state
  let darkMode = false;
  
  onMount(async () => {
    // Load dark mode preference
    const stored = await chrome.storage.local.get('darkMode');
    darkMode = stored.darkMode || false;
    applyDarkMode(darkMode);
    
    try {
      await loadBookmarks();
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
    bookmarks = await getAllBookmarks();
  }
  
  async function handleSearch(event) {
    const query = event.detail.query;
    searchQuery = query;
    
    try {
      loading = true;
      const result = await searchBookmarks(query);
      bookmarks = result.results || [];
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function handleFilter(event) {
    const { type, value } = event.detail;
    
    try {
      loading = true;
      
      switch (type) {
        case 'clear':
          bookmarks = await getAllBookmarks();
          break;
        case 'domain':
          bookmarks = await getBookmarksByDomain(value);
          break;
        case 'folder':
          bookmarks = await getBookmarksByFolder(value);
          break;
        case 'date':
          bookmarks = await getBookmarksByDateRange(value.startDate, value.endDate);
          break;
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  function openDashboard() {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    window.close();
  }
  
  function toggleSidebar() {
    showSidebar = !showSidebar;
  }
</script>

<div class="w-96 h-96 bg-white dark:bg-gray-900 flex flex-col transition-colors">
  <!-- Header -->
  <div class="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
    <div class="flex items-center justify-between mb-3">
      <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Bookmark Insight</h1>
      <div class="flex space-x-2">
        <button
          on:click={toggleDarkMode}
          class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
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
        <button
          on:click={toggleSidebar}
          class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Toggle Filters"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z"></path>
          </svg>
        </button>
        <button
          on:click={openDashboard}
          class="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          Dashboard
        </button>
      </div>
    </div>
    
    <SearchBar on:search={handleSearch} />
    
    <div class="text-xs text-gray-500 dark:text-gray-400">
      {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}
    </div>
  </div>
  
  <div class="flex flex-1 overflow-hidden">
    {#if showSidebar}
      <div class="w-48 border-r border-gray-200 dark:border-gray-800 overflow-y-auto bg-gray-50 dark:bg-gray-800">
        <Sidebar on:filter={handleFilter} compact={true} />
      </div>
    {/if}
    
    <!-- Main Content -->
    <div class="flex-1 overflow-y-auto p-4 bg-white dark:bg-gray-900">
      {#if loading}
        <div class="flex items-center justify-center h-32">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
        </div>
      {:else if error}
        <div class="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm text-center">
          <p>Error: {error}</p>
          <button
            on:click={loadBookmarks}
            class="mt-2 px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      {:else if bookmarks.length === 0}
        <div class="text-center text-gray-500 dark:text-gray-400 mt-10 p-4">
          {#if searchQuery}
            <p>No bookmarks found for "{searchQuery}"</p>
          {:else}
            <p>No bookmarks found</p>
          {/if}
        </div>
      {:else}
        <div class="space-y-3">
          {#each bookmarks as bookmark (bookmark.id)}
            <BookmarkCard {bookmark} compact={true} />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
