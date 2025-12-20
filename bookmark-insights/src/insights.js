// Advanced insights and analytics module for bookmark data
// Provides domain hierarchy visualization, behavioral analytics, and data insights

import { db } from './db.js';

/**
 * Build domain hierarchy tree for visualization
 * Returns a nested structure: domain → subdomain → paths
 */
export async function getDomainHierarchy() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const hierarchy = {};

    bookmarks.forEach(bookmark => {
      if (!bookmark.url) return;
      
      try {
        const urlObj = new URL(bookmark.url);
        const hostname = urlObj.hostname;
        const pathname = urlObj.pathname;
        
        // Extract TLD and domain parts
        const hostParts = hostname.split('.').reverse();
        const tld = hostParts[0];
        const domain = hostParts[1] || '';
        const subdomain = hostParts.length > 2 ? hostParts.slice(2).reverse().join('.') : 'www';
        
        // Create hierarchy key
        const domainKey = `${domain}.${tld}`;
        
        if (!hierarchy[domainKey]) {
          hierarchy[domainKey] = {
            name: domainKey,
            count: 0,
            subdomains: {}
          };
        }
        
        hierarchy[domainKey].count++;
        
        // Track subdomain
        if (!hierarchy[domainKey].subdomains[subdomain]) {
          hierarchy[domainKey].subdomains[subdomain] = {
            name: subdomain,
            count: 0,
            paths: {}
          };
        }
        hierarchy[domainKey].subdomains[subdomain].count++;
        
        // Track top-level path
        const pathParts = pathname.split('/').filter(p => p);
        const topPath = pathParts[0] || '/';
        
        if (!hierarchy[domainKey].subdomains[subdomain].paths[topPath]) {
          hierarchy[domainKey].subdomains[subdomain].paths[topPath] = 0;
        }
        hierarchy[domainKey].subdomains[subdomain].paths[topPath]++;
        
      } catch (e) {
        // Invalid URL, skip
      }
    });
    
    // Convert to array sorted by count
    const result = Object.values(hierarchy)
      .map(domain => ({
        ...domain,
        subdomains: Object.values(domain.subdomains)
          .map(sub => ({
            ...sub,
            paths: Object.entries(sub.paths)
              .map(([path, count]) => ({ name: path, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
          }))
          .sort((a, b) => b.count - a.count)
      }))
      .sort((a, b) => b.count - a.count);
    
    return result;
  } catch (error) {
    console.error('Error building domain hierarchy:', error);
    return [];
  }
}

/**
 * Get domain hierarchy in treemap format for Chart.js
 */
export async function getDomainTreemapData() {
  try {
    const hierarchy = await getDomainHierarchy();
    
    // Convert to flat treemap format with groups
    const data = [];
    const backgroundColors = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
      '#EC4899', '#6B7280', '#14B8A6', '#F97316', '#84CC16',
      '#06B6D4', '#F43F5E', '#22C55E', '#A855F7', '#0EA5E9'
    ];
    
    hierarchy.slice(0, 20).forEach((domain, idx) => {
      // Add domain as group
      data.push({
        name: domain.name,
        value: domain.count,
        group: domain.name,
        color: backgroundColors[idx % backgroundColors.length]
      });
    });
    
    return data;
  } catch (error) {
    console.error('Error getting treemap data:', error);
    return [];
  }
}

/**
 * Get stale bookmarks (old + never accessed)
 * @param {number} daysThreshold - Number of days to consider "old"
 */
export async function getStaleBookmarks(daysThreshold = 90) {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const now = Date.now();
    const threshold = daysThreshold * 24 * 60 * 60 * 1000;
    
    return bookmarks.filter(bookmark => {
      const age = now - bookmark.dateAdded;
      const neverAccessed = !bookmark.lastAccessed || bookmark.accessCount === 0;
      return age > threshold && neverAccessed;
    }).sort((a, b) => a.dateAdded - b.dateAdded);
  } catch (error) {
    console.error('Error getting stale bookmarks:', error);
    return [];
  }
}

/**
 * Get reading list suggestions (recently added but not accessed)
 */
export async function getReadingListSuggestions(limit = 20) {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    return bookmarks
      .filter(bookmark => {
        const isRecent = bookmark.dateAdded > thirtyDaysAgo;
        const notAccessed = !bookmark.lastAccessed || bookmark.accessCount === 0;
        return isRecent && notAccessed;
      })
      .sort((a, b) => b.dateAdded - a.dateAdded)
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting reading list suggestions:', error);
    return [];
  }
}

