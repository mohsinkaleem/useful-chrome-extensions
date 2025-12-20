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

/**
 * Get dead link insights and categorization
 * Provides analytics on dead/broken bookmarks by domain, age, and other factors
 */
export async function getDeadLinkInsights() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const deadLinks = bookmarks.filter(b => b.isAlive === false);
    const now = Date.now();
    
    if (deadLinks.length === 0) {
      return {
        total: 0,
        byDomain: [],
        byAge: { recent: 0, moderate: 0, old: 0, ancient: 0 },
        byCategory: [],
        oldestDeadLinks: [],
        recentlyDied: [],
        deadLinkRate: 0,
        checkedCount: 0
      };
    }
    
    // Group by domain
    const domainCounts = {};
    deadLinks.forEach(bookmark => {
      const domain = bookmark.domain || 'Unknown';
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });
    
    const byDomain = Object.entries(domainCounts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Group by age (when bookmark was created)
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    
    const byAge = {
      recent: deadLinks.filter(b => b.dateAdded > oneWeekAgo).length,      // < 1 week old
      moderate: deadLinks.filter(b => b.dateAdded <= oneWeekAgo && b.dateAdded > oneMonthAgo).length, // 1 week - 1 month
      old: deadLinks.filter(b => b.dateAdded <= oneMonthAgo && b.dateAdded > oneYearAgo).length,       // 1 month - 1 year
      ancient: deadLinks.filter(b => b.dateAdded <= oneYearAgo).length     // > 1 year old
    };
    
    // Group by category
    const categoryCounts = {};
    deadLinks.forEach(bookmark => {
      const category = bookmark.category || 'Uncategorized';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    const byCategory = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Oldest dead links (bookmarks that have been dead longest, based on when they were created)
    const oldestDeadLinks = [...deadLinks]
      .sort((a, b) => a.dateAdded - b.dateAdded)
      .slice(0, 5)
      .map(b => ({
        id: b.id,
        title: b.title,
        url: b.url,
        domain: b.domain,
        dateAdded: b.dateAdded,
        lastChecked: b.lastChecked
      }));
    
    // Recently died (most recently checked and found dead)
    const recentlyDied = [...deadLinks]
      .filter(b => b.lastChecked)
      .sort((a, b) => b.lastChecked - a.lastChecked)
      .slice(0, 5)
      .map(b => ({
        id: b.id,
        title: b.title,
        url: b.url,
        domain: b.domain,
        dateAdded: b.dateAdded,
        lastChecked: b.lastChecked
      }));
    
    // Calculate dead link rate
    const checkedCount = bookmarks.filter(b => b.isAlive !== null && b.isAlive !== undefined).length;
    const deadLinkRate = checkedCount > 0 ? ((deadLinks.length / checkedCount) * 100).toFixed(1) : 0;
    
    return {
      total: deadLinks.length,
      byDomain,
      byAge,
      byCategory,
      oldestDeadLinks,
      recentlyDied,
      deadLinkRate: parseFloat(deadLinkRate),
      checkedCount
    };
  } catch (error) {
    console.error('Error getting dead link insights:', error);
    return {
      total: 0,
      byDomain: [],
      byAge: { recent: 0, moderate: 0, old: 0, ancient: 0 },
      byCategory: [],
      oldestDeadLinks: [],
      recentlyDied: [],
      deadLinkRate: 0,
      checkedCount: 0
    };
  }
}

// ============================================================================
// COLLECTION HEALTH METRICS
// ============================================================================

/**
 * Get comprehensive collection health metrics
 * ROI, decay rate, enrichment coverage, etc.
 */
export async function getCollectionHealthMetrics() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const total = bookmarks.length;
    
    if (total === 0) {
      return {
        total: 0,
        roi: 0,
        decayRate: 0,
        deadLinkRatio: 0,
        enrichmentCoverage: 0,
        categorizationCoverage: 0,
        duplicateScore: 0,
        healthScore: 0,
        metrics: {}
      };
    }
    
    const now = Date.now();
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
    
    // ROI: % of bookmarks actually accessed
    const accessedBookmarks = bookmarks.filter(b => b.accessCount && b.accessCount > 0);
    const roi = ((accessedBookmarks.length / total) * 100);
    
    // Decay Rate: % of bookmarks older than 90 days that were never accessed
    const oldBookmarks = bookmarks.filter(b => b.dateAdded < ninetyDaysAgo);
    const decayedBookmarks = oldBookmarks.filter(b => !b.accessCount || b.accessCount === 0);
    const decayRate = oldBookmarks.length > 0 
      ? ((decayedBookmarks.length / oldBookmarks.length) * 100) 
      : 0;
    
    // Dead Link Ratio
    const checkedBookmarks = bookmarks.filter(b => b.isAlive !== null && b.isAlive !== undefined);
    const deadBookmarks = bookmarks.filter(b => b.isAlive === false);
    const deadLinkRatio = checkedBookmarks.length > 0 
      ? ((deadBookmarks.length / checkedBookmarks.length) * 100) 
      : 0;
    
    // Enrichment Coverage: has description or keywords
    const enrichedBookmarks = bookmarks.filter(b => 
      b.description || (b.keywords && b.keywords.length > 0) || b.contentSnippet
    );
    const enrichmentCoverage = ((enrichedBookmarks.length / total) * 100);
    
    // Categorization Coverage
    const categorizedBookmarks = bookmarks.filter(b => b.category);
    const categorizationCoverage = ((categorizedBookmarks.length / total) * 100);
    
    // Duplicate Score (by URL)
    const urlCounts = {};
    bookmarks.forEach(b => {
      if (b.url) {
        const normalizedUrl = b.url.replace(/\/$/, '').toLowerCase();
        urlCounts[normalizedUrl] = (urlCounts[normalizedUrl] || 0) + 1;
      }
    });
    const duplicateUrls = Object.values(urlCounts).filter(count => count > 1);
    const duplicateCount = duplicateUrls.reduce((sum, count) => sum + (count - 1), 0);
    const duplicateScore = ((duplicateCount / total) * 100);
    
    // Overall Health Score (weighted average)
    const healthScore = Math.round(
      (roi * 0.25) +                          // Usage is important
      ((100 - decayRate) * 0.20) +            // Low decay is good
      ((100 - deadLinkRatio) * 0.20) +        // Low dead links is good
      (enrichmentCoverage * 0.15) +           // Enrichment helps
      (categorizationCoverage * 0.10) +       // Categories help
      ((100 - duplicateScore) * 0.10)         // Low duplicates is good
    );
    
    return {
      total,
      roi: Math.round(roi * 10) / 10,
      decayRate: Math.round(decayRate * 10) / 10,
      deadLinkRatio: Math.round(deadLinkRatio * 10) / 10,
      enrichmentCoverage: Math.round(enrichmentCoverage * 10) / 10,
      categorizationCoverage: Math.round(categorizationCoverage * 10) / 10,
      duplicateScore: Math.round(duplicateScore * 10) / 10,
      healthScore: Math.min(100, Math.max(0, healthScore)),
      metrics: {
        accessed: accessedBookmarks.length,
        neverAccessed: total - accessedBookmarks.length,
        old: oldBookmarks.length,
        decayed: decayedBookmarks.length,
        checked: checkedBookmarks.length,
        dead: deadBookmarks.length,
        enriched: enrichedBookmarks.length,
        categorized: categorizedBookmarks.length,
        duplicates: duplicateCount
      }
    };
  } catch (error) {
    console.error('Error getting collection health metrics:', error);
    return {
      total: 0, roi: 0, decayRate: 0, deadLinkRatio: 0,
      enrichmentCoverage: 0, categorizationCoverage: 0,
      duplicateScore: 0, healthScore: 0, metrics: {}
    };
  }
}

