<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { getCreatorStats, getChannelClusters, getRepositoryGroups } from './insights.js';
  import { getPlatformDisplayName, getPlatformIcon, getContentTypeDisplayName } from './url-parsers.js';
  
  const dispatch = createEventDispatcher();
  
  // State
  let loading = true;
  let activeTab = 'creators';
  let selectedCreator = null;
  let selectedPlatform = null;
  
  // Data
  let creatorStats = null;
  let channelClusters = null;
  let repositoryGroups = null;
  
  const tabs = [
    { id: 'creators', label: 'Top Creators', icon: '👤' },
    { id: 'youtube', label: 'YouTube', icon: '📺' },
    { id: 'github', label: 'GitHub', icon: '🐙' },
    { id: 'blogs', label: 'Blogs', icon: '📝' }
  ];
  
  onMount(async () => {
    await loadData();
  });
  
  async function loadData() {
    loading = true;
    try {
      const [creators, clusters, repos] = await Promise.all([
        getCreatorStats(50),
        getChannelClusters(),
        getRepositoryGroups()
      ]);
      
      creatorStats = creators;
      channelClusters = clusters;
      repositoryGroups = repos;
    } catch (err) {
      console.error('Error loading creator data:', err);
    } finally {
      loading = false;
    }
  }
  
  function selectCreator(creator, platform) {
    selectedCreator = { creator, platform };
    
    // Find bookmarks for this creator
    const platformClusters = channelClusters?.[platform] || [];
    const creatorData = platformClusters.find(c => c.creator === creator);
    
    if (creatorData) {
      selectedCreator.bookmarks = creatorData.bookmarks;
      selectedCreator.contentTypes = creatorData.contentTypes;
      selectedCreator.totalCount = creatorData.totalCount;
    }
  }
  
  function clearSelection() {
    selectedCreator = null;
  }
  
  function openBookmark(url) {
    window.open(url, '_blank');
  }
  
  function filterByCreator(creator) {
    dispatch('filterByCreator', { creator: creator.creator, platform: creator.platform });
  }
  
  function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }
  
  // Platform-specific data getters
  $: youtubeCreators = channelClusters?.youtube 
    ? Object.values(channelClusters.youtube).sort((a, b) => b.totalCount - a.totalCount)
    : [];
  
  $: githubOwners = channelClusters?.github 
    ? Object.values(channelClusters.github).sort((a, b) => b.totalCount - a.totalCount)
    : [];
  
  $: blogAuthors = [
    ...(channelClusters?.medium ? Object.values(channelClusters.medium) : []),
    ...(channelClusters?.devto ? Object.values(channelClusters.devto) : []),
    ...(channelClusters?.substack ? Object.values(channelClusters.substack) : [])
  ].sort((a, b) => b.totalCount - a.totalCount);
</script>

