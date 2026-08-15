<script>
  import { activeFilters, searchQuery as searchQueryStore } from './stores.js';

  const COLORS = {
    blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    green:
      'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800',
    yellow:
      'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    indigo:
      'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    purple:
      'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    pink: 'bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-300 border-pink-200 dark:border-pink-800',
    red: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
    orange:
      'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  };

  const DATE_PERIOD_LABELS = {
    week: 'This Week',
    twoWeek: 'This 2-Week',
    month: 'This Month',
    threeMonth: 'This 3-Month',
    sixMonth: 'This 6-Month',
    year: 'This Year',
    older: 'Older',
  };

  const toggle = (key, value) => () => activeFilters.toggleFilter(key, value);
  const clear = (key, empty) => () => activeFilters.setFilter(key, empty);

  // One flat list drives every chip; adding a filter type means adding an entry.
  $: chips = [
    ...($searchQueryStore
      ? [
          {
            id: 'search',
            color: 'blue',
            label: `Search: ${$searchQueryStore}`,
            remove: () => searchQueryStore.set(''),
          },
        ]
      : []),
    ...($activeFilters.domains || []).map((v) => ({
      id: `domain:${v}`,
      color: 'green',
      label: `Domain: ${v}`,
      remove: toggle('domains', v),
    })),
    ...($activeFilters.folders || []).map((v) => ({
      id: `folder:${v}`,
      color: 'yellow',
      label: `Folder: ${v}`,
      remove: toggle('folders', v),
    })),
    ...($activeFilters.topics || []).map((v) => ({
      id: `topic:${v}`,
      color: 'indigo',
      label: `Topic: ${v}`,
      remove: toggle('topics', v),
    })),
    ...($activeFilters.tags || []).map((v) => ({
      id: `tag:${v}`,
      color: 'purple',
      label: `Tag: ${v}`,
      remove: toggle('tags', v),
    })),
    ...($activeFilters.readingList
      ? [
          {
            id: 'readingList',
            color: 'pink',
            label: 'Reading List',
            remove: clear('readingList', false),
          },
        ]
      : []),
    ...($activeFilters.dateRange
      ? [
          {
            id: 'dateRange',
            color: 'blue',
            label: `Date: ${DATE_PERIOD_LABELS[$activeFilters.dateRange.period] || 'Custom Range'}`,
            remove: clear('dateRange', null),
          },
        ]
      : []),
    ...($activeFilters.deadLinks
      ? [{ id: 'deadLinks', color: 'red', label: 'Dead Links', remove: clear('deadLinks', false) }]
      : []),
    ...($activeFilters.stale
      ? [{ id: 'stale', color: 'orange', label: 'Stale', remove: clear('stale', false) }]
      : []),
  ];

  function clearAll() {
    activeFilters.clearFilters();
    searchQueryStore.set('');
  }
</script>

{#if chips.length > 0}
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-sm text-gray-500 dark:text-gray-400 mr-1">Filters:</span>

    {#each chips as chip (chip.id)}
      <span
        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border {COLORS[
          chip.color
        ]}"
      >
        {chip.label}
        <button
          type="button"
          class="ml-1.5 inline-flex items-center justify-center opacity-60 hover:opacity-100 focus:outline-none"
          on:click={chip.remove}
        >
          <span class="sr-only">Remove {chip.label} filter</span>
          <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"
            ><path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            /></svg
          >
        </button>
      </span>
    {/each}

    <button on:click={clearAll} class="text-xs text-red-600 hover:text-red-800 underline ml-2">
      Clear all
    </button>
  </div>
{/if}
