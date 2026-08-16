<script>
  import Modal from './Modal.svelte';
  import { promptRequest } from './dialogs.js';

  let value = '';
  let lastRequest = null;

  // Reset the field whenever a new prompt opens.
  $: if ($promptRequest !== lastRequest) {
    lastRequest = $promptRequest;
    value = $promptRequest?.defaultValue ?? '';
  }

  function submit() {
    const trimmed = value.trim();
    if (trimmed) $promptRequest.resolve(trimmed);
  }
</script>

{#if $promptRequest}
  <Modal title={$promptRequest.title} size="max-w-md" on:close={() => $promptRequest.resolve(null)}>
    <form on:submit|preventDefault={submit}>
      <div class="px-6 py-5 space-y-3">
        <label class="block text-sm text-gray-600 dark:text-gray-300" for="prompt-dialog-input">
          {$promptRequest.message}
        </label>
        <!-- svelte-ignore a11y-autofocus -->
        <input
          id="prompt-dialog-input"
          type="text"
          bind:value
          autofocus
          placeholder={$promptRequest.placeholder}
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div
        class="px-6 py-4 flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
      >
        <button
          type="button"
          on:click={() => $promptRequest.resolve(null)}
          class="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!value.trim()}
          class="px-4 py-2 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {$promptRequest.confirmLabel}
        </button>
      </div>
    </form>
  </Modal>
{/if}
