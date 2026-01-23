<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import InsightCard from './InsightCard.svelte';
  import {
    getContentAnalysis,
    getActionableInsights,
    getDomainIntelligence,
    getTimeBasedAnalysis,
    getPlatformDistribution,
    getCreatorLeaderboard
  } from './insights.js';
  import { getPlatformDisplayName, getPlatformIcon, getContentTypeDisplayName } from './url-parsers.js';
  
  Chart.register(...registerables);
  
  const dispatch = createEventDispatcher();
  
  // State
  let loading = true;
  let activeTab = 'content';
  
  // Data
  let contentAnalysis = null;
  let actionableInsights = null;
  let domainIntelligence = null;
  let timeAnalysis = null;
  let platformDistribution = null;
  let creatorLeaderboard = null;
  
  // Charts
  let categoryChart = null;
  let contentTypeChart = null;
  let platformChart = null;
  let dateAddedChart = null;
  
  // Action states
  let refreshingRediscovery = false;
  
  // Simplified tabs: Content & Overview, Actions
  const tabs = [
    { id: 'content', label: 'Content & Overview', icon: '📚' },
    { id: 'actions', label: 'Actions', icon: '⚡' }
  ];
  
  onMount(async () => {
    await loadAllInsights();
  });
  
  async function loadAllInsights() {
    loading = true;
    try {
      const [content, actions, domains, time, platforms, creators] = await Promise.all([
        getContentAnalysis(),
        getActionableInsights(),
        getDomainIntelligence(),
        getTimeBasedAnalysis(),
        getPlatformDistribution(),
        getCreatorLeaderboard(15)
      ]);
      
      contentAnalysis = content;
      actionableInsights = actions;
      domainIntelligence = domains;
      timeAnalysis = time;
      platformDistribution = platforms;
      creatorLeaderboard = creators;
      
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
  
  function isDarkMode() {
    return document.documentElement.classList.contains('dark');
  }

  function getChartDefaults() {
    const isDark = isDarkMode();
    return {
      textColor: isDark ? '#9ca3af' : '#6b7280',
      gridColor: isDark ? 'rgba(75, 85, 99, 0.3)' : '#f3f4f6',
      borderColor: isDark ? '#1f2937' : '#fff'
    };
  }
  
  function renderCharts() {
    const defaults = getChartDefaults();
    Chart.defaults.color = defaults.textColor;
    Chart.defaults.borderColor = defaults.gridColor;
    
    renderCategoryChart(defaults);
    renderContentTypeChart(defaults);
    renderPlatformChart(defaults);
    renderDateAddedChart(defaults);
  }
  
  function renderPlatformChart(defaults) {
    const ctx = document.getElementById('platformDonutChart');
    if (!ctx || !platformDistribution?.platforms) return;
    
    if (platformChart) platformChart.destroy();
    
    const data = platformDistribution.platforms.slice(0, 8);
    const colors = {
      'youtube': '#FF0000',
      'github': isDarkMode() ? '#e5e7eb' : '#24292F',
      'medium': '#00AB6C',
      'devto': isDarkMode() ? '#e5e7eb' : '#0A0A0A',
      'substack': '#FF6719',
      'twitter': '#1DA1F2',
      'reddit': '#FF4500',
      'stackoverflow': '#F48024',
      'npm': '#CB3837',
      'other': '#6B7280'
    };
    
    platformChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => getPlatformDisplayName(d.platform)),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: data.map(d => colors[d.platform] || colors.other),
          borderWidth: 2,
          borderColor: defaults.borderColor
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { boxWidth: 12, padding: 8, font: { size: 11 }, color: defaults.textColor }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${ctx.raw} (${data[ctx.dataIndex].percentage}%)`
            }
          }
        },
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const platform = data[elements[0].index].platform;
            dispatch('filterByPlatform', { platform });
          }
        }
      }
    });
  }
  
  function renderCategoryChart(defaults) {
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
          borderColor: defaults.borderColor
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { boxWidth: 12, padding: 8, font: { size: 11 }, color: defaults.textColor }
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
  
  function renderContentTypeChart(defaults) {
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
          x: { 
            beginAtZero: true, 
            grid: { color: defaults.gridColor },
            ticks: { color: defaults.textColor }
          },
          y: { 
            grid: { display: false },
            ticks: { color: defaults.textColor }
          }
        }
      }
    });
  }
  
  function renderDateAddedChart(defaults) {
    const ctx = document.getElementById('dateAddedChart');
    if (!ctx || !timeAnalysis?.monthlyCreationTrend) return;
    
    if (dateAddedChart) dateAddedChart.destroy();
    
    const data = timeAnalysis.monthlyCreationTrend;
    
    dateAddedChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.monthLabel),
        datasets: [{
          label: 'Bookmarks Added',
          data: data.map(d => d.count),
          fill: true,
          borderColor: '#3B82F6',
          backgroundColor: isDarkMode() ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.raw} bookmarks added`
            }
          }
        },
        scales: {
          x: { 
            grid: { display: false },
            ticks: { maxRotation: 45, minRotation: 45, color: defaults.textColor }
          },
          y: { 
            beginAtZero: true, 
            grid: { color: defaults.gridColor },
            ticks: { color: defaults.textColor }
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
</script>

<div class="space-y-6">
  <!-- Tab Navigation -->
  <div class="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
    {#each tabs as tab}
      <button
        class="px-4 py-2 rounded-t-lg text-sm font-medium transition-colors
               {activeTab === tab.id 
                 ? 'bg-blue-500 text-white' 
                 : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}"
        on:click={() => { activeTab = tab.id; setTimeout(renderCharts, 100); }}
      >
        <span class="mr-1">{tab.icon}</span>
        {tab.label}
      </button>
    {/each}
    
    <button
      class="ml-auto px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1 transition-colors"
      on:click={loadAllInsights}
      disabled={loading}
    >
      <span class="transform {loading ? 'animate-spin' : ''}">🔄</span>
      Refresh
    </button>
  </div>
  
  {#if loading}
    <div class="flex items-center justify-center py-16">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 dark:border-blue-400"></div>
      <span class="ml-3 text-gray-500 dark:text-gray-400">Loading insights...</span>
    </div>
  {:else}
    
    <!-- CONTENT & OVERVIEW TAB -->
    {#if activeTab === 'content' && contentAnalysis}
      <div class="space-y-6">
        <!-- Quick Stats Row -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/40 border border-blue-200 dark:border-blue-800/50 rounded-lg p-4 transition-colors">
            <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">{contentAnalysis.totalBookmarks}</div>
            <div class="text-sm text-blue-600 dark:text-blue-400/80">Total Bookmarks</div>
          </div>
          <div class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/40 dark:to-purple-800/40 border border-purple-200 dark:border-purple-800/50 rounded-lg p-4 transition-colors">
            <div class="text-2xl font-bold text-purple-700 dark:text-purple-300">{contentAnalysis.categoryBreakdown?.length || 0}</div>
            <div class="text-sm text-purple-600 dark:text-purple-400/80">Categories</div>
          </div>
          <div class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/40 dark:to-green-800/40 border border-green-200 dark:border-green-800/50 rounded-lg p-4 transition-colors">
            <div class="text-2xl font-bold text-green-700 dark:text-green-300">{platformDistribution?.platforms?.length || 0}</div>
            <div class="text-sm text-green-600 dark:text-green-400/80">Platforms</div>
          </div>
          <div class="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/40 dark:to-orange-800/40 border border-orange-200 dark:border-orange-800/50 rounded-lg p-4 transition-colors">
            <div class="text-2xl font-bold text-orange-700 dark:text-orange-300">{creatorLeaderboard?.length || 0}</div>
            <div class="text-sm text-orange-600 dark:text-orange-400/80">Creators</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Platform Distribution Chart -->
          <InsightCard title="Platform Breakdown" icon="📱" subtitle="Click to filter by platform">
            <div class="h-64">
              <canvas id="platformDonutChart"></canvas>
            </div>
          </InsightCard>
          
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
          
          <!-- Date Added Chart -->
          <InsightCard title="Bookmarks Added Over Time" icon="📅" subtitle="Last 12 months">
            <div class="h-64">
              <canvas id="dateAddedChart"></canvas>
            </div>
          </InsightCard>
        </div>
        
        <!-- Topic Clusters (Word Cloud) -->
        <InsightCard title="Topic Clusters" icon="🏷️" subtitle="Most common keywords from your bookmarks">
          <div class="flex flex-wrap gap-2">
            {#if contentAnalysis.topicClusters && contentAnalysis.topicClusters.length > 0}
              {#each contentAnalysis.topicClusters.slice(0, 25) as topic}
                {@const size = Math.min(1.5, 0.7 + (topic.count / contentAnalysis.topicClusters[0].count))}
                <button
                  class="px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  style="font-size: {size}rem"
                  on:click={() => dispatch('searchQuery', { query: topic.keyword })}
                >
                  {topic.keyword}
                  <span class="text-xs opacity-60 ml-1">({topic.count})</span>
                </button>
              {/each}
            {:else}
              <p class="text-gray-500 dark:text-gray-400 text-sm">No keywords found. Run enrichment to extract keywords.</p>
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
                    <span class="text-sm truncate text-gray-700 dark:text-gray-200" title={folder.folder}>{folder.folder}</span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">{folder.count}</span>
                  </div>
                  <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div 
                      class="h-full bg-purple-500 dark:bg-purple-600 rounded-full"
                      style="width: {folder.percentage}%"
                    ></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </InsightCard>
        
        <!-- Top Creators Leaderboard -->
        {#if creatorLeaderboard && creatorLeaderboard.length > 0}
          <InsightCard title="Creator Leaderboard" icon="🏆" subtitle="Your most bookmarked creators">
            <div class="space-y-2 insight-scrollable">
              {#each creatorLeaderboard.slice(0, 10) as creator, index}
                <button
                  class="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                  on:click={() => dispatch('filterByCreator', { creator: creator.creator })}
                >
                  <div class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                    {index + 1}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm truncate text-gray-900 dark:text-gray-100">{creator.creator}</span>
                      <span class="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded" title={getPlatformDisplayName(creator.platform)}>
                        {getPlatformIcon(creator.platform)}
                      </span>
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">{creator.count} bookmarks</div>
                  </div>
                  <div class="text-right">
                    <div class="text-xs font-medium text-green-600 dark:text-green-400">+{creator.recentCount || 0}</div>
                    <div class="text-xs text-gray-400 dark:text-gray-500">last 30d</div>
                  </div>
                </button>
              {/each}
            </div>
          </InsightCard>
        {/if}

        <!-- Ephemeral Sources -->
        {#if domainIntelligence?.ephemeralSources?.length > 0}
          <InsightCard title="Ephemeral Sources" icon="💨" variant="danger" subtitle="Domains with high dead link rates">
            <div class="space-y-2">
              {#each domainIntelligence.ephemeralSources as domain}
                <div class="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/30">
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{domain.domain}</span>
                  <div class="flex items-center gap-4 text-sm">
                    <span class="text-red-600 dark:text-red-400">{domain.deadRate}% dead</span>
                    <span class="text-gray-500 dark:text-gray-400">{domain.dead} of {domain.checked}</span>
                  </div>
                </div>
              {/each}
            </div>
          </InsightCard>
        {/if}
      </div>
    {/if}
    
    <!-- ACTIONS TAB -->
    {#if activeTab === 'actions' && actionableInsights}
      <div class="space-y-6">
        <!-- Quick Stats -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg p-4 transition-colors">
            <div class="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{actionableInsights.stats.totalStale}</div>
            <div class="text-sm text-yellow-600 dark:text-yellow-500/80">Stale bookmarks</div>
          </div>
          <div class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-colors">
            <div class="text-2xl font-bold text-gray-700 dark:text-gray-300">{actionableInsights.stats.deadLinksCount}</div>
            <div class="text-sm text-gray-600 dark:text-gray-500/80">Dead links (check Health)</div>
          </div>
          <div class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-lg p-4 transition-colors">
            <div class="text-2xl font-bold text-orange-700 dark:text-orange-400">{actionableInsights.stats.totalLowValueDomains}</div>
            <div class="text-sm text-orange-600 dark:text-orange-500/80">Low-value domains</div>
          </div>
        </div>
        
        <!-- Rediscovery Feed -->
        <InsightCard title="Rediscovery Feed" icon="🔮" subtitle="Random old bookmarks you might have forgotten">
          <div slot="header-actions">
            <button
              class="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 flex items-center gap-1 transition-colors"
              on:click={refreshRediscovery}
              disabled={refreshingRediscovery}
            >
              <span class="transform {refreshingRediscovery ? 'animate-spin' : ''}">🔀</span>
              Shuffle
            </button>
          </div>
          
          <div class="space-y-2">
            {#each actionableInsights.rediscoveryFeed as bookmark}
              <div class="flex items-start gap-2 p-2 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 rounded-lg border border-purple-100 dark:border-purple-800/50 transition-colors">
                <div class="flex-1 min-w-0">
                  <a 
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1"
                  >
                    {bookmark.title}
                  </a>
                  <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">{bookmark.domain} • {formatAgo(bookmark.ageInDays)}</div>
                  {#if bookmark.description}
                    <p class="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{bookmark.description}</p>
                  {/if}
                </div>
                <button
                  class="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors"
                  on:click={() => openBookmark(bookmark.url)}
                  title="Open in new tab"
                >
                  ↗️
                </button>
              </div>
            {/each}
            {#if actionableInsights.rediscoveryFeed.length === 0}
              <p class="text-gray-500 dark:text-gray-400 text-sm">No old bookmarks to rediscover</p>
            {/if}
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
  
  .insight-scrollable {
    max-height: 300px;
    overflow-y: auto;
  }
</style>
