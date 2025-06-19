<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getUniqueDomains, getUniqueFolders } from './database.js';
  
  const dispatch = createEventDispatcher();
  
  let domains = [];
  let folders = [];
  let selectedFilter = null;
  
  onMount(async () => {
    try {
      domains = await getUniqueDomains();
      folders = await getUniqueFolders();
    } catch (error) {
      console.error('Error loading filters:', error);
    }
  });
  
  function applyFilter(type, value) {
    selectedFilter = { type, value };
    dispatch('filter', { type, value });
  }
  
  function clearFilters() {
    selectedFilter = null;
    dispatch('filter', { type: 'clear' });
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
    
    applyFilter('date', { startDate: startDate.getTime(), endDate: now.getTime(), period });
  }
</script>

<div class="w-64 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
  <div class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium text-gray-900">Filters</h3>
      {#if selectedFilter}
        <button
          on:click={clearFilters}
          class="text-xs text-blue-600 hover:text-blue-800"
        >
          Clear
        </button>
      {/if}
    </div>
    
    {#if selectedFilter}
      <div class="mb-4 p-2 bg-blue-50 rounded-md">
        <div class="text-xs text-blue-800">
          {#if selectedFilter.type === 'domain'}
            Domain: {selectedFilter.value}
          {:else if selectedFilter.type === 'folder'}
            Folder: {selectedFilter.value}
          {:else if selectedFilter.type === 'date'}
            {selectedFilter.value.period === 'week' ? 'This Week' : 
             selectedFilter.value.period === 'month' ? 'This Month' : 'This Year'}
          {/if}
        </div>
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
        class:bg-blue-50={selectedFilter?.type === 'date' && selectedFilter.value.period === 'week'}
        class:text-blue-700={selectedFilter?.type === 'date' && selectedFilter.value.period === 'week'}
      >
        This Week
      </button>
      <button
        on:click={() => applyDateFilter('month')}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-blue-50={selectedFilter?.type === 'date' && selectedFilter.value.period === 'month'}
        class:text-blue-700={selectedFilter?.type === 'date' && selectedFilter.value.period === 'month'}
      >
        This Month
      </button>
      <button
        on:click={() => applyDateFilter('year')}
        class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
        class:bg-blue-50={selectedFilter?.type === 'date' && selectedFilter.value.period === 'year'}
        class:text-blue-700={selectedFilter?.type === 'date' && selectedFilter.value.period === 'year'}
      >
        This Year
      </button>
    </div>
  </div>
  
  <!-- Domain Filters -->
  <div class="mb-6">
    <h4 class="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
      Domains ({domains.length})
    </h4>
    <div class="space-y-1 max-h-48 overflow-y-auto">
      {#each domains.slice(0, 20) as domain}
        <button
          on:click={() => applyFilter('domain', domain)}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded truncate"
          class:bg-blue-50={selectedFilter?.type === 'domain' && selectedFilter.value === domain}
          class:text-blue-700={selectedFilter?.type === 'domain' && selectedFilter.value === domain}
          title={domain}
        >
          {domain}
        </button>
      {/each}
      {#if domains.length > 20}
        <div class="text-xs text-gray-400 px-2 py-1">
          ... and {domains.length - 20} more
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
          on:click={() => applyFilter('folder', folder)}
          class="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded truncate"
          class:bg-blue-50={selectedFilter?.type === 'folder' && selectedFilter.value === folder}
          class:text-blue-700={selectedFilter?.type === 'folder' && selectedFilter.value === folder}
          title={folder}
        >
          📁 {folder}
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
