<script>
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import BookmarkCard from './BookmarkCard.svelte';
  import SearchBar from './SearchBar.svelte';
  import Sidebar from './Sidebar.svelte';
  import { 
    searchBookmarks, 
    getBookmarksPaginated, 
    getBookmarksByDomain, 
    getBookmarksByDateRange, 
    getBookmarksByFolder,
    getDomainStats,
    getActivityTimeline,
    findDuplicates,
    findOrphans,
    findMalformedUrls
  } from './database.js';
  
  Chart.register(...registerables);
  
  let bookmarks = [];
  let loading = true;
  let error = null;
  let currentView = 'bookmarks'; // bookmarks, insights, health
  let searchQuery = '';
  
  // Pagination variables
  let currentPage = 0;
  let totalCount = 0;
  let hasMore = false;
  let pageSize = 50;
  
  // Filter state
  let currentFilters = {
    domains: [],
    folders: [],
    dateRange: null,
    searchQuery: ''
  };
  
  // Chart variables
  let domainChart = null;
  let activityChart = null;
  
  // Health data
  let duplicates = [];
  let orphans = [];
  let malformedUrls = [];
  
  onMount(async () => {
    try {
      await loadBookmarksPaginated();
      if (currentView === 'insights') {
        await loadInsights();
      } else if (currentView === 'health') {
        await loadHealthData();
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });
  
  async function loadBookmarksPaginated(page = 0, append = false) {
    try {
      const filters = { ...currentFilters };
      const result = await getBookmarksPaginated(page, pageSize, filters);
      
      if (append) {
        bookmarks = [...bookmarks, ...result.bookmarks];
      } else {
        bookmarks = result.bookmarks;
      }
      
      currentPage = result.currentPage;
      totalCount = result.totalCount;
      hasMore = result.hasMore;
    } catch (err) {
      console.error('Error loading bookmarks:', err);
      throw err;
    }
  }

  async function loadMoreBookmarks() {
    if (!hasMore || loading) return;
    
    try {
      loading = true;
      await loadBookmarksPaginated(currentPage + 1, true);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function handleSearch(event) {
    const query = event.detail.query;
    searchQuery = query;
    currentFilters.searchQuery = query;
    
    try {
      loading = true;
      currentPage = 0;
      await loadBookmarksPaginated();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function handleFilter(event) {
    const filters = event.detail;
    currentFilters = { ...currentFilters, ...filters };
    
    try {
      loading = true;
      currentPage = 0;
      await loadBookmarksPaginated();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function switchView(view) {
    currentView = view;
    loading = true;
    
    try {
      if (view === 'bookmarks') {
        currentPage = 0;
        await loadBookmarksPaginated();
      } else if (view === 'insights') {
        await loadInsights();
      } else if (view === 'health') {
        await loadHealthData();
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function loadInsights() {
    try {
      const domainStats = await getDomainStats();
      const activityTimeline = await getActivityTimeline();
      
      // Create domain chart
      setTimeout(() => {
        const domainCtx = document.getElementById('domainChart');
        if (domainCtx) {
          if (domainChart) domainChart.destroy();
          domainChart = new Chart(domainCtx, {
            type: 'bar',
            data: {
              labels: domainStats.map(([domain]) => domain),
              datasets: [{
                label: 'Bookmarks',
                data: domainStats.map(([, count]) => count),
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: 'Top 10 Domains'
                }
              },
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });
        }
        
        // Create activity chart
        const activityCtx = document.getElementById('activityChart');
        if (activityCtx) {
          if (activityChart) activityChart.destroy();
          activityChart = new Chart(activityCtx, {
            type: 'line',
            data: {
              labels: activityTimeline.map(([month]) => month),
              datasets: [{
                label: 'Bookmarks Added',
                data: activityTimeline.map(([, count]) => count),
                fill: false,
                borderColor: 'rgba(34, 197, 94, 1)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.1
              }]
            },
            options: {
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: 'Bookmark Activity Timeline'
                }
              },
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });
        }
      }, 100);
    } catch (err) {
      console.error('Error loading insights:', err);
    }
  }
  
  async function loadHealthData() {
    try {
      duplicates = await findDuplicates();
      orphans = await findOrphans();
      malformedUrls = await findMalformedUrls();
    } catch (err) {
      console.error('Error loading health data:', err);
    }
  }
  
  async function deleteDuplicate(bookmarkId) {
    try {
      // First check if the bookmark still exists
      const existingBookmarks = await chrome.bookmarks.get([bookmarkId]);
      if (existingBookmarks && existingBookmarks.length > 0) {
        await chrome.bookmarks.remove(bookmarkId);
        console.log(`Deleted bookmark: ${bookmarkId}`);
      } else {
        console.log(`Bookmark ${bookmarkId} no longer exists`);
      }
      // Reload health data
      await loadHealthData();
    } catch (err) {
      console.error('Error deleting bookmark:', err);
      // Still reload health data to refresh the list
      await loadHealthData();
    }
  }
</script>

<svelte:head>
  <title>Bookmark Insight Dashboard</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="bg-white shadow-sm border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center py-4">
        <div class="flex items-center space-x-4">
          <h1 class="text-2xl font-bold text-gray-900">Bookmark Insight</h1>
        </div>
        
        <!-- Navigation -->
        <nav class="flex space-x-4">
          <button
            on:click={() => switchView('bookmarks')}
            class="px-4 py-2 rounded-md text-sm font-medium"
            class:bg-blue-100={currentView === 'bookmarks'}
            class:text-blue-700={currentView === 'bookmarks'}
            class:text-gray-500={currentView !== 'bookmarks'}
            class:hover:text-gray-700={currentView !== 'bookmarks'}
          >
            Bookmarks
          </button>
          <button
            on:click={() => switchView('insights')}
            class="px-4 py-2 rounded-md text-sm font-medium"
            class:bg-blue-100={currentView === 'insights'}
            class:text-blue-700={currentView === 'insights'}
            class:text-gray-500={currentView !== 'insights'}
            class:hover:text-gray-700={currentView !== 'insights'}
          >
            Insights
          </button>
          <button
            on:click={() => switchView('health')}
            class="px-4 py-2 rounded-md text-sm font-medium"
            class:bg-blue-100={currentView === 'health'}
            class:text-blue-700={currentView === 'health'}
            class:text-gray-500={currentView !== 'health'}
            class:hover:text-gray-700={currentView !== 'health'}
          >
            Health
          </button>
        </nav>
      </div>
    </div>
  </header>
  
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    {#if currentView === 'bookmarks'}
      <div class="mb-6">
        <SearchBar on:search={handleSearch} />
      </div>
      
      <div class="flex">
        <Sidebar on:filter={handleFilter} />
        
        <div class="flex-1 ml-6">
          {#if loading}
            <div class="flex items-center justify-center h-64">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          {:else if error}
            <div class="text-center text-red-600 p-8">
              <p>Error: {error}</p>
              <button
                on:click={() => loadBookmarksPaginated()}
                class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          {:else if bookmarks.length === 0}
            <div class="text-center text-gray-500 p-8">
              {#if searchQuery}
                <p>No bookmarks found for "{searchQuery}"</p>
              {:else}
                <p>No bookmarks found</p>
              {/if}
            </div>
          {:else}
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-medium text-gray-900">
                {totalCount} bookmark{totalCount !== 1 ? 's' : ''}
                {#if currentFilters.domains.length > 0 || currentFilters.folders.length > 0 || currentFilters.dateRange || currentFilters.searchQuery}
                  <span class="text-sm text-gray-500">
                    (filtered from {totalCount} total)
                  </span>
                {/if}
              </h2>
              <div class="text-sm text-gray-500">
                Showing {bookmarks.length} of {totalCount}
              </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {#each bookmarks as bookmark (bookmark.id)}
                <BookmarkCard {bookmark} />
              {/each}
            </div>

            <!-- Load More Button -->
            {#if hasMore}
              <div class="mt-8 text-center">
                <button
                  on:click={loadMoreBookmarks}
                  disabled={loading}
                  class="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {#if loading}
                    <div class="flex items-center">
                      <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Loading...
                    </div>
                  {:else}
                    Load More
                  {/if}
                </button>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {:else if currentView === 'insights'}
      <div class="space-y-8">
        {#if loading}
          <div class="flex items-center justify-center h-64">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        {:else}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="bg-white p-6 rounded-lg shadow">
              <canvas id="domainChart" width="400" height="300"></canvas>
            </div>
            <div class="bg-white p-6 rounded-lg shadow">
              <canvas id="activityChart" width="400" height="300"></canvas>
            </div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white p-6 rounded-lg shadow text-center">
              <div class="text-3xl font-bold text-blue-600">{bookmarks.length}</div>
              <div class="text-gray-500">Total Bookmarks</div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow text-center">
              <div class="text-3xl font-bold text-green-600">{duplicates.length}</div>
              <div class="text-gray-500">Duplicate Groups</div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow text-center">
              <div class="text-3xl font-bold text-orange-600">{orphans.length}</div>
              <div class="text-gray-500">Orphaned Bookmarks</div>
            </div>
          </div>
        {/if}
      </div>
    {:else if currentView === 'health'}
      <div class="space-y-8">
        {#if loading}
          <div class="flex items-center justify-center h-64">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        {:else}
          <!-- Duplicates -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                Duplicate Bookmarks ({duplicates.length} groups)
              </h3>
            </div>
            <div class="p-6">
              {#if duplicates.length === 0}
                <p class="text-gray-500">No duplicate bookmarks found.</p>
              {:else}
                <div class="space-y-6">
                  {#each duplicates as group}
                    <div class="border border-gray-200 rounded-lg p-4">
                      <h4 class="font-medium text-gray-900 mb-3">
                        {group[0].url}
                      </h4>
                      <div class="space-y-2">
                        {#each group as bookmark, index}
                          <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div class="flex-1">
                              <div class="text-sm font-medium">{bookmark.title}</div>
                              <div class="text-xs text-gray-500">
                                {bookmark.folderPath || 'No folder'}
                              </div>
                            </div>
                            {#if index > 0}
                              <button
                                on:click={() => deleteDuplicate(bookmark.id)}
                                class="ml-4 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                Delete
                              </button>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
          
          <!-- Orphans -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                Orphaned Bookmarks ({orphans.length})
              </h3>
            </div>
            <div class="p-6">
              {#if orphans.length === 0}
                <p class="text-gray-500">No orphaned bookmarks found.</p>
              {:else}
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {#each orphans as bookmark}
                    <BookmarkCard {bookmark} />
                  {/each}
                </div>
              {/if}
            </div>
          </div>
          
          <!-- Malformed URLs -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                Malformed URLs ({malformedUrls.length})
              </h3>
            </div>
            <div class="p-6">
              {#if malformedUrls.length === 0}
                <p class="text-gray-500">No malformed URLs found.</p>
              {:else}
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {#each malformedUrls as bookmark}
                    <BookmarkCard {bookmark} />
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
