<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import InsightCard from './InsightCard.svelte';
  import {
    getCollectionHealthMetrics,
    getContentAnalysis,
    getActionableInsights,
    getDomainIntelligence,
    getTimeBasedAnalysis
  } from './insights.js';
  
  Chart.register(...registerables);
  
  const dispatch = createEventDispatcher();
  
  // State
  let loading = true;
  let activeTab = 'health';
  
  // Data
  let healthMetrics = null;
  let contentAnalysis = null;
  let actionableInsights = null;
  let domainIntelligence = null;
  let timeAnalysis = null;
  
  // Charts
  let categoryChart = null;
  let contentTypeChart = null;
  let ageDistributionChart = null;
  let hourlyChart = null;
  let weekdayChart = null;
  let domainReliabilityChart = null;
  
  // Action states
  let refreshingRediscovery = false;
  let selectedCleanupItems = new Set();
  
  const tabs = [
    { id: 'health', label: 'Health', icon: '❤️' },
    { id: 'content', label: 'Content', icon: '📚' },
    { id: 'actions', label: 'Actions', icon: '⚡' },
    { id: 'domains', label: 'Domains', icon: '🌐' },
    { id: 'time', label: 'Time', icon: '⏰' }
  ];
  
  onMount(async () => {
    await loadAllInsights();
  });
  
  async function loadAllInsights() {
    loading = true;
    try {
      const [health, content, actions, domains, time] = await Promise.all([
        getCollectionHealthMetrics(),
        getContentAnalysis(),
        getActionableInsights(),
        getDomainIntelligence(),
        getTimeBasedAnalysis()
      ]);
      
      healthMetrics = health;
      contentAnalysis = content;
      actionableInsights = actions;
      domainIntelligence = domains;
      timeAnalysis = time;
      
      // Render charts after data loads
      setTimeout(() => {
        renderCharts();
      }, 100);
    } catch (err) {
      console.error('Error loading insights:', err);
    } finally {
      loading = false;
    }
  }
  
  function renderCharts() {
    renderCategoryChart();
    renderContentTypeChart();
    renderAgeDistributionChart();
    renderHourlyChart();
    renderWeekdayChart();
    renderDomainReliabilityChart();
  }
  
  function renderCategoryChart() {
    const ctx = document.getElementById('categoryDonutChart');
    if (!ctx || !contentAnalysis?.categoryBreakdown) return;
    
    if (categoryChart) categoryChart.destroy();
    
    const data = contentAnalysis.categoryBreakdown.slice(0, 8);
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#6B7280'];
    
    categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.category),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { boxWidth: 12, padding: 8, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${ctx.raw} (${data[ctx.dataIndex].percentage}%)`
            }
          }
        },
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const category = data[elements[0].index].category;
            dispatch('filterByCategory', { category });
          }
        }
      }
    });
  }
  
  function renderContentTypeChart() {
    const ctx = document.getElementById('contentTypeChart');
    if (!ctx || !contentAnalysis?.contentTypeMix) return;
    
    if (contentTypeChart) contentTypeChart.destroy();
    
    const data = contentAnalysis.contentTypeMix;
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#6B7280'];
    
    contentTypeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.type.charAt(0).toUpperCase() + d.type.slice(1)),
        datasets: [{
          label: 'Bookmarks',
          data: data.map(d => d.count),
          backgroundColor: colors.slice(0, data.length),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { beginAtZero: true, grid: { display: false } },
          y: { grid: { display: false } }
        }
      }
    });
  }
  
  function renderAgeDistributionChart() {
    const ctx = document.getElementById('ageDistributionChart');
    if (!ctx || !timeAnalysis?.ageDistribution) return;
    
    if (ageDistributionChart) ageDistributionChart.destroy();
    
    const data = timeAnalysis.ageDistribution;
    
    ageDistributionChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.period),
        datasets: [{
          label: 'Bookmarks',
          data: data.map(d => d.count),
          backgroundColor: data.map((_, i) => {
            const intensity = 0.3 + (i * 0.1);
            return `rgba(59, 130, 246, ${Math.min(intensity, 0.9)})`;
          }),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.raw} bookmarks (${data[ctx.dataIndex].percentage}%)`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: '#f3f4f6' } }
        }
      }
    });
  }
  
  function renderHourlyChart() {
    const ctx = document.getElementById('hourlyChart');
    if (!ctx || !timeAnalysis?.bookmarkingHours) return;
    
    if (hourlyChart) hourlyChart.destroy();
    
    const data = timeAnalysis.bookmarkingHours;
    const maxCount = Math.max(...data.map(d => d.count));
    
    hourlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.hour),
        datasets: [{
          label: 'Bookmarks',
          data: data.map(d => d.count),
          backgroundColor: data.map(d => {
            const intensity = d.count / maxCount;
            return `rgba(16, 185, 129, ${0.2 + intensity * 0.7})`;
          }),
          borderRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (ctx) => `${ctx[0].label}:00 - ${ctx[0].label}:59`,
              label: (ctx) => `${ctx.raw} bookmarks saved`
            }
          }
        },
        scales: {
          x: { 
            grid: { display: false },
            ticks: { 
              callback: (val, i) => i % 3 === 0 ? `${i}h` : '',
              maxRotation: 0
            }
          },
          y: { beginAtZero: true, grid: { color: '#f3f4f6' } }
        }
      }
    });
  }
  
  function renderWeekdayChart() {
    const ctx = document.getElementById('weekdayChart');
    if (!ctx || !timeAnalysis?.dayOfWeekDistribution) return;
    
    if (weekdayChart) weekdayChart.destroy();
    
    const data = timeAnalysis.dayOfWeekDistribution;
    const colors = ['#EF4444', '#3B82F6', '#3B82F6', '#3B82F6', '#3B82F6', '#3B82F6', '#EF4444'];
    
    weekdayChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.dayName.slice(0, 3)),
        datasets: [{
          label: 'Bookmarks',
          data: data.map(d => d.count),
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: '#f3f4f6' } }
        }
      }
    });
  }
  
  function renderDomainReliabilityChart() {
    const ctx = document.getElementById('domainReliabilityChart');
    if (!ctx || !domainIntelligence?.reliabilityScores) return;
    
    if (domainReliabilityChart) domainReliabilityChart.destroy();
    
    const data = domainIntelligence.reliabilityScores.slice(0, 10);
    
    domainReliabilityChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.domain.length > 20 ? d.domain.slice(0, 20) + '...' : d.domain),
        datasets: [{
          label: 'Reliability %',
          data: data.map(d => d.reliabilityScore),
          backgroundColor: data.map(d => {
            if (d.reliabilityScore >= 80) return '#10B981';
            if (d.reliabilityScore >= 50) return '#F59E0B';
            return '#EF4444';
          }),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.raw}% alive (${data[ctx.dataIndex].dead} dead of ${data[ctx.dataIndex].checked})`
            }
          }
        },
        scales: {
          x: { 
            beginAtZero: true, 
            max: 100,
            grid: { color: '#f3f4f6' },
            ticks: { callback: v => v + '%' }
          },
          y: { grid: { display: false } }
        },
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const domain = data[elements[0].index].domain;
            dispatch('filterByDomain', { domain });
          }
        }
      }
    });
  }
  
  async function refreshRediscovery() {
    refreshingRediscovery = true;
    try {
      const insights = await getActionableInsights();
      actionableInsights = { ...actionableInsights, rediscoveryFeed: insights.rediscoveryFeed };
    } finally {
      refreshingRediscovery = false;
    }
  }
  
  function toggleCleanupItem(id) {
    if (selectedCleanupItems.has(id)) {
      selectedCleanupItems.delete(id);
    } else {
      selectedCleanupItems.add(id);
    }
    selectedCleanupItems = selectedCleanupItems;
  }
  
  function selectAllCleanup() {
    if (actionableInsights?.cleanupCandidates) {
      actionableInsights.cleanupCandidates.forEach(b => selectedCleanupItems.add(b.id));
      selectedCleanupItems = selectedCleanupItems;
    }
  }
  
  function deselectAllCleanup() {
    selectedCleanupItems.clear();
    selectedCleanupItems = selectedCleanupItems;
  }
  
  function deleteSelectedCleanup() {
    const ids = Array.from(selectedCleanupItems);
    dispatch('deleteBookmarks', { ids });
    selectedCleanupItems.clear();
    selectedCleanupItems = selectedCleanupItems;
  }
  
  function openBookmark(url) {
    window.open(url, '_blank');
  }
  
  function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }
  
  function formatAgo(days) {
    if (days < 1) return 'Today';
    if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  }
  
  function getHealthColor(score) {
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  }
  
  function getHealthBg(score) {
    if (score >= 70) return 'bg-green-100';
    if (score >= 40) return 'bg-yellow-100';
    return 'bg-red-100';
  }
  
  function getMetricColor(value, inverted = false) {
    const v = inverted ? 100 - value : value;
    if (v >= 70) return 'text-green-600';
    if (v >= 40) return 'text-yellow-600';
    return 'text-red-600';
  }
</script>

<div class="space-y-6">
  <!-- Tab Navigation -->
  <div class="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
    {#each tabs as tab}
      <button
        class="px-4 py-2 rounded-t-lg text-sm font-medium transition-colors
               {activeTab === tab.id 
                 ? 'bg-blue-500 text-white' 
                 : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
        on:click={() => { activeTab = tab.id; setTimeout(renderCharts, 100); }}
      >
        <span class="mr-1">{tab.icon}</span>
        {tab.label}
      </button>
    {/each}
    
    <button
      class="ml-auto px-3 py-2 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      on:click={loadAllInsights}
      disabled={loading}
    >
      <span class="transform {loading ? 'animate-spin' : ''}">🔄</span>
      Refresh
    </button>
  </div>
  
  {#if loading}
    <div class="flex items-center justify-center py-16">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      <span class="ml-3 text-gray-500">Loading insights...</span>
    </div>
  {:else}
    
    <!-- HEALTH TAB -->
    {#if activeTab === 'health' && healthMetrics}
      <div class="space-y-6">
        <!-- Overall Health Score -->
        <div class="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-medium opacity-90">Collection Health Score</h2>
              <p class="text-sm opacity-75 mt-1">{healthMetrics.total.toLocaleString()} total bookmarks</p>
            </div>
            <div class="text-right">
              <div class="text-5xl font-bold">{healthMetrics.healthScore}</div>
              <div class="text-sm opacity-75">out of 100</div>
            </div>
          </div>
          
          <!-- Health bar -->
          <div class="mt-4 bg-white/20 rounded-full h-3 overflow-hidden">
            <div 
              class="h-full bg-white rounded-full transition-all duration-500"
              style="width: {healthMetrics.healthScore}%"
            ></div>
          </div>
        </div>
        
        <!-- Metric Cards Grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <!-- ROI -->
          <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
               on:click={() => dispatch('filterByAccessed', { accessed: true })}
               on:keypress={(e) => e.key === 'Enter' && dispatch('filterByAccessed', { accessed: true })}
               role="button" tabindex="0">
            <div class="text-xs text-gray-500 uppercase tracking-wide">Bookmark ROI</div>
            <div class="text-2xl font-bold mt-1 {getMetricColor(healthMetrics.roi)}">{healthMetrics.roi}%</div>
            <div class="text-xs text-gray-400 mt-1">{healthMetrics.metrics.accessed} of {healthMetrics.total} used</div>
          </div>
          
          <!-- Decay Rate -->
          <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
               on:click={() => dispatch('filterByStale')}
               on:keypress={(e) => e.key === 'Enter' && dispatch('filterByStale')}
               role="button" tabindex="0">
            <div class="text-xs text-gray-500 uppercase tracking-wide">Decay Rate</div>
            <div class="text-2xl font-bold mt-1 {getMetricColor(healthMetrics.decayRate, true)}">{healthMetrics.decayRate}%</div>
            <div class="text-xs text-gray-400 mt-1">{healthMetrics.metrics.decayed} old & unused</div>
          </div>
          
          <!-- Dead Links -->
          <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
               on:click={() => dispatch('filterByDead')}
               on:keypress={(e) => e.key === 'Enter' && dispatch('filterByDead')}
               role="button" tabindex="0">
            <div class="text-xs text-gray-500 uppercase tracking-wide">Dead Links</div>
            <div class="text-2xl font-bold mt-1 {getMetricColor(healthMetrics.deadLinkRatio, true)}">{healthMetrics.deadLinkRatio}%</div>
            <div class="text-xs text-gray-400 mt-1">{healthMetrics.metrics.dead} of {healthMetrics.metrics.checked} checked</div>
          </div>
          
          <!-- Enrichment -->
          <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
               on:click={() => dispatch('filterByUnenriched')}
               on:keypress={(e) => e.key === 'Enter' && dispatch('filterByUnenriched')}
               role="button" tabindex="0">
            <div class="text-xs text-gray-500 uppercase tracking-wide">Enriched</div>
            <div class="text-2xl font-bold mt-1 {getMetricColor(healthMetrics.enrichmentCoverage)}">{healthMetrics.enrichmentCoverage}%</div>
            <div class="text-xs text-gray-400 mt-1">{healthMetrics.metrics.enriched} with metadata</div>
          </div>
          
          <!-- Categorized -->
          <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
               on:click={() => dispatch('filterByUncategorized')}
               on:keypress={(e) => e.key === 'Enter' && dispatch('filterByUncategorized')}
               role="button" tabindex="0">
            <div class="text-xs text-gray-500 uppercase tracking-wide">Categorized</div>
            <div class="text-2xl font-bold mt-1 {getMetricColor(healthMetrics.categorizationCoverage)}">{healthMetrics.categorizationCoverage}%</div>
            <div class="text-xs text-gray-400 mt-1">{healthMetrics.metrics.categorized} tagged</div>
          </div>
          
          <!-- Duplicates -->
          <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
               on:click={() => dispatch('showDuplicates')}
               on:keypress={(e) => e.key === 'Enter' && dispatch('showDuplicates')}
               role="button" tabindex="0">
            <div class="text-xs text-gray-500 uppercase tracking-wide">Duplicates</div>
            <div class="text-2xl font-bold mt-1 {getMetricColor(healthMetrics.duplicateScore, true)}">{healthMetrics.duplicateScore}%</div>
            <div class="text-xs text-gray-400 mt-1">{healthMetrics.metrics.duplicates} duplicate URLs</div>
          </div>
        </div>
        
        <!-- Health Tips -->
        <InsightCard title="Improvement Tips" icon="💡" variant="info">
          <div class="space-y-2 text-sm">
            {#if healthMetrics.roi < 30}
              <div class="flex items-start gap-2">
                <span class="text-yellow-500">⚠️</span>
                <span>Low bookmark ROI ({healthMetrics.roi}%) — consider reviewing and removing unused bookmarks</span>
              </div>
            {/if}
            {#if healthMetrics.decayRate > 50}
              <div class="flex items-start gap-2">
                <span class="text-yellow-500">⚠️</span>
                <span>High decay rate ({healthMetrics.decayRate}%) — many old bookmarks never accessed</span>
              </div>
            {/if}
            {#if healthMetrics.deadLinkRatio > 10}
              <div class="flex items-start gap-2">
                <span class="text-red-500">🔗</span>
                <span>{healthMetrics.metrics.dead} dead links detected — consider cleanup</span>
              </div>
            {/if}
            {#if healthMetrics.enrichmentCoverage < 50}
              <div class="flex items-start gap-2">
                <span class="text-blue-500">📝</span>
                <span>Run enrichment to improve metadata coverage ({healthMetrics.enrichmentCoverage}%)</span>
              </div>
            {/if}
            {#if healthMetrics.healthScore >= 70}
              <div class="flex items-start gap-2">
                <span class="text-green-500">✅</span>
                <span>Your collection is in good health!</span>
              </div>
            {/if}
          </div>
        </InsightCard>
      </div>
    {/if}
    
    <!-- CONTENT TAB -->
    {#if activeTab === 'content' && contentAnalysis}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Category Distribution -->
        <InsightCard title="Category Distribution" icon="📂" subtitle="Click a segment to filter">
          <div class="h-64">
            <canvas id="categoryDonutChart"></canvas>
          </div>
        </InsightCard>
        
        <!-- Content Types -->
        <InsightCard title="Content Type Mix" icon="🎯">
          <div class="h-64">
            <canvas id="contentTypeChart"></canvas>
          </div>
        </InsightCard>
        
        <!-- Topic Clusters (Word Cloud) -->
        <InsightCard title="Topic Clusters" icon="🏷️" subtitle="Most common keywords from your bookmarks">
          <div class="flex flex-wrap gap-2">
            {#each contentAnalysis.topicClusters.slice(0, 25) as topic}
              {@const size = Math.min(1.5, 0.7 + (topic.count / contentAnalysis.topicClusters[0].count))}
              <button
                class="px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                style="font-size: {size}rem"
                on:click={() => dispatch('searchQuery', { query: topic.keyword })}
              >
                {topic.keyword}
                <span class="text-xs opacity-60 ml-1">({topic.count})</span>
              </button>
            {/each}
            {#if contentAnalysis.topicClusters.length === 0}
              <p class="text-gray-500 text-sm">No keywords found. Run enrichment to extract keywords.</p>
            {/if}
          </div>
        </InsightCard>
        
        <!-- Folder Distribution -->
        <InsightCard title="Folder Distribution" icon="📁" subtitle="Where your bookmarks live">
          <div class="space-y-2 insight-scrollable">
            {#each contentAnalysis.folderDistribution as folder}
              <div class="flex items-center gap-2">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm truncate" title={folder.folder}>{folder.folder}</span>
                    <span class="text-xs text-gray-500">{folder.count}</span>
                  </div>
                  <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div 
                      class="h-full bg-purple-500 rounded-full"
                      style="width: {folder.percentage}%"
                    ></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </InsightCard>
        
        <!-- Language Distribution -->
        <InsightCard title="Language Distribution" icon="🌍" collapsible collapsed={true}>
          <div class="space-y-2">
            {#each contentAnalysis.languageDistribution.slice(0, 10) as lang}
              <div class="flex items-center justify-between">
                <span class="text-sm">{lang.language}</span>
                <span class="text-sm font-medium">{lang.count} ({lang.percentage}%)</span>
              </div>
            {/each}
          </div>
        </InsightCard>
      </div>
    {/if}
    
    <!-- ACTIONS TAB -->
    {#if activeTab === 'actions' && actionableInsights}
      <div class="space-y-6">
        <!-- Quick Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-yellow-700">{actionableInsights.stats.totalStale}</div>
            <div class="text-sm text-yellow-600">Stale bookmarks</div>
          </div>
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-red-700">{actionableInsights.stats.totalCleanupCandidates}</div>
            <div class="text-sm text-red-600">Cleanup candidates</div>
          </div>
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-gray-700">{actionableInsights.stats.deadLinksCount}</div>
            <div class="text-sm text-gray-600">Dead links</div>
          </div>
          <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-orange-700">{actionableInsights.stats.totalLowValueDomains}</div>
            <div class="text-sm text-orange-600">Low-value domains</div>
          </div>
        </div>
        
        <!-- Rediscovery Feed -->
        <InsightCard title="Rediscovery Feed" icon="🔮" subtitle="Random old bookmarks you might have forgotten">
          <div slot="header-actions">
            <button
              class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center gap-1"
              on:click={refreshRediscovery}
              disabled={refreshingRediscovery}
            >
              <span class="transform {refreshingRediscovery ? 'animate-spin' : ''}">🔀</span>
              Shuffle
            </button>
          </div>
          
          <div class="space-y-3">
            {#each actionableInsights.rediscoveryFeed as bookmark}
              <div class="flex items-start gap-3 p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-100">
                <div class="flex-1 min-w-0">
                  <a 
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-1"
                  >
                    {bookmark.title}
                  </a>
                  <div class="text-xs text-gray-500 mt-1">{bookmark.domain} • {formatAgo(bookmark.ageInDays)}</div>
                  {#if bookmark.description}
                    <p class="text-xs text-gray-600 mt-1 line-clamp-2">{bookmark.description}</p>
                  {/if}
                </div>
                <button
                  class="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors"
                  on:click={() => openBookmark(bookmark.url)}
                  title="Open in new tab"
                >
                  ↗️
                </button>
              </div>
            {/each}
            {#if actionableInsights.rediscoveryFeed.length === 0}
              <p class="text-gray-500 text-sm">No old bookmarks to rediscover</p>
            {/if}
          </div>
        </InsightCard>
        
        <!-- Cleanup Candidates -->
        <InsightCard title="Cleanup Candidates" icon="🧹" variant="danger" subtitle="Dead links and old unused bookmarks">
          <div slot="header-actions" class="flex gap-2">
            {#if selectedCleanupItems.size > 0}
              <button
                class="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                on:click={deleteSelectedCleanup}
              >
                Delete {selectedCleanupItems.size} selected
              </button>
              <button
                class="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                on:click={deselectAllCleanup}
              >
                Deselect
              </button>
            {:else}
              <button
                class="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                on:click={selectAllCleanup}
              >
                Select All
              </button>
            {/if}
          </div>
          
          <div class="space-y-2 insight-scrollable">
            {#each actionableInsights.cleanupCandidates as bookmark}
              <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200">
                <input
                  type="checkbox"
                  checked={selectedCleanupItems.has(bookmark.id)}
                  on:change={() => toggleCleanupItem(bookmark.id)}
                  class="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm truncate">{bookmark.title}</span>
                    <span class="px-1.5 py-0.5 text-xs rounded {bookmark.isAlive === false ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}">
                      {bookmark.reason}
                    </span>
                  </div>
                  <div class="text-xs text-gray-500">{bookmark.domain} • {formatAgo(bookmark.ageInDays)}</div>
                </div>
              </div>
            {/each}
            {#if actionableInsights.cleanupCandidates.length === 0}
              <p class="text-gray-500 text-sm">No cleanup candidates found. Great job keeping things tidy!</p>
            {/if}
          </div>
        </InsightCard>
        
        <!-- Stale Queue -->
        <InsightCard title="Stale Queue" icon="📋" variant="warning" subtitle="Unread bookmarks older than 30 days" collapsible>
          <div class="space-y-2 insight-scrollable">
            {#each actionableInsights.staleQueue.slice(0, 20) as bookmark}
              <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-yellow-50">
                <div class="flex-1 min-w-0">
                  <a 
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-sm text-gray-900 hover:text-blue-600 truncate block"
                  >
                    {bookmark.title}
                  </a>
                  <div class="text-xs text-gray-500">{bookmark.domain} • {formatAgo(bookmark.ageInDays)}</div>
                </div>
              </div>
            {/each}
            {#if actionableInsights.staleQueue.length > 20}
              <p class="text-xs text-gray-500 pt-2">...and {actionableInsights.staleQueue.length - 20} more</p>
            {/if}
          </div>
        </InsightCard>
      </div>
    {/if}
    
    <!-- DOMAINS TAB -->
    {#if activeTab === 'domains' && domainIntelligence}
      <div class="space-y-6">
        <!-- Domain Stats Overview -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-blue-700">{domainIntelligence.uniqueDomains}</div>
            <div class="text-sm text-blue-600">Unique domains</div>
          </div>
          <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-green-700">{domainIntelligence.diversityScore}%</div>
            <div class="text-sm text-green-600">Diversity score</div>
          </div>
          <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-purple-700">{domainIntelligence.valuableDomains.length}</div>
            <div class="text-sm text-purple-600">High-value domains</div>
          </div>
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-red-700">{domainIntelligence.ephemeralSources.length}</div>
            <div class="text-sm text-red-600">Unreliable domains</div>
          </div>
        </div>
        
        <!-- Dependency Warnings -->
        {#if domainIntelligence.dependencyWarnings.length > 0}
          <InsightCard title="Concentration Warnings" icon="⚠️" variant="warning" subtitle="Domains with >10% of your bookmarks">
            <div class="space-y-3">
              {#each domainIntelligence.dependencyWarnings as warning}
                <div class="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div>
                    <button
                      class="font-medium text-gray-900 hover:text-blue-600"
                      on:click={() => dispatch('filterByDomain', { domain: warning.domain })}
                    >
                      {warning.domain}
                    </button>
                    <div class="text-xs text-gray-500">Category: {warning.topCategory}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-lg font-bold text-yellow-700">{warning.percentage}%</div>
                    <div class="text-xs text-gray-500">{warning.count} bookmarks</div>
                  </div>
                </div>
              {/each}
            </div>
          </InsightCard>
        {/if}
        
        <!-- Domain Reliability -->
        <InsightCard title="Domain Reliability" icon="🛡️" subtitle="Click to filter by domain">
          <div class="h-72">
            <canvas id="domainReliabilityChart"></canvas>
          </div>
        </InsightCard>
        
        <!-- Valuable Domains -->
        <InsightCard title="Most Valuable Domains" icon="⭐" subtitle="Domains you actually use">
          <div class="space-y-2">
            {#each domainIntelligence.valuableDomains as domain}
              <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                <button
                  class="text-sm font-medium text-gray-900 hover:text-blue-600"
                  on:click={() => dispatch('filterByDomain', { domain: domain.domain })}
                >
                  {domain.domain}
                </button>
                <div class="flex items-center gap-4 text-sm">
                  <span class="text-gray-500">{domain.total} bookmarks</span>
                  <span class="text-green-600">{domain.totalAccess} visits</span>
                  <span class="text-blue-600">{domain.engagementRate}% engaged</span>
                </div>
              </div>
            {/each}
          </div>
        </InsightCard>
        
        <!-- Ephemeral Sources -->
        {#if domainIntelligence.ephemeralSources.length > 0}
          <InsightCard title="Ephemeral Sources" icon="💨" variant="danger" subtitle="Domains with high dead link rates">
            <div class="space-y-2">
              {#each domainIntelligence.ephemeralSources as domain}
                <div class="flex items-center justify-between p-2 bg-red-50 rounded-lg">
                  <span class="text-sm font-medium text-gray-900">{domain.domain}</span>
                  <div class="flex items-center gap-4 text-sm">
                    <span class="text-red-600">{domain.deadRate}% dead</span>
                    <span class="text-gray-500">{domain.dead} of {domain.checked}</span>
                  </div>
                </div>
              {/each}
            </div>
          </InsightCard>
        {/if}
        
        <!-- Knowledge Map -->
        <InsightCard title="Knowledge Map" icon="🗺️" subtitle="Top 25 domains in your collection" collapsible>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 insight-scrollable">
            {#each domainIntelligence.knowledgeMap as domain}
              <button
                class="p-3 bg-gray-50 rounded-lg hover:bg-blue-50 hover:border-blue-200 border border-gray-200 text-left transition-colors"
                on:click={() => dispatch('filterByDomain', { domain: domain.domain })}
              >
                <div class="font-medium text-sm truncate">{domain.domain}</div>
                <div class="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span>{domain.total} bookmarks</span>
                  {#if domain.topCategory}
                    <span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{domain.topCategory}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </InsightCard>
      </div>
    {/if}
    
    <!-- TIME TAB -->
    {#if activeTab === 'time' && timeAnalysis}
      <div class="space-y-6">
        <!-- Time Stats Overview -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-blue-700">{timeAnalysis.avgAgeDays}</div>
            <div class="text-sm text-blue-600">Avg age (days)</div>
          </div>
          <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-green-700">{timeAnalysis.peakHours.join(', ')}</div>
            <div class="text-sm text-green-600">Peak hours</div>
          </div>
          <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-purple-700">{timeAnalysis.weekdayVsWeekend.weekday.percentage}%</div>
            <div class="text-sm text-purple-600">Weekday saves</div>
          </div>
          <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-orange-700">{timeAnalysis.weekdayVsWeekend.weekend.percentage}%</div>
            <div class="text-sm text-orange-600">Weekend saves</div>
          </div>
        </div>
        
        <!-- Hourly Distribution -->
        <InsightCard title="Bookmarking by Hour" icon="🕐" subtitle="When do you save bookmarks?">
          <div class="h-48">
            <canvas id="hourlyChart"></canvas>
          </div>
        </InsightCard>
        
        <!-- Day of Week -->
        <InsightCard title="Bookmarking by Day" icon="📅">
          <div class="h-48">
            <canvas id="weekdayChart"></canvas>
          </div>
        </InsightCard>
        
        <!-- Age Distribution -->
        <InsightCard title="Collection Age Distribution" icon="📊" subtitle="How old are your bookmarks?">
          <div class="h-56">
            <canvas id="ageDistributionChart"></canvas>
          </div>
        </InsightCard>
        
        <!-- Monthly Trend -->
        <InsightCard title="Monthly Save Activity" icon="📈" subtitle="Last 12 months">
          <div class="space-y-2">
            {#each timeAnalysis.monthlyCreationTrend as month}
              {@const maxCount = Math.max(...timeAnalysis.monthlyCreationTrend.map(m => m.count))}
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-500 w-16">{month.monthLabel}</span>
                <div class="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div 
                    class="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                    style="width: {maxCount > 0 ? (month.count / maxCount) * 100 : 0}%"
                  ></div>
                </div>
                <span class="text-xs font-medium text-gray-700 w-10 text-right">{month.count}</span>
              </div>
            {/each}
          </div>
        </InsightCard>
      </div>
    {/if}
  {/if}
</div>

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