/**
 * Get most accessed bookmarks
 */
export async function getMostAccessedBookmarks(limit = 20) {
  try {
    const bookmarks = await db.bookmarks.toArray();
    
    return bookmarks
      .filter(b => b.accessCount > 0)
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting most accessed bookmarks:', error);
    return [];
  }
}

/**
 * Get category distribution over time
 */
export async function getCategoryTrends() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const trends = {};
    
    bookmarks.forEach(bookmark => {
      if (!bookmark.category) return;
      
      const date = new Date(bookmark.dateAdded);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!trends[monthKey]) {
        trends[monthKey] = {};
      }
      
      if (!trends[monthKey][bookmark.category]) {
        trends[monthKey][bookmark.category] = 0;
      }
      
      trends[monthKey][bookmark.category]++;
    });
    
    // Get top categories
    const categoryTotals = {};
    Object.values(trends).forEach(monthData => {
      Object.entries(monthData).forEach(([cat, count]) => {
        categoryTotals[cat] = (categoryTotals[cat] || 0) + count;
      });
    });
    
    const topCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat]) => cat);
    
    // Build time series
    const months = Object.keys(trends).sort();
    const datasets = topCategories.map(category => ({
      category,
      data: months.map(month => trends[month][category] || 0)
    }));
    
    return { months, datasets };
  } catch (error) {
    console.error('Error getting category trends:', error);
    return { months: [], datasets: [] };
  }
}

/**
 * Get expertise areas based on bookmark patterns
 */
export async function getExpertiseAreas() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const expertiseScores = {};
    
    bookmarks.forEach(bookmark => {
      // Weight by access count and category
      const weight = 1 + (bookmark.accessCount || 0);
      const category = bookmark.category || 'uncategorized';
      
      expertiseScores[category] = (expertiseScores[category] || 0) + weight;
    });
    
    // Normalize scores
    const totalScore = Object.values(expertiseScores).reduce((a, b) => a + b, 0);
    
    return Object.entries(expertiseScores)
      .map(([area, score]) => ({
        area,
        score,
        percentage: totalScore > 0 ? ((score / totalScore) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch (error) {
    console.error('Error getting expertise areas:', error);
    return [];
  }
}

/**
 * Get "bookmark and forget" detection - bookmarks never accessed
 */
export async function getBookmarkAndForget() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const sixMonthsAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);
    
    return bookmarks
      .filter(bookmark => {
        const isOld = bookmark.dateAdded < sixMonthsAgo;
        const neverAccessed = !bookmark.lastAccessed && (!bookmark.accessCount || bookmark.accessCount === 0);
        return isOld && neverAccessed;
      })
      .sort((a, b) => a.dateAdded - b.dateAdded);
  } catch (error) {
    console.error('Error detecting bookmark-and-forget:', error);
    return [];
  }
}

/**
 * Get content freshness analysis
 */
export async function getContentFreshness() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const now = Date.now();
    
    const ageGroups = {
      'Last 7 days': 0,
      'Last 30 days': 0,
      'Last 90 days': 0,
      'Last year': 0,
      'Older': 0
    };
    
    const thresholds = {
      'Last 7 days': 7 * 24 * 60 * 60 * 1000,
      'Last 30 days': 30 * 24 * 60 * 60 * 1000,
      'Last 90 days': 90 * 24 * 60 * 60 * 1000,
      'Last year': 365 * 24 * 60 * 60 * 1000
    };
    
    bookmarks.forEach(bookmark => {
      const age = now - bookmark.dateAdded;
      
      if (age <= thresholds['Last 7 days']) {
        ageGroups['Last 7 days']++;
      } else if (age <= thresholds['Last 30 days']) {
        ageGroups['Last 30 days']++;
      } else if (age <= thresholds['Last 90 days']) {
        ageGroups['Last 90 days']++;
      } else if (age <= thresholds['Last year']) {
        ageGroups['Last year']++;
      } else {
        ageGroups['Older']++;
      }
    });
    
    return Object.entries(ageGroups).map(([period, count]) => ({ period, count }));
  } catch (error) {
    console.error('Error analyzing content freshness:', error);
    return [];
  }
}

/**
 * Get overall insights summary
 */
