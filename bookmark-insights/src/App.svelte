<script>
  import { onMount } from 'svelte';
  import BookmarkCard from './BookmarkCard.svelte';
  import SearchBar from './SearchBar.svelte';
  import Sidebar from './Sidebar.svelte';
  import { searchBookmarks, getAllBookmarks, getBookmarksByDomain, getBookmarksByDateRange, getBookmarksByFolder } from './database.js';
  
  let bookmarks = [];
  let loading = true;
  let error = null;
  let searchQuery = '';
  let showSidebar = false;
  
  onMount(async () => {
    try {
      await loadBookmarks();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });
  
  async function loadBookmarks() {
    bookmarks = await getAllBookmarks();
  }
  
  async function handleSearch(event) {
    const query = event.detail.query;
    searchQuery = query;
    
    try {
      loading = true;
      bookmarks = await searchBookmarks(query);
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

<div class="w-96 h-96 bg-white flex flex-col">
  <!-- Header -->
  <div class="p-4 border-b border-gray-200 bg-gray-50">
    <div class="flex items-center justify-between mb-3">
      <h1 class="text-lg font-semibold text-gray-900">Bookmark Insight</h1>
      <div class="flex space-x-2">
        <button
          on:click={toggleSidebar}
          class="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
          title="Toggle Filters"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z"></path>
          </svg>
        </button>
        <button
          on:click={openDashboard}
          class="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Dashboard
        </button>
      </div>
    </div>
    
    <SearchBar on:search={handleSearch} />
    
    <div class="text-xs text-gray-500">
      {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}
    </div>
  </div>
  
  <div class="flex flex-1 overflow-hidden">
    {#if showSidebar}
      <Sidebar on:filter={handleFilter} />
    {/if}
    
    <!-- Main Content -->
    <div class="flex-1 overflow-y-auto p-4">
      {#if loading}
        <div class="flex items-center justify-center h-32">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      {:else if error}
        <div class="text-center text-red-600 p-4">
          <p>Error: {error}</p>
          <button
            on:click={loadBookmarks}
            class="mt-2 px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      {:else if bookmarks.length === 0}
        <div class="text-center text-gray-500 p-4">
          {#if searchQuery}
            <p>No bookmarks found for "{searchQuery}"</p>
          {:else}
            <p>No bookmarks found</p>
          {/if}
        </div>
      {:else}
        <div class="space-y-3">
          {#each bookmarks as bookmark (bookmark.id)}
            <BookmarkCard {bookmark} />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
