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

// VISUAL ANALYTICS FEATURES

// Content Analysis - Most frequent words in bookmark titles
export async function getTitleWordFrequency() {
  try {
    const bookmarks = await getAllBookmarks();
    const wordCount = {};
    
    // Common words to filter out
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'about', 'from', 'up', 'out',
      'into', 'over', 'under', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their'
    ]);
    
    bookmarks.forEach(bookmark => {
      if (bookmark.title) {
        // Extract words from title, normalize and filter
        const words = bookmark.title
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 2 && !stopWords.has(word));
        
        words.forEach(word => {
          wordCount[word] = (wordCount[word] || 0) + 1;
        });
      }
    });
    
    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20);
  } catch (error) {
    console.error('Error getting title word frequency:', error);
    return [];
  }
}

// Content Analysis - Common title patterns
export async function getTitlePatterns() {
  try {
    const bookmarks = await getAllBookmarks();
    const patterns = {};
    
    bookmarks.forEach(bookmark => {
      if (bookmark.title) {
        const title = bookmark.title.toLowerCase();
        
        // Detect common patterns
        if (title.includes('how to')) {
          patterns['How-to guides'] = (patterns['How-to guides'] || 0) + 1;
        }
        if (title.includes('tutorial')) {
          patterns['Tutorials'] = (patterns['Tutorials'] || 0) + 1;
        }
        if (title.includes('documentation') || title.includes('docs')) {
          patterns['Documentation'] = (patterns['Documentation'] || 0) + 1;
        }
        if (title.includes('api') || title.includes('reference')) {
          patterns['API/Reference'] = (patterns['API/Reference'] || 0) + 1;
        }
        if (title.includes('blog') || title.includes('article')) {
          patterns['Blog/Articles'] = (patterns['Blog/Articles'] || 0) + 1;
        }
        if (title.includes('github') || title.includes('repository')) {
          patterns['Code Repositories'] = (patterns['Code Repositories'] || 0) + 1;
        }
        if (title.includes('video') || title.includes('youtube')) {
          patterns['Videos'] = (patterns['Videos'] || 0) + 1;
        }
        if (title.includes('tool') || title.includes('app')) {
          patterns['Tools/Apps'] = (patterns['Tools/Apps'] || 0) + 1;
        }
        
        // Length-based patterns
        if (title.length > 60) {
          patterns['Long titles (60+ chars)'] = (patterns['Long titles (60+ chars)'] || 0) + 1;
        }
        if (title.split(' ').length <= 3) {
          patterns['Short titles (≤3 words)'] = (patterns['Short titles (≤3 words)'] || 0) + 1;
        }
      }
    });
    
    return Object.entries(patterns)
      .sort(([,a], [,b]) => b - a);
  } catch (error) {
    console.error('Error getting title patterns:', error);
    return [];
  }
}

// Temporal Analysis - Bookmark age distribution
export async function getBookmarkAgeDistribution() {
  try {
    const bookmarks = await getAllBookmarks();
    const now = Date.now();
    const ageGroups = {
      'Last 24 hours': 0,
      'Last week': 0,
      'Last month': 0,
      'Last 3 months': 0,
      'Last 6 months': 0,
      'Last year': 0,
      'Over 1 year': 0
    };
    
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    
    bookmarks.forEach(bookmark => {
      const age = now - bookmark.dateAdded;
      
      if (age <= DAY) {
        ageGroups['Last 24 hours']++;
      } else if (age <= WEEK) {
        ageGroups['Last week']++;
      } else if (age <= MONTH) {
        ageGroups['Last month']++;
      } else if (age <= 3 * MONTH) {
        ageGroups['Last 3 months']++;
      } else if (age <= 6 * MONTH) {
        ageGroups['Last 6 months']++;
      } else if (age <= 365 * DAY) {
        ageGroups['Last year']++;
      } else {
        ageGroups['Over 1 year']++;
      }
    });
    
    return Object.entries(ageGroups);
  } catch (error) {
    console.error('Error getting bookmark age distribution:', error);
    return [];
  }
}

// Temporal Analysis - Enhanced bookmark creation patterns
export async function getBookmarkCreationPatterns() {
  try {
    const bookmarks = await getAllBookmarks();
    const hourPatterns = new Array(24).fill(0);
    const dayPatterns = new Array(7).fill(0);
    const monthPatterns = new Array(12).fill(0);
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    bookmarks.forEach(bookmark => {
      const date = new Date(bookmark.dateAdded);
      hourPatterns[date.getHours()]++;
      dayPatterns[date.getDay()]++;
      monthPatterns[date.getMonth()]++;
    });
    
    return {
      hourly: hourPatterns.map((count, hour) => ([`${hour}:00`, count])),
      daily: dayPatterns.map((count, day) => ([dayNames[day], count])),
      monthly: monthPatterns.map((count, month) => ([monthNames[month], count]))
    };
  } catch (error) {
    console.error('Error getting bookmark creation patterns:', error);
    return { hourly: [], daily: [], monthly: [] };
  }
}