<div class="h-full flex flex-col bg-white dark:bg-gray-900 transition-colors">
  <!-- Header -->
  <div class="border-b border-gray-200 dark:border-gray-800 p-4">
    <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Creator Explorer</h2>
    <p class="text-sm text-gray-500 dark:text-gray-400">Browse bookmarks by channel, author, and repository owner</p>
  </div>
  
  <!-- Tabs -->
  <div class="border-b border-gray-200 dark:border-gray-800 px-4">
    <div class="flex space-x-4">
      {#each tabs as tab}
        <button
          on:click={() => { activeTab = tab.id; selectedCreator = null; }}
          class="py-3 px-1 text-sm font-medium border-b-2 transition-colors {activeTab === tab.id ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}"
        >
          {tab.icon} {tab.label}
        </button>
      {/each}
    </div>
  </div>
  
  <!-- Content -->
  <div class="flex-1 overflow-hidden flex">
    {#if loading}
      <div class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p class="text-gray-500 dark:text-gray-400 text-sm">Loading creator data...</p>
        </div>
      </div>
    {:else}
      <!-- Creator List -->
      <div class="w-80 border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
        {#if activeTab === 'creators'}
          <!-- All Creators Tab -->
          {#if creatorStats?.all?.length > 0}
            <div class="p-4">
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">{creatorStats.totalCreators} creators found</p>
              <div class="space-y-2">
                {#each creatorStats.all as creator}
                  <button
                    on:click={() => selectCreator(creator.creator, creator.platform)}
                    class="w-full text-left p-3 rounded-lg border transition-colors {selectedCreator?.creator === creator.creator && selectedCreator?.platform === creator.platform ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {getPlatformIcon(creator.platform)} {creator.creator}
                      </span>
                      <span class="text-sm text-gray-500 dark:text-gray-400 ml-2">{creator.count}</span>
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {getPlatformDisplayName(creator.platform)}
                      {#if creator.contentTypes.length > 0}
                        • {creator.contentTypes.slice(0, 2).map(t => getContentTypeDisplayName(t)).join(', ')}
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="p-4 text-center text-gray-500 dark:text-gray-400">
              <p class="text-sm">No creators found</p>
              <p class="text-xs mt-1">Enrich your bookmarks to extract creator information</p>
            </div>
          {/if}
          
        {:else if activeTab === 'youtube'}
          <!-- YouTube Tab -->
          {#if youtubeCreators.length > 0}
            <div class="p-4">
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">{youtubeCreators.length} YouTube channels</p>
              <div class="space-y-2">
                {#each youtubeCreators as channel}
                  <button
                    on:click={() => selectCreator(channel.creator, 'youtube')}
                    class="w-full text-left p-3 rounded-lg border transition-colors {selectedCreator?.creator === channel.creator && selectedCreator?.platform === 'youtube' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-medium text-gray-900 dark:text-gray-100 truncate">📺 {channel.creator}</span>
                      <span class="text-sm text-gray-500 dark:text-gray-400">{channel.totalCount} videos</span>
                    </div>
                    {#if Object.keys(channel.contentTypes).length > 0}
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {#each Object.entries(channel.contentTypes).slice(0, 3) as [type, count]}
                          <span class="mr-2">{getContentTypeDisplayName(type)}: {count}</span>
                        {/each}
                      </div>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="p-4 text-center text-gray-500 dark:text-gray-400">
              <p class="text-sm">No YouTube channels found</p>
              <p class="text-xs mt-1">Bookmark some YouTube videos to see channels here</p>
            </div>
          {/if}
          
        {:else if activeTab === 'github'}
          <!-- GitHub Tab -->
          {#if repositoryGroups.length > 0}
            <div class="p-4">
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">{repositoryGroups.length} repositories</p>
              <div class="space-y-2">
                {#each repositoryGroups as repo}
                  <button
                    on:click={() => { selectedCreator = { creator: repo.repoName, platform: 'github', bookmarks: repo.bookmarks, breakdown: repo.breakdown, totalCount: repo.totalCount }; }}
                    class="w-full text-left p-3 rounded-lg border transition-colors {selectedCreator?.creator === repo.repoName ? 'bg-gray-800 dark:bg-gray-700 text-white border-gray-700 dark:border-gray-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-medium truncate text-gray-100">🐙 {repo.repoName}</span>
                      <span class="text-sm opacity-75 dark:text-gray-300">{repo.totalCount}</span>
                    </div>
                    <div class="text-xs opacity-75 dark:text-gray-400 flex flex-wrap gap-2">
                      {#if repo.breakdown.issue > 0}
                        <span>🐛 {repo.breakdown.issue} issues</span>
                      {/if}
                      {#if repo.breakdown.pr > 0}
                        <span>🔀 {repo.breakdown.pr} PRs</span>
                      {/if}
                      {#if repo.breakdown.file > 0}
                        <span>📄 {repo.breakdown.file} files</span>
                      {/if}
                      {#if repo.breakdown.repo > 0}
                        <span>📦 {repo.breakdown.repo} repo</span>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {:else if githubOwners.length > 0}
            <div class="p-4">
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">{githubOwners.length} GitHub users/orgs</p>
              <div class="space-y-2">
                {#each githubOwners as owner}
                  <button
                    on:click={() => selectCreator(owner.creator, 'github')}
                    class="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <div class="flex items-center justify-between">
                      <span class="font-medium text-gray-900 dark:text-gray-100">🐙 {owner.creator}</span>
                      <span class="text-sm text-gray-500 dark:text-gray-400">{owner.totalCount}</span>
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="p-4 text-center text-gray-500 dark:text-gray-400">
              <p class="text-sm">No GitHub bookmarks found</p>
            </div>
          {/if}
          
        {:else if activeTab === 'blogs'}
          <!-- Blogs Tab -->
          {#if blogAuthors.length > 0}
            <div class="p-4">
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">{blogAuthors.length} blog authors</p>
              <div class="space-y-2">
                {#each blogAuthors as author}
                  <button
                    on:click={() => selectCreator(author.creator, author.platform)}
                    class="w-full text-left p-3 rounded-lg border transition-colors {selectedCreator?.creator === author.creator ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {getPlatformIcon(author.platform)} {author.creator}
                      </span>
                      <span class="text-sm text-gray-500 dark:text-gray-400">{author.totalCount}</span>
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {getPlatformDisplayName(author.platform)}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="p-4 text-center text-gray-500 dark:text-gray-400">
              <p class="text-sm">No blog authors found</p>
              <p class="text-xs mt-1">Bookmark articles from Medium, dev.to, or Substack</p>
            </div>
          {/if}
        {/if}
      </div>
      
      <!-- Detail Panel -->
      <div class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
        {#if selectedCreator}
          <div class="p-6">
            <!-- Creator Header -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4 border border-gray-200 dark:border-gray-700">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {getPlatformIcon(selectedCreator.platform)} {selectedCreator.creator}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">{getPlatformDisplayName(selectedCreator.platform)}</p>
                </div>
                <div class="text-right">
                  <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{selectedCreator.totalCount || selectedCreator.bookmarks?.length || 0}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">bookmarks</div>
                </div>
              </div>
              
              {#if selectedCreator.breakdown}
                <div class="flex flex-wrap gap-2 mt-3">
                  {#each Object.entries(selectedCreator.breakdown).filter(([_, v]) => v > 0) as [type, count]}
                    <span class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                      {getContentTypeDisplayName(type)}: {count}
                    </span>
                  {/each}
                </div>
              {/if}
              
              <div class="mt-4 flex gap-2">
                <button
                  on:click={() => filterByCreator(selectedCreator)}
                  class="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
                >
                  Show in Bookmarks
                </button>
                <button
                  on:click={clearSelection}
                  class="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
            
            <!-- Bookmark List -->
            {#if selectedCreator.bookmarks?.length > 0}
              <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div class="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                  <h4 class="font-medium text-gray-900 dark:text-gray-100">All Bookmarks ({selectedCreator.bookmarks.length})</h4>
                </div>
                <div class="divide-y divide-gray-100 dark:divide-gray-700">
                  {#each selectedCreator.bookmarks as bookmark}
                    <button
                      on:click={() => openBookmark(bookmark.url)}
                      class="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                    >
                      <div class="flex items-start gap-3">
                        {#if bookmark.thumbnail}
                          <img 
                            src={bookmark.thumbnail} 
                            alt="" 
                            class="w-24 h-16 object-cover rounded flex-shrink-0"
                            on:error={(e) => e.target.style.display = 'none'}
                          />
                        {/if}
                        <div class="flex-1 min-w-0">
                          <h5 class="font-medium text-gray-900 dark:text-gray-100 truncate">{bookmark.title}</h5>
                          <p class="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{bookmark.url}</p>
                          <div class="flex items-center gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500">
                            {#if bookmark.contentType}
                              <span class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
                                {getContentTypeDisplayName(bookmark.contentType)}
                              </span>
                            {/if}
                            <span>{formatDate(bookmark.dateAdded)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {:else}
              <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                <p>No bookmarks found for this creator</p>
              </div>
            {/if}
          </div>
        {:else}
          <div class="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
            <div class="text-center">
              <div class="text-4xl mb-2">👈</div>
              <p>Select a creator to see their bookmarks</p>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
