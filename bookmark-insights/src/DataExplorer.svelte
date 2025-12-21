<script>
  import { onMount } from 'svelte';
  import { 
    getDatabaseOverview, 
    getTableRecords, 
    analyzeTableFields,
    getTableFields,
    getCachedMetricsStatus,
    getCachedMetricData,
    invalidateMetric,
    invalidateMetrics,
    clearAllMetrics,
    getMetricsFlowDiagram,
    exportTableAsJSON,
    downloadJSON,
    formatTimestamp,
    formatTimeRemaining,
    formatBytes
  } from './db-explorer.js';
  
  // State
  let loading = true;
  let error = null;
  
  // Database overview
  let dbOverview = null;
  
  // Table browser state
  let selectedTable = 'bookmarks';
  let tableRecords = [];
  let tableFields = [];
  let fieldAnalysis = [];
  let tablePagination = { page: 0, pageSize: 25, totalCount: 0, totalPages: 0 };
  let searchQuery = '';
  let searchField = 'all';
  let sortBy = null;
  let sortOrder = 'desc';
  let expandedRow = null;
  let loadingTable = false;
  
  // Field filter (click on coverage bar)
  let activeFieldFilter = null;
  
  // Cache inspector state
  let cachedMetrics = [];
  let selectedMetrics = new Set();
  let viewingMetricData = null;
  let loadingMetrics = false;
  
  // Flow diagram data (simple HTML rendering, no mermaid)
  let flowDiagram = null;
  
  // Active section (for collapsible panels)
  let activeSection = 'table'; // 'table', 'fields', 'cache', 'diagram', 'overview'
  
  onMount(async () => {
    try {
      await loadDatabaseOverview();
      await loadTableData();
      await loadCachedMetrics();
      await loadFlowDiagram();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });
  
  async function loadDatabaseOverview() {
    dbOverview = await getDatabaseOverview();
  }
  
  async function loadFlowDiagram() {
    flowDiagram = await getMetricsFlowDiagram();
  }
  
  async function loadTableData() {
    loadingTable = true;
    try {
      const options = {
        page: tablePagination.page,
        pageSize: tablePagination.pageSize,
        sortBy,
        sortOrder,
        searchQuery,
        searchField,
        fieldFilter: activeFieldFilter
      };
      
      const result = await getTableRecords(selectedTable, options);
      tableRecords = result.records;
      tablePagination = {
        page: result.page,
        pageSize: result.pageSize,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
        hasPrev: result.hasPrev
      };
      
      tableFields = await getTableFields(selectedTable);
      fieldAnalysis = await analyzeTableFields(selectedTable);
    } catch (err) {
      console.error('Error loading table data:', err);
    } finally {
      loadingTable = false;
    }
  }
  
  async function loadCachedMetrics() {
    loadingMetrics = true;
    try {
      cachedMetrics = await getCachedMetricsStatus();
    } catch (err) {
      console.error('Error loading cached metrics:', err);
    } finally {
      loadingMetrics = false;
    }
  }
  
  // Get status color class for flow diagram
  function getFlowStatusClass(status) {
    switch(status) {
      case 'valid': return 'bg-green-500 text-white';
      case 'expiring': return 'bg-yellow-500 text-white';
      case 'stale': return 'bg-red-500 text-white';
      case 'source': return 'bg-blue-500 text-white';
      case 'storage': return 'bg-purple-500 text-white';
      default: return 'bg-gray-400 text-white';
    }
  }
  
  // Table selection
  async function selectTable(tableName) {
    selectedTable = tableName;
    tablePagination.page = 0;
    searchQuery = '';
    sortBy = null;
    expandedRow = null;
    activeFieldFilter = null;
    await loadTableData();
  }
  
  // Pagination
  async function goToPage(page) {
    tablePagination.page = page;
    expandedRow = null;
    await loadTableData();
  }
  
  async function changePageSize(size) {
    tablePagination.pageSize = size;
    tablePagination.page = 0;
    await loadTableData();
  }
  
  // Sorting
  async function toggleSort(field) {
    if (sortBy === field) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = field;
      sortOrder = 'desc';
    }
    tablePagination.page = 0;
    await loadTableData();
  }
  
  // Search
  async function handleSearch() {
    tablePagination.page = 0;
    await loadTableData();
  }
  
  function clearSearch() {
    searchQuery = '';
    searchField = 'all';
    handleSearch();
  }
  
  // Field filter (from coverage bars)
  async function filterByField(field, hasValue) {
    if (activeFieldFilter?.field === field && activeFieldFilter?.hasValue === hasValue) {
      activeFieldFilter = null;
    } else {
      activeFieldFilter = { field, hasValue };
    }
    tablePagination.page = 0;
    await loadTableData();
  }
  
  function clearFieldFilter() {
    activeFieldFilter = null;
    loadTableData();
  }
  
  // Row expansion
  function toggleRowExpand(index) {
    expandedRow = expandedRow === index ? null : index;
  }
  
  // Export
  async function exportTable(allRecords = false) {
    const options = allRecords ? {} : {
      searchQuery,
      searchField,
      fieldFilter: activeFieldFilter
    };
    
    const json = await exportTableAsJSON(selectedTable, options);
    const filename = `${selectedTable}_${new Date().toISOString().split('T')[0]}.json`;
    downloadJSON(json, filename);
  }
  
  // Copy record as JSON
  function copyRecordJSON(record) {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
  }
  
  // Cache management
  function toggleMetricSelection(key) {
    if (selectedMetrics.has(key)) {
      selectedMetrics.delete(key);
    } else {
      selectedMetrics.add(key);
    }
    selectedMetrics = selectedMetrics; // trigger reactivity
  }
  
  function toggleAllMetrics() {
    if (selectedMetrics.size === cachedMetrics.length) {
      selectedMetrics.clear();
    } else {
      cachedMetrics.forEach(m => selectedMetrics.add(m.key));
    }
    selectedMetrics = selectedMetrics;
  }
  
  async function clearSelectedMetrics() {
    const keys = [...selectedMetrics];
    await invalidateMetrics(keys);
    selectedMetrics.clear();
    await loadCachedMetrics();
    await loadFlowDiagram();
  }
  
  async function viewMetricData(key) {
    const data = await getCachedMetricData(key);
    viewingMetricData = { key, data };
  }
  
  function closeMetricDataView() {
    viewingMetricData = null;
  }
  
  // Refresh all
  async function refreshAll() {
    loading = true;
    try {
      await loadDatabaseOverview();
      await loadTableData();
      await loadCachedMetrics();
      await loadFlowDiagram();
    } finally {
      loading = false;
    }
  }
  
  // Format value for display
  function formatValue(value) {
    if (value === null || value === undefined) return '<null>';
    if (typeof value === 'boolean') return value ? '✓ true' : '✗ false';
    if (typeof value === 'number') return value.toLocaleString();
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      return `[${value.length} items]`;
    }
    if (typeof value === 'object') return '{...}';
    if (typeof value === 'string' && value.length > 60) {
      return value.substring(0, 60) + '...';
    }
    return String(value);
  }
  
  // Get display columns for each table
  function getDisplayColumns(table) {
    const columnMap = {
      bookmarks: ['id', 'title', 'domain', 'category', 'isAlive'],
      events: ['eventId', 'bookmarkId', 'type', 'timestamp'],
      cache: ['key', 'timestamp', 'ttl'],
      settings: ['key'],
      similarities: ['id', 'bookmark1Id', 'bookmark2Id', 'score'],
      computedMetrics: ['key', 'computedAt', 'validUntil'],
      enrichmentQueue: ['queueId', 'bookmarkId', 'addedAt', 'priority']
    };
    return columnMap[table] || tableFields.slice(0, 5);
  }
  
  // Get status color class
  function getStatusClass(status) {
    switch(status) {
      case 'valid': return 'bg-green-100 text-green-800';
      case 'expiring': return 'bg-yellow-100 text-yellow-800';
      case 'stale': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  }
  
  function getStatusIcon(status) {
    switch(status) {
      case 'valid': return '🟢';
      case 'expiring': return '🟡';
      case 'stale': return '🔴';
      default: return '⚪';
    }
  }
</script>

<div class="data-explorer p-4 space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">
      🗄️ Data Explorer
    </h2>
    <button 
      on:click={refreshAll}
      class="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 text-sm"
      disabled={loading}
    >
      {#if loading}
        <span class="animate-spin">⟳</span>
      {:else}
        🔄
      {/if}
      Refresh
    </button>
  </div>
  
  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
      {error}
    </div>
  {/if}
  
  <!-- Database Overview Cards -->
  {#if dbOverview}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h3 class="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
        <span>📊</span> Database Overview
        <span class="text-xs font-normal text-gray-400">
          Total: {dbOverview.totalRecords.toLocaleString()} records • {dbOverview.estimatedSize}
        </span>
      </h3>
      <div class="grid grid-cols-4 md:grid-cols-7 gap-2">
        {#each dbOverview.tables as table}
          <button
            on:click={() => selectTable(table.name)}
            class="p-3 rounded-lg border transition-all hover:shadow-md {selectedTable === table.name ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}"
          >
            <div class="text-2xl">{table.icon}</div>
            <div class="text-lg font-bold text-gray-800">{table.count.toLocaleString()}</div>
            <div class="text-xs text-gray-500 truncate">{table.name}</div>
          </button>
        {/each}
      </div>
    </div>
  {/if}
  
  <!-- Table Browser -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200">
    <div class="p-4 border-b border-gray-200">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-gray-800 flex items-center gap-2">
          {dbOverview?.tables.find(t => t.name === selectedTable)?.icon || '📋'}
          {selectedTable}
          <span class="text-sm font-normal text-gray-500">
            ({tablePagination.totalCount.toLocaleString()} records)
          </span>
        </h3>
        <div class="flex gap-2">
          <button 
            on:click={() => exportTable(false)}
            class="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            title="Export visible/filtered records"
          >
            📥 Export Filtered
          </button>
          <button 
            on:click={() => exportTable(true)}
            class="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            title="Export all records"
          >
            📥 Export All
          </button>
        </div>
      </div>
      
      <!-- Search bar -->
      <div class="flex gap-2">
        <div class="flex-1 relative">
          <input
            type="text"
            bind:value={searchQuery}
            on:keydown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search records..."
            class="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <span class="absolute left-2.5 top-2.5 text-gray-400">🔍</span>
        </div>
        <select 
          bind:value={searchField}
          class="px-3 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="all">All Fields</option>
          {#each tableFields as field}
            <option value={field}>{field}</option>
          {/each}
        </select>
        <button 
          on:click={handleSearch}
          class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Search
        </button>
        {#if searchQuery || activeFieldFilter}
          <button 
            on:click={() => { clearSearch(); clearFieldFilter(); }}
            class="px-3 py-2 text-gray-500 hover:text-gray-700"
          >
            ✕ Clear
          </button>
        {/if}
      </div>
      
      <!-- Active filter indicator -->
      {#if activeFieldFilter}
        <div class="mt-2 flex items-center gap-2 text-sm">
          <span class="text-gray-500">Filter:</span>
          <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded">
            {activeFieldFilter.hasValue ? 'Has' : 'Missing'} "{activeFieldFilter.field}"
          </span>
          <button on:click={clearFieldFilter} class="text-gray-400 hover:text-gray-600">✕</button>
        </div>
      {/if}
    </div>
    
    <!-- Table -->
    <div class="overflow-x-auto">
      {#if loadingTable}
        <div class="p-8 text-center text-gray-500">
          <span class="animate-spin inline-block mr-2">⟳</span> Loading...
        </div>
      {:else if tableRecords.length === 0}
        <div class="p-8 text-center text-gray-500">
          No records found
        </div>
      {:else}
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="w-8 px-2 py-3"></th>
              {#each getDisplayColumns(selectedTable) as col}
                <th 
                  class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  on:click={() => toggleSort(col)}
                >
                  <span class="flex items-center gap-1">
                    {col}
                    {#if sortBy === col}
                      <span class="text-blue-500">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                    {:else}
                      <span class="text-gray-300">⬍</span>
                    {/if}
                  </span>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            {#each tableRecords as record, index}
              <tr 
                class="hover:bg-gray-50 cursor-pointer {expandedRow === index ? 'bg-blue-50' : ''}"
                on:click={() => toggleRowExpand(index)}
              >
                <td class="px-2 py-3 text-center text-gray-400">
                  {expandedRow === index ? '▼' : '▶'}
                </td>
                {#each getDisplayColumns(selectedTable) as col}
                  <td class="px-4 py-3 text-gray-700 max-w-xs truncate" title={String(record[col] ?? '')}>
                    {formatValue(record[col])}
                  </td>
                {/each}
              </tr>
              
              <!-- Expanded row detail -->
              {#if expandedRow === index}
                <tr class="bg-blue-50">
                  <td colspan={getDisplayColumns(selectedTable).length + 1} class="px-4 py-4">
                    <div class="bg-white rounded-lg border border-blue-200 p-4">
                      <div class="flex items-center justify-between mb-3">
                        <h4 class="font-semibold text-gray-800">Record Details</h4>
                        <div class="flex gap-2">
                          <button 
                            on:click|stopPropagation={() => copyRecordJSON(record)}
                            class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                          >
                            📋 Copy JSON
                          </button>
                          {#if record.url}
                            <a 
                              href={record.url} 
                              target="_blank" 
                              rel="noopener"
                              on:click|stopPropagation
                              class="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                            >
                              🔗 Open URL
                            </a>
                          {/if}
                        </div>
                      </div>
                      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {#each Object.entries(record) as [key, value]}
                          <div class="bg-gray-50 rounded p-2">
                            <div class="text-xs text-gray-500 font-medium">{key}</div>
                            <div class="text-gray-800 break-all">
                              {#if typeof value === 'object' && value !== null}
                                <pre class="text-xs overflow-auto max-h-24">{JSON.stringify(value, null, 2)}</pre>
                              {:else if key.includes('date') || key.includes('time') || key.includes('At') || key === 'timestamp'}
                                {value ? new Date(value).toLocaleString() : '-'}
                              {:else}
                                {formatValue(value)}
                              {/if}
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
    
    <!-- Pagination -->
    {#if tableRecords.length > 0}
      <div class="p-4 border-t border-gray-200 flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm text-gray-600">
          <span>Show</span>
          <select 
            value={tablePagination.pageSize}
            on:change={(e) => changePageSize(parseInt(e.target.value))}
            class="px-2 py-1 border border-gray-300 rounded"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>per page</span>
        </div>
        
        <div class="flex items-center gap-2">
          <button 
            on:click={() => goToPage(tablePagination.page - 1)}
            disabled={!tablePagination.hasPrev}
            class="px-3 py-1 rounded border {tablePagination.hasPrev ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}"
          >
            ◀ Prev
          </button>
          <span class="text-sm text-gray-600">
            Page {tablePagination.page + 1} of {tablePagination.totalPages || 1}
          </span>
          <button 
            on:click={() => goToPage(tablePagination.page + 1)}
            disabled={!tablePagination.hasMore}
            class="px-3 py-1 rounded border {tablePagination.hasMore ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}"
          >
            Next ▶
          </button>
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Field Analysis -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
    <h3 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
      📊 Field Coverage
      <span class="text-sm font-normal text-gray-500">Click bars to filter</span>
    </h3>
    <div class="space-y-2">
      {#each fieldAnalysis.slice(0, 12) as field}
        <div class="flex items-center gap-3 text-sm">
          <div class="w-28 text-gray-600 truncate font-mono text-xs" title={field.field}>
            {field.field}
          </div>
          <div class="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden flex cursor-pointer" title="Click to filter">
            <button
              class="h-full bg-green-400 hover:bg-green-500 transition-colors"
              style="width: {field.coverage}%"
              on:click={() => filterByField(field.field, true)}
              title="Show {field.populated} records with this field"
            ></button>
            <button
              class="h-full bg-gray-200 hover:bg-gray-300 transition-colors flex-1"
              on:click={() => filterByField(field.field, false)}
              title="Show {field.empty} records without this field"
            ></button>
          </div>
          <div class="w-20 text-right text-gray-500 text-xs">
            {field.coverage}% ({field.populated})
          </div>
        </div>
      {/each}
    </div>
  </div>
  
  <!-- Cached Metrics -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-semibold text-gray-800 flex items-center gap-2">
        💾 Cached Metrics
        <span class="text-sm font-normal text-gray-500">
          {cachedMetrics.filter(m => m.status === 'valid').length} valid / {cachedMetrics.length} total
        </span>
      </h3>
      {#if selectedMetrics.size > 0}
        <button 
          on:click={clearSelectedMetrics}
          class="px-3 py-1.5 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded-lg"
        >
          🗑️ Clear Selected ({selectedMetrics.size})
        </button>
      {/if}
    </div>
    
    <div class="space-y-1">
      <label class="flex items-center gap-2 p-2 text-sm text-gray-500 hover:bg-gray-50 rounded cursor-pointer">
        <input 
          type="checkbox" 
          checked={selectedMetrics.size === cachedMetrics.length && cachedMetrics.length > 0}
          on:change={toggleAllMetrics}
          class="rounded"
        />
        Select All
      </label>
      
      {#each cachedMetrics as metric}
        <div class="flex items-center gap-3 p-2 hover:bg-gray-50 rounded text-sm">
          <input 
            type="checkbox" 
            checked={selectedMetrics.has(metric.key)}
            on:change={() => toggleMetricSelection(metric.key)}
            class="rounded"
          />
          <span class="text-lg">{getStatusIcon(metric.status)}</span>
          <div class="flex-1 min-w-0">
            <div class="font-mono text-gray-800">{metric.key}</div>
            <div class="text-xs text-gray-500 truncate">{metric.description}</div>
          </div>
          <div class="text-xs text-gray-500 text-right">
            <div>{metric.computedAt ? formatTimestamp(metric.computedAt) : 'never'}</div>
            <div>{metric.timeRemaining ? `expires in ${formatTimeRemaining(metric.timeRemaining)}` : '-'}</div>
          </div>
          <span class="px-2 py-0.5 text-xs rounded-full {getStatusClass(metric.status)}">
            {metric.status}
          </span>
          {#if metric.hasData}
            <button 
              on:click={() => viewMetricData(metric.key)}
              class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
            >
              👁️ View
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </div>
  
  <!-- Metrics Flow Diagram -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
    <h3 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
      🔀 Metrics Dependency Flow
      <span class="text-sm font-normal text-gray-500">
        Colors indicate cache status
      </span>
    </h3>
    <div class="flex gap-4 text-xs text-gray-600 mb-4">
      <span>🟢 Valid</span>
      <span>🟡 Expiring Soon</span>
      <span>🔴 Stale/Expired</span>
      <span>⚪ Never Computed</span>
    </div>
    {#if flowDiagram}
      <div class="bg-gray-50 rounded-lg p-4 space-y-4">
        {#each flowDiagram.layers as layer}
          <div class="text-center">
            <div class="text-xs font-semibold text-gray-500 mb-2">{layer.title}</div>
            <div class="flex flex-wrap justify-center gap-2">
              {#each layer.items as item}
                <span class="px-3 py-1.5 rounded-lg text-xs font-medium {getFlowStatusClass(item.status)}">
                  {item.label}
                </span>
              {/each}
            </div>
          </div>
          {#if layer !== flowDiagram.layers[flowDiagram.layers.length - 1]}
            <div class="text-center text-gray-300 text-lg">↓</div>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="text-center text-gray-500 py-8">
        <span class="animate-spin inline-block mr-2">⟳</span> Loading...
      </div>
    {/if}
  </div>
  
  <!-- Metric Data Viewer Modal -->
  {#if viewingMetricData}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div class="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 class="font-semibold text-gray-800">
            Cached Data: <span class="font-mono text-blue-600">{viewingMetricData.key}</span>
          </h3>
          <button 
            on:click={closeMetricDataView}
            class="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>
        <div class="p-4 overflow-auto max-h-[60vh]">
          <pre class="text-xs bg-gray-50 p-4 rounded-lg overflow-auto">{JSON.stringify(viewingMetricData.data, null, 2)}</pre>
        </div>
        <div class="p-4 border-t border-gray-200 flex justify-end gap-2">
          <button 
            on:click={() => {
              navigator.clipboard.writeText(JSON.stringify(viewingMetricData.data, null, 2));
            }}
            class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            📋 Copy JSON
          </button>
          <button 
            on:click={closeMetricDataView}
            class="px-4 py-2 bg-blue-500 text-white hover:bg-blue-600 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
