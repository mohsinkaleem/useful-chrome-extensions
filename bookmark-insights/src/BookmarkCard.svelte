<script>
  export let bookmark;
  
  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString();
  }
  
  function openBookmark(url) {
    chrome.tabs.create({ url });
  }
  
  function getFaviconUrl(bookmark) {
    // For HTTP/HTTPS URLs, create a simple domain-based icon
    if (bookmark.url.startsWith('http://') || bookmark.url.startsWith('https://')) {
      // Create a simple letter-based favicon using the first letter of the domain
      const firstLetter = bookmark.domain.charAt(0).toUpperCase();
      const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
      const colorIndex = bookmark.domain.length % colors.length;
      const color = colors[colorIndex];
      
      return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${color}"/><text x="8" y="12" font-family="Arial" font-size="10" text-anchor="middle" fill="white" font-weight="bold">${firstLetter}</text></svg>`;
    }
    
    // Return specific icons for different types
    switch (bookmark.domain) {
      case 'chrome-internal':
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23EA4335"/><circle cx="8" cy="8" r="3" fill="white"/></svg>';
      case 'local-file':
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23F59E0B"/><text x="8" y="12" font-family="Arial" font-size="10" text-anchor="middle" fill="white">📄</text></svg>';
      case 'other-protocol':
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%236B7280"/><text x="8" y="12" font-family="Arial" font-size="10" text-anchor="middle" fill="white">⚡</text></svg>';
      default:
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23E5E7EB"/><text x="8" y="12" font-family="Arial" font-size="10" text-anchor="middle" fill="%236B7280">?</text></svg>';
    }
  }
  
  function getDomainLabel(bookmark) {
    switch (bookmark.domain) {
      case 'chrome-internal':
        return 'Chrome';
      case 'local-file':
        return 'Local File';
      case 'other-protocol':
        return 'Other';
      case 'invalid-url':
        return 'Invalid URL';
      default:
        return bookmark.domain;
    }
  }
</script>

<div class="bookmark-card bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer border border-gray-200"
     role="button"
     tabindex="0"
     on:click={() => openBookmark(bookmark.url)}
     on:keydown={(e) => e.key === 'Enter' && openBookmark(bookmark.url)}>
  <div class="flex items-start space-x-3">
    <img 
      src="{getFaviconUrl(bookmark)}"
      alt="Favicon"
      class="w-4 h-4 mt-1 flex-shrink-0"
    />
    <div class="flex-1 min-w-0">
      <h3 class="text-sm font-medium text-gray-900 truncate" title={bookmark.title}>
        {bookmark.title}
      </h3>
      <p class="text-xs text-gray-500 truncate mt-1" title={bookmark.url}>
        {bookmark.url}
      </p>
      <div class="flex items-center justify-between mt-2">
        <span class="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
          {getDomainLabel(bookmark)}
        </span>
        <span class="text-xs text-gray-400">
          {formatDate(bookmark.dateAdded)}
        </span>
      </div>
      {#if bookmark.folderPath}
        <p class="text-xs text-gray-400 mt-1 truncate" title={bookmark.folderPath}>
          📁 {bookmark.folderPath}
        </p>
      {/if}
    </div>
  </div>
</div>

<style>
  .bookmark-card:hover {
    transform: translateY(-1px);
  }
</style>
