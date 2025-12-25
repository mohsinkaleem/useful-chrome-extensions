<script>
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import BookmarkCard from './BookmarkCard.svelte';
  import BookmarkListItem from './BookmarkListItem.svelte';
  import SearchBar from './SearchBar.svelte';
  import Sidebar from './Sidebar.svelte';
  import DataExplorer from './DataExplorer.svelte';
  import VisualInsights from './VisualInsights.svelte';
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
    restoreFromAutoBackup,
    // Platform backfill
    backfillPlatformData,
    getPlatformDataStats
  } from './db.js';
  
  // Import new insights functions
  import {
    getDomainHierarchy,
    getDomainTreemapData,
    getContentFreshness,
    getInsightsSummary,
    getEventStatistics,
    getHourlyAccessPatterns,
    getDeadLinkInsights
  } from './insights.js';
  
  // Import enhanced similarity functions
  import {
    findSimilarBookmarksEnhancedFuzzy,
    findUselessBookmarks,
    getUselessBookmarkIds
  } from './similarity.js';
  
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
  let forceReenrich = false; // Force re-enrichment even for recently enriched bookmarks
  
  // Platform backfill state
  let runningPlatformBackfill = false;
  let platformBackfillProgress = null;
  let platformBackfillResult = null;
  
  // Advanced insights data
  let domainHierarchy = [];
  let contentFreshness = [];
  let insightsSummary = null;
  let eventStats = null;
  let deadLinkInsights = null;
  
  // Health section loading states (for progressive loading)
  let loadingDuplicates = false;
  let loadingSimilar = false;
  let loadingMalformed = false;
  let deletingDeadLinks = false;
  let loadingUseless = false;
  let loadingEnhancedSimilar = false;
  
  // Health section display limits (for on-demand loading)
  let duplicatesDisplayLimit = 10;
  let similarDisplayLimit = 10;
  let deadLinksDisplayLimit = 10;
  
  // Enhanced similarity detection
  let enhancedSimilarPairs = [];
  let enhancedSimilarStats = null;
  let enhancedSimilarCacheInfo = null; // Cache info for similarity detection
  let selectedComparisonPair = null; // For side-by-side comparison modal
  
  // Useless bookmarks detection
  let uselessBookmarks = null;
  let uselessDisplayLimits = {
    deadLinks: 10,
    oldUnused: 10,
    genericTitles: 10,
    temporaryUrls: 10,
    lowScore: 10
  };
  let deletingUseless = false;
  
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
  
  // Reference to Sidebar component for clearing filters
  let sidebarRef;
  
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
        
        // Apply additional filters (domains, folders, date range, platforms, creators, contentTypes) if any
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
        // Platform filter
        if (currentFilters.platforms && currentFilters.platforms.length > 0) {
          filteredResults = filteredResults.filter(b => currentFilters.platforms.includes(b.platform || 'other'));
        }
        // Creators filter
        if (currentFilters.creators && currentFilters.creators.length > 0) {
          filteredResults = filteredResults.filter(b => {
            if (!b.creator) return false;
            const bookmarkCreatorKey = `${b.platform || 'other'}:${b.creator}`;
            return currentFilters.creators.some(c => c.key === bookmarkCreatorKey);
          });
        }
        // Content types filter
        if (currentFilters.contentTypes && currentFilters.contentTypes.length > 0) {
          filteredResults = filteredResults.filter(b => currentFilters.contentTypes.includes(b.contentType));
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
      
      // Dead link insights load
      getDeadLinkInsights().then(insights => {
        deadLinkInsights = insights;
      }).catch(err => {
        console.error('Error loading dead link insights:', err);
      });
      
      // Malformed URLs load
      findMalformedUrls().then(malformed => {
        malformedUrls = malformed;
        loadingMalformed = false;
      }).catch(err => {
        console.error('Error loading malformed URLs:', err);
        loadingMalformed = false;
      });
      
      // Similar bookmarks - skip old algorithm, only use enhanced
      // Set to not loading since we don't auto-load anymore
      loadingSimilar = false;
      similarBookmarks = [];
      
      // Enhanced similar bookmarks with fuzzy matching
      // Try to load from cache first to show pre-computed results
      loadingEnhancedSimilar = true;
      findSimilarBookmarksEnhancedFuzzy({ 
        minSimilarity: 0.4, 
        maxPairs: 100,
        prioritizeSameDomain: true,
        forceRefresh: false,
        useCache: true
      }).then(result => {
        if (result.fromCache && result.pairs.length > 0) {
          enhancedSimilarPairs = result.pairs;
          enhancedSimilarStats = result.stats;
          enhancedSimilarCacheInfo = {
            fromCache: result.fromCache,
            cachedAt: result.cachedAt,
            cacheAge: result.cacheAge
          };
        }
        loadingEnhancedSimilar = false;
      }).catch(err => {
        console.error('Error loading cached similar pairs:', err);
        loadingEnhancedSimilar = false;
      });
      
      // Useless bookmarks detection - ON-DEMAND ONLY
      loadingUseless = false;
      // Note: uselessBookmarks will be loaded on demand
      
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
  
  // ============================================================================
  // VISUAL INSIGHTS EVENT HANDLERS
  // ============================================================================
  
  function handleInsightCategoryFilter(event) {
    const { category } = event.detail;
    currentFilters = { ...currentFilters, searchQuery: `category:${category}` };
    currentView = 'bookmarks';
    loadBookmarksPaginated(0, false);
  }
  
  function handleInsightDomainFilter(event) {
    const { domain } = event.detail;
    currentFilters = { ...currentFilters, domains: [domain] };
    currentView = 'bookmarks';
    loadBookmarksPaginated(0, false);
  }
  
  async function handleFilterByAccessed(event) {
    // Filter to show only accessed bookmarks
    searchQuery = 'accessed:yes';
    currentView = 'bookmarks';
    await handleSearch(searchQuery);
  }
  
  async function handleFilterByStale() {
    // Filter to show stale/unused bookmarks
    searchQuery = 'stale:yes';
    currentView = 'bookmarks';
    await handleSearch(searchQuery);
  }
  
  async function handleFilterByDead() {
    // Switch to health view and show dead links
    currentView = 'health';
    await loadHealthData();
  }
  
  async function handleFilterByUnenriched() {
    searchQuery = 'enriched:no';
    currentView = 'bookmarks';
    await handleSearch(searchQuery);
  }
  
  async function handleFilterByUncategorized() {
    searchQuery = 'category:uncategorized';
    currentView = 'bookmarks';
    await handleSearch(searchQuery);
  }
  
  function handleShowDuplicates() {
    currentView = 'health';
    loadHealthData();
  }
  
  async function handleBulkDeleteFromInsights(event) {
    const { ids } = event.detail;
    if (!ids || ids.length === 0) return;
    
    if (confirm(`Are you sure you want to delete ${ids.length} bookmark(s)?`)) {
      try {
        await deleteBookmarks(ids);
        // Refresh the current view
        await loadBookmarksPaginated(0, false);
      } catch (err) {
        console.error('Error deleting bookmarks:', err);
        alert('Failed to delete some bookmarks. Please try again.');
      }
    }
  }
  
  async function handleSearchFromInsights(event) {
    const { query } = event.detail;
    searchQuery = query;
    currentView = 'bookmarks';
    await handleSearch(query);
  }
  
  // ============================================================================
  
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
        concurrency: enrichmentConcurrency,
        force: forceReenrich
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
  
  // Platform data backfill - parses URLs to extract platform/creator info without network requests
  async function handlePlatformBackfill() {
    runningPlatformBackfill = true;
    platformBackfillProgress = null;
    platformBackfillResult = null;
    
    try {
      const result = await backfillPlatformData((processed, total) => {
        platformBackfillProgress = { processed, total };
      });
      
      platformBackfillResult = result;
      
      // Refresh data after backfill
      await loadBookmarksPaginated(0, false);
      
    } catch (err) {
      console.error('Error during platform backfill:', err);
      platformBackfillResult = { error: err.message };
    } finally {
      runningPlatformBackfill = false;
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
  
  // Delete a single dead link
  async function deleteDeadLink(bookmarkId) {
    try {
      // First check if the bookmark still exists
      const existingBookmarks = await chrome.bookmarks.get([bookmarkId]);
      if (existingBookmarks && existingBookmarks.length > 0) {
        await chrome.bookmarks.remove(bookmarkId);
        console.log(`Deleted dead link: ${bookmarkId}`);
      } else {
        console.log(`Bookmark ${bookmarkId} no longer exists`);
      }
      
      // Update the dead links list without full reload
      deadLinks = deadLinks.filter(b => b.id !== bookmarkId);
      
      // Update dead link insights
      if (deadLinkInsights) {
        deadLinkInsights = {
          ...deadLinkInsights,
          total: deadLinkInsights.total - 1
        };
      }
      
      // Remove from IndexedDB
      await deleteBookmark(bookmarkId);
      
    } catch (err) {
      console.error('Error deleting dead link:', err);
    }
  }
  
  // Delete all dead links
  async function deleteAllDeadLinks() {
    if (deadLinks.length === 0) return;
    
    const confirmed = confirm(`Are you sure you want to delete all ${deadLinks.length} dead links? This action cannot be undone.`);
    if (!confirmed) return;
    
    deletingDeadLinks = true;
    
    try {
      const bookmarkIds = deadLinks.map(b => b.id);
      const result = await deleteBookmarks(bookmarkIds);
      
      console.log(`Deleted ${result.success} dead links, ${result.errors.length} errors`);
      
      // Clear the dead links list
      deadLinks = [];
      deadLinkInsights = null;
      
      // Refresh dead link insights
      getDeadLinkInsights().then(insights => {
        deadLinkInsights = insights;
      });
      
    } catch (err) {
      console.error('Error deleting all dead links:', err);
      // Reload dead links on error
      getDeadLinks().then(links => {
        deadLinks = links;
      });
    } finally {
      deletingDeadLinks = false;
    }
  }
  
  // Re-enrich dead links state
  let reEnrichingDeadLinks = false;
  let reEnrichProgress = null;
  let reEnrichResult = null;
  
  // Dead link re-check configuration
  let deadLinkBatchSize = 50; // How many dead links to process at once
  let deadLinkConcurrency = 3; // Parallel requests for re-checking
  
  // Re-run enrichment on dead links to check if they're alive again
  async function reEnrichDeadLinks() {
    if (deadLinks.length === 0) return;
    
    const toProcess = deadLinkBatchSize > 0 && deadLinkBatchSize < deadLinks.length ? deadLinkBatchSize : deadLinks.length;
    const remaining = deadLinks.length - toProcess;
    const remainingText = remaining > 0 ? ` (${remaining} will remain for next batch)` : '';
    
    const confirmed = confirm(`Re-check ${toProcess} dead links?${remainingText}\n\nThis will attempt to fetch each URL again to verify if it's still unreachable.`);
    if (!confirmed) return;
    
    reEnrichingDeadLinks = true;
    reEnrichProgress = null;
    reEnrichResult = null;
    
    // Listen for progress updates
    const progressListener = (message) => {
      if (message.action === 'reEnrichProgress' && message.progress) {
        reEnrichProgress = message.progress;
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);
    
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'reEnrichDeadLinks',
        batchSize: deadLinkBatchSize,
        concurrency: deadLinkConcurrency
      });
      
      if (response.success) {
        reEnrichResult = response.results;
        
        // Reload dead links to show updated list
        const links = await getDeadLinks();
        deadLinks = links;
        
        // Refresh insights
        const insights = await getDeadLinkInsights();
        deadLinkInsights = insights;
      } else {
        console.error('Error re-enriching dead links:', response.error);
        reEnrichResult = { error: response.error };
      }
    } catch (err) {
      console.error('Error re-enriching dead links:', err);
      reEnrichResult = { error: err.message };
    } finally {
      reEnrichingDeadLinks = false;
      chrome.runtime.onMessage.removeListener(progressListener);
    }
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
  
  // Run smart similar detection on demand
  async function runSmartSimilarDetection(forceRefresh = false) {
    loadingEnhancedSimilar = true;
    enhancedSimilarPairs = [];
    enhancedSimilarStats = null;
    enhancedSimilarCacheInfo = null;
    
    try {
      const result = await findSimilarBookmarksEnhancedFuzzy({ 
        minSimilarity: 0.4, 
        maxPairs: 100,
        prioritizeSameDomain: true,
        forceRefresh: forceRefresh
      });
      enhancedSimilarPairs = result.pairs;
      enhancedSimilarStats = result.stats;
      enhancedSimilarCacheInfo = {
        fromCache: result.fromCache,
        cachedAt: result.cachedAt,
        cacheAge: result.cacheAge
      };
    } catch (err) {
      console.error('Error running smart similar detection:', err);
    } finally {
      loadingEnhancedSimilar = false;
    }
  }
  
  // Run useless bookmarks detection on demand
  async function runUselessDetection() {
    loadingUseless = true;
    uselessBookmarks = null;
    
    try {
      uselessBookmarks = await findUselessBookmarks();
    } catch (err) {
      console.error('Error finding useless bookmarks:', err);
    } finally {
      loadingUseless = false;
    }
  }
  
  // Enhanced similar bookmarks functions
  function openComparisonModal(pair) {
    selectedComparisonPair = pair;
  }
  
  function closeComparisonModal() {
    selectedComparisonPair = null;
  }
  
  async function deleteFromComparison(bookmarkId) {
    try {
      const existingBookmarks = await chrome.bookmarks.get([bookmarkId]);
      if (existingBookmarks && existingBookmarks.length > 0) {
        await chrome.bookmarks.remove(bookmarkId);
      }
      
      await deleteBookmark(bookmarkId);
      
      // Remove pairs containing this bookmark
      enhancedSimilarPairs = enhancedSimilarPairs.filter(
        p => p.bookmark1.id !== bookmarkId && p.bookmark2.id !== bookmarkId
      );
      
      // Close modal if the deleted bookmark was in comparison
      if (selectedComparisonPair && 
          (selectedComparisonPair.bookmark1.id === bookmarkId || 
           selectedComparisonPair.bookmark2.id === bookmarkId)) {
        closeComparisonModal();
      }
      
    } catch (err) {
      console.error('Error deleting bookmark from comparison:', err);
    }
  }
  
  // Useless bookmarks functions
  function loadMoreUseless(category) {
    uselessDisplayLimits = {
      ...uselessDisplayLimits,
      [category]: uselessDisplayLimits[category] + 10
    };
  }
  
  async function deleteUselessBookmark(bookmarkId, category) {
    try {
      const existingBookmarks = await chrome.bookmarks.get([bookmarkId]);
      if (existingBookmarks && existingBookmarks.length > 0) {
        await chrome.bookmarks.remove(bookmarkId);
      }
      
      await deleteBookmark(bookmarkId);
      
      // Update the useless bookmarks list
      if (uselessBookmarks) {
        uselessBookmarks = {
          ...uselessBookmarks,
          [category]: uselessBookmarks[category].filter(b => b.id !== bookmarkId),
          summary: {
            ...uselessBookmarks.summary,
            total: uselessBookmarks.summary.total - 1,
            byCategory: {
              ...uselessBookmarks.summary.byCategory,
              [category]: uselessBookmarks.summary.byCategory[category] - 1
            }
          }
        };
      }
      
    } catch (err) {
      console.error('Error deleting useless bookmark:', err);
    }
  }
  
  async function deleteAllUselessInCategory(category) {
    if (!uselessBookmarks || !uselessBookmarks[category] || uselessBookmarks[category].length === 0) return;
    
    const count = uselessBookmarks[category].length;
    const confirmed = confirm(`Are you sure you want to delete all ${count} bookmarks in "${category}"? This action cannot be undone.`);
    if (!confirmed) return;
    
    deletingUseless = true;
    
    try {
      const bookmarkIds = uselessBookmarks[category].map(b => b.id);
      await deleteBookmarks(bookmarkIds);
      
      // Update the useless bookmarks list
      uselessBookmarks = {
        ...uselessBookmarks,
        [category]: [],
        summary: {
          ...uselessBookmarks.summary,
          total: uselessBookmarks.summary.total - count,
          byCategory: {
            ...uselessBookmarks.summary.byCategory,
            [category]: 0
          }
        }
      };
      
    } catch (err) {
      console.error('Error deleting useless bookmarks:', err);
    } finally {
      deletingUseless = false;
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
          <Sidebar bind:this={sidebarRef} on:filter={handleFilter} {searchResultStats} isSearchActive={!!searchQuery} />
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
              <div class="flex items-center gap-3">
                <h2 class="text-lg font-medium text-gray-900">
                  {totalCount} bookmark{totalCount !== 1 ? 's' : ''}
                  {#if currentFilters.domains.length > 0 || currentFilters.folders.length > 0 || currentFilters.dateRange || currentFilters.searchQuery}
                    <span class="text-sm text-gray-500">
                      (filtered)
                    </span>
                  {/if}
                </h2>
                <!-- Clear Filters Button -->
                {#if currentFilters.domains.length > 0 || currentFilters.folders.length > 0 || currentFilters.dateRange}
                  <button
                    on:click={() => { if (sidebarRef) sidebarRef.clearAllFilters(); }}
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
                    title="Clear all sidebar filters"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                    Clear Filters
                  </button>
                {/if}
              </div>
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
      <!-- New Visual Insights Component -->
      <VisualInsights 
        on:filterByCategory={handleInsightCategoryFilter}
        on:filterByDomain={handleInsightDomainFilter}
        on:filterByAccessed={handleFilterByAccessed}
        on:filterByStale={handleFilterByStale}
        on:filterByDead={handleFilterByDead}
        on:filterByUnenriched={handleFilterByUnenriched}
        on:filterByUncategorized={handleFilterByUncategorized}
        on:showDuplicates={handleShowDuplicates}
        on:deleteBookmarks={handleBulkDeleteFromInsights}
        on:searchQuery={handleSearchFromInsights}
      />
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
                <div class="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div class="text-center">
                      <div class="text-xl font-bold text-purple-700">{enrichmentStatus.pendingCount || enrichmentStatus.queueSize || 0}</div>
                      <div class="text-xs text-purple-600">Pending</div>
                    </div>
                    <div class="text-center">
                      <div class="text-xl font-bold text-green-700">{enrichmentStatus.enrichedCount || 0}</div>
                      <div class="text-xs text-green-600">Enriched</div>
                    </div>
                    <div class="text-center">
                      <div class="text-xl font-bold text-blue-700">{enrichmentStatus.totalBookmarks || 0}</div>
                      <div class="text-xs text-blue-600">Total HTTP</div>
                    </div>
                    <div class="text-center">
                      <div class="text-xl font-bold {enrichmentStatus.enabled ? 'text-green-700' : 'text-gray-500'}">
                        {enrichmentStatus.enabled ? '✓' : '○'}
                      </div>
                      <div class="text-xs {enrichmentStatus.enabled ? 'text-green-600' : 'text-gray-500'}">
                        {enrichmentStatus.enabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                  </div>
                  {#if enrichmentStatus.pendingCount > 0 && enrichmentStatus.totalBookmarks > 0}
                    <div class="mt-3">
                      <div class="flex justify-between text-xs text-purple-600 mb-1">
                        <span>Progress</span>
                        <span>{((enrichmentStatus.enrichedCount / enrichmentStatus.totalBookmarks) * 100).toFixed(1)}%</span>
                      </div>
                      <div class="w-full bg-purple-200 rounded-full h-2">
                        <div 
                          class="bg-purple-600 h-2 rounded-full transition-all duration-300"
                          style="width: {(enrichmentStatus.enrichedCount / enrichmentStatus.totalBookmarks) * 100}%"
                        ></div>
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
              
              <!-- Enrichment Configuration -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                <div>
                  <label class="flex items-start gap-2 cursor-pointer mt-2">
                    <input 
                      type="checkbox" 
                      bind:checked={forceReenrich}
                      class="mt-0.5 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      disabled={runningEnrichment}
                    />
                    <div>
                      <span class="text-sm font-medium text-gray-700">Force Re-enrich</span>
                      <p class="text-xs text-gray-500 mt-0.5">
                        Re-fetch metadata for bookmarks even if already enriched. Bypasses the queue and processes {enrichmentBatchSize} bookmarks directly.
                      </p>
                      {#if forceReenrich}
                        <p class="text-xs text-purple-600 mt-1 font-medium">
                          ⚡ Will process unenriched bookmarks first, then oldest enriched
                        </p>
                      {/if}
                    </div>
                  </label>
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
          
          <!-- Platform Data Backfill Panel -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div>
                <h3 class="text-lg font-medium text-gray-900">
                  <span class="inline-block mr-2">📱</span>
                  Platform Detection
                </h3>
                <p class="text-sm text-gray-500 mt-1">
                  Extract platform, creator, and content type from bookmark URLs (no network requests)
                </p>
              </div>
              <button
                on:click={handlePlatformBackfill}
                disabled={runningPlatformBackfill}
                class="px-4 py-2 bg-pink-600 text-white text-sm rounded-md hover:bg-pink-700 disabled:opacity-50 flex-shrink-0"
              >
                {#if runningPlatformBackfill}
                  <span class="flex items-center">
                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </span>
                {:else}
                  Detect Platforms
                {/if}
              </button>
            </div>
            <div class="p-6">
              <div class="text-sm text-gray-600 mb-4">
                <p>Parses URLs to identify:</p>
                <div class="flex flex-wrap gap-2 mt-2">
                  <span class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">📺 YouTube</span>
                  <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">💻 GitHub</span>
                  <span class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">📝 Medium</span>
                  <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">👨‍💻 dev.to</span>
                  <span class="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">📰 Substack</span>
                  <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">🐦 Twitter</span>
                  <span class="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">🔴 Reddit</span>
                  <span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">📚 Stack Overflow</span>
                  <span class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">📦 npm</span>
                </div>
              </div>
              
              <!-- Progress -->
              {#if runningPlatformBackfill && platformBackfillProgress}
                <div class="mb-4">
                  <div class="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Processing bookmarks...</span>
                    <span>{platformBackfillProgress.processed} / {platformBackfillProgress.total}</span>
                  </div>
                  <div class="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      class="bg-pink-600 h-2 rounded-full transition-all duration-300"
                      style="width: {(platformBackfillProgress.processed / platformBackfillProgress.total) * 100}%"
                    ></div>
                  </div>
                </div>
              {/if}
              
              <!-- Results -->
              {#if platformBackfillResult}
                <div class="p-4 rounded-lg {platformBackfillResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}">
                  {#if platformBackfillResult.error}
                    <div class="text-red-700 text-sm">
                      <strong>Error:</strong> {platformBackfillResult.error}
                    </div>
                  {:else}
                    <div class="text-green-700 text-sm space-y-2">
                      <div class="font-medium">✅ Platform Detection Complete!</div>
                      <div class="flex flex-wrap gap-4 text-xs">
                        <span>Processed: <strong>{platformBackfillResult.processed}</strong></span>
                        <span>Updated: <strong>{platformBackfillResult.updated}</strong></span>
                        {#if platformBackfillResult.errors > 0}
                          <span class="text-orange-600">Errors: {platformBackfillResult.errors}</span>
                        {/if}
                      </div>
                      {#if platformBackfillResult.platforms && Object.keys(platformBackfillResult.platforms).length > 0}
                        <div class="mt-2 pt-2 border-t border-green-200">
                          <div class="text-xs text-green-600 mb-1">Platforms detected:</div>
                          <div class="flex flex-wrap gap-1">
                            {#each Object.entries(platformBackfillResult.platforms) as [platform, count]}
                              <span class="px-2 py-0.5 bg-white rounded text-xs">{platform}: {count}</span>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {:else if !runningPlatformBackfill}
                <p class="text-gray-500 text-sm">
                  Click "Detect Platforms" to parse all bookmark URLs and extract platform-specific data.
                  This enables filtering by platform, channel, repo, and more.
                </p>
              {/if}
            </div>
          </div>
          
          <!-- Dead Links Section -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 class="text-lg font-medium text-gray-900">
                  Dead Links {#if !loadingDeadLinks}({deadLinks.length}){/if}
                </h3>
                <p class="text-xs text-gray-500 mt-1">Bookmarks detected as unreachable during enrichment</p>
              </div>
              {#if deadLinks.length > 0}
                <div class="flex gap-2 flex-shrink-0">
                  <button
                    on:click={reEnrichDeadLinks}
                    disabled={reEnrichingDeadLinks || deletingDeadLinks}
                    class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    title="Re-check dead links to see if they're alive again"
                  >
                    {#if reEnrichingDeadLinks}
                      <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Re-checking...
                    {:else}
                      🔄 Re-check
                    {/if}
                  </button>
                  <button
                    on:click={deleteAllDeadLinks}
                    disabled={deletingDeadLinks || reEnrichingDeadLinks}
                    class="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {#if deletingDeadLinks}
                      <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Deleting...
                    {:else}
                      🗑️ Delete All
                    {/if}
                  </button>
                </div>
              {/if}
            </div>
            <div class="p-6">
              <!-- Dead Link Re-check Configuration -->
              {#if deadLinks.length > 0 && !reEnrichingDeadLinks}
                <div class="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 class="text-sm font-medium text-gray-700 mb-3">Re-check Configuration</h4>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label for="deadLinkBatchSize" class="block text-sm font-medium text-gray-700 mb-1">
                        Batch Size
                        <span class="text-xs text-gray-500 font-normal">(0 = all)</span>
                      </label>
                      <input 
                        id="deadLinkBatchSize"
                        type="number" 
                        min="0" 
                        max={deadLinks.length}
                        bind:value={deadLinkBatchSize}
                        class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        disabled={reEnrichingDeadLinks}
                      />
                      <p class="text-xs text-gray-500 mt-1">
                        Will process {deadLinkBatchSize > 0 && deadLinkBatchSize < deadLinks.length ? deadLinkBatchSize : deadLinks.length} of {deadLinks.length} dead links
                      </p>
                    </div>
                    <div>
                      <label for="deadLinkConcurrency" class="block text-sm font-medium text-gray-700 mb-1">
                        Concurrency
                        <span class="text-xs text-gray-500 font-normal">(parallel requests)</span>
                      </label>
                      <input 
                        id="deadLinkConcurrency"
                        type="number" 
                        min="1" 
                        max="10" 
                        bind:value={deadLinkConcurrency}
                        class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        disabled={reEnrichingDeadLinks}
                      />
                      <p class="text-xs text-gray-500 mt-1">
                        Higher = faster, but more resource intensive
                      </p>
                    </div>
                  </div>
                </div>
              {/if}
              
              {#if reEnrichingDeadLinks && reEnrichProgress}
                <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-blue-800">Re-checking dead links...</span>
                    <span class="text-sm text-blue-600">{reEnrichProgress.current}/{reEnrichProgress.total}</span>
                  </div>
                  <div class="w-full bg-blue-200 rounded-full h-2 mb-2">
                    <div 
                      class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style="width: {(reEnrichProgress.current / reEnrichProgress.total) * 100}%"
                    ></div>
                  </div>
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-blue-600 truncate flex-1">Checking: {reEnrichProgress.title || reEnrichProgress.url}</p>
                    {#if reEnrichProgress.results}
                      <div class="flex gap-2 text-xs text-blue-600 ml-2">
                        <span class="text-green-600">✓ {reEnrichProgress.results.success}</span>
                        <span class="text-red-600">✗ {reEnrichProgress.results.stillDead}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
              
              {#if reEnrichResult && !reEnrichingDeadLinks}
                <div class="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                  <h4 class="text-sm font-semibold text-green-800 mb-2">Re-check Complete</h4>
                  <div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div class="text-center">
                      <div class="text-lg font-bold text-green-700">{reEnrichResult.total}</div>
                      <div class="text-xs text-green-600">Checked</div>
                    </div>
                    <div class="text-center">
                      <div class="text-lg font-bold text-green-700">{reEnrichResult.success}</div>
                      <div class="text-xs text-green-600">Now Alive</div>
                    </div>
                    <div class="text-center">
                      <div class="text-lg font-bold text-red-700">{reEnrichResult.stillDead}</div>
                      <div class="text-xs text-red-600">Still Dead</div>
                    </div>
                    <div class="text-center">
                      <div class="text-lg font-bold text-yellow-700">{reEnrichResult.errors}</div>
                      <div class="text-xs text-yellow-600">Errors</div>
                    </div>
                    {#if reEnrichResult.pending > 0}
                      <div class="text-center">
                        <div class="text-lg font-bold text-blue-700">{reEnrichResult.pending}</div>
                        <div class="text-xs text-blue-600">Remaining</div>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
              
              {#if loadingDeadLinks}
                <div class="flex items-center justify-center py-8">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
                  <span class="ml-3 text-gray-500">Loading dead links...</span>
                </div>
              {:else if deadLinks.length === 0}
                <p class="text-gray-500">No dead links detected. Run enrichment to check bookmark availability.</p>
              {:else}
                <!-- Dead Link Insights Summary -->
                {#if deadLinkInsights && deadLinkInsights.total > 0}
                  <div class="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                    <h4 class="text-sm font-semibold text-red-800 mb-3">📊 Dead Link Insights</h4>
                    
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div class="text-center">
                        <div class="text-2xl font-bold text-red-700">{deadLinkInsights.total}</div>
                        <div class="text-xs text-red-600">Total Dead</div>
                      </div>
                      <div class="text-center">
                        <div class="text-2xl font-bold text-red-700">{deadLinkInsights.deadLinkRate}%</div>
                        <div class="text-xs text-red-600">Dead Link Rate</div>
                      </div>
                      <div class="text-center">
                        <div class="text-2xl font-bold text-red-700">{deadLinkInsights.checkedCount}</div>
                        <div class="text-xs text-red-600">Total Checked</div>
                      </div>
                      <div class="text-center">
                        <div class="text-2xl font-bold text-red-700">{deadLinkInsights.byDomain.length}</div>
                        <div class="text-xs text-red-600">Affected Domains</div>
                      </div>
                    </div>
                    
                    <!-- Age Distribution -->
                    <div class="mb-4">
                      <h5 class="text-xs font-medium text-red-700 mb-2">By Bookmark Age</h5>
                      <div class="flex gap-2 flex-wrap">
                        {#if deadLinkInsights.byAge.recent > 0}
                          <span class="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                            &lt; 1 week: {deadLinkInsights.byAge.recent}
                          </span>
                        {/if}
                        {#if deadLinkInsights.byAge.moderate > 0}
                          <span class="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                            1 week - 1 month: {deadLinkInsights.byAge.moderate}
                          </span>
                        {/if}
                        {#if deadLinkInsights.byAge.old > 0}
                          <span class="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                            1 month - 1 year: {deadLinkInsights.byAge.old}
                          </span>
                        {/if}
                        {#if deadLinkInsights.byAge.ancient > 0}
                          <span class="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                            &gt; 1 year: {deadLinkInsights.byAge.ancient}
                          </span>
                        {/if}
                      </div>
                    </div>
                    
                    <!-- Top Domains with Dead Links -->
                    {#if deadLinkInsights.byDomain.length > 0}
                      <div class="mb-4">
                        <h5 class="text-xs font-medium text-red-700 mb-2">Top Domains with Dead Links</h5>
                        <div class="flex gap-2 flex-wrap">
                          {#each deadLinkInsights.byDomain.slice(0, 5) as domainInfo}
                            <span class="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                              {domainInfo.domain}: {domainInfo.count}
                            </span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    
                    <!-- By Category -->
                    {#if deadLinkInsights.byCategory.length > 0}
                      <div>
                        <h5 class="text-xs font-medium text-red-700 mb-2">By Category</h5>
                        <div class="flex gap-2 flex-wrap">
                          {#each deadLinkInsights.byCategory.slice(0, 5) as catInfo}
                            <span class="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                              {catInfo.category}: {catInfo.count}
                            </span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}
                
                <!-- Dead Links List -->
                <div class="space-y-2 max-h-[32rem] overflow-y-auto">
                  {#each deadLinks.slice(0, deadLinksDisplayLimit) as bookmark}
                    <div class="p-3 bg-red-50 rounded border border-red-200">
                      <div class="flex items-start justify-between">
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-medium text-gray-800 truncate">{bookmark.title}</div>
                          <div class="text-xs text-gray-500 truncate">{bookmark.url}</div>
                          <div class="text-xs text-red-600 mt-1 flex items-center gap-3">
                            <span>Last checked: {bookmark.lastChecked ? new Date(bookmark.lastChecked).toLocaleDateString() : 'Unknown'}</span>
                            {#if bookmark.domain}
                              <span class="text-gray-500">• {bookmark.domain}</span>
                            {/if}
                            {#if bookmark.category}
                              <span class="text-gray-500">• {bookmark.category}</span>
                            {/if}
                          </div>
                        </div>
                        <div class="flex gap-1 ml-2 flex-shrink-0">
                          <a 
                            href={bookmark.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            class="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            Try Again
                          </a>
                          <button
                            on:click={() => deleteDeadLink(bookmark.id)}
                            class="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
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
          
          <!-- Smart Similar Detection (On-demand) -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 class="text-lg font-medium text-gray-900">
                  🔍 Smart Similar Detection {#if enhancedSimilarStats}({enhancedSimilarStats.total} pairs){/if}
                </h3>
                <p class="text-xs text-gray-500 mt-1">Advanced fuzzy matching using title, description, keywords & domain analysis</p>
              </div>
              <div class="flex items-center gap-2">
                {#if enhancedSimilarCacheInfo?.fromCache}
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-md" title="Loaded from cache">
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                    </svg>
                    Cached {Math.round((enhancedSimilarCacheInfo.cacheAge || 0) / 60000)}m ago
                  </span>
                  <button
                    on:click={() => runSmartSimilarDetection(true)}
                    disabled={loadingEnhancedSimilar}
                    class="px-2.5 py-1.5 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md disabled:opacity-50"
                    title="Force refresh - recompute similarity analysis"
                  >
                    🔄 Refresh
                  </button>
                {:else if enhancedSimilarStats}
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-md">
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                    </svg>
                    Fresh analysis
                  </span>
                {/if}
                <button
                  on:click={() => runSmartSimilarDetection(false)}
                  disabled={loadingEnhancedSimilar}
                  class="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {#if loadingEnhancedSimilar}
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Analyzing...
                  {:else}
                    🔍 Run Analysis
                  {/if}
                </button>
              </div>
            </div>
            <div class="p-6">
              {#if loadingEnhancedSimilar}
                <div class="flex items-center justify-center py-8">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  <span class="ml-3 text-gray-500">Running smart similarity analysis...</span>
                </div>
              {:else if enhancedSimilarPairs.length === 0 && !enhancedSimilarStats}
                <div class="text-center py-8">
                  <p class="text-gray-500 mb-4">Click "Run Analysis" to detect similar bookmarks using advanced fuzzy matching.</p>
                  <p class="text-xs text-gray-400">This analysis uses title, description, keywords, and domain information to find similar content.</p>
                </div>
              {:else if enhancedSimilarPairs.length === 0}
                <p class="text-gray-500">No similar bookmarks detected with enhanced matching.</p>
              {:else}
                <!-- Stats Summary -->
                {#if enhancedSimilarStats}
                  <div class="mb-4 p-3 bg-indigo-50 rounded-lg flex items-center justify-between">
                    <div class="flex gap-4 text-sm">
                      <span class="text-indigo-700">
                        <strong>{enhancedSimilarStats.sameDomain}</strong> same-domain pairs
                      </span>
                      <span class="text-indigo-600">
                        <strong>{enhancedSimilarStats.crossDomain}</strong> cross-domain pairs
                      </span>
                      <span class="text-indigo-500">
                        Avg: <strong>{(enhancedSimilarStats.avgSimilarity * 100).toFixed(0)}%</strong> similar
                      </span>
                    </div>
                  </div>
                {/if}
                
                <div class="space-y-3 max-h-[40rem] overflow-y-auto">
                  {#each enhancedSimilarPairs.slice(0, similarDisplayLimit) as pair, idx}
                    <div class="border {pair.sameDomain ? 'border-indigo-200 bg-indigo-50' : 'border-purple-200 bg-purple-50'} rounded-lg p-4">
                      <div class="flex justify-between items-center mb-3">
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-semibold px-2 py-1 rounded {pair.sameDomain ? 'bg-indigo-200 text-indigo-800' : 'bg-purple-200 text-purple-800'}">
                            {Math.round(pair.similarity * 100)}% match
                          </span>
                          {#if pair.sameDomain}
                            <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Same Domain</span>
                          {/if}
                          {#if pair.sameCategory}
                            <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">Same Category</span>
                          {/if}
                        </div>
                        <button
                          on:click={() => openComparisonModal(pair)}
                          class="text-xs px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Compare Details
                        </button>
                      </div>
                      
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <!-- Bookmark 1 -->
                        <div class="p-3 bg-white rounded border border-gray-200">
                          <div class="flex justify-between items-start mb-2">
                            <div class="flex-1 min-w-0">
                              <div class="text-sm font-medium text-gray-800 truncate" title={pair.bookmark1.title}>
                                {pair.bookmark1.title}
                              </div>
                              <div class="text-xs text-gray-500 truncate" title={pair.bookmark1.url}>
                                {pair.bookmark1.url}
                              </div>
                            </div>
                          </div>
                          <div class="flex items-center justify-between mt-2">
                            <div class="text-xs text-gray-400">
                              Coverage: {pair.coverage1.percentage.toFixed(0)}%
                            </div>
                            <div class="flex gap-1">
                              <a href={pair.bookmark1.url} target="_blank" rel="noopener" 
                                 class="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200">Open</a>
                              <button
                                on:click={() => deleteFromComparison(pair.bookmark1.id)}
                                class="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                              >Delete</button>
                            </div>
                          </div>
                        </div>
                        
                        <!-- Bookmark 2 -->
                        <div class="p-3 bg-white rounded border border-gray-200">
                          <div class="flex justify-between items-start mb-2">
                            <div class="flex-1 min-w-0">
                              <div class="text-sm font-medium text-gray-800 truncate" title={pair.bookmark2.title}>
                                {pair.bookmark2.title}
                              </div>
                              <div class="text-xs text-gray-500 truncate" title={pair.bookmark2.url}>
                                {pair.bookmark2.url}
                              </div>
                            </div>
                          </div>
                          <div class="flex items-center justify-between mt-2">
                            <div class="text-xs text-gray-400">
                              Coverage: {pair.coverage2.percentage.toFixed(0)}%
                            </div>
                            <div class="flex gap-1">
                              <a href={pair.bookmark2.url} target="_blank" rel="noopener" 
                                 class="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200">Open</a>
                              <button
                                on:click={() => deleteFromComparison(pair.bookmark2.id)}
                                class="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                              >Delete</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
                
                {#if enhancedSimilarPairs.length > similarDisplayLimit}
                  <div class="mt-4 text-center">
                    <button
                      on:click={loadMoreSimilar}
                      class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                    >
                      Load More ({similarDisplayLimit} of {enhancedSimilarPairs.length} shown)
                    </button>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
          
          <!-- Useless Bookmarks Detection -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                🗑️ Cleanup Candidates {#if uselessBookmarks}({uselessBookmarks.summary.total} found){/if}
              </h3>
              <p class="text-xs text-gray-500 mt-1">Bookmarks that may be candidates for removal based on various criteria</p>
            </div>
            <div class="p-6">
              {#if loadingUseless}
                <div class="flex items-center justify-center py-8">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                  <span class="ml-3 text-gray-500">Analyzing bookmarks for cleanup...</span>
                </div>
              {:else if !uselessBookmarks || uselessBookmarks.summary.total === 0}
                <p class="text-gray-500">No cleanup candidates found. Your bookmarks look great!</p>
              {:else}
                <!-- Summary Cards -->
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <div class="p-3 bg-red-50 rounded-lg text-center">
                    <div class="text-2xl font-bold text-red-600">{uselessBookmarks.summary.byCategory.deadLinks || 0}</div>
                    <div class="text-xs text-red-500">Dead Links</div>
                  </div>
                  <div class="p-3 bg-orange-50 rounded-lg text-center">
                    <div class="text-2xl font-bold text-orange-600">{uselessBookmarks.summary.byCategory.oldUnused || 0}</div>
                    <div class="text-xs text-orange-500">Old & Unused</div>
                  </div>
                  <div class="p-3 bg-yellow-50 rounded-lg text-center">
                    <div class="text-2xl font-bold text-yellow-600">{uselessBookmarks.summary.byCategory.genericTitles || 0}</div>
                    <div class="text-xs text-yellow-600">Generic Titles</div>
                  </div>
                  <div class="p-3 bg-purple-50 rounded-lg text-center">
                    <div class="text-2xl font-bold text-purple-600">{uselessBookmarks.summary.byCategory.temporaryUrls || 0}</div>
                    <div class="text-xs text-purple-500">Temp/Dev URLs</div>
                  </div>
                  <div class="p-3 bg-gray-100 rounded-lg text-center">
                    <div class="text-2xl font-bold text-gray-600">{uselessBookmarks.summary.byCategory.lowScore || 0}</div>
                    <div class="text-xs text-gray-500">Low Quality</div>
                  </div>
                </div>
                
                <!-- Old & Unused Section -->
                {#if uselessBookmarks.oldUnused.length > 0}
                  <div class="mb-6">
                    <div class="flex items-center justify-between mb-3">
                      <h4 class="text-sm font-semibold text-orange-700">📅 Old & Never Accessed ({uselessBookmarks.oldUnused.length})</h4>
                      <button
                        on:click={() => deleteAllUselessInCategory('oldUnused')}
                        disabled={deletingUseless}
                        class="text-xs px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                      >
                        Delete All
                      </button>
                    </div>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                      {#each uselessBookmarks.oldUnused.slice(0, uselessDisplayLimits.oldUnused) as bookmark}
                        <div class="p-2 bg-orange-50 rounded border border-orange-200 flex items-center justify-between">
                          <div class="flex-1 min-w-0">
                            <div class="text-sm truncate">{bookmark.title}</div>
                            <div class="text-xs text-gray-500 truncate">{bookmark.url}</div>
                            <div class="text-xs text-orange-600 mt-1">
                              Score: {bookmark.usefulnessScore} • Created: {new Date(bookmark.dateAdded).toLocaleDateString()}
                            </div>
                          </div>
                          <button
                            on:click={() => deleteUselessBookmark(bookmark.id, 'oldUnused')}
                            class="ml-2 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >Delete</button>
                        </div>
                      {/each}
                    </div>
                    {#if uselessBookmarks.oldUnused.length > uselessDisplayLimits.oldUnused}
                      <button on:click={() => loadMoreUseless('oldUnused')} class="mt-2 text-xs text-orange-600 hover:underline">
                        Show more ({uselessDisplayLimits.oldUnused} of {uselessBookmarks.oldUnused.length})
                      </button>
                    {/if}
                  </div>
                {/if}
                
                <!-- Generic Titles Section -->
                {#if uselessBookmarks.genericTitles.length > 0}
                  <div class="mb-6">
                    <div class="flex items-center justify-between mb-3">
                      <h4 class="text-sm font-semibold text-yellow-700">📝 Generic/Placeholder Titles ({uselessBookmarks.genericTitles.length})</h4>
                      <button
                        on:click={() => deleteAllUselessInCategory('genericTitles')}
                        disabled={deletingUseless}
                        class="text-xs px-2 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
                      >
                        Delete All
                      </button>
                    </div>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                      {#each uselessBookmarks.genericTitles.slice(0, uselessDisplayLimits.genericTitles) as bookmark}
                        <div class="p-2 bg-yellow-50 rounded border border-yellow-200 flex items-center justify-between">
                          <div class="flex-1 min-w-0">
                            <div class="text-sm truncate">{bookmark.title}</div>
                            <div class="text-xs text-gray-500 truncate">{bookmark.url}</div>
                          </div>
                          <button
                            on:click={() => deleteUselessBookmark(bookmark.id, 'genericTitles')}
                            class="ml-2 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >Delete</button>
                        </div>
                      {/each}
                    </div>
                    {#if uselessBookmarks.genericTitles.length > uselessDisplayLimits.genericTitles}
                      <button on:click={() => loadMoreUseless('genericTitles')} class="mt-2 text-xs text-yellow-600 hover:underline">
                        Show more ({uselessDisplayLimits.genericTitles} of {uselessBookmarks.genericTitles.length})
                      </button>
                    {/if}
                  </div>
                {/if}
                
                <!-- Temporary URLs Section -->
                {#if uselessBookmarks.temporaryUrls.length > 0}
                  <div class="mb-6">
                    <div class="flex items-center justify-between mb-3">
                      <h4 class="text-sm font-semibold text-purple-700">🔧 Temporary/Dev URLs ({uselessBookmarks.temporaryUrls.length})</h4>
                      <button
                        on:click={() => deleteAllUselessInCategory('temporaryUrls')}
                        disabled={deletingUseless}
                        class="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                      >
                        Delete All
                      </button>
                    </div>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                      {#each uselessBookmarks.temporaryUrls.slice(0, uselessDisplayLimits.temporaryUrls) as bookmark}
                        <div class="p-2 bg-purple-50 rounded border border-purple-200 flex items-center justify-between">
                          <div class="flex-1 min-w-0">
                            <div class="text-sm truncate">{bookmark.title}</div>
                            <div class="text-xs text-gray-500 truncate">{bookmark.url}</div>
                          </div>
                          <button
                            on:click={() => deleteUselessBookmark(bookmark.id, 'temporaryUrls')}
                            class="ml-2 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >Delete</button>
                        </div>
                      {/each}
                    </div>
                    {#if uselessBookmarks.temporaryUrls.length > uselessDisplayLimits.temporaryUrls}
                      <button on:click={() => loadMoreUseless('temporaryUrls')} class="mt-2 text-xs text-purple-600 hover:underline">
                        Show more ({uselessDisplayLimits.temporaryUrls} of {uselessBookmarks.temporaryUrls.length})
                      </button>
                    {/if}
                  </div>
                {/if}
                
                <!-- Low Score Section -->
                {#if uselessBookmarks.lowScore.length > 0}
                  <div>
                    <div class="flex items-center justify-between mb-3">
                      <h4 class="text-sm font-semibold text-gray-700">⚠️ Low Quality Score ({uselessBookmarks.lowScore.length})</h4>
                      <button
                        on:click={() => deleteAllUselessInCategory('lowScore')}
                        disabled={deletingUseless}
                        class="text-xs px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                      >
                        Delete All
                      </button>
                    </div>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                      {#each uselessBookmarks.lowScore.slice(0, uselessDisplayLimits.lowScore) as bookmark}
                        <div class="p-2 bg-gray-50 rounded border border-gray-200 flex items-center justify-between">
                          <div class="flex-1 min-w-0">
                            <div class="text-sm truncate">{bookmark.title}</div>
                            <div class="text-xs text-gray-500 truncate">{bookmark.url}</div>
                            <div class="text-xs text-gray-400 mt-1">
                              Score: {bookmark.usefulnessScore} • {bookmark.uselessReasons?.join(', ')}
                            </div>
                          </div>
                          <button
                            on:click={() => deleteUselessBookmark(bookmark.id, 'lowScore')}
                            class="ml-2 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >Delete</button>
                        </div>
                      {/each}
                    </div>
                    {#if uselessBookmarks.lowScore.length > uselessDisplayLimits.lowScore}
                      <button on:click={() => loadMoreUseless('lowScore')} class="mt-2 text-xs text-gray-600 hover:underline">
                        Show more ({uselessDisplayLimits.lowScore} of {uselessBookmarks.lowScore.length})
                      </button>
                    {/if}
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

<!-- Comparison Modal for Similar Bookmarks -->
{#if selectedComparisonPair}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" on:click={closeComparisonModal}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" on:click|stopPropagation>
      <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <h3 class="text-lg font-semibold text-gray-900">Compare Similar Bookmarks</h3>
        <button on:click={closeComparisonModal} class="text-gray-400 hover:text-gray-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <div class="p-6">
        <!-- Similarity Score -->
        <div class="text-center mb-6">
          <div class="inline-flex items-center px-4 py-2 bg-indigo-100 rounded-full">
            <span class="text-2xl font-bold text-indigo-700">{Math.round(selectedComparisonPair.similarity * 100)}%</span>
            <span class="ml-2 text-sm text-indigo-600">Overall Similarity</span>
          </div>
        </div>
        
        <!-- Similarity Breakdown -->
        <div class="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 class="text-sm font-semibold text-gray-700 mb-3">Similarity Breakdown</h4>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="text-center">
              <div class="text-lg font-bold text-blue-600">{Math.round((selectedComparisonPair.breakdown?.titleFuzzy || 0) * 100)}%</div>
              <div class="text-xs text-gray-500">Title (Fuzzy)</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-bold text-green-600">{Math.round((selectedComparisonPair.breakdown?.titleWords || 0) * 100)}%</div>
              <div class="text-xs text-gray-500">Title (Words)</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-bold text-purple-600">{Math.round((selectedComparisonPair.breakdown?.descriptionWords || 0) * 100)}%</div>
              <div class="text-xs text-gray-500">Description</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-bold text-orange-600">{Math.round((selectedComparisonPair.breakdown?.keywordsOverlap || 0) * 100)}%</div>
              <div class="text-xs text-gray-500">Keywords</div>
            </div>
          </div>
        </div>
        
        <!-- Side by Side Comparison -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Bookmark 1 -->
          <div class="border border-gray-200 rounded-lg overflow-hidden">
            <div class="bg-blue-50 px-4 py-2 border-b border-blue-200">
              <span class="text-sm font-medium text-blue-800">Bookmark 1</span>
            </div>
            <div class="p-4 space-y-3">
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Title</div>
                <div class="text-sm font-medium">{selectedComparisonPair.bookmark1.title}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">URL</div>
                <a href={selectedComparisonPair.bookmark1.url} target="_blank" rel="noopener" 
                   class="text-sm text-blue-600 hover:underline break-all">{selectedComparisonPair.bookmark1.url}</a>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Domain</div>
                <div class="text-sm">{selectedComparisonPair.bookmark1.domain || 'N/A'}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Category</div>
                <div class="text-sm">{selectedComparisonPair.bookmark1.category || 'Uncategorized'}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Description</div>
                <div class="text-sm text-gray-600">{selectedComparisonPair.bookmark1.description || 'No description'}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Keywords</div>
                <div class="flex flex-wrap gap-1">
                  {#if selectedComparisonPair.bookmark1.keywords?.length > 0}
                    {#each selectedComparisonPair.bookmark1.keywords.slice(0, 5) as keyword}
                      <span class="px-2 py-0.5 bg-gray-100 text-xs rounded">{keyword}</span>
                    {/each}
                  {:else}
                    <span class="text-sm text-gray-400">No keywords</span>
                  {/if}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Added</div>
                <div class="text-sm">{new Date(selectedComparisonPair.bookmark1.dateAdded).toLocaleDateString()}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Metadata Coverage</div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-blue-600 h-2 rounded-full" style="width: {selectedComparisonPair.coverage1.percentage}%"></div>
                </div>
                <div class="text-xs text-gray-400 mt-1">{selectedComparisonPair.coverage1.percentage.toFixed(0)}%</div>
              </div>
              
              <div class="pt-3 border-t border-gray-200 flex gap-2">
                <a href={selectedComparisonPair.bookmark1.url} target="_blank" rel="noopener" 
                   class="flex-1 px-3 py-2 text-center text-sm bg-gray-100 rounded hover:bg-gray-200">
                  Open
                </a>
                <button
                  on:click={() => deleteFromComparison(selectedComparisonPair.bookmark1.id)}
                  class="flex-1 px-3 py-2 text-center text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete This
                </button>
              </div>
            </div>
          </div>
          
          <!-- Bookmark 2 -->
          <div class="border border-gray-200 rounded-lg overflow-hidden">
            <div class="bg-green-50 px-4 py-2 border-b border-green-200">
              <span class="text-sm font-medium text-green-800">Bookmark 2</span>
            </div>
            <div class="p-4 space-y-3">
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Title</div>
                <div class="text-sm font-medium">{selectedComparisonPair.bookmark2.title}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">URL</div>
                <a href={selectedComparisonPair.bookmark2.url} target="_blank" rel="noopener" 
                   class="text-sm text-blue-600 hover:underline break-all">{selectedComparisonPair.bookmark2.url}</a>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Domain</div>
                <div class="text-sm">{selectedComparisonPair.bookmark2.domain || 'N/A'}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Category</div>
                <div class="text-sm">{selectedComparisonPair.bookmark2.category || 'Uncategorized'}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Description</div>
                <div class="text-sm text-gray-600">{selectedComparisonPair.bookmark2.description || 'No description'}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Keywords</div>
                <div class="flex flex-wrap gap-1">
                  {#if selectedComparisonPair.bookmark2.keywords?.length > 0}
                    {#each selectedComparisonPair.bookmark2.keywords.slice(0, 5) as keyword}
                      <span class="px-2 py-0.5 bg-gray-100 text-xs rounded">{keyword}</span>
                    {/each}
                  {:else}
                    <span class="text-sm text-gray-400">No keywords</span>
                  {/if}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Added</div>
                <div class="text-sm">{new Date(selectedComparisonPair.bookmark2.dateAdded).toLocaleDateString()}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 uppercase mb-1">Metadata Coverage</div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-green-600 h-2 rounded-full" style="width: {selectedComparisonPair.coverage2.percentage}%"></div>
                </div>
                <div class="text-xs text-gray-400 mt-1">{selectedComparisonPair.coverage2.percentage.toFixed(0)}%</div>
              </div>
              
              <div class="pt-3 border-t border-gray-200 flex gap-2">
                <a href={selectedComparisonPair.bookmark2.url} target="_blank" rel="noopener" 
                   class="flex-1 px-3 py-2 text-center text-sm bg-gray-100 rounded hover:bg-gray-200">
                  Open
                </a>
                <button
                  on:click={() => deleteFromComparison(selectedComparisonPair.bookmark2.id)}
                  class="flex-1 px-3 py-2 text-center text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete This
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}