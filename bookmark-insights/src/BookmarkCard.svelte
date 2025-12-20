<script>
  import { createEventDispatcher } from 'svelte';
  import { formatDate, getFaviconUrl, getDomainLabel, copyToClipboard } from './utils.js';
  
  export let bookmark;
  
  const dispatch = createEventDispatcher();
  
  let showCopied = false;
  
  function openBookmark(url) {
    chrome.tabs.create({ url });
  }
  
  async function handleCopyUrl(event) {
    event.stopPropagation();
    const success = await copyToClipboard(bookmark.url);
    if (success) {
      showCopied = true;
      setTimeout(() => showCopied = false, 2000);
    }
  }
</script>

<div class="bookmark-card bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer border border-gray-200"
     role="button"
     tabindex="0"
     on:click={() => openBookmark(bookmark.url)}
     on:keydown={(e) => e.key === 'Enter' && openBookmark(bookmark.url)}>
  <div class="flex items-start space-x-3">
    <img 
      src="{getFaviconUrl(bookmark)}"
      alt="Favicon"
      class="w-4 h-4 mt-1 flex-shrink-0"
    />
    <div class="flex-1 min-w-0">
      <h3 class="text-sm font-medium text-gray-900 truncate" title={bookmark.title}>
        {bookmark.title}
      </h3>
      <p class="text-xs text-gray-500 truncate mt-1" title={bookmark.url}>
        {bookmark.url}
      </p>
      <div class="flex items-center justify-between mt-2">
        <span class="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
          {getDomainLabel(bookmark)}
        </span>
        <div class="flex items-center space-x-2">
          <button
            on:click={handleCopyUrl}
            class="p-1 text-gray-400 hover:text-blue-600 transition-colors"
            title="Copy URL"
          >
            {#if showCopied}
              <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            {:else}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
              </svg>
            {/if}
          </button>
          <span class="text-xs text-gray-400">
            {formatDate(bookmark.dateAdded)}
          </span>
        </div>
      </div>
      {#if bookmark.folderPath}
        <p class="text-xs text-gray-400 mt-1 truncate" title={bookmark.folderPath}>
          📁 {bookmark.folderPath}
        </p>
      {/if}
    </div>
  </div>
</div>

<style>
  .bookmark-card:hover {
    transform: translateY(-1px);
  }
</style>
