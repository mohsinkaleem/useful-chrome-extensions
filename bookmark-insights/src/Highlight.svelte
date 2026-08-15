<script>
  import { highlightSegments } from './utils.js';

  export let text = '';
  export let query = null;

  $: segments = highlightSegments(text, query);
</script>

{#each segments as segment}{#if segment.match}<mark class="bg-yellow-200 text-gray-900 rounded-sm px-0.5">{segment.text}</mark>{:else}{segment.text}{/if}{/each}
