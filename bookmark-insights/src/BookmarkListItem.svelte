<script>
  import { createEventDispatcher } from 'svelte';
  import { formatDate, getFaviconUrl, getDomainLabel, copyToClipboard } from './utils.js';
  
  export let bookmark;
  export let isSelected = false;
  export let multiSelectMode = false;
  
  const dispatch = createEventDispatcher();
  
  let showCopied = false;
  
  function openBookmark(url) {
    chrome.tabs.create({ url });
  }
  
  function handleCheckboxChange(event) {
    dispatch('toggle-select', {
      bookmarkId: bookmark.id,
      selected: event.target.checked
    });
  }
  
  function handleTitleClick() {
    if (!multiSelectMode) {
      openBookmark(bookmark.url);
    }
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
     class:selected={isSelected}>
  <div class="flex items-center px-4 py-3">
    <!-- Checkbox for multi-select -->
    {#if multiSelectMode}
      <input 
        type="checkbox" 
        checked={isSelected}
        on:change={handleCheckboxChange}
        class="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
      />
    {/if}
    
    <!-- Favicon -->
    <img 
      src="{getFaviconUrl(bookmark)}"
      alt="Favicon"
      class="w-4 h-4 mr-3 flex-shrink-0"
    />
    
    <!-- Content -->
    <div class="flex-1 min-w-0 cursor-pointer" 
         role="button" 
         tabindex="0"
         on:click={handleTitleClick}
         on:keydown={(e) => e.key === 'Enter' && handleTitleClick()}>
      <div class="flex items-center justify-between">
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-medium text-gray-900 truncate hover:text-blue-600" title={bookmark.title}>
            {bookmark.title}
          </h3>
          <div class="flex items-center mt-1 space-x-2 sm:space-x-4">
            <p class="text-xs text-gray-500 flex-1 min-w-0" title={bookmark.url}>
              <span class="truncate block">{bookmark.url}</span>
            </p>
            <span class="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">
              {getDomainLabel(bookmark)}
            </span>
          </div>
          {#if bookmark.folderPath}
            <p class="text-xs text-gray-400 mt-1 truncate" title={bookmark.folderPath}>
              📁 {bookmark.folderPath}
            </p>
          {/if}
        </div>
        
        <!-- Date and Actions -->
        <div class="flex items-center ml-2 sm:ml-4 space-x-2 flex-shrink-0">
          <span class="text-xs text-gray-400 whitespace-nowrap hidden sm:block">
            {formatDate(bookmark.dateAdded)}
          </span>
          <button
            on:click={handleCopyUrl}
            class="p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
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
            class="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
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
