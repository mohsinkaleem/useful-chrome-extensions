<script>
  import { toasts, dismissToast } from './dialogs.js';

  const TONE = {
    info: 'bg-gray-900 dark:bg-gray-700',
    success: 'bg-green-700',
    error: 'bg-red-700',
  };

  async function runAction(toast) {
    dismissToast(toast.id);
    await toast.action.run();
  }
</script>

<!-- Announced politely so undo prompts and bulk-operation results reach screen readers. -->
<div
  class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none"
  role="status"
  aria-live="polite"
  aria-atomic="false"
>
  {#each $toasts as toast (toast.id)}
    <div
      class="pointer-events-auto text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-lg {TONE[
        toast.type
      ] || TONE.info}"
    >
      <span class="text-sm">{toast.message}</span>
      {#if toast.action}
        <button
          type="button"
          on:click={() => runAction(toast)}
          class="px-3 py-1 text-sm font-medium text-blue-300 hover:text-blue-200 hover:bg-black/30 rounded transition-colors"
        >
          {toast.action.label}
        </button>
      {/if}
      <button
        type="button"
        on:click={() => dismissToast(toast.id)}
        class="text-gray-300 hover:text-white transition-colors"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  {/each}
</div>