// ============================================================================
// CONTENT ANALYSIS
// ============================================================================

/**
 * Get comprehensive content analysis
 * Category breakdown, topic clusters, content types
 */
export async function getContentAnalysis() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    
    // Category Breakdown
    const categoryCount = {};
    bookmarks.forEach(b => {
      const cat = b.category || 'uncategorized';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    
    const categoryBreakdown = Object.entries(categoryCount)
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / bookmarks.length) * 1000) / 10
      }))
      .sort((a, b) => b.count - a.count);
    
    // Topic Clusters from keywords
    const keywordCount = {};
    bookmarks.forEach(b => {
      if (b.keywords && Array.isArray(b.keywords)) {
        b.keywords.forEach(kw => {
          const normalized = kw.toLowerCase().trim();
          if (normalized.length > 2) {
            keywordCount[normalized] = (keywordCount[normalized] || 0) + 1;
          }
        });
      }
    });
    
    const topicClusters = Object.entries(keywordCount)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);
    
    // Content Type Mix (based on URL patterns and categories)
    const contentTypes = {
      articles: 0,
      videos: 0,
      documentation: 0,
      tools: 0,
      social: 0,
      code: 0,
      shopping: 0,
      other: 0
    };
    
    bookmarks.forEach(b => {
      const url = (b.url || '').toLowerCase();
      const category = b.category || '';
      
      if (category === 'video' || url.includes('youtube') || url.includes('vimeo') || url.includes('video')) {
        contentTypes.videos++;
      } else if (category === 'documentation' || url.includes('/docs') || url.includes('/api') || url.includes('/reference')) {
        contentTypes.documentation++;
      } else if (category === 'code' || url.includes('github') || url.includes('gitlab') || url.includes('stackoverflow')) {
        contentTypes.code++;
      } else if (category === 'tool' || url.includes('app.') || url.includes('/app')) {
        contentTypes.tools++;
      } else if (category === 'social' || url.includes('twitter') || url.includes('linkedin') || url.includes('reddit')) {
        contentTypes.social++;
      } else if (category === 'shopping' || url.includes('amazon') || url.includes('ebay') || url.includes('shop')) {
        contentTypes.shopping++;
      } else if (category === 'blog' || url.includes('blog') || url.includes('article') || url.includes('medium')) {
        contentTypes.articles++;
      } else {
        contentTypes.other++;
      }
    });
    
    const contentTypeMix = Object.entries(contentTypes)
      .map(([type, count]) => ({
        type,
        count,
        percentage: Math.round((count / bookmarks.length) * 1000) / 10
      }))
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count);
    
    // Language Distribution from rawMetadata
    const languageCount = {};
    bookmarks.forEach(b => {
      let lang = 'unknown';
      if (b.rawMetadata?.other?.language) {
        lang = b.rawMetadata.other.language.split('-')[0].toLowerCase();
      }
      languageCount[lang] = (languageCount[lang] || 0) + 1;
    });
    
    const languageDistribution = Object.entries(languageCount)
      .map(([language, count]) => ({
        language: language === 'unknown' ? 'Unknown' : language.toUpperCase(),
        count,
        percentage: Math.round((count / bookmarks.length) * 1000) / 10
      }))
      .sort((a, b) => b.count - a.count);
    
    // Folder distribution
    const folderCount = {};
    bookmarks.forEach(b => {
      const folder = b.folderPath || 'Root';
      folderCount[folder] = (folderCount[folder] || 0) + 1;
    });
    
    const folderDistribution = Object.entries(folderCount)
      .map(([folder, count]) => ({
        folder,
        count,
        percentage: Math.round((count / bookmarks.length) * 1000) / 10
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    
    return {
      categoryBreakdown,
      topicClusters,
      contentTypeMix,
      languageDistribution,
      folderDistribution,
      totalBookmarks: bookmarks.length
    };
  } catch (error) {
    console.error('Error getting content analysis:', error);
    return {
      categoryBreakdown: [],
      topicClusters: [],
      contentTypeMix: [],
      languageDistribution: [],
      folderDistribution: [],
      totalBookmarks: 0
    };
  }
}

// ============================================================================
// ACTIONABLE INSIGHTS
// ============================================================================

/**
 * Get actionable insights with recommendations
 * Stale queue, cleanup candidates, rediscovery suggestions
 */
export async function getActionableInsights() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const now = Date.now();
    
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    
    // Stale Queue: Unaccessed bookmarks older than 30 days
    const staleQueue = bookmarks
      .filter(b => {
        const isOld = b.dateAdded < thirtyDaysAgo;
        const neverAccessed = !b.accessCount || b.accessCount === 0;
        const isAlive = b.isAlive !== false;
        return isOld && neverAccessed && isAlive;
      })
      .sort((a, b) => a.dateAdded - b.dateAdded)
      .slice(0, 50)
      .map(b => ({
        id: b.id,
        title: b.title,
        url: b.url,
        domain: b.domain,
        dateAdded: b.dateAdded,
        category: b.category,
        folderPath: b.folderPath,
        ageInDays: Math.floor((now - b.dateAdded) / (24 * 60 * 60 * 1000))
      }));
    
    // Cleanup Candidates: Dead + never accessed + very old
    const cleanupCandidates = bookmarks
      .filter(b => {
        const isDead = b.isAlive === false;
        const neverAccessed = !b.accessCount || b.accessCount === 0;
        const isVeryOld = b.dateAdded < oneYearAgo && neverAccessed;
        return isDead || isVeryOld;
      })
      .sort((a, b) => {
        // Prioritize dead links first
        if (a.isAlive === false && b.isAlive !== false) return -1;
        if (b.isAlive === false && a.isAlive !== false) return 1;
        return a.dateAdded - b.dateAdded;
      })
      .slice(0, 50)
      .map(b => ({
        id: b.id,
        title: b.title,
        url: b.url,
        domain: b.domain,
        dateAdded: b.dateAdded,
        isAlive: b.isAlive,
        accessCount: b.accessCount || 0,
        reason: b.isAlive === false ? 'Dead link' : 'Old & unused',
        ageInDays: Math.floor((now - b.dateAdded) / (24 * 60 * 60 * 1000))
      }));
    
    // Rediscovery Feed: Random selection of old but alive bookmarks
    const rediscoveryCandidates = bookmarks.filter(b => {
      const isOld = b.dateAdded < ninetyDaysAgo;
      const isAlive = b.isAlive !== false;
      const hasContent = b.title && b.url;
      return isOld && isAlive && hasContent;
    });
    
    // Shuffle and pick 5
    const shuffled = [...rediscoveryCandidates].sort(() => Math.random() - 0.5);
    const rediscoveryFeed = shuffled.slice(0, 5).map(b => ({
      id: b.id,
      title: b.title,
      url: b.url,
      domain: b.domain,
      dateAdded: b.dateAdded,
      category: b.category,
      description: b.description,
      ageInDays: Math.floor((now - b.dateAdded) / (24 * 60 * 60 * 1000))
    }));
    
    // Consolidation Opportunities: Domains with only 1-2 bookmarks
    const domainCount = {};
    bookmarks.forEach(b => {
      if (b.domain) {
        if (!domainCount[b.domain]) {
          domainCount[b.domain] = [];
        }
        domainCount[b.domain].push(b);
      }
    });
    
    const lowValueDomains = Object.entries(domainCount)
      .filter(([, bks]) => bks.length <= 2)
      .map(([domain, bks]) => ({
        domain,
        count: bks.length,
        bookmarks: bks.map(b => ({
          id: b.id,
          title: b.title,
          url: b.url,
          dateAdded: b.dateAdded
        }))
      }))
      .sort((a, b) => a.count - b.count)
      .slice(0, 20);
    
    // Quick Stats
    const stats = {
      totalStale: staleQueue.length,
      totalCleanupCandidates: cleanupCandidates.length,
      totalLowValueDomains: lowValueDomains.length,
      deadLinksCount: bookmarks.filter(b => b.isAlive === false).length,
      oldUnusedCount: bookmarks.filter(b => 
        b.dateAdded < oneYearAgo && (!b.accessCount || b.accessCount === 0)
      ).length
    };
    
    return {
      staleQueue,
      cleanupCandidates,
      rediscoveryFeed,
      lowValueDomains,
      stats
    };
  } catch (error) {
    console.error('Error getting actionable insights:', error);
    return {
      staleQueue: [],
      cleanupCandidates: [],
      rediscoveryFeed: [],
      lowValueDomains: [],
      stats: {}
    };
  }
}

