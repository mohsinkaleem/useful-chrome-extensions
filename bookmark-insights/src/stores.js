// Svelte stores for reactive state management
// This centralizes the stats and enables real-time updates

import { writable, derived } from 'svelte/store';
import { 
  getAllBookmarks, 
  getCachedMetric, 
  CACHE_DURATIONS,
  getStoredSimilarities 
} from './db.js';

// =============================================
// Stats Store - Reactive bookmark statistics
// =============================================

const createStatsStore = () => {
  const { subscribe, set, update } = writable({
    total: 0,
    enriched: 0,
    pending: 0,
    deadLinks: 0,
    duplicates: 0,
    uniqueDomains: 0,
    addedThisWeek: 0,
    addedThisMonth: 0,
    lastUpdated: null,
    loading: true
  });

  let refreshInterval = null;

  return {
    subscribe,
    
    /**
     * Refresh all statistics
     */
    async refresh() {
      try {
        const bookmarks = await getAllBookmarks();
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        const oneMonth = 30 * 24 * 60 * 60 * 1000;
        
        const total = bookmarks.length;
        const enriched = bookmarks.filter(b => b.lastChecked).length;
        const deadLinks = bookmarks.filter(b => b.isAlive === false).length;
        const uniqueDomains = new Set(bookmarks.map(b => b.domain).filter(d => d)).size;
        const addedThisWeek = bookmarks.filter(b => now - b.dateAdded < oneWeek).length;
        const addedThisMonth = bookmarks.filter(b => now - b.dateAdded < oneMonth).length;
        
        // Get duplicates count from cached computation
        const duplicates = await getCachedMetric(
          'quickDuplicateCount',
          async () => {
            const urlMap = new Map();
            bookmarks.forEach(b => {
              const normalized = b.url.toLowerCase().replace(/\/$/, '');
              if (!urlMap.has(normalized)) urlMap.set(normalized, 0);
              urlMap.set(normalized, urlMap.get(normalized) + 1);
            });
            return Array.from(urlMap.values()).filter(count => count > 1).length;
          },
          CACHE_DURATIONS.quickStats
        );
        
        set({
          total,
          enriched,
          pending: total - enriched,
          deadLinks,
          duplicates,
          uniqueDomains,
          addedThisWeek,
          addedThisMonth,
          lastUpdated: Date.now(),
          loading: false
        });
      } catch (error) {
        console.error('Error refreshing stats:', error);
        update(s => ({ ...s, loading: false }));
      }
    },
    
    /**
     * Start auto-refresh (call when dashboard opens)
     * @param {number} intervalMs - Refresh interval in milliseconds
     */
    startAutoRefresh(intervalMs = 30000) {
      this.refresh(); // Initial refresh
      if (!refreshInterval) {
        refreshInterval = setInterval(() => this.refresh(), intervalMs);
        console.log('Stats auto-refresh started');
      }
    },
    
    /**
     * Stop auto-refresh (call when dashboard closes)
     */
    stopAutoRefresh() {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        console.log('Stats auto-refresh stopped');
      }
    }
  };
};

export const stats = createStatsStore();

// =============================================
// Enrichment Progress Store
// =============================================

export const enrichmentProgress = writable({
  isRunning: false,
  current: 0,
  total: 0,
  currentBookmark: null,
  logs: [],
  lastCompleted: null
});

/**
 * Update enrichment progress
 * @param {Object} progress - Progress update from background script
 */
export function updateEnrichmentProgress(progress) {
  enrichmentProgress.update(state => ({
    ...state,
    ...progress,
    lastCompleted: progress.isRunning === false ? Date.now() : state.lastCompleted
  }));
  
  // Refresh stats when enrichment completes
  if (progress.isRunning === false) {
    stats.refresh();
  }
}

// =============================================
// Domain Hierarchy Store - For interactive drill-down
// =============================================

export const domainExplorer = writable({
  currentLevel: 'root', // 'root' | 'domain' | 'path1'
  selectedDomain: null,
  selectedPath1: null,
  hierarchyData: {},
  loading: true
});

/**
 * Navigate in domain hierarchy
 */
