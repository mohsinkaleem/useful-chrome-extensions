<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let value = '';
  
  let debounceTimer;
  
  function handleInput(event) {
    value = event.target.value;
    
    // Debounce search to avoid too many queries
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      dispatch('search', { query: value });
    }, 300);
  }
  
  function clearSearch() {
    value = '';
    dispatch('search', { query: '' });
  }
</script>

<div class="relative mb-6">
  <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
    <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
    </svg>
  </div>
  <input
    type="text"
    bind:value
    on:input={handleInput}
    placeholder="Search bookmarks by title or URL..."
    class="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
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
</div>
