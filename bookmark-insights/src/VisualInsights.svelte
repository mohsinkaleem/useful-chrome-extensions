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
  
  function renderCharts() {
    renderCategoryChart();
    renderContentTypeChart();
    renderPlatformChart();
    renderDateAddedChart();
  }
  
  function renderPlatformChart() {
    const ctx = document.getElementById('platformDonutChart');
    if (!ctx || !platformDistribution?.platforms) return;
    
    if (platformChart) platformChart.destroy();
    
    const data = platformDistribution.platforms.slice(0, 8);
    const colors = {
      'youtube': '#FF0000',
      'github': '#24292F',
      'medium': '#00AB6C',
      'devto': '#0A0A0A',
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
            const platform = data[elements[0].index].platform;
            dispatch('filterByPlatform', { platform });
          }
        }
      }
    });
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
  
  function renderDateAddedChart() {
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
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
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
            ticks: { maxRotation: 45, minRotation: 45 }
          },
          y: { 
            beginAtZero: true, 
            grid: { color: '#f3f4f6' }
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
    
    <!-- CONTENT & OVERVIEW TAB -->
    {#if activeTab === 'content' && contentAnalysis}
      <div class="space-y-6">
        <!-- Quick Stats Row -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-blue-700">{contentAnalysis.totalBookmarks}</div>
            <div class="text-sm text-blue-600">Total Bookmarks</div>
          </div>
          <div class="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-purple-700">{contentAnalysis.categoryBreakdown?.length || 0}</div>
            <div class="text-sm text-purple-600">Categories</div>
          </div>
          <div class="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-green-700">{platformDistribution?.platforms?.length || 0}</div>
            <div class="text-sm text-green-600">Platforms</div>
          </div>
          <div class="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-orange-700">{creatorLeaderboard?.length || 0}</div>
            <div class="text-sm text-orange-600">Creators</div>
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
                  class="px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  style="font-size: {size}rem"
                  on:click={() => dispatch('searchQuery', { query: topic.keyword })}
                >
                  {topic.keyword}
                  <span class="text-xs opacity-60 ml-1">({topic.count})</span>
                </button>
              {/each}
            {:else}
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
        
        <!-- Top Creators Leaderboard -->
        {#if creatorLeaderboard && creatorLeaderboard.length > 0}
          <InsightCard title="Creator Leaderboard" icon="🏆" subtitle="Your most bookmarked creators">
            <div class="space-y-2 insight-scrollable">
              {#each creatorLeaderboard.slice(0, 10) as creator, index}
                <button
                  class="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  on:click={() => dispatch('filterByCreator', { creator: creator.creator })}
                >
                  <div class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                    {index + 1}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm truncate">{creator.creator}</span>
                      <span class="text-xs px-1.5 py-0.5 bg-gray-100 rounded" title={getPlatformDisplayName(creator.platform)}>
                        {getPlatformIcon(creator.platform)}
                      </span>
                    </div>
                    <div class="text-xs text-gray-500">{creator.count} bookmarks</div>
                  </div>
                  <div class="text-right">
                    <div class="text-xs font-medium text-green-600">+{creator.recentCount || 0}</div>
                    <div class="text-xs text-gray-400">last 30d</div>
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
      </div>
    {/if}
    
    <!-- ACTIONS TAB -->
    {#if activeTab === 'actions' && actionableInsights}
      <div class="space-y-6">
        <!-- Quick Stats -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-yellow-700">{actionableInsights.stats.totalStale}</div>
            <div class="text-sm text-yellow-600">Stale bookmarks</div>
          </div>
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div class="text-2xl font-bold text-gray-700">{actionableInsights.stats.deadLinksCount}</div>
            <div class="text-sm text-gray-600">Dead links (check Health tab)</div>
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
