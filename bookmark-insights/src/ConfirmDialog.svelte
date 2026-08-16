<script>
  import Modal from './Modal.svelte';
  import { confirmRequest } from './dialogs.js';

  $: request = $confirmRequest;
</script>

{#if request}
  <Modal title={request.title} size="max-w-md" on:close={() => request.resolve(false)}>
    <div class="px-6 py-5">
      <p class="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{request.message}</p>
    </div>
    <div
      class="px-6 py-4 flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
    >
      <button
        type="button"
        on:click={() => request.resolve(false)}
        class="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        {request.cancelLabel}
      </button>
      <button
        type="button"
        on:click={() => request.resolve(true)}
        class="px-4 py-2 text-sm rounded-md text-white {request.danger
          ? 'bg-red-600 hover:bg-red-700'
          : 'bg-blue-600 hover:bg-blue-700'}"
      >
        {request.confirmLabel}
      </button>
    </div>
  </Modal>
{/if}
