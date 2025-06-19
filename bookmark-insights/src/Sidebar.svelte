<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getDomainsByRecency, getDomainsByCount, getUniqueFolders } from './database.js';
  
  const dispatch = createEventDispatcher();
  
  let domainsByRecency = [];
  let domainsByCount = [];
  let folders = [];
  let selectedFilters = {
    domains: [],
    folders: [],
    dateRange: null
  };
  let domainSortMode = 'recency'; // 'recency' or 'count'
  
  onMount(async () => {
    try {
      await loadDomains();
      folders = await getUniqueFolders();
    } catch (error) {
      console.error('Error loading filters:', error);
    }
  });

  async function loadDomains() {
    domainsByRecency = await getDomainsByRecency();
    domainsByCount = await getDomainsByCount();
  }

  $: currentDomains = domainSortMode === 'recency' ? domainsByRecency : domainsByCount;
  
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

  function setDateFilter(startDate, endDate, period) {
    selectedFilters.dateRange = { startDate, endDate, period };
    dispatchFilters();
  }
  
  function clearFilters() {
    selectedFilters = {
      domains: [],
      folders: [],
      dateRange: null
    };
    dispatchFilters();
  }

  function dispatchFilters() {
    dispatch('filter', selectedFilters);
  }

  function hasActiveFilters() {
    return selectedFilters.domains.length > 0 || 
           selectedFilters.folders.length > 0 || 
           selectedFilters.dateRange !== null;
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

<div class="w-64 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
  <div class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium text-gray-900">Filters</h3>
      {#if hasActiveFilters()}
        <button
          on:click={clearFilters}
          class="text-xs text-blue-600 hover:text-blue-800"
        >
          Clear All
        </button>
      {/if}
    </div>
    
    <!-- Active Filters Display -->
    {#if hasActiveFilters()}
      <div class="mb-4 space-y-2">
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
  
  <!-- Date Filters -->
  <div class="mb-6">
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
  
  <!-- Domain Filters -->
  <div class="mb-6">
    <div class="flex items-center justify-between mb-2">
      <h4 class="text-xs font-medium text-gray-700 uppercase tracking-wide">
        Domains ({currentDomains.length})
      </h4>
      <div class="flex space-x-1">
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
    </div>
    <div class="space-y-1 max-h-64 overflow-y-auto">
      {#each currentDomains.slice(0, 30) as domainData}
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
            {#if domainSortMode === 'recency'}
              <span>{formatTimeAgo(domainData.dateAdded || domainData.latestDate)}</span>
            {/if}
          </div>
        </button>
      {/each}
      {#if currentDomains.length > 30}
        <div class="text-xs text-gray-400 px-2 py-1">
          ... and {currentDomains.length - 30} more
        </div>
      {/if}
    </div>
  </div>
  
  <!-- Folder Filters -->
  <div class="mb-6">
    <h4 class="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
      Folders ({folders.length})
    </h4>
    <div class="space-y-1 max-h-48 overflow-y-auto">
      {#each folders.slice(0, 15) as folder}
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
          <span class="truncate">📁 {folder}</span>
        </button>
      {/each}
      {#if folders.length > 15}
        <div class="text-xs text-gray-400 px-2 py-1">
          ... and {folders.length - 15} more
        </div>
      {/if}
    </div>
  </div>
</div>
