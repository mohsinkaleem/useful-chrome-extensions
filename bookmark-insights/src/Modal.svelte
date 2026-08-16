<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  export let title = '';
  export let size = 'max-w-lg';

  const dispatch = createEventDispatcher();

  // Every focusable control the trap needs to cycle between.
  const FOCUSABLE =
    'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 10)}`;

  let dialogEl;
  let previouslyFocused = null;

  onMount(() => {
    previouslyFocused = document.activeElement;
    const first = dialogEl?.querySelector(FOCUSABLE);
    (first || dialogEl)?.focus();
  });

  onDestroy(() => {
    previouslyFocused?.focus?.();
  });

  function close() {
    dispatch('close');
  }

  function visibleFocusable() {
    if (!dialogEl) return [];
    return Array.from(dialogEl.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    );
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = visibleFocusable();
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  on:click={close}
>
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full {size} max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700 focus:outline-none"
    on:click|stopPropagation
    on:keydown={handleKeydown}
  >
    <div
      class="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      <h3 id={titleId} class="text-lg font-semibold text-gray-900 dark:text-gray-200">{title}</h3>
      <button
        type="button"
        on:click={close}
        aria-label="Close dialog"
        class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          ></path>
        </svg>
      </button>
    </div>

    <slot />
  </div>
</div>
