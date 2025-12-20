<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let value = '';
  export let placeholder = 'Search: use +term (must include), -term (exclude), "exact phrase"';
  
  let debounceTimer;
  let inputElement;
  let showHelp = false;
  
  // Parse query to show visual feedback
  $: parsedQuery = parseQueryForDisplay(value);
  
  function parseQueryForDisplay(query) {
    if (!query) return { positive: [], negative: [], phrases: [], regular: [] };
    
    const positive = [];
    const negative = [];
    const phrases = [];
    const regular = [];
    
    // Extract quoted phrases first
    const phraseMatches = query.match(/"([^"]+)"/g) || [];
    phraseMatches.forEach(p => phrases.push(p.slice(1, -1)));
    
    // Remove quoted phrases for further parsing
    let remaining = query.replace(/"[^"]+"/g, '').trim();
    
    // Split into terms
    const terms = remaining.split(/\s+/).filter(t => t.length > 0);
    
    terms.forEach(term => {
      if (term.startsWith('+') && term.length > 1) {
        positive.push(term.slice(1));
      } else if (term.startsWith('-') && term.length > 1) {
        negative.push(term.slice(1));
      } else {
        regular.push(term);
      }
    });
    
    return { positive, negative, phrases, regular };
  }
  
  function handleInput(event) {
    value = event.target.value;
    
    // Debounce search to avoid too many queries
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      dispatch('search', { query: value });
    }, 200);
  }
  
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      clearSearch();
    } else if (event.key === 'Enter') {
      // Immediate search on Enter
      clearTimeout(debounceTimer);
      dispatch('search', { query: value });
    }
  }
  
  function clearSearch() {
    value = '';
    dispatch('search', { query: '' });
    inputElement?.focus();
  }
  
  function toggleHelp() {
    showHelp = !showHelp;
  }
</script>

<div class="relative mb-4">
  <div class="flex items-center gap-2">
    <div class="relative flex-1">
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
        placeholder={placeholder}
        class="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        autocomplete="off"
        spellcheck="false"
      />
      {#if value}
        <button
          on:click={clearSearch}
          class="absolute inset-y-0 right-0 pr-3 flex items-center"
          type="button"
          title="Clear search (Esc)"
        >
          <svg class="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      {/if}
    </div>
    <button
      on:click={toggleHelp}
      class="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-gray-300 transition-colors"
      type="button"
      title="Search help"
    >
      <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    </button>
  </div>
  
  <!-- Active search terms display -->
  {#if value && (parsedQuery.positive.length > 0 || parsedQuery.negative.length > 0 || parsedQuery.phrases.length > 0)}
    <div class="flex flex-wrap gap-1.5 mt-2">
      {#each parsedQuery.positive as term}
        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
          <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
          {term}
        </span>
      {/each}
      {#each parsedQuery.negative as term}
        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
          <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>
          {term}
        </span>
      {/each}
      {#each parsedQuery.phrases as phrase}
        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
          <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 13V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2zM5 7a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm1 3a1 1 0 100 2h3a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>
          "{phrase}"
        </span>
      {/each}
    </div>
  {/if}
  
  <!-- Search help dropdown -->
  {#if showHelp}
    <div class="absolute z-20 w-full mt-2 p-4 bg-white border border-gray-200 rounded-lg shadow-lg">
      <h4 class="font-medium text-gray-900 mb-3">Search Syntax</h4>
      <div class="space-y-2 text-sm">
        <div class="flex items-start gap-3">
          <code class="px-1.5 py-0.5 bg-green-100 text-green-800 rounded text-xs whitespace-nowrap">+term</code>
          <span class="text-gray-600">Must include this term</span>
        </div>
        <div class="flex items-start gap-3">
          <code class="px-1.5 py-0.5 bg-red-100 text-red-800 rounded text-xs whitespace-nowrap">-term</code>
          <span class="text-gray-600">Must NOT include this term</span>
        </div>
        <div class="flex items-start gap-3">
          <code class="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-xs whitespace-nowrap">"exact phrase"</code>
          <span class="text-gray-600">Match exact phrase</span>
        </div>
        <div class="flex items-start gap-3">
          <code class="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs whitespace-nowrap">word</code>
          <span class="text-gray-600">Regular search term</span>
        </div>
      </div>
      <div class="mt-3 pt-3 border-t border-gray-100">
        <p class="text-xs text-gray-500">
          <strong>Example:</strong> <code class="bg-gray-100 px-1 rounded">javascript +tutorial -video "best practices"</code>
        </p>
      </div>
    </div>
  {/if}
</div>
