<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getDomainsByRecency, getDomainsByCount, getUniqueFolders, getAllBookmarks } from './db.js';
  import { getPlatformDisplayName, getPlatformIcon, getContentTypeDisplayName } from './url-parsers.js';
  
  const dispatch = createEventDispatcher();
  
  // Props for search result stats
  export let searchResultStats = null;
  export let isSearchActive = false;
  
  let domainsByRecency = [];
  let domainsByCount = [];
  let folders = [];
  let platforms = [];
  let creators = [];
  let contentTypes = [];
  let selectedFilters = {
    domains: [],
    folders: [],
    platforms: [],
    creators: [],
    contentTypes: [],
    dateRange: null,
    readingTimeRange: null, // { min, max }
    qualityScoreRange: null, // { min, max }
    hasPublishedDate: null, // true/false/null
    smartTags: [] // array of tag strings
  };
  let domainSortMode = 'count'; // 'recency' or 'count'
  let domainDisplayLimit = 30; // Initial limit for domains
  let folderDisplayLimit = 15; // Initial limit for folders
  let creatorDisplayLimit = 10; // Initial limit for creators
  
  // Collapsible section states
  let sectionsExpanded = {
    platforms: true,
    creators: true,
    contentTypes: false,
    domains: true,
    folders: false
  };
  
  // Export hasActiveFilters for external use
  export function getHasActiveFilters() {
    return hasActiveFilters();
  }
  
  // Export clearFilters for external use
  export function clearAllFilters() {
    clearFilters();
  }
  
  onMount(async () => {
    try {
      await loadDomains();
      await loadPlatformData();
      folders = await getUniqueFolders();
    } catch (error) {
      console.error('Error loading filters:', error);
    }
  });

  async function loadDomains() {
    domainsByRecency = await getDomainsByRecency();
    domainsByCount = await getDomainsByCount();
  }
  
  async function loadPlatformData() {
    const bookmarks = await getAllBookmarks();
    
    // Count platforms
    const platformCounts = {};
    const creatorCounts = {};
    const typeCounts = {};
    
    bookmarks.forEach(b => {
      // Platforms
      const platform = b.platform || 'other';
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
      
      // Creators (with platform prefix)
      if (b.creator) {
        const creatorKey = `${b.platform || 'other'}:${b.creator}`;
        if (!creatorCounts[creatorKey]) {
          creatorCounts[creatorKey] = { creator: b.creator, platform: b.platform || 'other', count: 0 };
        }
        creatorCounts[creatorKey].count++;
      }
      
      // Content types
      if (b.contentType) {
        typeCounts[b.contentType] = (typeCounts[b.contentType] || 0) + 1;
      }
    });
    
    platforms = Object.entries(platformCounts)
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);
    
    creators = Object.values(creatorCounts)
      .sort((a, b) => b.count - a.count);
    
    contentTypes = Object.entries(typeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Use search result stats when available, otherwise use full domain list
  $: displayDomains = isSearchActive && searchResultStats?.domains 
    ? searchResultStats.domains 
    : (domainSortMode === 'recency' ? domainsByRecency : domainsByCount);
  
  // Use search result folders when available
  $: displayFolders = isSearchActive && searchResultStats?.folders 
    ? searchResultStats.folders.map(f => f.folder)
    : folders;
  
  // Reactive computed value for active filters check
  $: activeFiltersExist = selectedFilters.domains.length > 0 || 
                          selectedFilters.folders.length > 0 || 
                          selectedFilters.platforms.length > 0 ||
                          selectedFilters.creators.length > 0 ||
                          selectedFilters.contentTypes.length > 0 ||
                          selectedFilters.dateRange !== null ||
                          selectedFilters.readingTimeRange !== null ||
                          selectedFilters.qualityScoreRange !== null ||
                          selectedFilters.hasPublishedDate !== null ||
                          selectedFilters.smartTags.length > 0;
  
  function loadMoreDomains() {
    domainDisplayLimit += 30;
  }
  
  function loadMoreFolders() {
    folderDisplayLimit += 15;
  }
  
  function loadMoreCreators() {
    creatorDisplayLimit += 10;
  }
  
  function toggleSection(section) {
    sectionsExpanded[section] = !sectionsExpanded[section];
  }
  
  function toggleDomainFilter(domain) {
    if (selectedFilters.domains.includes(domain)) {
      selectedFilters.domains = selectedFilters.domains.filter(d => d !== domain);
    } else {
      selectedFilters.domains = [...selectedFilters.domains, domain];
    }
    dispatchFilters();
  }

  function toggleFolderFilter(folder) {
    if (selectedFilters.folders.includes(folder)) {
      selectedFilters.folders = selectedFilters.folders.filter(f => f !== folder);
    } else {
      selectedFilters.folders = [...selectedFilters.folders, folder];
    }
    dispatchFilters();
  }
  
  function togglePlatformFilter(platform) {
    if (selectedFilters.platforms.includes(platform)) {
      selectedFilters.platforms = selectedFilters.platforms.filter(p => p !== platform);
    } else {
      selectedFilters.platforms = [...selectedFilters.platforms, platform];
    }
    dispatchFilters();
  }
  
  function toggleCreatorFilter(creator, platform) {
    const key = `${platform}:${creator}`;
    const existing = selectedFilters.creators.find(c => c.key === key);
    if (existing) {
      selectedFilters.creators = selectedFilters.creators.filter(c => c.key !== key);
    } else {
      selectedFilters.creators = [...selectedFilters.creators, { key, creator, platform }];
    }
    dispatchFilters();
  }
  
  function toggleContentTypeFilter(type) {
    if (selectedFilters.contentTypes.includes(type)) {
      selectedFilters.contentTypes = selectedFilters.contentTypes.filter(t => t !== type);
    } else {
      selectedFilters.contentTypes = [...selectedFilters.contentTypes, type];
    }
    dispatchFilters();
  }

  function setDateFilter(startDate, endDate, period) {
    selectedFilters.dateRange = { startDate, endDate, period };
    dispatchFilters();
  }
  
  function clearFilters() {
    selectedFilters = {
      domains: [],
      folders: [],
      platforms: [],
      creators: [],
      contentTypes: [],
      dateRange: null,
      readingTimeRange: null,
      qualityScoreRange: null,
      hasPublishedDate: null,
      smartTags: []
    };
    dispatchFilters();
  }
  
  function setReadingTimeFilter(min, max) {
    selectedFilters.readingTimeRange = min || max ? { min, max } : null;
    dispatchFilters();
  }
  
  function setQualityScoreFilter(min, max) {
    selectedFilters.qualityScoreRange = min || max ? { min, max } : null;
    dispatchFilters();
  }
  
  function togglePublishedDateFilter() {
    // Cycle through: null -> true (has date) -> false (no date) -> null
    if (selectedFilters.hasPublishedDate === null) {
      selectedFilters.hasPublishedDate = true;
    } else if (selectedFilters.hasPublishedDate === true) {
      selectedFilters.hasPublishedDate = false;
    } else {
      selectedFilters.hasPublishedDate = null;
    }
    dispatchFilters();
  }

  function dispatchFilters() {
    dispatch('filter', selectedFilters);
  }

  function hasActiveFilters() {
    return activeFiltersExist;
  }
  
  function applyDateFilter(period) {
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }
    
    setDateFilter(startDate.getTime(), now.getTime(), period);
  }

  function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  }
