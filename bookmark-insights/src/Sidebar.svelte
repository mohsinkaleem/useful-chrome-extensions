<script>
  import { onMount } from 'svelte';
  import { getDomainsByRecency, getDomainsByCount, getUniqueFolders } from './db.js';
  import { getPlatformDisplayName, getPlatformIcon, getContentTypeDisplayName } from './url-parsers.js';
  import { activeFilters, allBookmarks } from './stores.js';
  
  // Props for search result stats
  export let searchResultStats = null;
  export let isSearchActive = false;
  
  let domainsByRecency = [];
  let domainsByCount = [];
  let folders = [];
  let platforms = [];
  let creators = [];
  let contentTypes = [];
  let dateCounts = { week: 0, twoWeek: 0, month: 0, threeMonth: 0, sixMonth: 0, year: 0, older: 0 };
  
  let domainSortMode = 'count'; // 'recency' or 'count'
  let domainDisplayLimit = 40; // Initial limit for domains
  let folderDisplayLimit = 10; // Initial limit for folders
  let creatorDisplayLimit = 10; // Initial limit for creators
  let contentTypeDisplayLimit = 10; // Initial limit for content types
  
  // Collapsible section states
  let sectionsExpanded = {
    platforms: true,
    creators: true,
    contentTypes: true,
    domains: true,
    folders: true
  };
  
  // Export hasActiveFilters for external use
  export function getHasActiveFilters() {
    return hasActiveFilters();
  }
  
  // Export clearFilters for external use
  export function clearAllFilters() {
    activeFilters.clearFilters();
  }

  // Export refresh for external use
  export async function refresh() {
    try {
      await loadDomains();
      await loadPlatformData();
      await loadDateCounts();
      folders = await getUniqueFolders();
    } catch (error) {
      console.error('Error refreshing sidebar:', error);
    }
  }
  
  onMount(async () => {
    try {
      await loadDomains();
      await loadPlatformData();
      await loadDateCounts();
      folders = await getUniqueFolders();
    } catch (error) {
      console.error('Error loading filters:', error);
    }
  });

  async function loadDateCounts() {
    const bookmarks = await allBookmarks.getCached();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const twoWeeks = 14 * oneDay;
    const threeMonths = 90 * oneDay;
    const sixMonths = 180 * oneDay;
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const startOfMonth = new Date(currentYear, today.getMonth(), 1).getTime();
    const startOfYear = new Date(currentYear, 0, 1).getTime();
    
    let week = 0, twoWeek = 0, month = 0, threeMonth = 0, sixMonth = 0, year = 0, older = 0;
    
    bookmarks.forEach(b => {
      const dateAdded = b.dateAdded;
      if (now - dateAdded < oneWeek) week++;
      if (now - dateAdded < twoWeeks) twoWeek++;
      if (dateAdded >= startOfMonth) month++;
      if (now - dateAdded < threeMonths) threeMonth++;
      if (now - dateAdded < sixMonths) sixMonth++;
      if (dateAdded >= startOfYear) year++;
      if (dateAdded < startOfYear) older++;
    });
    
    dateCounts = { week, twoWeek, month, threeMonth, sixMonth, year, older };
  }

  async function loadDomains() {
    domainsByRecency = await getDomainsByRecency();
    domainsByCount = await getDomainsByCount();
  }
  
  async function loadPlatformData() {
    // Use cached bookmarks from store instead of fetching again
    const bookmarks = await allBookmarks.getCached();
    
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

  // Reactive computed value for active filters check - MUST be defined before useFilteredStats
  $: activeFiltersExist = $activeFilters.domains.length > 0 || 
                          $activeFilters.folders.length > 0 || 
                          $activeFilters.platforms.length > 0 ||
                          $activeFilters.creators.length > 0 ||
                          $activeFilters.types.length > 0 ||
                          ($activeFilters.tags && $activeFilters.tags.length > 0) ||
                          $activeFilters.deadLinks ||
                          $activeFilters.stale ||
                          $activeFilters.dateRange !== null ||
                          $activeFilters.readingTimeRange !== null ||
                          $activeFilters.qualityScoreRange !== null ||
                          $activeFilters.hasPublishedDate !== null;

  // Reactive: Check if we should use filtered stats
  // This ensures proper reactivity when searchResultStats prop changes
  $: useFilteredStats = (isSearchActive || activeFiltersExist) && searchResultStats != null;
  
  // Use search result stats when available, otherwise use full domain list
  $: displayDomains = useFilteredStats && searchResultStats?.domains 
    ? searchResultStats.domains 
    : (domainSortMode === 'recency' ? domainsByRecency : domainsByCount);
  
  // Use search result folders when available
  $: displayFolders = useFilteredStats && searchResultStats?.folders 
    ? searchResultStats.folders
    : folders;

  // Use search result platforms when available
  $: displayPlatforms = useFilteredStats && searchResultStats?.platforms
    ? searchResultStats.platforms
    : platforms;

  // Use search result creators when available
  $: displayCreators = useFilteredStats && searchResultStats?.creators
    ? searchResultStats.creators
    : creators;

  // Use search result content types when available
  $: displayContentTypes = useFilteredStats && searchResultStats?.contentTypes
    ? searchResultStats.contentTypes
    : contentTypes;

  // Use search result date counts when available
  $: displayDateCounts = useFilteredStats && searchResultStats?.dateCounts
    ? searchResultStats.dateCounts
    : dateCounts;
  
  function loadMoreDomains() {
    domainDisplayLimit += 30;
  }
  
  function loadMoreFolders() {
    folderDisplayLimit += 15;
  }
  
  function loadMoreCreators() {
    creatorDisplayLimit += 10;
  }
  
  function loadMoreContentTypes() {
    contentTypeDisplayLimit += 10;
  }
  
  function toggleSection(section) {
    sectionsExpanded[section] = !sectionsExpanded[section];
  }
  
  function isFilterActive(category, value) {
      if ($activeFilters[category] === undefined) return false;
      
      if (Array.isArray($activeFilters[category])) {
          // Special handling for creators which are stored as objects
          if (category === 'creators') {
             return $activeFilters[category].some(item => item.key === value);
          }

          return $activeFilters[category].some(item => 
              String(item).toLowerCase() === String(value).toLowerCase()
          );
      }
      
      return $activeFilters[category] === value;
  }

  function toggleDomainFilter(domain) {
    activeFilters.toggleFilter('domains', domain);
  }

  function toggleFolderFilter(folder) {
    activeFilters.toggleFilter('folders', folder);
  }
  
  function togglePlatformFilter(platform) {
    activeFilters.toggleFilter('platforms', platform);
  }
  
  function toggleCreatorFilter(creator, platform) {
    const key = `${platform}:${creator}`;
    activeFilters.toggleFilter('creators', { key, creator, platform });
  }
  
  function toggleContentTypeFilter(type) {
    activeFilters.toggleFilter('types', type);
  }

  function setDateFilter(startDate, endDate, period) {
    activeFilters.setFilter('dateRange', { startDate, endDate, period });
  }
  
  function clearFilters() {
    activeFilters.clearFilters();
  }
  
  function setReadingTimeFilter(min, max) {
    activeFilters.setFilter('readingTimeRange', min || max ? { min, max } : null);
  }
  
  function setQualityScoreFilter(min, max) {
    activeFilters.setFilter('qualityScoreRange', min || max ? { min, max } : null);
  }
  
  function togglePublishedDateFilter() {
    // Cycle through: null -> true (has date) -> false (no date) -> null
    if ($activeFilters.hasPublishedDate === null) {
      activeFilters.setFilter('hasPublishedDate', true);
    } else if ($activeFilters.hasPublishedDate === true) {
      activeFilters.setFilter('hasPublishedDate', false);
    } else {
      activeFilters.setFilter('hasPublishedDate', null);
    }
  }

  function hasActiveFilters() {
    return activeFiltersExist;
  }
  
  function applyDateFilter(period) {
    // Toggle behavior: if the same period is already active, clear it
    if ($activeFilters.dateRange?.period === period) {
      activeFilters.setFilter('dateRange', null);
      return;
    }
    
    const now = new Date();
    const currentYear = now.getFullYear();
    let startDate;
    let endDate = now.getTime();
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'twoWeek':
        startDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(currentYear, now.getMonth(), 1);
        break;
      case 'threeMonth':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'sixMonth':
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(currentYear, 0, 1);
        break;
      case 'older':
        startDate = new Date(0);
        endDate = new Date(currentYear, 0, 1).getTime() - 1;
        break;
    }
    
    setDateFilter(startDate.getTime(), endDate, period);
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

<div class="w-[24rem] bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0">
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
      <div class="mb-4 flex flex-wrap gap-2">
        {#each $activeFilters.platforms as platform}
          <div class="flex items-center space-x-1 p-1.5 bg-indigo-50 rounded-md border border-indigo-100">
            <div class="text-[10px] text-indigo-800">{getPlatformIcon(platform)} {getPlatformDisplayName(platform)}</div>
            <button 
              on:click={() => togglePlatformFilter(platform)}
              class="text-indigo-600 hover:text-indigo-800 font-bold"
            >
              ×
            </button>
          </div>
        {/each}
        {#each $activeFilters.creators as creatorData}
          <div class="flex items-center space-x-1 p-1.5 bg-pink-50 rounded-md border border-pink-100">
            <div class="text-[10px] text-pink-800">{getPlatformIcon(creatorData.platform)} {creatorData.creator}</div>
            <button 
              on:click={() => toggleCreatorFilter(creatorData.creator, creatorData.platform)}
              class="text-pink-600 hover:text-pink-800 font-bold"
            >
              ×
            </button>
          </div>
        {/each}
        {#each $activeFilters.types as type}
          <div class="flex items-center space-x-1 p-1.5 bg-orange-50 rounded-md border border-orange-100">
            <div class="text-[10px] text-orange-800">{getContentTypeDisplayName(type)}</div>
            <button 
              on:click={() => toggleContentTypeFilter(type)}
              class="text-orange-600 hover:text-orange-800 font-bold"
            >
              ×
            </button>
          </div>
        {/each}
        {#each $activeFilters.domains as domain}
          <div class="flex items-center space-x-1 p-1.5 bg-blue-50 rounded-md border border-blue-100">
            <div class="text-[10px] text-blue-800">{domain}</div>
            <button 
              on:click={() => toggleDomainFilter(domain)}
              class="text-blue-600 hover:text-blue-800 font-bold"
            >
              ×
            </button>
          </div>
        {/each}
        {#each $activeFilters.folders as folder}
          <div class="flex items-center space-x-1 p-1.5 bg-green-50 rounded-md border border-green-100">
            <div class="text-[10px] text-green-800">{folder}</div>
            <button 
              on:click={() => toggleFolderFilter(folder)}
              class="text-green-600 hover:text-green-800 font-bold"
            >
              ×
            </button>
          </div>
        {/each}
        {#if $activeFilters.dateRange}
          <div class="flex items-center space-x-1 p-1.5 bg-purple-50 rounded-md border border-purple-100">
            <div class="text-[10px] text-purple-800">
              {$activeFilters.dateRange.period === 'week' ? 'This Week' : 
               $activeFilters.dateRange.period === 'twoWeek' ? 'This 2-Week' :
               $activeFilters.dateRange.period === 'month' ? 'This Month' :
               $activeFilters.dateRange.period === 'threeMonth' ? 'This 3-Month' :
               $activeFilters.dateRange.period === 'sixMonth' ? 'This 6-Month' :
               $activeFilters.dateRange.period === 'year' ? 'This Year' : 'Older'}
            </div>
            <button 
              on:click={() => { activeFilters.setFilter('dateRange', null); }}
              class="text-purple-600 hover:text-purple-800 font-bold"
            >
              ×
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-2 gap-x-6 gap-y-6">
    <!-- Domain Filters -->
    <div class="mb-0">
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
              class="text-[10px] px-1.5 py-0.5 rounded"
              class:bg-blue-100={domainSortMode === 'recency'}
              class:text-blue-700={domainSortMode === 'recency'}
              class:text-gray-500={domainSortMode !== 'recency'}
              title="Sort by most recent bookmark"
            >
              Recent
            </button>
            <button
              on:click={() => domainSortMode = 'count'}
              class="text-[10px] px-1.5 py-0.5 rounded"
              class:bg-blue-100={domainSortMode === 'count'}
              class:text-blue-700={domainSortMode === 'count'}
              class:text-gray-500={domainSortMode !== 'count'}
              title="Sort by bookmark count"
            >
              Count
            </button>
          </div>
        {/if}
        <div class="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto pr-1">
          {#each displayDomains.slice(0, domainDisplayLimit) as domainData}
            <button
              on:click={() => toggleDomainFilter(domainData.domain)}
              class="w-full text-left px-1 py-0.5 text-sm hover:bg-gray-100 rounded border flex items-center justify-between"
              class:bg-blue-50={isFilterActive('domains', domainData.domain)}
              class:text-blue-700={isFilterActive('domains', domainData.domain)}
              class:border-blue-200={isFilterActive('domains', domainData.domain)}
              class:text-gray-600={!isFilterActive('domains', domainData.domain)}
              class:border-transparent={!isFilterActive('domains', domainData.domain)}
              title={domainData.domain}
            >
              <span class="truncate font-medium text-xs">{domainData.domain}</span>
              <div class="flex items-center text-[10px] text-gray-400 ml-2">
                <span>{domainData.count}</span>
              </div>
            </button>
          {/each}
          {#if displayDomains.length > domainDisplayLimit}
            <button
              on:click={loadMoreDomains}
              class="w-full text-center px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded border border-blue-200 mt-2"
            >
              Load More
            </button>
          {/if}
        </div>
      {/if}
    </div>
    
    <!-- Folder Filters -->
    <div class="mb-0">
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
        <div class="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto pr-1">
          {#each displayFolders.slice(0, folderDisplayLimit) as folderData}
            <button
              on:click={() => toggleFolderFilter(folderData.folder)}
              class="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded border flex items-center justify-between"
              class:bg-green-50={isFilterActive('folders', folderData.folder)}
              class:text-green-700={isFilterActive('folders', folderData.folder)}
              class:border-green-200={isFilterActive('folders', folderData.folder)}
              class:text-gray-600={!isFilterActive('folders', folderData.folder)}
              class:border-transparent={!isFilterActive('folders', folderData.folder)}
              title={folderData.folder}
            >
              <span class="truncate block text-xs">📁 {folderData.folder.toLowerCase().replace("bookmarks","")}</span>
              <span class="text-[10px] text-gray-400 ml-1">{folderData.count}</span>
            </button>
          {/each}
          {#if displayFolders.length > folderDisplayLimit}
            <button
              on:click={loadMoreFolders}
              class="w-full text-center px-2 py-1.5 text-xs text-green-600 hover:bg-green-50 rounded border border-green-200 mt-2"
            >
              Load More
            </button>
          {/if}
        </div>
      {/if}
    </div>
    
    <!-- Platforms Section -->
    {#if displayPlatforms.length > 0}
      <div class="mb-0">
        <button
          on:click={() => toggleSection('platforms')}
          class="w-full flex items-center justify-between text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 hover:text-gray-900"
        >
          <span>📱 Platforms ({displayPlatforms.length})</span>
          <span class="text-gray-400">{sectionsExpanded.platforms ? '▼' : '▶'}</span>
        </button>
        {#if sectionsExpanded.platforms}
          <div class="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1">
            {#each displayPlatforms as p}
              <button
                on:click={() => togglePlatformFilter(p.platform)}
                class="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded border flex items-center justify-between"
                class:bg-indigo-50={isFilterActive('platforms', p.platform)}
                class:text-indigo-700={isFilterActive('platforms', p.platform)}
                class:border-indigo-200={isFilterActive('platforms', p.platform)}
                class:text-gray-600={!isFilterActive('platforms', p.platform)}
                class:border-transparent={!isFilterActive('platforms', p.platform)}
              >
                <span class="text-xs">{getPlatformIcon(p.platform)} {getPlatformDisplayName(p.platform)}</span>
                <span class="text-[10px] text-gray-400">{p.count}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    
    <!-- Top Creators Section -->
    {#if displayCreators.length > 0}
      <div class="mb-0">
        <button
          on:click={() => toggleSection('creators')}
          class="w-full flex items-center justify-between text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 hover:text-gray-900"
        >
          <span>👤 Top Creators ({displayCreators.length})</span>
          <span class="text-gray-400">{sectionsExpanded.creators ? '▼' : '▶'}</span>
        </button>
        {#if sectionsExpanded.creators}
          <div class="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1">
            {#each displayCreators.slice(0, creatorDisplayLimit) as c}
              {@const isSelected = isFilterActive('creators', `${c.platform}:${c.creator}`)}
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
                  <span class="truncate text-xs">{getPlatformIcon(c.platform)} {c.creator}</span>
                  <span class="text-[10px] text-gray-400 ml-1">{c.count}</span>
                </div>
              </button>
            {/each}
            {#if displayCreators.length > creatorDisplayLimit}
              <button
                on:click={loadMoreCreators}
                class="w-full text-center px-2 py-1 text-xs text-pink-600 hover:bg-pink-50 rounded"
              >
                Show more
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
    
    <!-- Content Types Section -->
    {#if displayContentTypes.length > 0}
      <div class="mb-0">
        <button
          on:click={() => toggleSection('contentTypes')}
          class="w-full flex items-center justify-between text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 hover:text-gray-900"
        >
          <span>📝 Content Types ({displayContentTypes.length})</span>
          <span class="text-gray-400">{sectionsExpanded.contentTypes ? '▼' : '▶'}</span>
        </button>
        {#if sectionsExpanded.contentTypes}
          <div class="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1">
            {#each displayContentTypes.slice(0, contentTypeDisplayLimit) as ct}
              <button
                on:click={() => toggleContentTypeFilter(ct.type)}
                class="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded border flex items-center justify-between"
                class:bg-orange-50={isFilterActive('types', ct.type)}
                class:text-orange-700={isFilterActive('types', ct.type)}
                class:border-orange-200={isFilterActive('types', ct.type)}
                class:text-gray-600={!isFilterActive('types', ct.type)}
                class:border-transparent={!isFilterActive('types', ct.type)}
              >
                <span class="text-xs">{getContentTypeDisplayName(ct.type)}</span>
                <span class="text-[10px] text-gray-400">{ct.count}</span>
              </button>
            {/each}
            {#if displayContentTypes.length > contentTypeDisplayLimit}
              <button
                on:click={loadMoreContentTypes}
                class="w-full text-center px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 rounded"
              >
                Show more
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
    
    <!-- Date Filters -->
    <div class="mb-0">
      <h4 class="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
        Date Added
      </h4>
      <div class="grid grid-cols-1 gap-1">
        <button
          on:click={() => applyDateFilter('week')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center justify-between"
          class:bg-blue-50={$activeFilters.dateRange?.period === 'week'}
          class:text-blue-700={$activeFilters.dateRange?.period === 'week'}
        >
          <span class="text-xs">This Week</span>
          <span class="text-[10px] text-gray-400">{displayDateCounts.week}</span>
        </button>
        <button
          on:click={() => applyDateFilter('twoWeek')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center justify-between"
          class:bg-blue-50={$activeFilters.dateRange?.period === 'twoWeek'}
          class:text-blue-700={$activeFilters.dateRange?.period === 'twoWeek'}
        >
          <span class="text-xs">This 2-Week</span>
          <span class="text-[10px] text-gray-400">{displayDateCounts.twoWeek}</span>
        </button>
        <button
          on:click={() => applyDateFilter('month')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center justify-between"
          class:bg-blue-50={$activeFilters.dateRange?.period === 'month'}
          class:text-blue-700={$activeFilters.dateRange?.period === 'month'}
        >
          <span class="text-xs">This Month</span>
          <span class="text-[10px] text-gray-400">{displayDateCounts.month}</span>
        </button>
        <button
          on:click={() => applyDateFilter('threeMonth')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center justify-between"
          class:bg-blue-50={$activeFilters.dateRange?.period === 'threeMonth'}
          class:text-blue-700={$activeFilters.dateRange?.period === 'threeMonth'}
        >
          <span class="text-xs">This 3-Month</span>
          <span class="text-[10px] text-gray-400">{displayDateCounts.threeMonth}</span>
        </button>
        <button
          on:click={() => applyDateFilter('sixMonth')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center justify-between"
          class:bg-blue-50={$activeFilters.dateRange?.period === 'sixMonth'}
          class:text-blue-700={$activeFilters.dateRange?.period === 'sixMonth'}
        >
          <span class="text-xs">This 6-Month</span>
          <span class="text-[10px] text-gray-400">{displayDateCounts.sixMonth}</span>
        </button>
        <button
          on:click={() => applyDateFilter('year')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center justify-between"
          class:bg-blue-50={$activeFilters.dateRange?.period === 'year'}
          class:text-blue-700={$activeFilters.dateRange?.period === 'year'}
        >
          <span class="text-xs">This Year</span>
          <span class="text-[10px] text-gray-400">{displayDateCounts.year}</span>
        </button>
        <button
          on:click={() => applyDateFilter('older')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center justify-between"
          class:bg-blue-50={$activeFilters.dateRange?.period === 'older'}
          class:text-blue-700={$activeFilters.dateRange?.period === 'older'}
        >
          <span class="text-xs">Older</span>
          <span class="text-[10px] text-gray-400">{displayDateCounts.older}</span>
        </button>
      </div>
    </div>
  </div>
</div>