export const domainExplorerActions = {
  async loadHierarchy() {
    domainExplorer.update(s => ({ ...s, loading: true }));
    
    try {
      const bookmarks = await getAllBookmarks();
      const hierarchy = {};
      
      for (const bookmark of bookmarks) {
        try {
          if (!bookmark.url.startsWith('http')) continue;
          
          const url = new URL(bookmark.url);
          const domain = url.hostname;
          const pathParts = url.pathname.split('/').filter(p => p && p.length < 50);
          
          // Level 1: Domain
          if (!hierarchy[domain]) {
            hierarchy[domain] = { 
              count: 0, 
              bookmarks: [],
              subpaths: {} 
            };
          }
          hierarchy[domain].count++;
          hierarchy[domain].bookmarks.push(bookmark.id);
          
          // Level 2: First path segment
          if (pathParts.length > 0) {
            const level1 = pathParts[0];
            if (!hierarchy[domain].subpaths[level1]) {
              hierarchy[domain].subpaths[level1] = { 
                count: 0, 
                bookmarks: [],
                subpaths: {} 
              };
            }
            hierarchy[domain].subpaths[level1].count++;
            hierarchy[domain].subpaths[level1].bookmarks.push(bookmark.id);
            
            // Level 3: Second path segment
            if (pathParts.length > 1) {
              const level2 = pathParts[1];
              if (!hierarchy[domain].subpaths[level1].subpaths[level2]) {
                hierarchy[domain].subpaths[level1].subpaths[level2] = { 
                  count: 0, 
                  bookmarks: [] 
                };
              }
              hierarchy[domain].subpaths[level1].subpaths[level2].count++;
              hierarchy[domain].subpaths[level1].subpaths[level2].bookmarks.push(bookmark.id);
            }
          }
        } catch (e) {
          // Skip invalid URLs
        }
      }
      
      domainExplorer.update(s => ({ 
        ...s, 
        hierarchyData: hierarchy,
        loading: false 
      }));
    } catch (error) {
      console.error('Error loading domain hierarchy:', error);
      domainExplorer.update(s => ({ ...s, loading: false }));
    }
  },
  
  drillDown(domain, path1 = null) {
    domainExplorer.update(s => {
      if (path1) {
        return { ...s, selectedPath1: path1, currentLevel: 'path1' };
      } else {
        return { ...s, selectedDomain: domain, currentLevel: 'domain' };
      }
    });
  },
  
  goBack() {
    domainExplorer.update(s => {
      if (s.currentLevel === 'path1') {
        return { ...s, selectedPath1: null, currentLevel: 'domain' };
      } else {
        return { ...s, selectedDomain: null, currentLevel: 'root' };
      }
    });
  },
  
  reset() {
    domainExplorer.update(s => ({
      ...s,
      currentLevel: 'root',
      selectedDomain: null,
      selectedPath1: null
    }));
  }
};

// =============================================
// Derived Stores
// =============================================

/**
 * Enrichment coverage percentage
 */
export const enrichmentCoverage = derived(stats, $stats => {
  if ($stats.total === 0) return 0;
  return Math.round(($stats.enriched / $stats.total) * 100);
});

/**
 * Pending enrichment count
 */
export const pendingEnrichment = derived(stats, $stats => $stats.pending);

// =============================================
// Settings Store
// =============================================

export const settingsStore = writable({
  enrichmentEnabled: true,
  enrichmentBatchSize: 20,
  enrichmentConcurrency: 3,
  enrichmentFreshnessDays: 30,
  trackBrowsingBehavior: false,
  loaded: false
});

/**
 * Load settings from database
 */
export async function loadSettings() {
  try {
    const { getSettings } = await import('./db.js');
    const settings = await getSettings();
    settingsStore.set({ ...settings, loaded: true });
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Update a setting
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 */
export async function updateSetting(key, value) {
  try {
    const { updateSettings } = await import('./db.js');
    await updateSettings({ [key]: value });
    settingsStore.update(s => ({ ...s, [key]: value }));
  } catch (error) {
    console.error('Error updating setting:', error);
  }
}