// ============================================================================
// DOMAIN INTELLIGENCE
// ============================================================================

/**
 * Get domain intelligence metrics
 * Reliability scores, ephemeral sources, dependency analysis
 */
export async function getDomainIntelligence() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    
    // Group by domain
    const domainData = {};
    bookmarks.forEach(b => {
      if (!b.domain) return;
      
      if (!domainData[b.domain]) {
        domainData[b.domain] = {
          domain: b.domain,
          total: 0,
          dead: 0,
          checked: 0,
          accessed: 0,
          totalAccess: 0,
          oldestBookmark: Infinity,
          newestBookmark: 0,
          categories: {}
        };
      }
      
      const d = domainData[b.domain];
      d.total++;
      
      if (b.isAlive !== null && b.isAlive !== undefined) {
        d.checked++;
        if (b.isAlive === false) d.dead++;
      }
      
      if (b.accessCount && b.accessCount > 0) {
        d.accessed++;
        d.totalAccess += b.accessCount;
      }
      
      if (b.dateAdded < d.oldestBookmark) d.oldestBookmark = b.dateAdded;
      if (b.dateAdded > d.newestBookmark) d.newestBookmark = b.dateAdded;
      
      if (b.category) {
        d.categories[b.category] = (d.categories[b.category] || 0) + 1;
      }
    });
    
    // Calculate reliability scores
    const reliabilityScores = Object.values(domainData)
      .filter(d => d.checked >= 3) // Only domains with enough data
      .map(d => ({
        domain: d.domain,
        total: d.total,
        dead: d.dead,
        checked: d.checked,
        reliabilityScore: Math.round(((d.checked - d.dead) / d.checked) * 100),
        deadRate: Math.round((d.dead / d.checked) * 100)
      }))
      .sort((a, b) => a.reliabilityScore - b.reliabilityScore)
      .slice(0, 15);
    
    // Ephemeral Sources: High dead rate domains
    const ephemeralSources = reliabilityScores
      .filter(d => d.deadRate >= 30)
      .sort((a, b) => b.deadRate - a.deadRate);
    
    // Most valuable domains (high access + high count)
    const valuableDomains = Object.values(domainData)
      .map(d => ({
        domain: d.domain,
        total: d.total,
        accessed: d.accessed,
        totalAccess: d.totalAccess,
        engagementRate: d.total > 0 ? Math.round((d.accessed / d.total) * 100) : 0,
        avgAccess: d.accessed > 0 ? Math.round(d.totalAccess / d.accessed * 10) / 10 : 0
      }))
      .filter(d => d.totalAccess > 0)
      .sort((a, b) => b.totalAccess - a.totalAccess)
      .slice(0, 10);
    
    // Dependency Analysis: Domains with >10% of bookmarks
    const total = bookmarks.length;
    const dependencyWarnings = Object.values(domainData)
      .filter(d => (d.total / total) >= 0.10)
      .map(d => ({
        domain: d.domain,
        count: d.total,
        percentage: Math.round((d.total / total) * 100),
        topCategory: Object.entries(d.categories)
          .sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown'
      }))
      .sort((a, b) => b.percentage - a.percentage);
    
    // Domain diversity score
    const uniqueDomains = Object.keys(domainData).length;
    const diversityScore = total > 0 
      ? Math.min(100, Math.round((uniqueDomains / total) * 100 * 3))
      : 0;
    
    // Knowledge Map: Top domains with details
    const knowledgeMap = Object.values(domainData)
      .map(d => ({
        domain: d.domain,
        total: d.total,
        accessed: d.accessed,
        dead: d.dead,
        checked: d.checked,
        percentage: Math.round((d.total / total) * 1000) / 10,
        topCategory: Object.entries(d.categories)
          .sort(([, a], [, b]) => b - a)[0]?.[0] || null,
        categories: Object.entries(d.categories)
          .map(([cat, count]) => ({ category: cat, count }))
          .sort((a, b) => b.count - a.count)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 25);
    
    return {
      reliabilityScores,
      ephemeralSources,
      valuableDomains,
      dependencyWarnings,
      knowledgeMap,
      diversityScore,
      uniqueDomains,
      totalBookmarks: total
    };
  } catch (error) {
    console.error('Error getting domain intelligence:', error);
    return {
      reliabilityScores: [],
      ephemeralSources: [],
      valuableDomains: [],
      dependencyWarnings: [],
      knowledgeMap: [],
      diversityScore: 0,
      uniqueDomains: 0,
      totalBookmarks: 0
    };
  }
}

