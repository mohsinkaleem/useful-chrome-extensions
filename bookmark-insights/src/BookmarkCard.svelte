<script>
  import { createEventDispatcher } from 'svelte';
  import { formatDate, getFaviconUrl, getDomainLabel, copyToClipboard, highlightText } from './utils.js';
  
  export let bookmark;
  export let parsedSearchQuery = null;
  
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
     class:border-red-200={bookmark.isAlive === false}
     class:bg-red-50={bookmark.isAlive === false}
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
      <div class="flex items-center gap-1.5">
        <h3 class="text-sm font-medium text-gray-900 truncate flex-1" title={bookmark.title}>
          {@html highlightText(bookmark.title, parsedSearchQuery)}
        </h3>
        <!-- Status Icons -->
        <div class="flex items-center gap-1 flex-shrink-0">
          {#if bookmark.isAlive === false}
            <span class="text-red-500" title="Dead link">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
            </span>
          {/if}
          {#if bookmark.description || (bookmark.keywords && bookmark.keywords.length > 0)}
            <span class="text-green-500" title="Enriched with metadata">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
            </span>
          {/if}
          {#if bookmark.accessCount > 0}
            <span class="text-blue-500 text-xs" title="Accessed {bookmark.accessCount} times">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
              </svg>
            </span>
          {/if}
        </div>
      </div>
      <p class="text-xs text-gray-500 truncate mt-1" title={bookmark.url}>
        {@html highlightText(bookmark.url, parsedSearchQuery)}
      </p>
      <div class="flex items-center justify-between mt-2 gap-2 flex-wrap">
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
            {getDomainLabel(bookmark)}
          </span>
          {#if bookmark.category}
            <span class="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded" title="Category: {bookmark.category}">
              🏷️ {bookmark.category}
            </span>
          {/if}
        </div>
        {#if bookmark.description}
          <p class="text-xs text-gray-500 mt-2 line-clamp-2 w-full" title={bookmark.description}>
            {@html highlightText(bookmark.description, parsedSearchQuery)}
          </p>
        {/if}
        <!-- Deep Metadata -->
        {#if bookmark.readingTime || bookmark.publishedDate || bookmark.contentQualityScore}
          <div class="flex items-center gap-2 mt-2 flex-wrap">
            {#if bookmark.readingTime}
              <span class="text-xs text-gray-600 bg-gray-50 px-2 py-0.5 rounded flex items-center gap-1" title="Estimated reading time">
                ⏱️ {bookmark.readingTime} min
              </span>
            {/if}
            {#if bookmark.publishedDate}
              <span class="text-xs text-gray-600 bg-gray-50 px-2 py-0.5 rounded flex items-center gap-1" title="Published date">
                📅 {formatDate(bookmark.publishedDate)}
              </span>
            {/if}
            {#if bookmark.contentQualityScore}
              <span class="text-xs px-2 py-0.5 rounded flex items-center gap-1"
                    class:text-green-700={bookmark.contentQualityScore >= 70}
                    class:bg-green-50={bookmark.contentQualityScore >= 70}
                    class:text-yellow-700={bookmark.contentQualityScore >= 40 && bookmark.contentQualityScore < 70}
                    class:bg-yellow-50={bookmark.contentQualityScore >= 40 && bookmark.contentQualityScore < 70}
                    class:text-orange-700={bookmark.contentQualityScore < 40}
                    class:bg-orange-50={bookmark.contentQualityScore < 40}
                    title="Content quality score">
                ⭐ {bookmark.contentQualityScore}
              </span>
            {/if}
          </div>
        {/if}
        {#if bookmark.smartTags && bookmark.smartTags.length > 0}
          <div class="flex items-center gap-1 mt-2 flex-wrap">
            {#each bookmark.smartTags.slice(0, 5) as tag}
              <span class="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded" title="Smart tag">
                {tag}
              </span>
            {/each}
            {#if bookmark.smartTags.length > 5}
              <span class="text-xs text-gray-500">+{bookmark.smartTags.length - 5} more</span>
            {/if}
          </div>
        {/if}
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
