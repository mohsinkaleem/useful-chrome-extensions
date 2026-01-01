<!-- 
            <div class="truncate font-medium">{domainData.domain}</div>
            <div class="flex justify-between items-center text-xs text-gray-500 mt-1">
              <span>{domainData.count}</span>
              {#if !isSearchActive && domainSortMode === 'recency' && (domainData.dateAdded || domainData.latestDate)}
                <span>{formatTimeAgo(domainData.dateAdded || domainData.latestDate)}</span>
              {/if}
            </div>



            <span class="truncate block">📁 {folderData.folder.toLowerCase().replace("bookmarks","")}</span>
            <span class="text-xs text-gray-400 ml-1">{folderData.count}</span>
   
 -->

<button
  class="w-full text-left px-2 py-2 text-sm hover:bg-gray-100 rounded border text-gray-600 border-transparent"
  title="www.youtube.com"
  ><div class="truncate font-medium">www.youtube.com</div>
  <div class="flex justify-between items-center text-xs text-gray-500 mt-1">
    <span>1297</span>
  </div></button
>
<button
  class="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded border flex items-center justify-between text-gray-600 border-transparent"
  title="Bookmarks bar"
  ><span class="truncate block">📁 bar</span>
  <span class="text-xs text-gray-400 ml-1">532</span></button
>