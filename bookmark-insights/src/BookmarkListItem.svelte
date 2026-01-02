<script>
  import { createEventDispatcher } from 'svelte';
  import { formatDate, getFaviconUrl, getGeneratedFavicon, getDomainLabel, copyToClipboard, highlightText } from './utils.js';
  import { selectedBookmarks } from './stores.js';
  
  export let bookmark;
  export let parsedSearchQuery = null;
  export let multiSelectMode = false;
  
  const dispatch = createEventDispatcher();
  
  let showCopied = false;
  
  function handleImageError(event) {
    // Fallback to generated icon if the favicon URL fails to load
    event.target.src = getGeneratedFavicon(bookmark);
  }

  function openBookmark(url, active = true) {
    chrome.tabs.create({ url, active });
  }
  
  function handleCheckboxChange(event) {
    selectedBookmarks.toggle(bookmark.id);
  }
  
  function handleTitleClick(event) {
    // Open in background if Shift, Cmd (Mac), or Ctrl (Windows/Linux) is pressed
    const active = !(event && (event.shiftKey || event.metaKey || event.ctrlKey));
    openBookmark(bookmark.url, active);
  }
  
  function handleDeleteClick(event) {
    event.stopPropagation();
    dispatch('delete', { bookmarkId: bookmark.id });
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

<div class="bookmark-list-item group bg-white border-b border-gray-200 hover:bg-gray-50 transition-colors"
     class:selected={$selectedBookmarks.has(bookmark.id)}
     class:bg-red-50={bookmark.isAlive === false}
     class:border-red-200={bookmark.isAlive === false}>
  <div class="flex items-center px-3 py-2">
    <!-- Checkbox for multi-select -->
    {#if multiSelectMode}
      <input 
        type="checkbox" 
        checked={$selectedBookmarks.has(bookmark.id)}
        on:change={handleCheckboxChange}
        class="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
      />
    {/if}
    
    <!-- Favicon -->
    <img 
      src="{getFaviconUrl(bookmark)}"
      on:error={handleImageError}
      alt="Favicon"
      class="w-4 h-4 mr-3 flex-shrink-0"
    />
    
    <!-- Content -->
    <div class="flex-1 min-w-0 cursor-pointer" 
         role="button" 
         tabindex="0"
         on:click={handleTitleClick}
         on:keydown={(e) => e.key === 'Enter' && handleTitleClick(e)}>
      <div class="flex items-center justify-between gap-2">
        
        <!-- Left Side: Title, URL, Folder -->
        <div class="flex-1 min-w-0 flex flex-col">
          <!-- Row 1: Title + Status Icons -->
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-medium text-gray-900 truncate hover:text-blue-600" title={bookmark.title}>
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
                    <path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
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
          
          <!-- Row 2: URL + Folder + Reading Time -->
          <div class="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
            <span class="flex text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded truncate max-w-5xl" title={bookmark.url}>
              {bookmark.url}
            </span>

            {#if bookmark.readingTime}
              <span class="text-gray-300">|</span>
              <span class="text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded" title="Estimated reading time">
                ⏱️ {bookmark.readingTime}m
              </span>
            {/if}
          </div>
        </div>
        
        <!-- Right Side: Date + Actions -->
        <div class="flex items-center gap-3 flex-shrink-0">
          <span class="text-xs text-gray-400 whitespace-nowrap hidden sm:block">
            {formatDate(bookmark.dateAdded)}
          </span>
          
          <!-- Actions (Show on hover) -->
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              on:click|stopPropagation={() => dispatch('enrich', { bookmarkId: bookmark.id })}
              class="p-1 text-gray-400 hover:text-purple-600"
              title="Enrich metadata now"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
            </button>
            <button
              on:click={handleCopyUrl}
              class="p-1 text-gray-400 hover:text-blue-600"
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
            <button
              on:click={handleDeleteClick}
              class="p-1 text-gray-400 hover:text-red-600"
              title="Delete bookmark"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .bookmark-list-item {
    transition: all 0.15s ease;
  }
  
  .bookmark-list-item:hover .group-hover\:opacity-100 {
    opacity: 1;
  }
  
  .bookmark-list-item.selected {
    background-color: #dbeafe;
    border-left: 4px solid #3b82f6;
  }
</style>
