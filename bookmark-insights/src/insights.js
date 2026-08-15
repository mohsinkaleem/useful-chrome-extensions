// Advanced insights and analytics module for bookmark data
// Provides domain hierarchy visualization, behavioral analytics, and data insights

import { getAllBookmarks } from './db.js';
// import { allBookmarks } from './stores.js';

// Use cached bookmarks to avoid redundant DB calls across insight functions
async function getBookmarksCached() {
  // return await allBookmarks.getCached();
  return await getAllBookmarks();
}

/**
 * Get dead link insights and categorization
 * Provides analytics on dead/broken bookmarks by domain, age, and other factors
 */
export async function getDeadLinkInsights() {
  try {
    const bookmarks = await getBookmarksCached();
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

// ============================================================================
// CONTENT ANALYSIS
// ============================================================================

/**
 * Get comprehensive content analysis
 * Category breakdown, topic clusters, content types
 */
export async function getContentAnalysis() {
  try {
    const bookmarks = await getBookmarksCached();
    const pct = (count) => bookmarks.length > 0 ? Math.round((count / bookmarks.length) * 1000) / 10 : 0;
    
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
        percentage: pct(count)
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
        percentage: pct(count)
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
        percentage: pct(count)
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
        percentage: pct(count)
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
    const bookmarks = await getBookmarksCached();
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
    const rediscoveryFeed = shuffled.slice(0, 10).map(b => ({
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
    const bookmarks = await getBookmarksCached();
    
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
    const bookmarks = await getBookmarksCached();
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
    const peakHours = maxHourCount === 0 ? [] : bookmarkingHours
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
    const percentOfTotal = (count) => bookmarks.length > 0 ? Math.round((count / bookmarks.length) * 100) : 0;
    const weekdayVsWeekend = {
      weekday: { count: weekdayCount, percentage: percentOfTotal(weekdayCount) },
      weekend: { count: weekendCount, percentage: percentOfTotal(weekendCount) }
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
      percentage: percentOfTotal(count)
    }));
    
    // Average age calculation
    const totalAge = bookmarks.reduce((sum, b) => sum + (now - (b.dateAdded || now)), 0);
    const avgAgeMs = bookmarks.length > 0 ? totalAge / bookmarks.length : 0;
    const avgAgeDays = Math.round(avgAgeMs / (24 * 60 * 60 * 1000));
    
    // Monthly creation trend (last 12 months)
    // Anchor to day 1 before stepping months back, otherwise e.g. Mar 31 -> "Feb 31"
    // overflows into March and drops February from the series.
    const monthlyTrend = {};
    const trendAnchor = new Date(now);
    trendAnchor.setDate(1);
    for (let i = 11; i >= 0; i--) {
      const date = new Date(trendAnchor);
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
    
    const monthlyCreationTrend = Object.entries(monthlyTrend).map(([month, count]) => {
      const [year, monthNum] = month.split('-').map(Number);
      return {
        month,
        // Construct in local time; `new Date('YYYY-MM-01')` parses as UTC and renders
        // as the previous month for any timezone west of UTC.
        monthLabel: new Date(year, monthNum - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        count
      };
    });
    
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

// ============================================================================
// PLATFORM & CREATOR ANALYTICS
// ============================================================================

/**
 * Get platform distribution - breakdown of bookmarks by platform
 * @returns {Object} Platform stats with counts and percentages
 */
export async function getPlatformDistribution() {
  try {
    const bookmarks = await getBookmarksCached();
    const total = bookmarks.length;
    
    if (total === 0) {
      return { platforms: [], total: 0 };
    }
    
    // Count by platform
    const platformCounts = {};
    bookmarks.forEach(b => {
      const platform = b.platform || 'other';
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
    });
    
    // Calculate percentages and sort
    const platforms = Object.entries(platformCounts)
      .map(([platform, count]) => ({
        platform,
        count,
        percentage: Math.round((count / total) * 100)
      }))
      .sort((a, b) => b.count - a.count);
    
    return { platforms, total };
  } catch (error) {
    console.error('Error getting platform distribution:', error);
    return { platforms: [], total: 0 };
  }
}

/**
 * Get top creators leaderboard with velocity metrics
 * @param {number} limit - Number of top creators to return
 * @returns {Array} Leaderboard with bookmark counts and velocity
 */
export async function getCreatorLeaderboard(limit = 10) {
  try {
    const bookmarks = await getBookmarksCached();
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    const creatorMap = {};
    
    bookmarks.forEach(b => {
      if (!b.creator) return;
      
      const key = `${b.platform}:${b.creator}`;
      
      if (!creatorMap[key]) {
        creatorMap[key] = {
          creator: b.creator,
          platform: b.platform || 'other',
          totalCount: 0,
          recentCount: 0,
          contentTypes: new Set(),
          thumbnail: null,
          firstSaved: Infinity,
          lastSaved: 0
        };
      }
      
      creatorMap[key].totalCount++;
      
      if (b.dateAdded > thirtyDaysAgo) {
        creatorMap[key].recentCount++;
      }
      
      if (b.contentType) {
        creatorMap[key].contentTypes.add(b.contentType);
      }
      
      if (b.dateAdded < creatorMap[key].firstSaved) {
        creatorMap[key].firstSaved = b.dateAdded;
      }
      
      if (b.dateAdded > creatorMap[key].lastSaved) {
        creatorMap[key].lastSaved = b.dateAdded;
      }
      
      if (!creatorMap[key].thumbnail && b.platformData?.extra?.thumbnail) {
        creatorMap[key].thumbnail = b.platformData.extra.thumbnail;
      }
    });
    
    const leaderboard = Object.values(creatorMap)
      .map(c => ({
        ...c,
        contentTypes: Array.from(c.contentTypes),
        // Velocity: bookmarks per month based on time span
        velocity: c.firstSaved !== Infinity 
          ? (c.totalCount / Math.max(1, (now - c.firstSaved) / (30 * 24 * 60 * 60 * 1000))).toFixed(1)
          : 0
      }))
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, limit);
    
    return leaderboard;
  } catch (error) {
    console.error('Error getting creator leaderboard:', error);
    return [];
  }
}

