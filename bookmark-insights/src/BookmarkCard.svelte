<script>
  import { createEventDispatcher } from 'svelte';
  import { formatDate, getFaviconUrl, getDomainLabel, copyToClipboard, highlightText } from './utils.js';
  import { selectedBookmarks } from './stores.js';
  
  export let bookmark;
  export let parsedSearchQuery = null;
  
  const dispatch = createEventDispatcher();
  
  let showCopied = false;
  
  function openBookmark(url, active = true) {
    chrome.tabs.create({ url, active });
  }

  function handleBookmarkClick(event) {
    // Open in background if Shift, Cmd (Mac), or Ctrl (Windows/Linux) is pressed
    const active = !(event && (event.shiftKey || event.metaKey || event.ctrlKey));
    openBookmark(bookmark.url, active);
  }
  
  async function handleCopyUrl(event) {
    event.stopPropagation();
    const success = await copyToClipboard(bookmark.url);
    if (success) {
      showCopied = true;
      setTimeout(() => showCopied = false, 2000);
    }
  }

  function toggleSelection(event) {
    event.stopPropagation();
    selectedBookmarks.toggle(bookmark.id);
  }
  
  // Compute dynamic classes for the bookmark card
  $: deadLinkClasses = bookmark.isAlive === false 
    ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' 
    : '';
  $: selectedClasses = $selectedBookmarks.has(bookmark.id) 
    ? 'ring-2 ring-blue-500' 
    : '';
</script>

<div class="bookmark-card bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer border border-gray-200 dark:border-gray-700 relative group {deadLinkClasses} {selectedClasses}"
     role="button"
     tabindex="0"
     on:click={handleBookmarkClick}
     on:keydown={(e) => e.key === 'Enter' && handleBookmarkClick(e)}>
  
  <!-- Selection Checkbox -->
  <div class="absolute top-2 right-2 z-10"
       class:opacity-0={!$selectedBookmarks.has(bookmark.id)}
       class:group-hover:opacity-100={true}>
      <input type="checkbox" 
             checked={$selectedBookmarks.has(bookmark.id)}
             on:click={toggleSelection}
             class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" />
  </div>

  <div class="flex items-start space-x-3">
    <img 
      src="{getFaviconUrl(bookmark)}"
      alt="Favicon"
      class="w-4 h-4 mt-1 flex-shrink-0"
    />
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5">
        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1" title={bookmark.title}>
          {@html highlightText(bookmark.title, parsedSearchQuery)}
        </h3>
        <!-- Status Icons -->
        <div class="flex items-center gap-1 flex-shrink-0">
          {#if bookmark.isAlive === false}
            <span class="text-red-500 dark:text-red-400" title="Dead link">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
            </span>
          {/if}
          {#if bookmark.description || (bookmark.keywords && bookmark.keywords.length > 0)}
            <span class="text-green-500 dark:text-green-400" title="Enriched with metadata">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
            </span>
          {/if}
          {#if bookmark.accessCount > 0}
            <span class="text-blue-500 dark:text-blue-400 text-xs" title="Accessed {bookmark.accessCount} times">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
              </svg>
            </span>
          {/if}
        </div>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400 truncate mt-1 max-w-full" title={bookmark.url}>
        {@html highlightText(bookmark.url, parsedSearchQuery)}
      </p>
      <div class="flex items-center justify-between mt-2 gap-2 flex-wrap">
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2 py-1 rounded">
            {getDomainLabel(bookmark)}
          </span>
          {#if bookmark.category}
            <span class="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/40 px-2 py-0.5 rounded" title="Category: {bookmark.category}">
              🏷️ {bookmark.category}
            </span>
          {/if}
        </div>
        {#if bookmark.description}
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2 w-full" title={bookmark.description}>
            {@html highlightText(bookmark.description, parsedSearchQuery)}
          </p>
        {/if}
        <!-- Deep Metadata -->
        {#if bookmark.readingTime || bookmark.publishedDate || bookmark.contentQualityScore}
          <div class="flex items-center gap-2 mt-2 flex-wrap">
            {#if bookmark.readingTime}
              <span class="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 px-2 py-0.5 rounded flex items-center gap-1" title="Estimated reading time">
                ⏱️ {bookmark.readingTime} min
              </span>
            {/if}
            {#if bookmark.publishedDate}
              <span class="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 px-2 py-0.5 rounded flex items-center gap-1" title="Published date">
                📅 {formatDate(bookmark.publishedDate)}
              </span>
            {/if}
            {#if bookmark.contentQualityScore}
              {@const qualityClass = bookmark.contentQualityScore >= 70 
                ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/40' 
                : bookmark.contentQualityScore >= 40 
                  ? 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/40'
                  : 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/40'}
              <span class="text-xs px-2 py-0.5 rounded flex items-center gap-1 {qualityClass}"
                    title="Content quality score">
                ⭐ {bookmark.contentQualityScore}
              </span>
            {/if}
          </div>
        {/if}
        {#if bookmark.smartTags && bookmark.smartTags.length > 0}
          <div class="flex items-center gap-1 mt-2 flex-wrap">
            {#each bookmark.smartTags.slice(0, 5) as tag}
              <span class="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded" title="Smart tag">
                {tag}
              </span>
            {/each}
            {#if bookmark.smartTags.length > 5}
              <span class="text-xs text-gray-500 dark:text-gray-400">+{bookmark.smartTags.length - 5} more</span>
            {/if}
          </div>
        {/if}
        {#if bookmark.topics && bookmark.topics.length > 0}
          <div class="flex items-center gap-1 mt-2 flex-wrap">
            {#each bookmark.topics.slice(0, 4) as topic}
              <span class="text-xs text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 rounded" title="Topic: {topic}">
                🏷️ {topic}
              </span>
            {/each}
            {#if bookmark.topics.length > 4}
              <span class="text-xs text-gray-500 dark:text-gray-400">+{bookmark.topics.length - 4} more</span>
            {/if}
          </div>
        {/if}
        <div class="flex items-center space-x-2">
          <button
            on:click={handleCopyUrl}
            class="p-1 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            title="Copy URL"
          >
            {#if showCopied}
              <svg class="w-4 h-4 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            {:else}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
              </svg>
            {/if}
          </button>
          <span class="text-xs text-gray-400 dark:text-gray-500">
            {formatDate(bookmark.dateAdded)}
          </span>
        </div>
      </div>
      {#if bookmark.folderPath}
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate" title={bookmark.folderPath}>
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