// ============================================================================
// TIME-BASED ANALYSIS
// ============================================================================

/**
 * Get time-based analysis
 * Bookmarking hours, weekday patterns, age distribution
 */
export async function getTimeBasedAnalysis() {
  try {
    const bookmarks = await db.bookmarks.toArray();
    const now = Date.now();
    
    // Bookmarking Hours (0-23)
    const hourCounts = Array(24).fill(0);
    bookmarks.forEach(b => {
      if (b.dateAdded) {
        const hour = new Date(b.dateAdded).getHours();
        hourCounts[hour]++;
      }
    });
    
    const bookmarkingHours = hourCounts.map((count, hour) => ({
      hour,
      hourLabel: `${hour.toString().padStart(2, '0')}:00`,
      count
    }));
    
    // Peak hours
    const maxHourCount = Math.max(...hourCounts);
    const peakHours = bookmarkingHours
      .filter(h => h.count === maxHourCount)
      .map(h => h.hourLabel);
    
    // Day of Week distribution
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayCounts = Array(7).fill(0);
    bookmarks.forEach(b => {
      if (b.dateAdded) {
        const day = new Date(b.dateAdded).getDay();
        dayCounts[day]++;
      }
    });
    
    const dayOfWeekDistribution = dayCounts.map((count, day) => ({
      day,
      dayName: dayNames[day],
      count
    }));
    
    // Weekend vs Weekday
    const weekendCount = dayCounts[0] + dayCounts[6];
    const weekdayCount = dayCounts.slice(1, 6).reduce((a, b) => a + b, 0);
    const weekdayVsWeekend = {
      weekday: { count: weekdayCount, percentage: Math.round((weekdayCount / bookmarks.length) * 100) },
      weekend: { count: weekendCount, percentage: Math.round((weekendCount / bookmarks.length) * 100) }
    };
    
    // Age Distribution (histogram)
    const ageGroups = {
      'Today': 0,
      '1-7 days': 0,
      '1-4 weeks': 0,
      '1-3 months': 0,
      '3-6 months': 0,
      '6-12 months': 0,
      '1-2 years': 0,
      '2+ years': 0
    };
    
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const fourWeeksAgo = now - (28 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = now - (90 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000);
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    const twoYearsAgo = now - (730 * 24 * 60 * 60 * 1000);
    
    bookmarks.forEach(b => {
      if (!b.dateAdded) return;
      
      if (b.dateAdded >= oneDayAgo) ageGroups['Today']++;
      else if (b.dateAdded >= oneWeekAgo) ageGroups['1-7 days']++;
      else if (b.dateAdded >= fourWeeksAgo) ageGroups['1-4 weeks']++;
      else if (b.dateAdded >= threeMonthsAgo) ageGroups['1-3 months']++;
      else if (b.dateAdded >= sixMonthsAgo) ageGroups['3-6 months']++;
      else if (b.dateAdded >= oneYearAgo) ageGroups['6-12 months']++;
      else if (b.dateAdded >= twoYearsAgo) ageGroups['1-2 years']++;
      else ageGroups['2+ years']++;
    });
    
    const ageDistribution = Object.entries(ageGroups).map(([period, count]) => ({
      period,
      count,
      percentage: Math.round((count / bookmarks.length) * 100)
    }));
    
    // Average age calculation
    const totalAge = bookmarks.reduce((sum, b) => sum + (now - (b.dateAdded || now)), 0);
    const avgAgeMs = bookmarks.length > 0 ? totalAge / bookmarks.length : 0;
    const avgAgeDays = Math.round(avgAgeMs / (24 * 60 * 60 * 1000));
    
    // Monthly creation trend (last 12 months)
    const monthlyTrend = {};
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyTrend[monthKey] = 0;
    }
    
    bookmarks.forEach(b => {
      if (b.dateAdded) {
        const date = new Date(b.dateAdded);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (monthKey in monthlyTrend) {
          monthlyTrend[monthKey]++;
        }
      }
    });
    
    const monthlyCreationTrend = Object.entries(monthlyTrend).map(([month, count]) => ({
      month,
      monthLabel: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      count
    }));
    
    return {
      bookmarkingHours,
      peakHours,
      dayOfWeekDistribution,
      weekdayVsWeekend,
      ageDistribution,
      avgAgeDays,
      monthlyCreationTrend,
      totalBookmarks: bookmarks.length
    };
  } catch (error) {
    console.error('Error getting time-based analysis:', error);
    return {
      bookmarkingHours: [],
      peakHours: [],
      dayOfWeekDistribution: [],
      weekdayVsWeekend: { weekday: { count: 0, percentage: 0 }, weekend: { count: 0, percentage: 0 } },
      ageDistribution: [],
      avgAgeDays: 0,
      monthlyCreationTrend: [],
      totalBookmarks: 0
    };
  }
}
