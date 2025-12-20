<script>
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import BookmarkCard from './BookmarkCard.svelte';
  import BookmarkListItem from './BookmarkListItem.svelte';
  import SearchBar from './SearchBar.svelte';
  import Sidebar from './Sidebar.svelte';
  import DataExplorer from './DataExplorer.svelte';
  import { SORT_OPTIONS } from './utils.js';
  import { searchBookmarks, computeSearchResultStats } from './search.js';
  import { 
    getBookmarksPaginated, 
    getBookmarksByDomain, 
    getBookmarksByDateRange, 
    getBookmarksByFolder,
    getDomainStats,
    getActivityTimeline,
    findDuplicates,
    findMalformedUrls,
    findSimilarBookmarks,
    deleteBookmark,
    deleteBookmarks,
    getDeadLinks,
    exportBookmarks,
    getQuickStats,
    getSettings,
    // Analytics functions
    getTitleWordFrequency,
    getTitlePatterns,
    getBookmarkAgeDistribution,
    getBookmarkCreationPatterns,
    getUrlPatterns,
    getUrlParameterUsage,
    getDomainDistribution,
    // Backup functions
    downloadBackup,
    restoreFromBackup,
    validateBackup,
    createAutoBackup,
    listAutoBackups,
    restoreFromAutoBackup
  } from './db.js';
  
  // Import new insights functions
  import {
    getDomainHierarchy,
    getDomainTreemapData,
    getContentFreshness,
    getInsightsSummary,
    getEventStatistics,
    getHourlyAccessPatterns
  } from './insights.js';
  
  Chart.register(...registerables);
  
  let bookmarks = [];
  let loading = true;
  let error = null;
  let currentView = 'bookmarks'; // bookmarks, insights, health, dataExplorer
  let searchQuery = '';
  
  // Pagination variables
  let currentPage = 0;
  let totalCount = 0;
  let hasMore = false;
  let pageSize = 50;
  
  // Sorting state
  let currentSortBy = 'date_desc';
  
  // Filter state
  let currentFilters = {
    domains: [],
    folders: [],
    dateRange: null,
    searchQuery: '',
    sortBy: 'date_desc'
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
  let domainHierarchyChart = null;
  let freshnessChart = null;
  let accessPatternChart = null;
  
  // Health data
  let duplicates = [];
  let malformedUrls = [];
  let similarBookmarks = [];
  let deadLinks = [];
  let loadingDeadLinks = false;
  let quickStats = null;
  
  // Search result stats for sidebar (domains/folders from search results)
  let searchResultStats = null;
  
  // Enrichment state
  let enrichmentStatus = null;
  let runningEnrichment = false;
  let enrichmentResult = null;
  let enrichmentProgress = null; // Real-time progress tracking
  let enrichmentLogs = []; // Detailed progress logs
  
  // Enrichment configuration
  let enrichmentBatchSize = 20;
  let enrichmentConcurrency = 3;
  
  // Advanced insights data
  let domainHierarchy = [];
  let contentFreshness = [];
  let insightsSummary = null;
  let eventStats = null;
  
  // Health section loading states (for progressive loading)
  let loadingDuplicates = false;
  let loadingSimilar = false;
  let loadingMalformed = false;
  
  // Health section display limits (for on-demand loading)
  let duplicatesDisplayLimit = 10;
  let similarDisplayLimit = 10;
  let deadLinksDisplayLimit = 10;
  
  // URL parameter data (for insights)
  let urlParameterData = null;
  
  // Backup state
  let backupInProgress = false;
  let restoreInProgress = false;
  let autoBackups = [];
  let showRestoreDialog = false;
  let restoreFile = null;
  let backupValidation = null;
  
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

    // Listen for enrichment progress updates
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'enrichmentProgress' && message.progress) {
        enrichmentProgress = message.progress;
        
        // Add to logs for detailed tracking
        const logEntry = {
          timestamp: Date.now(),
          ...message.progress
        };
        enrichmentLogs = [...enrichmentLogs, logEntry];
        
        // Keep only last 100 log entries
        if (enrichmentLogs.length > 100) {
          enrichmentLogs = enrichmentLogs.slice(-100);
        }
      }
    });
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
      
      if (query && query.trim()) {
        // Use advanced search with +/- term support
        const searchResult = await searchBookmarks(query, { limit: 1000 });
        const allResults = searchResult.results || [];
        
        // Compute stats from ALL search results for sidebar
        searchResultStats = computeSearchResultStats(allResults);
        
        // Apply additional filters (domains, folders, date range) if any
        let filteredResults = allResults;
        
        if (currentFilters.domains && currentFilters.domains.length > 0) {
          filteredResults = filteredResults.filter(b => currentFilters.domains.includes(b.domain));
        }
        if (currentFilters.folders && currentFilters.folders.length > 0) {
          filteredResults = filteredResults.filter(b => currentFilters.folders.includes(b.folderPath));
        }
        if (currentFilters.dateRange) {
          filteredResults = filteredResults.filter(b => 
            b.dateAdded >= currentFilters.dateRange.startDate && 
            b.dateAdded <= currentFilters.dateRange.endDate
          );
        }
        
        // Apply sorting
        const sortBy = currentFilters.sortBy || 'relevance';
        if (sortBy !== 'relevance') {
          switch (sortBy) {
            case 'date_desc':
              filteredResults.sort((a, b) => b.dateAdded - a.dateAdded);
              break;
            case 'date_asc':
              filteredResults.sort((a, b) => a.dateAdded - b.dateAdded);
              break;
            case 'title_asc':
              filteredResults.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
              break;
            case 'title_desc':
              filteredResults.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
              break;
          }
        }
        
        // Paginate
        const startIndex = currentPage * pageSize;
        bookmarks = filteredResults.slice(startIndex, startIndex + pageSize);
        totalCount = filteredResults.length;
        hasMore = startIndex + pageSize < filteredResults.length;
      } else {
        // No search query - clear search stats and load all bookmarks
        searchResultStats = null;
        await loadBookmarksPaginated();
      }
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
      
      // Re-run search with new filters if there's a search query
      if (searchQuery && searchQuery.trim()) {
        await handleSearch({ detail: { query: searchQuery } });
        return;
      }
      
      await loadBookmarksPaginated();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function handleSortChange(sortKey) {
    currentSortBy = sortKey;
    currentFilters.sortBy = sortKey;
    
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
        domainDistribution,
        // New insights data
        hierarchyData,
        freshnessData,
        summaryData,
        eventData
      ] = await Promise.all([
        getDomainStats(),
        getActivityTimeline(),
        getTitleWordFrequency(),
        getTitlePatterns(),
        getBookmarkAgeDistribution(),
        getBookmarkCreationPatterns(),
        getUrlPatterns(),
        getUrlParameterUsage(),
        getDomainDistribution(),
        // New insights functions
        getDomainHierarchy(),
        getContentFreshness(),
        getInsightsSummary(),
        getEventStatistics()
      ]);
      
      // Store URL parameter data for display
      urlParameterData = urlParameterUsage;
      
      // Store new insights data
      domainHierarchy = hierarchyData;
      contentFreshness = freshnessData;
      insightsSummary = summaryData;
      eventStats = eventData;
      
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

        // Domain Hierarchy Chart (treemap-like horizontal bar)
        const hierarchyCtx = document.getElementById('domainHierarchyChart');
        if (hierarchyCtx && hierarchyData.length > 0) {
          if (domainHierarchyChart) domainHierarchyChart.destroy();
          const topDomains = hierarchyData.slice(0, 15);
          domainHierarchyChart = new Chart(hierarchyCtx, {
            type: 'bar',
            data: {
              labels: topDomains.map(d => d.name),
              datasets: [{
                label: 'Bookmarks',
                data: topDomains.map(d => d.count),
                backgroundColor: [
                  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
                  '#EC4899', '#6B7280', '#14B8A6', '#F97316', '#84CC16',
                  '#06B6D4', '#F43F5E', '#22C55E', '#A855F7', '#0EA5E9'
                ]
              }]
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: 'Domain Hierarchy (Top 15 Domains)'
                },
                legend: {
                  display: false
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

        // Content Freshness Chart (doughnut)
        const freshnessCtx = document.getElementById('freshnessChart');
        if (freshnessCtx && freshnessData.length > 0) {
          if (freshnessChart) freshnessChart.destroy();
          freshnessChart = new Chart(freshnessCtx, {
            type: 'doughnut',
            data: {
              labels: freshnessData.map(d => d.period),
              datasets: [{
                data: freshnessData.map(d => d.count),
                backgroundColor: ['#22C55E', '#84CC16', '#F59E0B', '#F97316', '#EF4444']
              }]
            },
            options: {
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: 'Bookmark Freshness'
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
    // Reset display limits
    duplicatesDisplayLimit = 10;
    similarDisplayLimit = 10;
    deadLinksDisplayLimit = 10;
    
    try {
      // Load quick stats first (fast) - shows something immediately
      loadingDuplicates = true;
      loadingSimilar = true;
      loadingDeadLinks = true;
      loadingMalformed = true;
      
      // Load quick stats immediately
      quickStats = await getQuickStats();
      
      // Load enrichment status
      await loadEnrichmentStatus();
      
      // Load sections progressively (non-blocking)
      // Duplicates load
      findDuplicates().then(dups => {
        duplicates = dups;
        loadingDuplicates = false;
      }).catch(err => {
        console.error('Error loading duplicates:', err);
        loadingDuplicates = false;
      });
      
      // Dead links load (from stored data)
      getDeadLinks().then(links => {
        deadLinks = links;
        loadingDeadLinks = false;
      }).catch(err => {
        console.error('Error loading dead links:', err);
        loadingDeadLinks = false;
      });
      
      // Malformed URLs load
      findMalformedUrls().then(malformed => {
        malformedUrls = malformed;
        loadingMalformed = false;
      }).catch(err => {
        console.error('Error loading malformed URLs:', err);
        loadingMalformed = false;
      });
      
      // Similar bookmarks load (slowest - O(n²) algorithm)
      findSimilarBookmarks().then(similar => {
        similarBookmarks = similar;
        loadingSimilar = false;
      }).catch(err => {
        console.error('Error loading similar bookmarks:', err);
        loadingSimilar = false;
      });
      
    } catch (err) {
      console.error('Error loading health data:', err);
    }
  }
  
  // Enrichment functions
  async function loadEnrichmentStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getEnrichmentStatus' });
      if (response.success) {
        enrichmentStatus = response;
      }
      
      // Load enrichment settings - getSettings is already imported at the top
      const settings = await getSettings();
      if (settings) {
        enrichmentBatchSize = settings.enrichmentBatchSize || 20;
        enrichmentConcurrency = settings.enrichmentConcurrency || 3;
      }
    } catch (err) {
      console.error('Error loading enrichment status:', err);
    }
  }
  
  async function handleRunEnrichment() {
    runningEnrichment = true;
    enrichmentResult = null;
    enrichmentProgress = null;
    enrichmentLogs = [];
    
    try {
      // Create auto-backup before enrichment
      console.log('Creating auto-backup before enrichment...');
      await createAutoBackup();
      
      const response = await chrome.runtime.sendMessage({ 
        action: 'runEnrichment',
        batchSize: enrichmentBatchSize,
        concurrency: enrichmentConcurrency
      });
      
      if (response.success) {
        enrichmentResult = response.result;
        // Refresh enrichment status
        await loadEnrichmentStatus();
      } else {
        enrichmentResult = { error: response.error };
      }
    } catch (err) {
      console.error('Error running enrichment:', err);
      enrichmentResult = { error: err.message };
    } finally {
      runningEnrichment = false;
    }
  }
  
  async function deleteSimilarBookmark(bookmarkId, pairIndex) {
    try {
      // First check if the bookmark still exists
      const existingBookmarks = await chrome.bookmarks.get([bookmarkId]);
      if (existingBookmarks && existingBookmarks.length > 0) {
        await chrome.bookmarks.remove(bookmarkId);
        console.log(`Deleted similar bookmark: ${bookmarkId}`);
      } else {
        console.log(`Bookmark ${bookmarkId} no longer exists`);
      }
      // Remove the pair from the list immediately - no need to reload since data is precomputed
      similarBookmarks = similarBookmarks.filter((_, idx) => idx !== pairIndex);
    } catch (err) {
      console.error('Error deleting bookmark:', err);
      // Even on error, just remove the pair from display - don't reload
      similarBookmarks = similarBookmarks.filter((_, idx) => idx !== pairIndex);
    }
  }
  
  function loadMoreDuplicates() {
    duplicatesDisplayLimit += 10;
  }
  
  function loadMoreSimilar() {
    similarDisplayLimit += 10;
  }
  
  function loadMoreDeadLinks() {
    deadLinksDisplayLimit += 10;
  }
  
  async function deleteDuplicate(bookmarkId, groupIndex) {
    try {
      // First check if the bookmark still exists
      const existingBookmarks = await chrome.bookmarks.get([bookmarkId]);
      if (existingBookmarks && existingBookmarks.length > 0) {
        await chrome.bookmarks.remove(bookmarkId);
        console.log(`Deleted bookmark: ${bookmarkId}`);
      } else {
        console.log(`Bookmark ${bookmarkId} no longer exists`);
      }
      
      // Update the duplicates list without full reload
      duplicates = duplicates.map((group, idx) => {
        if (idx === groupIndex) {
          return group.filter(b => b.id !== bookmarkId);
        }
        return group;
      }).filter(group => group.length > 1); // Remove groups that no longer have duplicates
      
    } catch (err) {
      console.error('Error deleting bookmark:', err);
      // Reload duplicates only on error
      loadingDuplicates = true;
      findDuplicates().then(dups => {
        duplicates = dups;
        loadingDuplicates = false;
      });
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
  
  // Backup & Restore handlers
  async function handleDownloadBackup() {
    backupInProgress = true;
    try {
      const result = await downloadBackup();
      if (result.success) {
        alert(`Backup saved: ${result.filename}\n\nContains:\n- ${result.metadata.totalBookmarks} bookmarks\n- ${result.metadata.enrichedCount} enriched\n- ${result.metadata.categorizedCount} categorized`);
      }
    } catch (err) {
      console.error('Error creating backup:', err);
      alert('Error creating backup: ' + err.message);
    } finally {
      backupInProgress = false;
    }
  }
  
  async function handleRestoreBackup() {
    if (!restoreFile) {
      alert('Please select a backup file first');
      return;
    }
    
    if (!backupValidation || !backupValidation.valid) {
      alert('Please select a valid backup file');
      return;
    }
    
    if (!confirm(`Restore backup from ${backupValidation.createdAt}?\n\nThis will replace your current data with:\n- ${backupValidation.metadata.totalBookmarks} bookmarks\n- ${backupValidation.metadata.enrichedCount} enriched\n\nYour current data will be auto-backed up first.`)) {
      return;
    }
    
    restoreInProgress = true;
    try {
      // Create auto-backup first
      await createAutoBackup();
      
      // Read and parse the file
      const text = await restoreFile.text();
      const backup = JSON.parse(text);
      
      // Restore
      const result = await restoreFromBackup(backup);
      
      if (result.success) {
        alert(`Restore complete!\n\n- ${result.results.bookmarksRestored} bookmarks restored\n- ${result.results.similaritiesRestored} similarities restored\n\nRefreshing...`);
        showRestoreDialog = false;
        restoreFile = null;
        backupValidation = null;
        // Reload the page to refresh all data
        window.location.reload();
      }
    } catch (err) {
      console.error('Error restoring backup:', err);
      alert('Error restoring backup: ' + err.message);
    } finally {
      restoreInProgress = false;
    }
  }
  
  async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    restoreFile = file;
    
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      backupValidation = validateBackup(backup);
    } catch (err) {
      backupValidation = { valid: false, issues: ['Invalid JSON file'] };
    }
  }
  
  async function loadAutoBackups() {
    autoBackups = await listAutoBackups();
  }
  
  async function handleRestoreAutoBackup(index) {
    if (!confirm(`Restore auto-backup from ${autoBackups[index].createdAt}?\n\nThis will replace your current data.`)) {
      return;
    }
    
    restoreInProgress = true;
    try {
      const result = await restoreFromAutoBackup(index);
      if (result.success) {
        alert('Restore complete! Refreshing...');
        window.location.reload();
      }
    } catch (err) {
      console.error('Error restoring auto-backup:', err);
      alert('Error: ' + err.message);
    } finally {
      restoreInProgress = false;
    }
  }
  
  async function handleExportBookmarks() {
    try {
      const exportData = await exportBookmarks();
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookmarks-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting bookmarks:', err);
      alert('Error exporting bookmarks. Please try again.');
    }
  }
</script>

<svelte:head>
  <title>Bookmark Insight Dashboard</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="bg-white shadow-sm border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center py-4">
        <div class="flex items-center space-x-4">
          <h1 class="text-2xl font-bold text-gray-900">Bookmark Insight</h1>
          <button
            on:click={handleExportBookmarks}
            class="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            title="Export bookmarks to JSON"
          >
            <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            Export
          </button>
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
          <button
            on:click={() => switchView('dataExplorer')}
            class="px-4 py-2 rounded-md text-sm font-medium"
            class:bg-blue-100={currentView === 'dataExplorer'}
            class:text-blue-700={currentView === 'dataExplorer'}
            class:text-gray-500={currentView !== 'dataExplorer'}
            class:hover:text-gray-700={currentView !== 'dataExplorer'}
          >
            🗄️ Data
          </button>
        </nav>
      </div>
    </div>
  </header>
  
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    {#if currentView === 'bookmarks'}
      <div class="mb-4">
        <SearchBar on:search={handleSearch} />
      </div>
      
      <div class="flex gap-6 min-h-0">
        <div class="flex-shrink-0">
          <Sidebar on:filter={handleFilter} {searchResultStats} isSearchActive={!!searchQuery} />
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
                
                <!-- Sort Dropdown -->
                <select
                  bind:value={currentSortBy}
                  on:change={(e) => handleSortChange(e.target.value)}
                  class="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white"
                >
                  {#each Object.values(SORT_OPTIONS) as option}
                    <option value={option.key}>{option.label}</option>
                  {/each}
                </select>
                
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
                {#if urlParameterData}
                  <div class="space-y-2">
                    <div class="text-sm text-gray-600">
                      URLs with parameters: <span class="font-semibold">{urlParameterData.percentage}%</span>
                      <span class="text-xs text-gray-400">({urlParameterData.urlsWithParams} of {urlParameterData.totalUrls})</span>
                    </div>
                    {#if urlParameterData.parameters.length > 0}
                      <div class="space-y-1 mt-3">
                        <div class="text-sm font-medium text-gray-700">Most Common Parameters:</div>
                        {#each urlParameterData.parameters.slice(0, 10) as [param, count]}
                          <div class="flex justify-between text-xs text-gray-600 py-1 border-b border-gray-200">
                            <span class="font-mono bg-gray-100 px-1 rounded">{param}</span>
                            <span class="font-semibold">{count}</span>
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <p class="text-sm text-gray-500 mt-2">No URL parameters found in bookmarks.</p>
                    {/if}
                  </div>
                {:else}
                  <p class="text-sm text-gray-500">Loading parameter data...</p>
                {/if}
              </div>
            </div>
          </div>
          
          <!-- NEW: Domain Hierarchy Visualization (Step 9) -->
          <div class="bg-white p-6 rounded-lg shadow">
            <h3 class="text-xl font-semibold text-gray-900 mb-6">
              <svg class="w-6 h-6 inline-block mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path>
              </svg>
              Domain Hierarchy
            </h3>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <canvas id="domainHierarchyChart" width="400" height="400"></canvas>
              </div>
              <div class="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                <h4 class="text-lg font-medium text-gray-900 mb-4">Domain Breakdown</h4>
                {#if domainHierarchy.length > 0}
                  <div class="space-y-3">
                    {#each domainHierarchy.slice(0, 10) as domain}
                      <div class="border border-gray-200 rounded p-3 bg-white">
                        <div class="flex justify-between items-center">
                          <span class="font-medium text-gray-800">{domain.name}</span>
                          <span class="text-sm font-bold text-blue-600">{domain.count}</span>
                        </div>
                        {#if domain.subdomains.length > 0}
                          <div class="mt-2 pl-4 border-l-2 border-gray-200">
                            {#each domain.subdomains.slice(0, 3) as subdomain}
                              <div class="text-sm text-gray-600 flex justify-between py-1">
                                <span>{subdomain.name}</span>
                                <span class="text-gray-500">{subdomain.count}</span>
                              </div>
                            {/each}
                            {#if domain.subdomains.length > 3}
                              <div class="text-xs text-gray-400">+{domain.subdomains.length - 3} more...</div>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="text-gray-500 text-sm">No domain data available.</p>
                {/if}
              </div>
            </div>
          </div>
          
          <!-- NEW: Data Insights Dashboard (Step 11) -->
          <div class="bg-white p-6 rounded-lg shadow">
            <h3 class="text-xl font-semibold text-gray-900 mb-6">
              <svg class="w-6 h-6 inline-block mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
              </svg>
              Data Insights
            </h3>
            
            {#if insightsSummary}
              <!-- Insights Summary Cards -->
              <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg text-center">
                  <div class="text-2xl font-bold text-blue-700">{insightsSummary.totalBookmarks}</div>
                  <div class="text-xs text-blue-600">Total Bookmarks</div>
                </div>
                <div class="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg text-center">
                  <div class="text-2xl font-bold text-green-700">{insightsSummary.categorizedPercentage}%</div>
                  <div class="text-xs text-green-600">Categorized</div>
                </div>
                <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg text-center">
                  <div class="text-2xl font-bold text-purple-700">{insightsSummary.enrichedPercentage}%</div>
                  <div class="text-xs text-purple-600">Enriched</div>
                </div>
                <div class="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg text-center">
                  <div class="text-2xl font-bold text-orange-700">{insightsSummary.neverAccessedPercentage}%</div>
                  <div class="text-xs text-orange-600">Never Accessed</div>
                </div>
                <div class="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg text-center">
                  <div class="text-2xl font-bold text-red-700">{insightsSummary.deadLinks}</div>
                  <div class="text-xs text-red-600">Dead Links</div>
                </div>
                <div class="bg-gradient-to-br from-cyan-50 to-cyan-100 p-4 rounded-lg text-center">
                  <div class="text-2xl font-bold text-cyan-700">{insightsSummary.uniqueDomains}</div>
                  <div class="text-xs text-cyan-600">Unique Domains</div>
                </div>
              </div>
            {/if}
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <!-- Content Freshness -->
              <div>
                <canvas id="freshnessChart" width="400" height="300"></canvas>
              </div>
              
              <!-- Top Categories -->
              <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-lg font-medium text-gray-900 mb-4">Top Categories</h4>
                {#if insightsSummary && insightsSummary.topCategories}
                  <div class="space-y-2">
                    {#each insightsSummary.topCategories as [category, count]}
                      <div class="flex items-center justify-between py-2 border-b border-gray-200">
                        <span class="font-medium text-gray-700 capitalize">{category}</span>
                        <div class="flex items-center">
                          <div class="w-24 bg-gray-200 rounded-full h-2 mr-3">
                            <div class="bg-purple-600 h-2 rounded-full" style="width: {Math.min(100, (count / insightsSummary.topCategories[0][1]) * 100)}%"></div>
                          </div>
                          <span class="text-sm font-bold text-gray-600">{count}</span>
                        </div>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="text-sm text-gray-500">No category data available.</p>
                {/if}
              </div>
            </div>
          </div>
          
          <!-- Summary Statistics -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white p-6 rounded-lg shadow text-center">
              <div class="text-3xl font-bold text-blue-600">{bookmarks.length || 0}</div>
              <div class="text-gray-500">Total Bookmarks</div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow text-center">
              <div class="text-3xl font-bold text-green-600">{duplicates.length}</div>
              <div class="text-gray-500">Duplicate Groups</div>
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
          <!-- Quick Stats Summary -->
          {#if quickStats}
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div class="bg-white p-4 rounded-lg shadow text-center">
                <div class="text-2xl font-bold text-blue-600">{quickStats.total}</div>
                <div class="text-xs text-gray-500">Total Bookmarks</div>
              </div>
              <div class="bg-white p-4 rounded-lg shadow text-center">
                <div class="text-2xl font-bold text-red-600">{quickStats.duplicateGroups}</div>
                <div class="text-xs text-gray-500">Duplicate Groups</div>
              </div>
              <div class="bg-white p-4 rounded-lg shadow text-center">
                <div class="text-2xl font-bold text-orange-600">{quickStats.deadLinks}</div>
                <div class="text-xs text-gray-500">Dead Links</div>
              </div>
              <div class="bg-white p-4 rounded-lg shadow text-center">
                <div class="text-2xl font-bold text-purple-600">{quickStats.uniqueDomains}</div>
                <div class="text-xs text-gray-500">Unique Domains</div>
              </div>
              <div class="bg-white p-4 rounded-lg shadow text-center">
                <div class="text-2xl font-bold text-green-600">{quickStats.addedThisWeek}</div>
                <div class="text-xs text-gray-500">Added This Week</div>
              </div>
              <div class="bg-white p-4 rounded-lg shadow text-center">
                <div class="text-2xl font-bold text-cyan-600">{quickStats.addedThisMonth}</div>
                <div class="text-xs text-gray-500">Added This Month</div>
              </div>
            </div>
          {/if}
          
          <!-- Enrichment Panel -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div>
                <h3 class="text-lg font-medium text-gray-900">
                  <svg class="w-5 h-5 inline-block mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
                  </svg>
                  Bookmark Enrichment
                </h3>
                <p class="text-sm text-gray-500 mt-1">
                  Fetch metadata (descriptions, categories, keywords) for your bookmarks
                </p>
              </div>
              <button
                on:click={handleRunEnrichment}
                disabled={runningEnrichment}
                class="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50 flex-shrink-0"
              >
                {#if runningEnrichment}
                  <span class="flex items-center">
                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Enriching...
                  </span>
                {:else}
                  Run Enrichment
                {/if}
              </button>
            </div>
            <div class="p-6">
              {#if enrichmentStatus}
                <div class="flex flex-wrap gap-4 text-sm mb-4">
                  <span class="text-gray-600">
                    Queue: <strong class="text-purple-600">{enrichmentStatus.queueSize}</strong> bookmarks pending
                  </span>
                  <span class="text-gray-600">
                    Status: <strong class="{enrichmentStatus.enabled ? 'text-green-600' : 'text-gray-500'}">{enrichmentStatus.enabled ? 'Enabled' : 'Disabled'}</strong>
                  </span>
                </div>
              {/if}
              
              <!-- Enrichment Configuration -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Batch Size
                    <span class="text-xs text-gray-500 font-normal">(how many bookmarks to process)</span>
                    <input 
                      type="number" 
                      min="5" 
                      max="100" 
                      bind:value={enrichmentBatchSize}
                      class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      disabled={runningEnrichment}
                    />
                  </label>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Concurrency
                    <span class="text-xs text-gray-500 font-normal">(parallel requests)</span>
                    <input 
                      type="number" 
                      min="1" 
                      max="10" 
                      bind:value={enrichmentConcurrency}
                      class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      disabled={runningEnrichment}
                    />
                  </label>
                  <p class="text-xs text-gray-500 mt-1">
                    Higher = faster, but more resource intensive (recommended: 3-5)
                  </p>
                </div>
              </div>
              
              <!-- Real-time Progress Display -->
              {#if enrichmentProgress && runningEnrichment}
                <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div class="mb-3">
                    <div class="flex justify-between items-center mb-2">
                      <span class="text-sm font-medium text-blue-900">Processing...</span>
                      <span class="text-sm text-blue-700">
                        {enrichmentProgress.completed || enrichmentProgress.current} / {enrichmentProgress.total} completed
                      </span>
                    </div>
                    <div class="w-full bg-blue-200 rounded-full h-2">
                      <div 
                        class="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                        style="width: {((enrichmentProgress.completed || enrichmentProgress.current) / enrichmentProgress.total * 100)}%"
                      ></div>
                    </div>
                  </div>
                  
                  {#if enrichmentProgress.title}
                    <div class="text-xs text-blue-800 space-y-1">
                      <div class="font-medium truncate" title="{enrichmentProgress.url}">
                        {enrichmentProgress.status === 'processing' ? '⏳' : enrichmentProgress.status === 'completed' ? '✓' : '✗'} 
                        {enrichmentProgress.title}
                      </div>
                      <div class="text-blue-600 truncate text-[10px]">{enrichmentProgress.url}</div>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Results Display -->
              {#if enrichmentResult}
                <div class="mt-4 p-4 rounded-lg {enrichmentResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}">
                  {#if enrichmentResult.error}
                    <div class="text-red-700 text-sm">
                      <strong>Error:</strong> {enrichmentResult.error}
                    </div>
                  {:else}
                    <div class="text-green-700 text-sm space-y-1">
                      <div><strong>Enrichment Complete!</strong></div>
                      <div>Processed: {enrichmentResult.processed || 0} bookmarks</div>
                      <div>Successful: {enrichmentResult.success || 0}</div>
                      {#if enrichmentResult.failed > 0}
                        <div class="text-orange-600">Failed: {enrichmentResult.failed}</div>
                      {/if}
                      {#if enrichmentResult.skipped > 0}
                        <div class="text-gray-600">Skipped (already enriched): {enrichmentResult.skipped}</div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Progress Logs (collapsible) -->
              {#if enrichmentLogs.length > 0}
                <details class="mt-4">
                  <summary class="cursor-pointer text-sm text-gray-600 hover:text-gray-800 font-medium">View Detailed Logs ({enrichmentLogs.length})</summary>
                  <div class="mt-2 max-h-64 overflow-y-auto bg-gray-50 rounded p-3 space-y-1 text-xs font-mono">
                    {#each enrichmentLogs.slice().reverse() as log}
                      <div class="{log.status === 'completed' ? 'text-green-700' : log.status === 'failed' || log.status === 'error' ? 'text-red-700' : 'text-gray-600'}">
                        <span class="text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</span> 
                        [{log.current}/{log.total}] 
                        {log.status === 'completed' ? '✓' : log.status === 'failed' || log.status === 'error' ? '✗' : '⏳'} 
                        <span class="truncate inline-block max-w-md" title="{log.url}">{log.title || log.url}</span>
                      </div>
                    {/each}
                  </div>
                </details>
              {:else if !enrichmentResult}
                <p class="text-gray-500 text-sm">
                  Click "Run Enrichment" to fetch metadata for bookmarks that haven't been enriched yet. 
                  Only new bookmarks without descriptions or categories will be processed.
                </p>
              {/if}
            </div>
          </div>
          
          <!-- Dead Links Section -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                Dead Links {#if !loadingDeadLinks}({deadLinks.length}){/if}
              </h3>
              <p class="text-xs text-gray-500 mt-1">Bookmarks detected as unreachable during enrichment</p>
            </div>
            <div class="p-6">
              {#if loadingDeadLinks}
                <div class="flex items-center justify-center py-8">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
                  <span class="ml-3 text-gray-500">Loading dead links...</span>
                </div>
              {:else if deadLinks.length === 0}
                <p class="text-gray-500">No dead links detected. Run enrichment to check bookmark availability.</p>
              {:else}
                <div class="space-y-2 max-h-[32rem] overflow-y-auto">
                  {#each deadLinks.slice(0, deadLinksDisplayLimit) as bookmark}
                    <div class="p-3 bg-red-50 rounded border border-red-200">
                      <div class="flex items-start justify-between">
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-medium text-gray-800 truncate">{bookmark.title}</div>
                          <div class="text-xs text-gray-500 truncate">{bookmark.url}</div>
                          <div class="text-xs text-red-600 mt-1">
                            Last checked: {bookmark.lastChecked ? new Date(bookmark.lastChecked).toLocaleDateString() : 'Unknown'}
                          </div>
                        </div>
                        <a 
                          href={bookmark.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          class="ml-2 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 flex-shrink-0"
                        >
                          Try Again
                        </a>
                      </div>
                    </div>
                  {/each}
                </div>
                {#if deadLinks.length > deadLinksDisplayLimit}
                  <div class="mt-4 text-center">
                    <button
                      on:click={loadMoreDeadLinks}
                      class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                    >
                      Load More ({deadLinksDisplayLimit} of {deadLinks.length} shown)
                    </button>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
          
          <!-- Duplicates -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                Duplicate Bookmarks {#if !loadingDuplicates}({duplicates.length} groups){/if}
              </h3>
            </div>
            <div class="p-6">
              {#if loadingDuplicates}
                <div class="flex items-center justify-center py-8">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span class="ml-3 text-gray-500">Finding duplicates...</span>
                </div>
              {:else if duplicates.length === 0}
                <p class="text-gray-500">No duplicate bookmarks found. Great!</p>
              {:else}
                <div class="space-y-6 max-h-[32rem] overflow-y-auto">
                  {#each duplicates.slice(0, duplicatesDisplayLimit) as group, groupIndex}
                    <div class="border border-gray-200 rounded-lg p-4">
                      <h4 class="font-medium text-gray-900 mb-3 truncate" title={group[0].url}>
                        {group[0].url}
                      </h4>
                      <div class="space-y-2">
                        {#each group as bookmark, index}
                          <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div class="flex-1 min-w-0">
                              <div class="text-sm font-medium truncate">{bookmark.title}</div>
                              <div class="text-xs text-gray-500">
                                {bookmark.folderPath || 'No folder'}
                              </div>
                            </div>
                            {#if index > 0}
                              <button
                                on:click={() => deleteDuplicate(bookmark.id, groupIndex)}
                                class="ml-4 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex-shrink-0"
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
                {#if duplicates.length > duplicatesDisplayLimit}
                  <div class="mt-4 text-center">
                    <button
                      on:click={loadMoreDuplicates}
                      class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                    >
                      Load More ({duplicatesDisplayLimit} of {duplicates.length} shown)
                    </button>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
          
          <!-- Similar Bookmarks -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                Similar Bookmarks {#if !loadingSimilar}({similarBookmarks.length} pairs){/if}
              </h3>
              <p class="text-xs text-gray-500 mt-1">Bookmarks with similar titles but different URLs</p>
            </div>
            <div class="p-6">
              {#if loadingSimilar}
                <div class="flex items-center justify-center py-8">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600"></div>
                  <span class="ml-3 text-gray-500">Analyzing similarities...</span>
                </div>
              {:else if similarBookmarks.length === 0}
                <p class="text-gray-500">No similar bookmarks found.</p>
              {:else}
                <div class="space-y-4 max-h-[32rem] overflow-y-auto">
                  {#each similarBookmarks.slice(0, similarDisplayLimit) as [bookmark1, bookmark2, similarity], pairIndex}
                    <div class="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                      <div class="flex justify-between items-center mb-2">
                        <div class="text-xs text-yellow-700">
                          {Math.round(similarity * 100)}% similar
                        </div>
                      </div>
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="p-2 bg-white rounded flex justify-between items-start">
                          <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium truncate">{bookmark1.title}</div>
                            <div class="text-xs text-gray-500 truncate">{bookmark1.url}</div>
                          </div>
                          <button
                            on:click={() => deleteSimilarBookmark(bookmark1.id, pairIndex)}
                            class="ml-2 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex-shrink-0"
                            title="Remove this bookmark"
                          >
                            Remove
                          </button>
                        </div>
                        <div class="p-2 bg-white rounded flex justify-between items-start">
                          <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium truncate">{bookmark2.title}</div>
                            <div class="text-xs text-gray-500 truncate">{bookmark2.url}</div>
                          </div>
                          <button
                            on:click={() => deleteSimilarBookmark(bookmark2.id, pairIndex)}
                            class="ml-2 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex-shrink-0"
                            title="Remove this bookmark"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
                {#if similarBookmarks.length > similarDisplayLimit}
                  <div class="mt-4 text-center">
                    <button
                      on:click={loadMoreSimilar}
                      class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                    >
                      Load More ({similarDisplayLimit} of {similarBookmarks.length} shown)
                    </button>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
          
          <!-- Malformed URLs -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                Invalid URLs {#if !loadingMalformed}({malformedUrls.length}){/if}
              </h3>
              <p class="text-xs text-gray-500 mt-1">Bookmarks with unrecognized URL schemes</p>
            </div>
            <div class="p-6">
              {#if loadingMalformed}
                <div class="flex items-center justify-center py-8">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <span class="ml-3 text-gray-500">Checking URLs...</span>
                </div>
              {:else if malformedUrls.length === 0}
                <p class="text-gray-500">All bookmark URLs are valid.</p>
              {:else}
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {#each malformedUrls as bookmark}
                    <BookmarkCard {bookmark} />
                  {/each}
                </div>
              {/if}
            </div>
          </div>
          
          <!-- Backup & Restore Panel -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                <svg class="w-5 h-5 inline-block mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path>
                </svg>
                Backup & Restore
              </h3>
              <p class="text-sm text-gray-500 mt-1">
                Protect your enrichment data - backup regularly!
              </p>
            </div>
            <div class="p-6">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Backup Section -->
                <div class="border border-gray-200 rounded-lg p-4">
                  <h4 class="font-medium text-gray-900 mb-3">Create Backup</h4>
                  <p class="text-sm text-gray-600 mb-4">
                    Download a complete backup of your bookmarks including all enrichment data, categories, and metadata.
                  </p>
                  <button
                    on:click={handleDownloadBackup}
                    disabled={backupInProgress}
                    class="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center"
                  >
                    {#if backupInProgress}
                      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating Backup...
                    {:else}
                      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                      </svg>
                      Download Backup
                    {/if}
                  </button>
                </div>
                
                <!-- Restore Section -->
                <div class="border border-gray-200 rounded-lg p-4">
                  <h4 class="font-medium text-gray-900 mb-3">Restore Backup</h4>
                  <p class="text-sm text-gray-600 mb-4">
                    Restore from a backup file. Your current data will be auto-backed up first.
                  </p>
                  
                  <label class="block">
                    <span class="sr-only">Choose backup file</span>
                    <input 
                      type="file" 
                      accept=".json"
                      on:change={handleFileSelect}
                      class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </label>
                  
                  {#if backupValidation}
                    <div class="mt-3 p-3 rounded-md {backupValidation.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
                      {#if backupValidation.valid}
                        <p class="text-sm text-green-800">
                          ✓ Valid backup from {backupValidation.createdAt}<br>
                          <span class="text-xs text-green-600">
                            {backupValidation.metadata?.totalBookmarks || 0} bookmarks, 
                            {backupValidation.metadata?.enrichedCount || 0} enriched
                          </span>
                        </p>
                        <button
                          on:click={handleRestoreBackup}
                          disabled={restoreInProgress}
                          class="mt-2 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                        >
                          {restoreInProgress ? 'Restoring...' : 'Restore This Backup'}
                        </button>
                      {:else}
                        <p class="text-sm text-red-800">✗ Invalid backup file</p>
                        <ul class="text-xs text-red-600 mt-1">
                          {#each backupValidation.issues as issue}
                            <li>• {issue}</li>
                          {/each}
                        </ul>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
              
              <!-- Auto-backups Section -->
              <div class="mt-6 border-t border-gray-200 pt-6">
                <div class="flex justify-between items-center mb-3">
                  <h4 class="font-medium text-gray-900">Auto-Backups</h4>
                  <button
                    on:click={loadAutoBackups}
                    class="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Refresh
                  </button>
                </div>
                <p class="text-sm text-gray-600 mb-3">
                  Auto-backups are created before restore operations and enrichment runs. Last 3 are kept.
                </p>
                
                {#if autoBackups.length === 0}
                  <p class="text-gray-500 text-sm">No auto-backups yet. They will appear after your first restore or enrichment run.</p>
                {:else}
                  <div class="space-y-2">
                    {#each autoBackups as backup, index}
                      <div class="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                        <div>
                          <span class="text-sm font-medium text-gray-900">
                            {new Date(backup.createdAt).toLocaleString()}
                          </span>
                          <span class="text-xs text-gray-500 ml-2">
                            ({backup.metadata?.totalBookmarks || 0} bookmarks, {backup.metadata?.enrichedCount || 0} enriched)
                          </span>
                        </div>
                        <button
                          on:click={() => handleRestoreAutoBackup(index)}
                          disabled={restoreInProgress}
                          class="text-sm px-3 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                        >
                          Restore
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>
    {:else if currentView === 'dataExplorer'}
      <DataExplorer />
    {/if}
  </div>
</div>