export async function getInsightsSummary() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const events = await db.events.toArray();
    
    const now = Date.now();
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    // Calculate metrics
    const totalBookmarks = bookmarks.length;
    const categorized = bookmarks.filter(b => b.category).length;
    const enriched = bookmarks.filter(b => b.description || b.keywords?.length > 0).length;
    const aliveChecked = bookmarks.filter(b => b.isAlive !== null).length;
    const deadLinks = bookmarks.filter(b => b.isAlive === false).length;
    const neverAccessed = bookmarks.filter(b => !b.lastAccessed && (!b.accessCount || b.accessCount === 0)).length;
    
    // Recent activity
    const addedThisWeek = bookmarks.filter(b => b.dateAdded > weekAgo).length;
    const addedThisMonth = bookmarks.filter(b => b.dateAdded > monthAgo).length;
    
    // Events summary
    const recentEvents = events.filter(e => e.timestamp > weekAgo);
    const accessEvents = recentEvents.filter(e => e.type === 'access').length;
    const createEvents = recentEvents.filter(e => e.type === 'create').length;
    
    // Top categories
    const categoryCount = {};
    bookmarks.forEach(b => {
      if (b.category) {
        categoryCount[b.category] = (categoryCount[b.category] || 0) + 1;
      }
    });
    const topCategories = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    
    // Unique domains
    const uniqueDomains = new Set(bookmarks.map(b => b.domain).filter(d => d)).size;
    
    return {
      totalBookmarks,
      categorized,
      categorizedPercentage: totalBookmarks > 0 ? ((categorized / totalBookmarks) * 100).toFixed(1) : 0,
      enriched,
      enrichedPercentage: totalBookmarks > 0 ? ((enriched / totalBookmarks) * 100).toFixed(1) : 0,
      aliveChecked,
      deadLinks,
      neverAccessed,
      neverAccessedPercentage: totalBookmarks > 0 ? ((neverAccessed / totalBookmarks) * 100).toFixed(1) : 0,
      addedThisWeek,
      addedThisMonth,
      accessEventsThisWeek: accessEvents,
      createEventsThisWeek: createEvents,
      topCategories,
      uniqueDomains
    };
  } catch (error) {
    console.error('Error getting insights summary:', error);
    return {};
  }
}

/**
 * Get event statistics for behavioral analytics
 */
export async function getEventStatistics() {
  try {
    const events = await db.events.toArray();
    const now = Date.now();
    
    // Group events by type and time
    const eventsByType = {};
    const eventsByDay = {};
    
    events.forEach(event => {
      // By type
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      
      // By day
      const date = new Date(event.timestamp);
      const dayKey = date.toISOString().split('T')[0];
      if (!eventsByDay[dayKey]) {
        eventsByDay[dayKey] = { total: 0, byType: {} };
      }
      eventsByDay[dayKey].total++;
      eventsByDay[dayKey].byType[event.type] = (eventsByDay[dayKey].byType[event.type] || 0) + 1;
    });
    
    // Get last 30 days
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const dayKey = date.toISOString().split('T')[0];
      last30Days.push({
        date: dayKey,
        total: eventsByDay[dayKey]?.total || 0,
        ...eventsByDay[dayKey]?.byType || {}
      });
    }
    
    return {
      summary: eventsByType,
      timeline: last30Days,
      totalEvents: events.length
    };
  } catch (error) {
    console.error('Error getting event statistics:', error);
    return { summary: {}, timeline: [], totalEvents: 0 };
  }
}

/**
 * Record a bookmark access event
 */
export async function recordBookmarkAccess(bookmarkId, url) {
  try {
    // Update bookmark access stats
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (bookmark) {
      await db.bookmarks.update(bookmarkId, {
        lastAccessed: Date.now(),
        accessCount: (bookmark.accessCount || 0) + 1
      });
    }
    
    // Log event
    await db.events.add({
      bookmarkId,
      type: 'access',
      timestamp: Date.now(),
      url
    });
    
    return true;
  } catch (error) {
    console.error('Error recording bookmark access:', error);
    return false;
  }
}

/**
 * Find bookmark by URL for access tracking
 */
export async function findBookmarkByUrl(url) {
  try {
    return await db.bookmarks.where('url').equals(url).first();
  } catch (error) {
    console.error('Error finding bookmark by URL:', error);
    return null;
  }
}

/**
 * Get hourly access patterns
 */
export async function getHourlyAccessPatterns() {
  try {
    const events = await db.events.where('type').equals('access').toArray();
    
    const hourlyPattern = Array(24).fill(0);
    
    events.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      hourlyPattern[hour]++;
    });
    
    return hourlyPattern.map((count, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      count
    }));
  } catch (error) {
    console.error('Error getting hourly patterns:', error);
    return Array(24).fill(0).map((_, hour) => ({ hour: `${hour.toString().padStart(2, '0')}:00`, count: 0 }));
  }
}
