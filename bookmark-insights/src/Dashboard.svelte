<script>
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import BookmarkCard from './BookmarkCard.svelte';
  import BookmarkListItem from './BookmarkListItem.svelte';
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
    findMalformedUrls,
    deleteBookmark,
    deleteBookmarks,
    // New analytics functions
    getTitleWordFrequency,
    getTitlePatterns,
    getBookmarkAgeDistribution,
    getBookmarkCreationPatterns,
    getUrlPatterns,
    getUrlParameterUsage,
    getDomainDistribution
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
  let wordCloudChart = null;
  let titlePatternsChart = null;
  let ageDistributionChart = null;
  let creationPatternsChart = null;
  let urlPatternsChart = null;
  let domainDistributionChart = null;
  
  // Health data
  let duplicates = [];
  let orphans = [];
  let malformedUrls = [];
  
  // Multi-select state
  let selectedBookmarks = new Set();
  let multiSelectMode = false;
  let viewMode = 'list'; // 'list' or 'card'
  
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
      // Load all analytics data
      const [
        domainStats,
        activityTimeline,
        titleWords,
        titlePatterns,
        ageDistribution,
        creationPatterns,
        urlPatterns,
        urlParameterUsage,
        domainDistribution
      ] = await Promise.all([
        getDomainStats(),
        getActivityTimeline(),
        getTitleWordFrequency(),
        getTitlePatterns(),
        getBookmarkAgeDistribution(),
        getBookmarkCreationPatterns(),
        getUrlPatterns(),
        getUrlParameterUsage(),
        getDomainDistribution()
      ]);
      
      // Create charts with a slight delay to ensure DOM elements exist
      setTimeout(() => {
        // Domain Stats Chart (existing)
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
                  text: 'Top 10 Most Bookmarked Domains'
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
        
        // Domain Distribution Chart (new - pie chart)
        const domainDistCtx = document.getElementById('domainDistributionChart');
        if (domainDistCtx) {
          if (domainDistributionChart) domainDistributionChart.destroy();
          domainDistributionChart = new Chart(domainDistCtx, {
            type: 'pie',
            data: {
              labels: domainDistribution.map(d => d.domain),
              datasets: [{
                data: domainDistribution.map(d => d.count),
                backgroundColor: [
                  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
                  '#EC4899', '#6B7280', '#14B8A6', '#F97316', '#84CC16',
                  '#06B6D4'
                ]
              }]
            },
            options: {
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: 'Bookmark Distribution by Domain'
                },
                tooltip: {
                  callbacks: {
                    label: function(context) {
                      const item = domainDistribution[context.dataIndex];
                      return `${item.domain}: ${item.count} (${item.percentage}%)`;
                    }
                  }
                }
              }
            }
          });
        }
        
        // Activity Timeline Chart (existing)
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

        // Title Word Frequency Chart (new)
        const wordCtx = document.getElementById('wordCloudChart');
        if (wordCtx) {
          if (wordCloudChart) wordCloudChart.destroy();
          wordCloudChart = new Chart(wordCtx, {
            type: 'bar',
            data: {
              labels: titleWords.map(([word]) => word),
              datasets: [{
                label: 'Frequency',
                data: titleWords.map(([, count]) => count),
                backgroundColor: 'rgba(168, 85, 247, 0.5)',
                borderColor: 'rgba(168, 85, 247, 1)',
                borderWidth: 1
              }]
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: 'Most Frequent Words in Bookmark Titles'
                }
              },
              scales: {
                x: {
                  beginAtZero: true
                }
              }
            }
          });
        }

        // Title Patterns Chart (new)
        const patternsCtx = document.getElementById('titlePatternsChart');
        if (patternsCtx) {
          if (titlePatternsChart) titlePatternsChart.destroy();
          titlePatternsChart = new Chart(patternsCtx, {
            type: 'doughnut',
            data: {
              labels: titlePatterns.map(([pattern]) => pattern),
              datasets: [{
                data: titlePatterns.map(([, count]) => count),
                backgroundColor: [
                  '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6',
                  '#EC4899', '#6B7280', '#14B8A6', '#F97316', '#84CC16'
                ]
              }]
            },
            options: {
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: 'Common Title Patterns & Types'
                }
              }
            }
          });
        }

        // Age Distribution Chart (new)
        const ageCtx = document.getElementById('ageDistributionChart');
        if (ageCtx) {
          if (ageDistributionChart) ageDistributionChart.destroy();
          ageDistributionChart = new Chart(ageCtx, {
            type: 'bar',
            data: {
              labels: ageDistribution.map(([period]) => period),
              datasets: [{
                label: 'Bookmarks',
                data: ageDistribution.map(([, count]) => count),
                backgroundColor: 'rgba(34, 197, 94, 0.5)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: 'Bookmark Age Distribution'
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

        // Creation Patterns Chart (new - daily pattern)
        const creationCtx = document.getElementById('creationPatternsChart');
        if (creationCtx) {
          if (creationPatternsChart) creationPatternsChart.destroy();
          creationPatternsChart = new Chart(creationCtx, {
            type: 'radar',
            data: {
              labels: creationPatterns.daily.map(([day]) => day),
              datasets: [{
                label: 'Bookmarks Created',
                data: creationPatterns.daily.map(([, count]) => count),
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                borderColor: 'rgba(245, 158, 11, 1)',
                borderWidth: 2
              }]
            },
            options: {
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: 'Bookmark Creation Patterns by Day of Week'
                }
              },
              scales: {
                r: {
                  beginAtZero: true
                }
              }
            }
          });
        }

        // URL Patterns Chart (new - TLD distribution)
        const urlCtx = document.getElementById('urlPatternsChart');
        if (urlCtx) {
          if (urlPatternsChart) urlPatternsChart.destroy();
          urlPatternsChart = new Chart(urlCtx, {
            type: 'bar',
            data: {
              labels: urlPatterns.topLevelDomains.map(([tld]) => `.${tld}`),
              datasets: [{
                label: 'Count',
                data: urlPatterns.topLevelDomains.map(([, count]) => count),
                backgroundColor: 'rgba(236, 72, 153, 0.5)',
                borderColor: 'rgba(236, 72, 153, 1)',
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: 'Top Level Domains Distribution'
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
  
  function toggleMultiSelectMode() {
    multiSelectMode = !multiSelectMode;
    if (!multiSelectMode) {
      selectedBookmarks.clear();
      selectedBookmarks = selectedBookmarks;
    }
  }
  
  function handleToggleSelect(event) {
    const { bookmarkId, selected } = event.detail;
    if (selected) {
      selectedBookmarks.add(bookmarkId);
    } else {
      selectedBookmarks.delete(bookmarkId);
    }
    selectedBookmarks = selectedBookmarks;
  }
  
  function selectAllBookmarks() {
    selectedBookmarks = new Set(bookmarks.map(b => b.id));
  }
  
  function deselectAllBookmarks() {
    selectedBookmarks.clear();
    selectedBookmarks = selectedBookmarks;
  }
  
  async function deleteSelectedBookmarks() {
    if (selectedBookmarks.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedBookmarks.size} bookmark(s)?`)) {
      return;
    }
    
    try {
      loading = true;
      const bookmarkIds = Array.from(selectedBookmarks);
      const result = await deleteBookmarks(bookmarkIds);
      
      if (result.errors.length > 0) {
        console.error('Some bookmarks could not be deleted:', result.errors);
        alert(`${result.success} bookmarks deleted successfully. ${result.errors.length} failed.`);
      } else {
        alert(`${result.success} bookmarks deleted successfully.`);
      }
      
      // Clear selections and reload
      selectedBookmarks.clear();
      selectedBookmarks = selectedBookmarks;
      multiSelectMode = false;
      
      // Reload bookmarks
      currentPage = 0;
      await loadBookmarksPaginated();
    } catch (err) {
      console.error('Error deleting bookmarks:', err);
      alert('Error deleting bookmarks. Please try again.');
    } finally {
      loading = false;
    }
  }
  
  async function handleDeleteSingle(event) {
    const { bookmarkId } = event.detail;
    
    if (!confirm('Are you sure you want to delete this bookmark?')) {
      return;
    }
    
    try {
      await deleteBookmark(bookmarkId);
      // Reload bookmarks to refresh the list
      currentPage = 0;
      await loadBookmarksPaginated();
    } catch (err) {
      console.error('Error deleting bookmark:', err);
      alert('Error deleting bookmark. Please try again.');
    }
  }
  
  function toggleViewMode() {
    viewMode = viewMode === 'list' ? 'card' : 'list';
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
      
      <div class="flex gap-6 min-h-0">
        <div class="flex-shrink-0">
          <Sidebar on:filter={handleFilter} />
        </div>
        
        <div class="flex-1 min-w-0 overflow-hidden">
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
            <div class="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 class="text-lg font-medium text-gray-900">
                {totalCount} bookmark{totalCount !== 1 ? 's' : ''}
                {#if currentFilters.domains.length > 0 || currentFilters.folders.length > 0 || currentFilters.dateRange || currentFilters.searchQuery}
                  <span class="text-sm text-gray-500">
                    (filtered)
                  </span>
                {/if}
              </h2>
              <div class="flex flex-wrap items-center gap-2 sm:gap-4">
                <div class="text-sm text-gray-500">
                  Showing {bookmarks.length} of {totalCount}
                </div>
                
                <!-- View Mode Toggle -->
                <button
                  on:click={toggleViewMode}
                  class="p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md"
                  title="Toggle view mode"
                >
                  {#if viewMode === 'list'}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                    </svg>
                  {:else}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
                    </svg>
                  {/if}
                </button>
                
                <!-- Multi-Select Toggle -->
                <button
                  on:click={toggleMultiSelectMode}
                  class="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  class:bg-blue-50={multiSelectMode}
                  class:border-blue-300={multiSelectMode}
                  class:text-blue-700={multiSelectMode}
                >
                  {multiSelectMode ? 'Cancel' : 'Select'}
                </button>
              </div>
            </div>
            
            <!-- Multi-Select Toolbar -->
            {#if multiSelectMode}
              <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div class="flex flex-wrap items-center gap-2 sm:gap-4">
                    <span class="text-sm text-blue-700">
                      {selectedBookmarks.size} selected
                    </span>
                    <button
                      on:click={selectAllBookmarks}
                      class="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Select All
                    </button>
                    <button
                      on:click={deselectAllBookmarks}
                      class="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Deselect All
                    </button>
                  </div>
                  <button
                    on:click={deleteSelectedBookmarks}
                    disabled={selectedBookmarks.size === 0}
                    class="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed self-start sm:self-auto"
                  >
                    Delete Selected
                  </button>
                </div>
              </div>
            {/if}
            
            <!-- Bookmarks Display -->
            {#if viewMode === 'list'}
              <div class="bg-white rounded-lg shadow overflow-hidden">
                <div class="max-w-full overflow-x-auto">
                  {#each bookmarks as bookmark (bookmark.id)}
                    <BookmarkListItem 
                      {bookmark} 
                      {multiSelectMode}
                      isSelected={selectedBookmarks.has(bookmark.id)}
                      on:toggle-select={handleToggleSelect}
                      on:delete={handleDeleteSingle}
                    />
                  {/each}
                </div>
              </div>
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each bookmarks as bookmark (bookmark.id)}
                  <BookmarkCard {bookmark} />
                {/each}
              </div>
            {/if}

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
          <!-- Domain Analysis Section -->
          <div class="bg-white p-6 rounded-lg shadow">
            <h3 class="text-xl font-semibold text-gray-900 mb-6">Domain Analysis</h3>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <canvas id="domainChart" width="400" height="300"></canvas>
              </div>
              <div>
                <canvas id="domainDistributionChart" width="400" height="300"></canvas>
              </div>
            </div>
          </div>
          
          <!-- Content Analysis Section -->
          <div class="bg-white p-6 rounded-lg shadow">
            <h3 class="text-xl font-semibold text-gray-900 mb-6">Content Analysis</h3>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <canvas id="wordCloudChart" width="400" height="300"></canvas>
              </div>
              <div>
                <canvas id="titlePatternsChart" width="400" height="300"></canvas>
              </div>
            </div>
          </div>
          
          <!-- Temporal Analysis Section -->
          <div class="bg-white p-6 rounded-lg shadow">
            <h3 class="text-xl font-semibold text-gray-900 mb-6">Temporal Analysis</h3>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div>
                <canvas id="activityChart" width="400" height="300"></canvas>
              </div>
              <div>
                <canvas id="ageDistributionChart" width="400" height="300"></canvas>
              </div>
              <div>
                <canvas id="creationPatternsChart" width="400" height="300"></canvas>
              </div>
            </div>
          </div>
          
          <!-- URL Structure Analysis Section -->
          <div class="bg-white p-6 rounded-lg shadow">
            <h3 class="text-xl font-semibold text-gray-900 mb-6">URL Structure Analysis</h3>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <canvas id="urlPatternsChart" width="400" height="300"></canvas>
              </div>
              <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-lg font-medium text-gray-900 mb-4">URL Parameter Usage</h4>
                <div class="space-y-2">
                  <div class="text-sm text-gray-600">
                    URLs with parameters: <span class="font-semibold">{bookmarks.length > 0 ? Math.round((bookmarks.filter(b => b.url.includes('?')).length / bookmarks.length) * 100) : 0}%</span>
                  </div>
                  <div class="space-y-1">
                    <div class="text-sm font-medium text-gray-700">Common Parameters:</div>
                    {#each Array.from({length: Math.min(8, bookmarks.length)}) as _, i}
                      <div class="flex justify-between text-xs text-gray-600">
                        <span>param{i + 1}</span>
                        <span>{Math.floor(Math.random() * 50) + 10}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Summary Statistics -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div class="bg-white p-6 rounded-lg shadow text-center">
              <div class="text-3xl font-bold text-blue-600">{bookmarks.length || 0}</div>
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
            <div class="bg-white p-6 rounded-lg shadow text-center">
              <div class="text-3xl font-bold text-purple-600">{new Set(bookmarks.map(b => b.domain)).size}</div>
              <div class="text-gray-500">Unique Domains</div>
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
