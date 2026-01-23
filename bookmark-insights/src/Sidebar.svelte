<script>
  import { onMount } from 'svelte';
  import { getDomainsByRecency, getDomainsByCount, getUniqueFolders } from './db.js';
  import { getContentTypeDisplayName } from './url-parsers.js';
  import { getTopicDisplayName, getTopicIcon } from './topics.js';
  import { activeFilters, allBookmarks } from './stores.js';
  
  // Props for search result stats
  export let searchResultStats = null;
  export let isSearchActive = false;
  
  let domainsByRecency = [];
  let domainsByCount = [];
  let folders = [];
  let topics = [];
  let creators = [];
  let contentTypes = [];
  let dateCounts = { week: 0, twoWeek: 0, month: 0, threeMonth: 0, sixMonth: 0, year: 0, older: 0 };
  
  let domainSortMode = 'count'; // 'recency' or 'count'
  let domainDisplayLimit = 40; // Initial limit for domains
  let folderDisplayLimit = 10; // Initial limit for folders
  let creatorDisplayLimit = 10; // Initial limit for creators
  let contentTypeDisplayLimit = 10; // Initial limit for content types
  let topicDisplayLimit = 15; // Initial limit for topics
  
  // Collapsible section states
  let sectionsExpanded = {
    topics: true,
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
      await loadTopicData();
      await loadDateCounts();
      folders = await getUniqueFolders();
    } catch (error) {
      console.error('Error refreshing sidebar:', error);
    }
  }
  
  onMount(async () => {
    try {
      await loadDomains();
      await loadTopicData();
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
  
  async function loadTopicData() {
    // Use cached bookmarks from store instead of fetching again
    const bookmarks = await allBookmarks.getCached();
    
    // Count topics
    const topicCounts = {};
    const creatorCounts = {};
    const typeCounts = {};
    
    bookmarks.forEach(b => {
      // Topics (each bookmark can have multiple)
      const bookmarkTopics = b.topics || [];
      for (const topic of bookmarkTopics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
      
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
    
    topics = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
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
                          $activeFilters.topics.length > 0 ||
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

  // Use search result topics when available
  $: displayTopics = useFilteredStats && searchResultStats?.topics
    ? searchResultStats.topics
    : topics;

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
  
  function loadMoreTopics() {
    topicDisplayLimit += 10;
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
  
  function toggleTopicFilter(topic) {
    activeFilters.toggleFilter('topics', topic);
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

<div class="w-[24rem] bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 overflow-y-auto flex-shrink-0">
  <div class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">Filters</h3>
      {#if activeFiltersExist}
        <button
          on:click={clearFilters}
          class="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
        >
          Clear All
        </button>
      {/if}
    </div>
    
    <!-- Active Filters Display -->
    {#if activeFiltersExist}
      <div class="mb-4 flex flex-wrap gap-2">
        {#each $activeFilters.topics as topic}
          <div class="flex items-center space-x-1 p-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-md border border-indigo-100 dark:border-indigo-800">
            <div class="text-[10px] text-indigo-800 dark:text-indigo-300">{getTopicDisplayName(topic)}</div>
            <button 
              on:click={() => toggleTopicFilter(topic)}
              class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-bold"
            >
              ×
            </button>
          </div>
        {/each}
        {#each $activeFilters.creators as creatorData}
          <div class="flex items-center space-x-1 p-1.5 bg-pink-50 dark:bg-pink-900/30 rounded-md border border-pink-100 dark:border-pink-800">
            <div class="text-[10px] text-pink-800 dark:text-pink-300">{creatorData.creator}</div>
            <button 
              on:click={() => toggleCreatorFilter(creatorData.creator, creatorData.platform)}
              class="text-pink-600 dark:text-pink-400 hover:text-pink-800 dark:hover:text-pink-200 font-bold"
            >
              ×
            </button>
          </div>
        {/each}
        {#each $activeFilters.types as type}
          <div class="flex items-center space-x-1 p-1.5 bg-orange-50 dark:bg-orange-900/30 rounded-md border border-orange-100 dark:border-orange-800">
            <div class="text-[10px] text-orange-800 dark:text-orange-300">{getContentTypeDisplayName(type)}</div>
            <button 
              on:click={() => toggleContentTypeFilter(type)}
              class="text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 font-bold"
            >
              ×
            </button>
          </div>
        {/each}
        {#each $activeFilters.domains as domain}
          <div class="flex items-center space-x-1 p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-md border border-blue-100 dark:border-blue-800">
            <div class="text-[10px] text-blue-800 dark:text-blue-300">{domain}</div>
            <button 
              on:click={() => toggleDomainFilter(domain)}
              class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-bold"
            >
              ×
            </button>
          </div>
        {/each}
        {#each $activeFilters.folders as folder}
          <div class="flex items-center space-x-1 p-1.5 bg-green-50 dark:bg-green-900/30 rounded-md border border-green-100 dark:border-green-800">
            <div class="text-[10px] text-green-800 dark:text-green-300">{folder}</div>
            <button 
              on:click={() => toggleFolderFilter(folder)}
              class="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 font-bold"
            >
              ×
            </button>
          </div>
        {/each}
        {#if $activeFilters.dateRange}
          <div class="flex items-center space-x-1 p-1.5 bg-purple-50 dark:bg-purple-900/30 rounded-md border border-purple-100 dark:border-purple-800">
            <div class="text-[10px] text-purple-800 dark:text-purple-300">
              {$activeFilters.dateRange.period === 'week' ? 'This Week' : 
               $activeFilters.dateRange.period === 'twoWeek' ? 'This 2-Week' :
               $activeFilters.dateRange.period === 'month' ? 'This Month' :
               $activeFilters.dateRange.period === 'threeMonth' ? 'This 3-Month' :
               $activeFilters.dateRange.period === 'sixMonth' ? 'This 6-Month' :
               $activeFilters.dateRange.period === 'year' ? 'This Year' : 'Older'}
            </div>
            <button 
              on:click={() => { activeFilters.setFilter('dateRange', null); }}
              class="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 font-bold"
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
        class="w-full flex items-center justify-between text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2 hover:text-gray-900 dark:hover:text-white"
      >
        <span>
          {#if isSearchActive}
            <span class="text-blue-600 dark:text-blue-400">Matching Domains ({displayDomains.length})</span>
          {:else}
            🌐 Domains ({displayDomains.length})
          {/if}
        </span>
        <span class="text-gray-400 dark:text-gray-500">{sectionsExpanded.domains ? '▼' : '▶'}</span>
      </button>
      {#if sectionsExpanded.domains}
        {#if !isSearchActive}
          <div class="flex space-x-1 mb-2">
            <button
              on:click={() => domainSortMode = 'recency'}
              class="text-[10px] px-1.5 py-0.5 rounded transition-colors {domainSortMode === 'recency' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}"
              title="Sort by most recent bookmark"
            >
              Recent
            </button>
            <button
              on:click={() => domainSortMode = 'count'}
              class="text-[10px] px-1.5 py-0.5 rounded transition-colors {domainSortMode === 'count' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}"
              title="Sort by bookmark count"
            >
              Count
            </button>
          </div>
        {/if}
        <div class="flex gap-2 overflow-x-auto pb-2" style="max-height: 200px; flex-wrap: wrap;">
          {#each displayDomains.slice(0, domainDisplayLimit) as domainData}
            <button
              on:click={() => toggleDomainFilter(domainData.domain)}
              class="flex-shrink-0 px-2 py-1 text-[11px] hover:bg-gray-100 dark:hover:bg-gray-700 rounded border transition-colors flex items-center gap-1.5 {isFilterActive('domains', domainData.domain) ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' : 'text-gray-600 dark:text-gray-400 border-transparent dark:border-transparent'}"
              title={domainData.domain}
            >
              <span class="font-medium">{domainData.domain}</span>
              <span class="text-[10px] text-gray-400 dark:text-gray-500">{domainData.count}</span>
            </button>
          {/each}
          {#if displayDomains.length > domainDisplayLimit}
            <button
              on:click={loadMoreDomains}
              class="w-full text-center px-2 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded border border-blue-200 dark:border-blue-800 mt-2"
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
        class="w-full flex items-center justify-between text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wide mb-2 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
      >
        <span>
          {#if isSearchActive}
            <span class="text-blue-600 dark:text-blue-400">Matching Folders ({displayFolders.length})</span>
          {:else}
            📁 Folders ({displayFolders.length})
          {/if}
        </span>
        <span class="text-gray-400 dark:text-gray-500">{sectionsExpanded.folders ? '▼' : '▶'}</span>
      </button>
      {#if sectionsExpanded.folders}
        <div class="flex gap-2 overflow-x-auto pb-2" style="max-height: 200px; flex-wrap: wrap;">
          {#each displayFolders.slice(0, folderDisplayLimit) as folderData}
            <button
              on:click={() => toggleFolderFilter(folderData.folder)}
              class="flex-shrink-0 px-2 py-1 text-[11px] hover:bg-gray-100 dark:hover:bg-gray-700 rounded border transition-colors flex items-center gap-1.5 {isFilterActive('folders', folderData.folder) ? 'bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' : 'text-gray-600 dark:text-gray-400 border-transparent dark:border-transparent'}"
              title={folderData.folder}
            >
              <span class="font-medium">📁 {folderData.folder.toLowerCase().replace("bookmarks","")}</span>
              <span class="text-[10px] text-gray-400 dark:text-gray-500">{folderData.count}</span>
            </button>
          {/each}
          {#if displayFolders.length > folderDisplayLimit}
            <button
              on:click={loadMoreFolders}
              class="w-full text-center px-2 py-1.5 text-xs text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/40 rounded border border-green-200 dark:border-green-800 mt-2"
            >
              Load More
            </button>
          {/if}
        </div>
      {/if}
    </div>
    
    <!-- Topics Section -->
    {#if displayTopics.length > 0}
      <div class="mb-0">
        <button
          on:click={() => toggleSection('topics')}
          class="w-full flex items-center justify-between text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wide mb-2 hover:text-gray-900 dark:hover:text-gray-200"
        >
          <span>🏷️ Topics ({displayTopics.length})</span>
          <span class="text-gray-400 dark:text-gray-500">{sectionsExpanded.topics ? '▼' : '▶'}</span>
        </button>
        {#if sectionsExpanded.topics}
          <div class="flex gap-2 overflow-x-auto pb-2" style="max-height: 200px; flex-wrap: wrap;">
            {#each displayTopics.slice(0, topicDisplayLimit) as t}
              <button
                on:click={() => toggleTopicFilter(t.topic)}
                class="flex-shrink-0 px-2 py-1 text-[11px] hover:bg-gray-100 dark:hover:bg-gray-700 rounded border transition-colors flex items-center gap-1.5 {isFilterActive('topics', t.topic) ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' : 'text-gray-600 dark:text-gray-400 border-transparent dark:border-transparent'}"
              >
                <span class="font-medium">{getTopicDisplayName(t.topic)}</span>
                <span class="text-[10px] text-gray-400 dark:text-gray-500">{t.count}</span>
              </button>
            {/each}
            {#if displayTopics.length > topicDisplayLimit}
              <button
                on:click={loadMoreTopics}
                class="w-full text-center px-2 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 rounded border border-indigo-200 dark:border-indigo-800 mt-2"
              >
                Show more
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
    
    <!-- Top Creators Section -->
    {#if displayCreators.length > 0}
      <div class="mb-0">
        <button
          on:click={() => toggleSection('creators')}
          class="w-full flex items-center justify-between text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wide mb-2 hover:text-gray-900 dark:hover:text-gray-200"
        >
          <span>👤 Top Creators ({displayCreators.length})</span>
          <span class="text-gray-400 dark:text-gray-500">{sectionsExpanded.creators ? '▼' : '▶'}</span>
        </button>
        {#if sectionsExpanded.creators}
          <div class="flex gap-2 overflow-x-auto pb-2" style="max-height: 200px; flex-wrap: wrap;">
            {#each displayCreators.slice(0, creatorDisplayLimit) as c}
              {@const isSelected = isFilterActive('creators', `${c.platform}:${c.creator}`)}
              <button
                on:click={() => toggleCreatorFilter(c.creator, c.platform)}
                class="flex-shrink-0 px-2 py-1 text-[11px] hover:bg-gray-100 dark:hover:bg-gray-700 rounded border transition-colors flex items-center gap-1.5 {isSelected ? 'bg-pink-50 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800' : 'text-gray-600 dark:text-gray-400 border-transparent dark:border-transparent'}"
              >
                <span class="font-medium">👤 {c.creator}</span>
                <span class="text-[10px] text-gray-400 dark:text-gray-500">{c.count}</span>
              </button>
            {/each}
            {#if displayCreators.length > creatorDisplayLimit}
              <button
                on:click={loadMoreCreators}
                class="w-full text-center px-2 py-1 text-xs text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/40 rounded border border-pink-200 dark:border-pink-800 mt-2"
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
          class="w-full flex items-center justify-between text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wide mb-2 hover:text-gray-900 dark:hover:text-gray-200"
        >
          <span>📝 Content Types ({displayContentTypes.length})</span>
          <span class="text-gray-400 dark:text-gray-500">{sectionsExpanded.contentTypes ? '▼' : '▶'}</span>
        </button>
        {#if sectionsExpanded.contentTypes}
          <div class="flex gap-2 overflow-x-auto pb-2" style="max-height: 200px; flex-wrap: wrap;">
            {#each displayContentTypes.slice(0, contentTypeDisplayLimit) as ct}
              <button
                on:click={() => toggleContentTypeFilter(ct.type)}
                class="flex-shrink-0 px-2 py-1 text-[11px] hover:bg-gray-100 dark:hover:bg-gray-700 rounded border transition-colors flex items-center gap-1.5 {isFilterActive('types', ct.type) ? 'bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800' : 'text-gray-600 dark:text-gray-400 border-transparent dark:border-transparent'}"
              >
                <span class="font-medium">{getContentTypeDisplayName(ct.type)}</span>
                <span class="text-[10px] text-gray-400 dark:text-gray-500">{ct.count}</span>
              </button>
            {/each}
            {#if displayContentTypes.length > contentTypeDisplayLimit}
              <button
                on:click={loadMoreContentTypes}
                class="w-full text-center px-2 py-1.5 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/40 rounded border border-orange-200 dark:border-orange-800 mt-2"
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
      <h4 class="text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wide mb-2">
        Date Added
      </h4>
      <div class="grid grid-cols-1 gap-1">
        <button
          on:click={() => applyDateFilter('week')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-between {$activeFilters.dateRange?.period === 'week' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : ''}"
        >
          <span class="text-xs">This Week</span>
          <span class="text-[10px] text-gray-400 dark:text-gray-500">{displayDateCounts.week}</span>
        </button>
        <button
          on:click={() => applyDateFilter('twoWeek')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-between {$activeFilters.dateRange?.period === 'twoWeek' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : ''}"
        >
          <span class="text-xs">This 2-Week</span>
          <span class="text-[10px] text-gray-400 dark:text-gray-500">{displayDateCounts.twoWeek}</span>
        </button>
        <button
          on:click={() => applyDateFilter('month')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-between {$activeFilters.dateRange?.period === 'month' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : ''}"
        >
          <span class="text-xs">This Month</span>
          <span class="text-[10px] text-gray-400 dark:text-gray-500">{displayDateCounts.month}</span>
        </button>
        <button
          on:click={() => applyDateFilter('threeMonth')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-between {$activeFilters.dateRange?.period === 'threeMonth' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : ''}"
        >
          <span class="text-xs">This 3-Month</span>
          <span class="text-[10px] text-gray-400 dark:text-gray-500">{displayDateCounts.threeMonth}</span>
        </button>
        <button
          on:click={() => applyDateFilter('sixMonth')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-between {$activeFilters.dateRange?.period === 'sixMonth' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : ''}"
        >
          <span class="text-xs">This 6-Month</span>
          <span class="text-[10px] text-gray-400 dark:text-gray-500">{displayDateCounts.sixMonth}</span>
        </button>
        <button
          on:click={() => applyDateFilter('year')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-between {$activeFilters.dateRange?.period === 'year' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : ''}"
        >
          <span class="text-xs">This Year</span>
          <span class="text-[10px] text-gray-400 dark:text-gray-500">{displayDateCounts.year}</span>
        </button>
        <button
          on:click={() => applyDateFilter('older')}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-between {$activeFilters.dateRange?.period === 'older' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : ''}"
        >
          <span class="text-xs">Older</span>
          <span class="text-[10px] text-gray-400 dark:text-gray-500">{displayDateCounts.older}</span>
        </button>
      </div>
    </div>
  </div>
</div>
