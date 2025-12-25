// Main popup script
import { TabEventManager, getAllTabs, getTabsByWindow } from '../shared/tab-utils.js';
import { findDuplicatesByUrl, getDuplicateGroups, normalizeUrl } from '../shared/url-utils.js';
import { TabList } from './components/TabList.js';
import { SearchBar } from './components/SearchBar.js';
import { QuickActions } from './components/QuickActions.js';
import { ResourcePanel } from './components/ResourcePanel.js';
import { ResourceOverview } from './components/ResourceOverview.js';
import { MediaControls } from './components/MediaControls.js';
import { SessionManager } from './components/SessionManager.js';

class TabManagerApp {
  private tabEventManager: TabEventManager;
  private tabList: TabList;
  private searchBar: SearchBar;
  private quickActions: QuickActions;
  private resourcePanel: ResourcePanel;
  private resourceOverview: ResourceOverview;
  private mediaControls: MediaControls;
  private sessionManager: SessionManager;
  private selectedTabs: Set<number> = new Set();
  private currentView: 'list' | 'compact' | 'grid' = 'list';
  private highlightDuplicates: boolean = false;
  private duplicateUrls: Set<string> = new Set();
  private currentSearchQuery: string = '';
  private currentFilters: any = null;

  constructor() {
    this.tabEventManager = new TabEventManager();
    this.tabList = new TabList();
    this.searchBar = new SearchBar();
    this.quickActions = new QuickActions();
    this.resourcePanel = new ResourcePanel();
    this.resourceOverview = new ResourceOverview();
    this.mediaControls = new MediaControls();
    this.sessionManager = new SessionManager();
    
    this.init();
  }

  private async init() {
    // Setup event listeners
    this.setupEventListeners();
    
    // Initial load
    await this.loadAndRenderTabs();
    
    // Listen for tab changes
    this.tabEventManager.onChange(() => {
      this.loadAndRenderTabs(this.currentSearchQuery, this.currentFilters);
    });
  }

  private setupEventListeners() {
    // Search with duplicate highlight support
    this.searchBar.onSearch((query, filters) => {
      this.highlightDuplicates = filters.duplicates;
      this.currentSearchQuery = query;
      this.currentFilters = filters;
      this.loadAndRenderTabs(query, filters);
    });

    // View mode buttons
    document.getElementById('view-list')?.addEventListener('click', () => {
      this.setViewMode('list');
    });
    document.getElementById('view-compact')?.addEventListener('click', () => {
      this.setViewMode('compact');
    });
    document.getElementById('view-grid')?.addEventListener('click', () => {
      this.setViewMode('grid');
    });

    // Quick actions
    this.quickActions.onAction((action, tabs) => {
      this.handleQuickAction(action, tabs);
    });

    // Tab selection
    this.tabList.onSelectionChange((selectedIds) => {
      this.selectedTabs = new Set(selectedIds);
      this.quickActions.updateSelectedTabs(Array.from(this.selectedTabs));
    });

    // Tab click
    this.tabList.onTabClick((tabId) => {
      chrome.tabs.update(tabId, { active: true });
    });

    // Session manager
    document.getElementById('action-save-session')?.addEventListener('click', () => {
      this.sessionManager.showModal();
    });

    // Close all duplicates button
    document.getElementById('action-close-duplicates')?.addEventListener('click', async () => {
      await this.closeAllDuplicates();
    });
  }