// URL Structure Analysis - Common URL patterns
export async function getUrlPatterns() {
  try {
    const bookmarks = await getAllBookmarks();
    const protocols = {};
    const topLevelDomains = {};
    const pathPatterns = {};
    const subdomainPatterns = {};
    
    bookmarks.forEach(bookmark => {
      try {
        const url = new URL(bookmark.url);
        
        // Protocol analysis
        protocols[url.protocol] = (protocols[url.protocol] || 0) + 1;
        
        // TLD analysis
        const domain = url.hostname;
        const parts = domain.split('.');
        if (parts.length > 1) {
          const tld = parts[parts.length - 1];
          topLevelDomains[tld] = (topLevelDomains[tld] || 0) + 1;
        }
        
        // Subdomain analysis
        if (parts.length > 2) {
          const subdomain = parts[0];
          if (subdomain !== 'www') {
            subdomainPatterns[subdomain] = (subdomainPatterns[subdomain] || 0) + 1;
          }
        }
        
        // Path patterns
        const pathSegments = url.pathname.split('/').filter(segment => segment.length > 0);
        if (pathSegments.length > 0) {
          const firstSegment = pathSegments[0];
          pathPatterns[firstSegment] = (pathPatterns[firstSegment] || 0) + 1;
        }
        
      } catch (e) {
        // Skip malformed URLs
      }
    });
    
    return {
      protocols: Object.entries(protocols).sort(([,a], [,b]) => b - a),
      topLevelDomains: Object.entries(topLevelDomains).sort(([,a], [,b]) => b - a).slice(0, 10),
      subdomains: Object.entries(subdomainPatterns).sort(([,a], [,b]) => b - a).slice(0, 10),
      pathPatterns: Object.entries(pathPatterns).sort(([,a], [,b]) => b - a).slice(0, 15)
    };
  } catch (error) {
    console.error('Error getting URL patterns:', error);
    return { protocols: [], topLevelDomains: [], subdomains: [], pathPatterns: [] };
  }
}

// URL Structure Analysis - Parameter usage frequency
export async function getUrlParameterUsage() {
  try {
    const bookmarks = await getAllBookmarks();
    const parameterCount = {};
    let urlsWithParams = 0;
    let totalUrls = 0;
    
    bookmarks.forEach(bookmark => {
      totalUrls++;
      try {
        const url = new URL(bookmark.url);
        const params = url.searchParams;
        
        if (params.toString()) {
          urlsWithParams++;
          for (const [key] of params) {
            parameterCount[key] = (parameterCount[key] || 0) + 1;
          }
        }
      } catch (e) {
        // Skip malformed URLs
      }
    });
    
    const parameterUsage = Object.entries(parameterCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15);
    
    return {
      parameters: parameterUsage,
      urlsWithParams,
      totalUrls,
      percentage: totalUrls > 0 ? Math.round((urlsWithParams / totalUrls) * 100) : 0
    };
  } catch (error) {
    console.error('Error getting URL parameter usage:', error);
    return { parameters: [], urlsWithParams: 0, totalUrls: 0, percentage: 0 };
  }
}

// Enhanced Domain Analysis - Distribution of bookmarks across domains
export async function getDomainDistribution() {
  try {
    const bookmarks = await getAllBookmarks();
    const domainCount = {};
    
    bookmarks.forEach(bookmark => {
      domainCount[bookmark.domain] = (domainCount[bookmark.domain] || 0) + 1;
    });
    
    const sortedDomains = Object.entries(domainCount)
      .sort(([,a], [,b]) => b - a);
    
    const totalBookmarks = bookmarks.length;
    const top10 = sortedDomains.slice(0, 10);
    const others = sortedDomains.slice(10);
    const othersCount = others.reduce((sum, [,count]) => sum + count, 0);
    
    const distribution = top10.map(([domain, count]) => ({
      domain,
      count,
      percentage: Math.round((count / totalBookmarks) * 100)
    }));
    
    if (othersCount > 0) {
      distribution.push({
        domain: 'Others',
        count: othersCount,
        percentage: Math.round((othersCount / totalBookmarks) * 100)
      });
    }
    
    return distribution;
  } catch (error) {
    console.error('Error getting domain distribution:', error);
    return [];
  }
}