</script>

<div class="w-64 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0">
  <div class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium text-gray-900">Filters</h3>
      {#if activeFiltersExist}
        <button
          on:click={clearFilters}
          class="text-xs text-blue-600 hover:text-blue-800"
        >
          Clear All
        </button>
      {/if}
    </div>
    
    <!-- Active Filters Display -->
    {#if activeFiltersExist}
      <div class="mb-4 space-y-2">
        {#each selectedFilters.platforms as platform}
          <div class="flex items-center justify-between p-2 bg-indigo-50 rounded-md">
            <div class="text-xs text-indigo-800">{getPlatformIcon(platform)} {getPlatformDisplayName(platform)}</div>
            <button 
              on:click={() => togglePlatformFilter(platform)}
              class="text-indigo-600 hover:text-indigo-800"
            >
              ×
            </button>
          </div>
        {/each}
        {#each selectedFilters.creators as creatorData}
          <div class="flex items-center justify-between p-2 bg-pink-50 rounded-md">
            <div class="text-xs text-pink-800">{getPlatformIcon(creatorData.platform)} {creatorData.creator}</div>
            <button 
              on:click={() => toggleCreatorFilter(creatorData.creator, creatorData.platform)}
              class="text-pink-600 hover:text-pink-800"
            >
              ×
            </button>
          </div>
        {/each}
        {#each selectedFilters.contentTypes as type}
          <div class="flex items-center justify-between p-2 bg-orange-50 rounded-md">
            <div class="text-xs text-orange-800">Type: {getContentTypeDisplayName(type)}</div>
            <button 
              on:click={() => toggleContentTypeFilter(type)}
              class="text-orange-600 hover:text-orange-800"
            >
              ×
            </button>
          </div>
        {/each}
        {#each selectedFilters.domains as domain}
          <div class="flex items-center justify-between p-2 bg-blue-50 rounded-md">
            <div class="text-xs text-blue-800">Domain: {domain}</div>
            <button 
              on:click={() => toggleDomainFilter(domain)}
              class="text-blue-600 hover:text-blue-800"
            >
              ×
            </button>
          </div>
        {/each}
        {#each selectedFilters.folders as folder}
          <div class="flex items-center justify-between p-2 bg-green-50 rounded-md">
            <div class="text-xs text-green-800">Folder: {folder}</div>
            <button 
              on:click={() => toggleFolderFilter(folder)}
              class="text-green-600 hover:text-green-800"
            >
              ×
            </button>
          </div>
        {/each}
        {#if selectedFilters.dateRange}
          <div class="flex items-center justify-between p-2 bg-purple-50 rounded-md">
            <div class="text-xs text-purple-800">
              {selectedFilters.dateRange.period === 'week' ? 'This Week' : 
               selectedFilters.dateRange.period === 'month' ? 'This Month' : 'This Year'}
            </div>
            <button 
              on:click={() => { selectedFilters.dateRange = null; dispatchFilters(); }}
              class="text-purple-600 hover:text-purple-800"
            >
              ×
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  
  <!-- Domain Filters -->
  <div class="mb-4">
    <button
      on:click={() => toggleSection('domains')}
      class="w-full flex items-center justify-between text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 hover:text-gray-900"
    >
      <span>
        {#if isSearchActive}
          <span class="text-blue-600">Matching Domains ({displayDomains.length})</span>
        {:else}
          🌐 Domains ({displayDomains.length})
        {/if}
      </span>
      <span class="text-gray-400">{sectionsExpanded.domains ? '▼' : '▶'}</span>
    </button>
    {#if sectionsExpanded.domains}
      {#if !isSearchActive}
        <div class="flex space-x-1 mb-2">
          <button
            on:click={() => domainSortMode = 'recency'}
            class="text-xs px-2 py-1 rounded"
            class:bg-blue-100={domainSortMode === 'recency'}
            class:text-blue-700={domainSortMode === 'recency'}
            class:text-gray-500={domainSortMode !== 'recency'}
            title="Sort by most recent bookmark"
          >
            Recent
          </button>
          <button
            on:click={() => domainSortMode = 'count'}
            class="text-xs px-2 py-1 rounded"
            class:bg-blue-100={domainSortMode === 'count'}
            class:text-blue-700={domainSortMode === 'count'}
            class:text-gray-500={domainSortMode !== 'count'}
            title="Sort by bookmark count"
          >
            Count
          </button>
        </div>
      {/if}
      <div class="space-y-1 max-h-64 overflow-y-auto">
        {#each displayDomains.slice(0, domainDisplayLimit) as domainData}
          <button
            on:click={() => toggleDomainFilter(domainData.domain)}
            class="w-full text-left px-2 py-2 text-sm hover:bg-gray-100 rounded border"
            class:bg-blue-50={selectedFilters.domains.includes(domainData.domain)}
            class:text-blue-700={selectedFilters.domains.includes(domainData.domain)}
            class:border-blue-200={selectedFilters.domains.includes(domainData.domain)}
            class:text-gray-600={!selectedFilters.domains.includes(domainData.domain)}
            class:border-transparent={!selectedFilters.domains.includes(domainData.domain)}
            title={domainData.domain}
          >
            <div class="truncate font-medium">{domainData.domain}</div>
            <div class="flex justify-between items-center text-xs text-gray-500 mt-1">
              <span>{domainData.count} bookmark{domainData.count !== 1 ? 's' : ''}</span>
              {#if !isSearchActive && domainSortMode === 'recency' && (domainData.dateAdded || domainData.latestDate)}
                <span>{formatTimeAgo(domainData.dateAdded || domainData.latestDate)}</span>
              {/if}
            </div>
          </button>
        {/each}
        {#if displayDomains.length > domainDisplayLimit}
          <button
            on:click={loadMoreDomains}
            class="w-full text-center px-2 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded border border-blue-200 mt-2"
          >
            Load More ({domainDisplayLimit} of {displayDomains.length} shown)
          </button>
        {/if}
        {#if displayDomains.length === 0}
          <div class="text-xs text-gray-400 px-2 py-2 italic">
            No domains found
          </div>
        {/if}
      </div>
    {/if}
  </div>
  
  <!-- Folder Filters -->
  <div class="mb-4">
    <button
      on:click={() => toggleSection('folders')}
      class="w-full flex items-center justify-between text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 hover:text-gray-900"
    >
      <span>
        {#if isSearchActive}
          <span class="text-blue-600">Matching Folders ({displayFolders.length})</span>
        {:else}
          📁 Folders ({displayFolders.length})
        {/if}
      </span>
      <span class="text-gray-400">{sectionsExpanded.folders ? '▼' : '▶'}</span>
    </button>
    {#if sectionsExpanded.folders}
      <div class="space-y-1 max-h-64 overflow-y-auto">
        {#each displayFolders.slice(0, folderDisplayLimit) as folder}
          <button
            on:click={() => toggleFolderFilter(folder)}
            class="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded border"
            class:bg-green-50={selectedFilters.folders.includes(folder)}
            class:text-green-700={selectedFilters.folders.includes(folder)}
            class:border-green-200={selectedFilters.folders.includes(folder)}
            class:text-gray-600={!selectedFilters.folders.includes(folder)}
            class:border-transparent={!selectedFilters.folders.includes(folder)}
            title={folder}
          >
            <span class="truncate block">📁 {folder}</span>
          </button>
        {/each}
        {#if displayFolders.length > folderDisplayLimit}
          <button
            on:click={loadMoreFolders}
            class="w-full text-center px-2 py-2 text-sm text-green-600 hover:bg-green-50 rounded border border-green-200 mt-2"
          >
            Load More ({folderDisplayLimit} of {displayFolders.length} shown)
          </button>
        {/if}
        {#if displayFolders.length === 0}
          <div class="text-xs text-gray-400 px-2 py-2 italic">
            No folders found
          </div>
        {/if}
      </div>
    {/if}
  </div>
  
  <!-- Platforms Section -->
  {#if platforms.length > 0}
    <div class="mb-4">
      <button
        on:click={() => toggleSection('platforms')}
        class="w-full flex items-center justify-between text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 hover:text-gray-900"
      >
        <span>📱 Platforms ({platforms.length})</span>
        <span class="text-gray-400">{sectionsExpanded.platforms ? '▼' : '▶'}</span>
      </button>
      {#if sectionsExpanded.platforms}
        <div class="space-y-1">
          {#each platforms as p}
            <button
              on:click={() => togglePlatformFilter(p.platform)}
              class="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded border flex items-center justify-between"
              class:bg-indigo-50={selectedFilters.platforms.includes(p.platform)}
              class:text-indigo-700={selectedFilters.platforms.includes(p.platform)}
              class:border-indigo-200={selectedFilters.platforms.includes(p.platform)}
              class:text-gray-600={!selectedFilters.platforms.includes(p.platform)}
              class:border-transparent={!selectedFilters.platforms.includes(p.platform)}
            >
              <span>{getPlatformIcon(p.platform)} {getPlatformDisplayName(p.platform)}</span>
              <span class="text-xs text-gray-400">{p.count}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  
  <!-- Top Creators Section -->
  {#if creators.length > 0}
    <div class="mb-4">
      <button
        on:click={() => toggleSection('creators')}
        class="w-full flex items-center justify-between text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 hover:text-gray-900"
      >
        <span>👤 Top Creators ({creators.length})</span>
        <span class="text-gray-400">{sectionsExpanded.creators ? '▼' : '▶'}</span>
      </button>
      {#if sectionsExpanded.creators}
        <div class="space-y-1 max-h-48 overflow-y-auto">
          {#each creators.slice(0, creatorDisplayLimit) as c}
            {@const isSelected = selectedFilters.creators.some(sc => sc.key === `${c.platform}:${c.creator}`)}
            <button
              on:click={() => toggleCreatorFilter(c.creator, c.platform)}
              class="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded border"
              class:bg-pink-50={isSelected}
              class:text-pink-700={isSelected}
              class:border-pink-200={isSelected}
              class:text-gray-600={!isSelected}
              class:border-transparent={!isSelected}
            >
              <div class="flex items-center justify-between">
                <span class="truncate">{getPlatformIcon(c.platform)} {c.creator}</span>
                <span class="text-xs text-gray-400 ml-1">{c.count}</span>
              </div>
            </button>
          {/each}
          {#if creators.length > creatorDisplayLimit}
            <button
              on:click={loadMoreCreators}
              class="w-full text-center px-2 py-1 text-xs text-pink-600 hover:bg-pink-50 rounded"
            >
              Show more ({creators.length - creatorDisplayLimit} more)
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
  
  <!-- Content Types Section -->
  {#if contentTypes.length > 0}
    <div class="mb-4">
      <button
        on:click={() => toggleSection('contentTypes')}
        class="w-full flex items-center justify-between text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 hover:text-gray-900"
      >
        <span>📝 Content Types ({contentTypes.length})</span>
        <span class="text-gray-400">{sectionsExpanded.contentTypes ? '▼' : '▶'}</span>
      </button>
      {#if sectionsExpanded.contentTypes}
        <div class="space-y-1">
          {#each contentTypes as ct}
            <button
              on:click={() => toggleContentTypeFilter(ct.type)}
              class="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded border flex items-center justify-between"
              class:bg-orange-50={selectedFilters.contentTypes.includes(ct.type)}
              class:text-orange-700={selectedFilters.contentTypes.includes(ct.type)}
              class:border-orange-200={selectedFilters.contentTypes.includes(ct.type)}
              class:text-gray-600={!selectedFilters.contentTypes.includes(ct.type)}
              class:border-transparent={!selectedFilters.contentTypes.includes(ct.type)}
            >
              <span>{getContentTypeDisplayName(ct.type)}</span>
              <span class="text-xs text-gray-400">{ct.count}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  
  <!-- Date Filters -->
  <div class="mb-4">
    <h4 class="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
      Date Added
    </h4>
    <div class="space-y-1">
      <button
        on:click={() => applyDateFilter('week')}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-blue-50={selectedFilters.dateRange?.period === 'week'}
        class:text-blue-700={selectedFilters.dateRange?.period === 'week'}
      >
        This Week
      </button>
      <button
        on:click={() => applyDateFilter('month')}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-blue-50={selectedFilters.dateRange?.period === 'month'}
        class:text-blue-700={selectedFilters.dateRange?.period === 'month'}
      >
        This Month
      </button>
      <button
        on:click={() => applyDateFilter('year')}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-blue-50={selectedFilters.dateRange?.period === 'year'}
        class:text-blue-700={selectedFilters.dateRange?.period === 'year'}
      >
        This Year
      </button>
    </div>
  </div>
  
  <!-- Reading Time Filter -->
  <div class="mb-4">
    <h4 class="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
      ⏱️ Reading Time
    </h4>
    <div class="space-y-2">
      <button
        on:click={() => setReadingTimeFilter(null, 5)}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-blue-50={selectedFilters.readingTimeRange?.max === 5}
        class:text-blue-700={selectedFilters.readingTimeRange?.max === 5}
      >
        Quick read (&lt; 5 min)
      </button>
      <button
        on:click={() => setReadingTimeFilter(5, 15)}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-blue-50={selectedFilters.readingTimeRange?.min === 5 && selectedFilters.readingTimeRange?.max === 15}
        class:text-blue-700={selectedFilters.readingTimeRange?.min === 5 && selectedFilters.readingTimeRange?.max === 15}
      >
        Medium (5-15 min)
      </button>
      <button
        on:click={() => setReadingTimeFilter(15, null)}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-blue-50={selectedFilters.readingTimeRange?.min === 15}
        class:text-blue-700={selectedFilters.readingTimeRange?.min === 15}
      >
        Long read (&gt; 15 min)
      </button>
    </div>
  </div>
  
  <!-- Quality Score Filter -->
  <div class="mb-4">
    <h4 class="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
      ⭐ Content Quality
    </h4>
    <div class="space-y-2">
      <button
        on:click={() => setQualityScoreFilter(70, 100)}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-green-50={selectedFilters.qualityScoreRange?.min === 70}
        class:text-green-700={selectedFilters.qualityScoreRange?.min === 70}
      >
        High (70-100)
      </button>
      <button
        on:click={() => setQualityScoreFilter(40, 69)}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-yellow-50={selectedFilters.qualityScoreRange?.min === 40 && selectedFilters.qualityScoreRange?.max === 69}
        class:text-yellow-700={selectedFilters.qualityScoreRange?.min === 40 && selectedFilters.qualityScoreRange?.max === 69}
      >
        Medium (40-69)
      </button>
      <button
        on:click={() => setQualityScoreFilter(null, 39)}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-orange-50={selectedFilters.qualityScoreRange?.max === 39}
        class:text-orange-700={selectedFilters.qualityScoreRange?.max === 39}
      >
        Low (&lt; 40)
      </button>
    </div>
  </div>
  
  <!-- Published Date Filter -->
  <div class="mb-4">
    <h4 class="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
      📅 Published Date
    </h4>
    <button
      on:click={togglePublishedDateFilter}
      class="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
      class:bg-blue-50={selectedFilters.hasPublishedDate === true}
      class:text-blue-700={selectedFilters.hasPublishedDate === true}
      class:bg-orange-50={selectedFilters.hasPublishedDate === false}
      class:text-orange-700={selectedFilters.hasPublishedDate === false}
    >
      {#if selectedFilters.hasPublishedDate === null}
        All content
      {:else if selectedFilters.hasPublishedDate === true}
        ✓ Has publish date
      {:else}
        ✗ No publish date
      {/if}
    </button>
  </div>
</div>