  private async loadAndRenderTabs(searchQuery?: string, filters?: any) {
    const tabs = await getAllTabs();
    const tabsByWindow = await getTabsByWindow();
    
    // Calculate duplicate URLs for highlighting
    const duplicates = findDuplicatesByUrl(tabs);
    this.duplicateUrls = new Set(duplicates.keys());
    
    // Update stats
    this.updateStats(tabs, tabsByWindow.size);
    
    // Filter tabs if search query
    let filteredTabs = tabs;
    if (searchQuery) {
      filteredTabs = tabs.filter(tab => 
        tab.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tab.url?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply filters
    if (filters) {
      if (filters.audible) {
        filteredTabs = filteredTabs.filter(tab => tab.audible);
      }
      if (filters.pinned) {
        filteredTabs = filteredTabs.filter(tab => tab.pinned);
      }
      if (filters.duplicates) {
        // Only show tabs that are duplicates
        filteredTabs = filteredTabs.filter(tab => {
          if (!tab.url) return false;
          const normalizedUrl = normalizeUrl(tab.url);
          return this.duplicateUrls.has(normalizedUrl);
        });
      }
    }
    
    // Render tabs by window
    const filteredByWindow = new Map<number, chrome.tabs.Tab[]>();
    for (const tab of filteredTabs) {
      if (tab.windowId) {
        if (!filteredByWindow.has(tab.windowId)) {
          filteredByWindow.set(tab.windowId, []);
        }
        filteredByWindow.get(tab.windowId)!.push(tab);
      }
    }
    
    // Pass highlight info to TabList
    this.tabList.setDuplicateHighlight(this.highlightDuplicates, this.duplicateUrls);
    this.tabList.render(filteredByWindow, this.currentView);
    
    // Update resource panel with more stats
    this.resourcePanel.update(tabs, this.duplicateUrls.size);
    
    // Update resource overview
    this.resourceOverview.update(tabs);
    
    // Update media controls
    this.mediaControls.update(tabs);
  }

  private updateStats(tabs: chrome.tabs.Tab[], windowCount: number) {
    const tabCountEl = document.getElementById('tab-count');
    const windowCountEl = document.getElementById('window-count');
    const memoryEl = document.getElementById('memory-usage');
    const heavyTabsEl = document.getElementById('header-heavy-tabs');
    
    if (tabCountEl) {
      tabCountEl.textContent = `${tabs.length} tabs`;
    }
    if (windowCountEl) {
      windowCountEl.textContent = `${windowCount} windows`;
    }
    
    // Calculate memory and heavy tabs
    let totalMemory = 0;
    let heavyTabsCount = 0;
    
    for (const tab of tabs) {
      const estimate = this.estimateTabMemory(tab);
      totalMemory += estimate;
      
      // Consider a tab "heavy" if it uses more than 200MB
      if (estimate > 200 * 1024 * 1024) {
        heavyTabsCount++;
      }
    }
    
    if (memoryEl) {
      // Use same estimation logic as ResourceOverview
      const estimatedGB = totalMemory / (1024 * 1024 * 1024);
      if (estimatedGB >= 1) {
        memoryEl.textContent = `~${estimatedGB.toFixed(1)} GB`;
      } else {
        memoryEl.textContent = `~${(totalMemory / (1024 * 1024)).toFixed(0)} MB`;
      }
    }
    
    if (heavyTabsEl) {
      heavyTabsEl.textContent = heavyTabsCount.toString();
    }
  }

  private estimateTabMemory(tab: chrome.tabs.Tab): number {
    let memoryBytes = 30 * 1024 * 1024; // 30MB base
    if (tab.discarded) return 5 * 1024 * 1024; // 5MB

    const url = tab.url || '';
    const domain = this.getDomain(url);

    if (domain.includes('youtube.com') || domain.includes('twitch.tv')) {
      memoryBytes += 150 * 1024 * 1024;
    } else if (domain.includes('meet.google.com') || domain.includes('zoom.us')) {
      memoryBytes += 200 * 1024 * 1024;
    } else if (domain.includes('gmail.com') || domain.includes('outlook.com')) {
      memoryBytes += 80 * 1024 * 1024;
    } else if (domain.includes('docs.google.com') || domain.includes('sheets.google.com')) {
      memoryBytes += 60 * 1024 * 1024;
    } else if (domain.includes('figma.com') || domain.includes('miro.com')) {
      memoryBytes += 120 * 1024 * 1024;
    }

    if (tab.active) memoryBytes += 20 * 1024 * 1024;
    if (tab.audible) memoryBytes += 50 * 1024 * 1024;

    if (tab.lastAccessed) {
      const ageHours = (Date.now() - tab.lastAccessed) / (1000 * 60 * 60);
      if (ageHours > 24) memoryBytes += 30 * 1024 * 1024;
    }

    return memoryBytes;
  }

  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  private setViewMode(mode: 'list' | 'compact' | 'grid') {
    this.currentView = mode;
    
    // Update button states
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.getElementById(`view-${mode}`)?.classList.add('active');
    
    // Re-render
    this.loadAndRenderTabs();
  }

  private async handleQuickAction(action: string, tabs: number[]) {
    switch (action) {
      case 'close':
        await chrome.tabs.remove(tabs);
        this.selectedTabs.clear();
        break;
      case 'bookmark':
        const tabsToBookmark = await chrome.tabs.query({ 
          windowId: chrome.windows.WINDOW_ID_CURRENT 
        });
        const selectedTabObjs = tabsToBookmark.filter(t => t.id && tabs.includes(t.id));
        // Import and use bookmark utility
        const { bulkBookmarkTabs } = await import('../shared/bookmark-utils.js');
        await bulkBookmarkTabs(selectedTabObjs, `Bookmarks ${new Date().toLocaleDateString()}`);
        break;
      case 'group':
        if (tabs.length > 0) {
          const groupId = await chrome.tabs.group({ tabIds: tabs });
          await chrome.tabGroups.update(groupId, { 
            title: `Group ${new Date().toLocaleTimeString()}`,
            collapsed: false
          });
        }
        break;
    }
  }

  private async closeAllDuplicates() {
    const tabs = await getAllTabs();
    const duplicateGroups = getDuplicateGroups(tabs);
    const toClose: number[] = [];

    for (const group of duplicateGroups) {
      // Keep the most recently accessed, close the rest
      const sorted = group.tabs.sort((a, b) => 
        (b.lastAccessed || 0) - (a.lastAccessed || 0)
      );
      const duplicateIds = sorted.slice(1).map(t => t.id).filter(Boolean) as number[];
      toClose.push(...duplicateIds);
    }

    if (toClose.length > 0) {
      await chrome.tabs.remove(toClose);
    }
  }
}

// Initialize app
new TabManagerApp();
