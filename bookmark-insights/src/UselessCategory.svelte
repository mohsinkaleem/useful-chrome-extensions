<script>
  import { createEventDispatcher } from 'svelte';
  import { safeHref } from './url-safety.js';

  export let title;
  export let bookmarks = [];
  export let limit = 10;
  export let color = 'gray';
  export let deleting = false;
  /** Per-bookmark detail line, e.g. b => `Score: ${b.usefulnessScore}` */
  export let detail = () => '';
  /** Show an extra "Try" link to the bookmark URL (dead links only) */
  export let showTryLink = false;

  const dispatch = createEventDispatcher();

  const COLORS = {
    red: {
      heading: 'text-red-700',
      button: 'bg-red-600 hover:bg-red-700',
      card: 'bg-red-50 border-red-200',
      more: 'text-red-600',
    },
    orange: {
      heading: 'text-orange-700',
      button: 'bg-orange-600 hover:bg-orange-700',
      card: 'bg-orange-50 border-orange-200',
      more: 'text-orange-600',
    },
    yellow: {
      heading: 'text-yellow-700',
      button: 'bg-yellow-600 hover:bg-yellow-700',
      card: 'bg-yellow-50 border-yellow-200',
      more: 'text-yellow-600',
    },
    purple: {
      heading: 'text-purple-700',
      button: 'bg-purple-600 hover:bg-purple-700',
      card: 'bg-purple-50 border-purple-200',
      more: 'text-purple-600',
    },
    gray: {
      heading: 'text-gray-700',
      button: 'bg-gray-600 hover:bg-gray-700',
      card: 'bg-gray-50 border-gray-200',
      more: 'text-gray-600',
    },
  };

  $: theme = COLORS[color] || COLORS.gray;
</script>

{#if bookmarks.length > 0}
  <div class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-sm font-semibold {theme.heading}">
        {title} ({bookmarks.length})
      </h4>
      <button
        on:click={() => dispatch('deleteAll')}
        disabled={deleting}
        class="text-xs px-2 py-1 text-white rounded disabled:opacity-50 {theme.button}"
      >
        Delete All
      </button>
    </div>

    <div class="space-y-2 max-h-48 overflow-y-auto">
      {#each bookmarks.slice(0, limit) as bookmark (bookmark.id)}
        <div class="p-2 rounded border flex items-center justify-between {theme.card}">
          <div class="flex-1 min-w-0">
            <div class="text-sm truncate">{bookmark.title}</div>
            <div class="text-xs text-gray-500 truncate">{bookmark.url}</div>
            <div class="text-xs text-gray-500 mt-1">{detail(bookmark)}</div>
          </div>
          <div class="flex gap-1 ml-2 flex-shrink-0">
            {#if showTryLink}
              <a
                href={safeHref(bookmark.url)}
                target="_blank"
                rel="noopener noreferrer"
                class="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Try
              </a>
            {/if}
            <button
              on:click={() => dispatch('delete', bookmark.id)}
              class="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      {/each}
    </div>

    {#if bookmarks.length > limit}
      <button
        on:click={() => dispatch('loadMore')}
        class="mt-2 text-xs hover:underline {theme.more}"
      >
        Show more ({limit} of {bookmarks.length})
      </button>
    {/if}
  </div>
{/if}
