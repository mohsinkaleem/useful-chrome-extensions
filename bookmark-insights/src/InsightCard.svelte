<script>
  import { createEventDispatcher } from 'svelte';
  
  export let title = '';
  export let subtitle = '';
  export let icon = '📊';
  export let loading = false;
  export let collapsible = false;
  export let collapsed = false;
  export let variant = 'default'; // default, success, warning, danger, info
  
  const dispatch = createEventDispatcher();
  
  function toggle() {
    if (collapsible) {
      collapsed = !collapsed;
    }
  }
  
  function handleClick(event) {
    dispatch('click', event);
  }
  
  const variantClasses = {
    default: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/30',
    danger: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30'
  };
  
  const headerVariantClasses = {
    default: 'text-gray-900 dark:text-gray-100',
    success: 'text-green-800 dark:text-green-300',
    warning: 'text-yellow-800 dark:text-yellow-300',
    danger: 'text-red-800 dark:text-red-300',
    info: 'text-blue-800 dark:text-blue-300'
  };
</script>

<div class="rounded-lg border shadow-sm transition-colors {variantClasses[variant] || variantClasses.default}">
  <!-- Header -->
  <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
  <div 
    class="px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between {collapsible ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' : ''}"
    on:click={toggle}
    on:keypress={(e) => e.key === 'Enter' && toggle()}
    role={collapsible ? 'button' : 'heading'}
    tabindex={collapsible ? 0 : -1}
  >
    <div class="flex items-center gap-2">
      <span class="text-lg">{icon}</span>
      <div>
        <h3 class="text-sm font-semibold {headerVariantClasses[variant] || headerVariantClasses.default}">
          {title}
        </h3>
        {#if subtitle}
          <p class="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        {/if}
      </div>
    </div>
    
    <div class="flex items-center gap-2">
      <slot name="header-actions" />
      {#if collapsible}
        <span class="text-gray-400 dark:text-gray-500 transform transition-transform {collapsed ? '' : 'rotate-180'}">
          ▼
        </span>
      {/if}
    </div>
  </div>
  
  <!-- Content -->
  {#if !collapsed}
    <div class="p-4">
      {#if loading}
        <div class="flex items-center justify-center py-8">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400"></div>
          <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading...</span>
        </div>
      {:else}
        <slot />
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Custom scrollbar for content overflow */
  :global(.insight-scrollable) {
    max-height: 300px;
    overflow-y: auto;
  }
  
  :global(.insight-scrollable::-webkit-scrollbar) {
    width: 6px;
  }
  
  :global(.insight-scrollable::-webkit-scrollbar-track) {
    background: transparent;
  }
  
  :global(.insight-scrollable::-webkit-scrollbar-thumb) {
    background: #e2e8f0;
    border-radius: 10px;
  }

  :global(.dark .insight-scrollable::-webkit-scrollbar-thumb) {
    background: #4a5568;
  }
  
  :global(.insight-scrollable::-webkit-scrollbar-thumb:hover) {
    background: #cbd5e1;
  }

  :global(.dark .insight-scrollable::-webkit-scrollbar-thumb:hover) {
    background: #718096;
  }
</style>
