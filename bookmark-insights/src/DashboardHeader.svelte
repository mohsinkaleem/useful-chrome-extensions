<script>
  import { createEventDispatcher } from 'svelte';
  import { darkMode, toggleDarkMode } from './darkModeStore.js';

  export let currentView = 'bookmarks';

  const dispatch = createEventDispatcher();

  const VIEWS = [
    { key: 'bookmarks', label: 'Bookmarks' },
    { key: 'insights', label: 'Insights' },
    { key: 'health', label: 'Health' },
    { key: 'dataExplorer', label: '🗄️ Data' },
  ];

  const ACTIVE = 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300';
  const INACTIVE = 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300';
</script>

<header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center py-4">
      <div class="flex items-center space-x-4">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-200">Bookmark Insight</h1>
        <button
          on:click={() => dispatch('export')}
          class="px-3 py-1 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Export bookmarks to JSON"
        >
          <svg
            class="w-4 h-4 inline-block mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            ></path>
          </svg>
          Export
        </button>
      </div>

      <div class="flex items-center space-x-4">
        <button
          on:click={toggleDarkMode}
          class="p-2 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={$darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {#if $darkMode}
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                clip-rule="evenodd"
              />
            </svg>
          {:else}
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          {/if}
        </button>

        <nav class="flex space-x-4">
          {#each VIEWS as view (view.key)}
            <button
              on:click={() => dispatch('switchView', view.key)}
              class="px-4 py-2 rounded-md text-sm font-medium transition-colors {currentView ===
              view.key
                ? ACTIVE
                : INACTIVE}"
            >
              {view.label}
            </button>
          {/each}
        </nav>
      </div>
    </div>
  </div>
</header>
