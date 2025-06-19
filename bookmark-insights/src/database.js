// Database utilities using Chrome storage instead of Dexie for simplicity

// Get all bookmarks from Chrome storage
export async function getAllBookmarks() {
  try {
    const result = await chrome.storage.local.get(['bookmarks']);
    return result.bookmarks || [];
  } catch (error) {
    console.error('Error getting bookmarks:', error);
    return [];
  }
}

// Search functionality
export async function searchBookmarks(query) {
  try {
    const bookmarks = await getAllBookmarks();
    
    if (!query.trim()) {
      return bookmarks.sort((a, b) => b.dateAdded - a.dateAdded);
    }
    
    const lowerQuery = query.toLowerCase();
    return bookmarks
      .filter(bookmark => 
        bookmark.title.toLowerCase().includes(lowerQuery) ||
        bookmark.url.toLowerCase().includes(lowerQuery) ||
        bookmark.domain.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => b.dateAdded - a.dateAdded);
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

// Get bookmarks by domain
export async function getBookmarksByDomain(domain) {
  try {
    const bookmarks = await getAllBookmarks();
    return bookmarks.filter(bookmark => bookmark.domain === domain);
  } catch (error) {
    console.error('Error getting bookmarks by domain:', error);
    return [];
  }
}

// Get bookmarks by date range
export async function getBookmarksByDateRange(startDate, endDate) {
  try {
    const bookmarks = await getAllBookmarks();
    return bookmarks.filter(bookmark => 
      bookmark.dateAdded >= startDate && bookmark.dateAdded <= endDate
    );
  } catch (error) {
    console.error('Error getting bookmarks by date range:', error);
    return [];
  }
}

// Get bookmarks by folder
export async function getBookmarksByFolder(folderPath) {
  try {
    const bookmarks = await getAllBookmarks();
    return bookmarks.filter(bookmark => bookmark.folderPath === folderPath);
  } catch (error) {
    console.error('Error getting bookmarks by folder:', error);
    return [];
  }
}

// Get unique domains
export async function getUniqueDomains() {
  try {
    const bookmarks = await getAllBookmarks();
    const domains = [...new Set(bookmarks.map(b => b.domain))];
    return domains.sort();
  } catch (error) {
    console.error('Error getting unique domains:', error);
    return [];
  }
}

// Get unique folders
export async function getUniqueFolders() {
  try {
    const bookmarks = await getAllBookmarks();
    const folders = [...new Set(bookmarks.map(b => b.folderPath).filter(f => f))];
    return folders.sort();
  } catch (error) {
    console.error('Error getting unique folders:', error);
    return [];
  }
}

// Get domain statistics
export async function getDomainStats() {
  try {
    const bookmarks = await getAllBookmarks();
    const domainCount = {};
    
    bookmarks.forEach(bookmark => {
      domainCount[bookmark.domain] = (domainCount[bookmark.domain] || 0) + 1;
    });
    
    return Object.entries(domainCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
  } catch (error) {
    console.error('Error getting domain stats:', error);
    return [];
  }
}

// Get activity timeline
export async function getActivityTimeline() {
  try {
    const bookmarks = await getAllBookmarks();
    const monthlyCount = {};
    
    bookmarks.forEach(bookmark => {
      const date = new Date(bookmark.dateAdded);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1;
    });
    
    return Object.entries(monthlyCount).sort();
  } catch (error) {
    console.error('Error getting activity timeline:', error);
    return [];
  }
}

// Find duplicate bookmarks
export async function findDuplicates() {
  try {
    const bookmarks = await getAllBookmarks();
    const urlMap = {};
    
    bookmarks.forEach(bookmark => {
      if (!urlMap[bookmark.url]) {
        urlMap[bookmark.url] = [];
      }
      urlMap[bookmark.url].push(bookmark);
    });
    
    // Filter out groups where bookmarks might no longer exist
    const duplicateGroups = Object.values(urlMap).filter(group => group.length > 1);
    
    // Verify bookmarks still exist by checking with Chrome API
    const validGroups = [];
    for (const group of duplicateGroups) {
      const validBookmarks = [];
      for (const bookmark of group) {
        try {
          const exists = await chrome.bookmarks.get([bookmark.id]);
          if (exists && exists.length > 0) {
            validBookmarks.push(bookmark);
          }
        } catch (e) {
          // Bookmark doesn't exist anymore, skip it
          console.log(`Bookmark ${bookmark.id} no longer exists`);
        }
      }
      if (validBookmarks.length > 1) {
        validGroups.push(validBookmarks);
      }
    }
    
    return validGroups;
  } catch (error) {
    console.error('Error finding duplicates:', error);
    return [];
  }
}

// Find orphaned bookmarks
export async function findOrphans() {
  try {
    const bookmarks = await getAllBookmarks();
    return bookmarks.filter(bookmark => 
      !bookmark.folderPath || 
      bookmark.folderPath === 'Bookmarks Bar' ||
      bookmark.folderPath === 'Other Bookmarks'
    );
  } catch (error) {
    console.error('Error finding orphans:', error);
    return [];
  }
}

// Find malformed URLs
export async function findMalformedUrls() {
  try {
    const bookmarks = await getAllBookmarks();
    return bookmarks.filter(bookmark => 
      !bookmark.url.startsWith('http://') && 
      !bookmark.url.startsWith('https://')
    );
  } catch (error) {
    console.error('Error finding malformed URLs:', error);
    return [];
  }
}

// Trigger sync from background script
export async function syncBookmarks() {
  try {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'syncBookmarks' }, (response) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  } catch (error) {
    console.error('Error syncing bookmarks:', error);
    throw error;
  }
}

// Get bookmarks with pagination for better performance
export async function getBookmarksPaginated(page = 0, pageSize = 50, filters = {}) {
  try {
    const allBookmarks = await getAllBookmarks();
    let filteredBookmarks = allBookmarks;

    // Apply multiple filters
    if (filters.domains && filters.domains.length > 0) {
      filteredBookmarks = filteredBookmarks.filter(bookmark => 
        filters.domains.includes(bookmark.domain)
      );
    }

    if (filters.folders && filters.folders.length > 0) {
      filteredBookmarks = filteredBookmarks.filter(bookmark => 
        filters.folders.includes(bookmark.folderPath)
      );
    }

    if (filters.dateRange) {
      filteredBookmarks = filteredBookmarks.filter(bookmark => 
        bookmark.dateAdded >= filters.dateRange.startDate && 
        bookmark.dateAdded <= filters.dateRange.endDate
      );
    }

    if (filters.searchQuery) {
      const lowerQuery = filters.searchQuery.toLowerCase();
      filteredBookmarks = filteredBookmarks.filter(bookmark => 
        bookmark.title.toLowerCase().includes(lowerQuery) ||
        bookmark.url.toLowerCase().includes(lowerQuery) ||
        bookmark.domain.toLowerCase().includes(lowerQuery)
      );
    }

    // Sort by date added (newest first)
    filteredBookmarks.sort((a, b) => b.dateAdded - a.dateAdded);

    const startIndex = page * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedBookmarks = filteredBookmarks.slice(startIndex, endIndex);

    return {
      bookmarks: paginatedBookmarks,
      totalCount: filteredBookmarks.length,
      hasMore: endIndex < filteredBookmarks.length,
      currentPage: page
    };
  } catch (error) {
    console.error('Error getting paginated bookmarks:', error);
    return {
      bookmarks: [],
      totalCount: 0,
      hasMore: false,
      currentPage: 0
    };
  }
}

// Get domains sorted by recency (most recent bookmark first)
export async function getDomainsByRecency() {
  try {
    const bookmarks = await getAllBookmarks();
    const domainLatest = {};
    
    bookmarks.forEach(bookmark => {
      if (!domainLatest[bookmark.domain] || bookmark.dateAdded > domainLatest[bookmark.domain].dateAdded) {
        domainLatest[bookmark.domain] = {
          domain: bookmark.domain,
          dateAdded: bookmark.dateAdded,
          count: 0
        };
      }
    });

    // Count bookmarks per domain
    bookmarks.forEach(bookmark => {
      domainLatest[bookmark.domain].count++;
    });
    
    return Object.values(domainLatest)
      .sort((a, b) => b.dateAdded - a.dateAdded);
  } catch (error) {
    console.error('Error getting domains by recency:', error);
    return [];
  }
}

// Get domains sorted by bookmark count (most bookmarks first)
export async function getDomainsByCount() {
  try {
    const bookmarks = await getAllBookmarks();
    const domainCount = {};
    const domainLatest = {};
    
    bookmarks.forEach(bookmark => {
      domainCount[bookmark.domain] = (domainCount[bookmark.domain] || 0) + 1;
      if (!domainLatest[bookmark.domain] || bookmark.dateAdded > domainLatest[bookmark.domain]) {
        domainLatest[bookmark.domain] = bookmark.dateAdded;
      }
    });
    
    return Object.entries(domainCount)
      .map(([domain, count]) => ({
        domain,
        count,
        latestDate: domainLatest[domain]
      }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error getting domains by count:', error);
    return [];
  }
}

// Delete a single bookmark
export async function deleteBookmark(bookmarkId) {
  try {
    // Delete from Chrome bookmarks API
    await chrome.bookmarks.remove(bookmarkId);
    
    // Remove from our local storage cache
    const result = await chrome.storage.local.get(['bookmarks']);
    const bookmarks = result.bookmarks || [];
    const updatedBookmarks = bookmarks.filter(b => b.id !== bookmarkId);
    await chrome.storage.local.set({ bookmarks: updatedBookmarks });
    
    return true;
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    throw error;
  }
}

// Delete multiple bookmarks
export async function deleteBookmarks(bookmarkIds) {
  try {
    const errors = [];
    
    // Delete each bookmark from Chrome bookmarks API
    for (const id of bookmarkIds) {
      try {
        await chrome.bookmarks.remove(id);
      } catch (error) {
        console.error(`Error deleting bookmark ${id}:`, error);
        errors.push({ id, error: error.message });
      }
    }
    
    // Remove from our local storage cache
    const result = await chrome.storage.local.get(['bookmarks']);
    const bookmarks = result.bookmarks || [];
    const updatedBookmarks = bookmarks.filter(b => !bookmarkIds.includes(b.id));
    await chrome.storage.local.set({ bookmarks: updatedBookmarks });
    
    return {
      success: bookmarkIds.length - errors.length,
      errors: errors
    };
  } catch (error) {
    console.error('Error deleting bookmarks:', error);
    throw error;
  }
}
