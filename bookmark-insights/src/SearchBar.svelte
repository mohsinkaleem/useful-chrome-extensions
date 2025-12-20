<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getSearchSuggestions } from './search.js';
  
  const dispatch = createEventDispatcher();
  
  export let value = '';
  export let placeholder = 'Search bookmarks by title, URL, category, or keywords...';
  export let showSuggestions = true;
  
  let debounceTimer;
  let suggestions = [];
  let showSuggestionsList = false;
  let selectedSuggestionIndex = -1;
  let inputElement;
  
  function handleInput(event) {
    value = event.target.value;
    selectedSuggestionIndex = -1;
    
    // Get suggestions if query is long enough
    if (showSuggestions && value.length >= 2) {
      getSuggestions(value);
    } else {
      suggestions = [];
      showSuggestionsList = false;
    }
    
    // Debounce search to avoid too many queries
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      dispatch('search', { query: value });
    }, 300);
  }
  
  async function getSuggestions(query) {
    try {
      suggestions = await getSearchSuggestions(query, 8);
      showSuggestionsList = suggestions.length > 0;
    } catch (error) {
      console.error('Error getting suggestions:', error);
      suggestions = [];
      showSuggestionsList = false;
    }
  }
  
  function selectSuggestion(suggestion) {
    value = suggestion;
    suggestions = [];
    showSuggestionsList = false;
    dispatch('search', { query: value });
    inputElement?.blur();
  }
  
  function handleKeyDown(event) {
    if (!showSuggestionsList || suggestions.length === 0) {
      return;
    }
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestions.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        break;
      case 'Enter':
        if (selectedSuggestionIndex >= 0) {
          event.preventDefault();
          selectSuggestion(suggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        suggestions = [];
        showSuggestionsList = false;
        selectedSuggestionIndex = -1;
        break;
    }
  }
  
  function clearSearch() {
    value = '';
    suggestions = [];
    showSuggestionsList = false;
    dispatch('search', { query: '' });
  }
  
  function handleBlur() {
    // Delay to allow click on suggestion
    setTimeout(() => {
      showSuggestionsList = false;
    }, 200);
  }
  
  function handleFocus() {
    if (suggestions.length > 0 && value.length >= 2) {
      showSuggestionsList = true;
    }
  }
</script>

<div class="relative mb-6">
  <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
    <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
    </svg>
  </div>
  <input
    bind:this={inputElement}
    type="text"
    bind:value
    on:input={handleInput}
    on:keydown={handleKeyDown}
    on:blur={handleBlur}
    on:focus={handleFocus}
    placeholder={placeholder}
    class="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
    autocomplete="off"
  />
  {#if value}
    <button
      on:click={clearSearch}
      class="absolute inset-y-0 right-0 pr-3 flex items-center"
      type="button"
    >
      <svg class="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </button>
  {/if}
  
  <!-- Suggestions dropdown -->
  {#if showSuggestionsList && suggestions.length > 0}
    <div class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
      {#each suggestions as suggestion, index}
        <button
          type="button"
          on:click={() => selectSuggestion(suggestion)}
          class="w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none {selectedSuggestionIndex === index ? 'bg-blue-50' : ''}"
        >
          <div class="flex items-center">
            <svg class="h-4 w-4 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
            <span class="text-sm text-gray-700">{suggestion}</span>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
