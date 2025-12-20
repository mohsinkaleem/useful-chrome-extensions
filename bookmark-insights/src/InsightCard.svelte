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
    default: 'bg-white border-gray-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    danger: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200'
  };
  
  const headerVariantClasses = {
    default: 'text-gray-900',
    success: 'text-green-800',
    warning: 'text-yellow-800',
    danger: 'text-red-800',
    info: 'text-blue-800'
  };
</script>

<div class="rounded-lg border shadow-sm {variantClasses[variant] || variantClasses.default}">
  <!-- Header -->
  <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
  <div 
    class="px-4 py-3 border-b border-gray-100 flex items-center justify-between {collapsible ? 'cursor-pointer hover:bg-gray-50' : ''}"
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
          <p class="text-xs text-gray-500">{subtitle}</p>
        {/if}
      </div>
    </div>
    
    <div class="flex items-center gap-2">
      <slot name="header-actions" />
      {#if collapsible}
        <span class="text-gray-400 transform transition-transform {collapsed ? '' : 'rotate-180'}">
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
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span class="ml-2 text-sm text-gray-500">Loading...</span>
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
    background: #f1f1f1;
    border-radius: 3px;
  }
  
  :global(.insight-scrollable::-webkit-scrollbar-thumb) {
    background: #c1c1c1;
    border-radius: 3px;
  }
  
  :global(.insight-scrollable::-webkit-scrollbar-thumb:hover) {
    background: #a1a1a1;
  }
</style>
