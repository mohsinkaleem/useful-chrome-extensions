// Main popup script
import { TabBalancer } from '../shared/tab-balancer.js';
import { TabEventManager, getAllTabs, getTabsByWindow } from '../shared/tab-utils.js';
import { findDuplicatesByUrl, getDuplicateGroups, normalizeUrl, isChromeInternalUrl } from '../shared/url-utils.js';
import { bulkBookmarkTabs } from '../shared/bookmark-utils.js';
import { mergeSelectedWindows } from '../shared/window-utils.js';
import { confirmDialog, promptDialog, showToast } from '../shared/dialogs.js';
import { TabList } from './components/TabList.js';
import { SearchBar, SearchFilters } from './components/SearchBar.js';
import { QuickActions } from './components/QuickActions.js';
import { MediaControls } from './components/MediaControls.js';
import { SessionManager } from './components/SessionManager.js';

class TabManagerApp {
  private tabEventManager: TabEventManager;
  private tabList: TabList;
  private searchBar: SearchBar;
  private quickActions: QuickActions;
  private mediaControls: MediaControls;
  private sessionManager: SessionManager;
  private selectedTabs: Set<number> = new Set();
  private currentView: 'list' | 'compact' | 'grid' = 'list';
  private highlightDuplicates: boolean = false;
  private duplicateUrls: Set<string> = new Set();
  private currentSearchQuery: string = '';
  private currentFilters: SearchFilters | null = null;
  private balancer: TabBalancer;
  private isRendering: boolean = false;
  private pendingRender: boolean = false;

  constructor() {
    this.tabEventManager = new TabEventManager();
    this.tabList = new TabList();
    this.searchBar = new SearchBar();
    this.quickActions = new QuickActions();
    this.mediaControls = new MediaControls();
    this.sessionManager = new SessionManager();
    this.balancer = new TabBalancer();
    
    this.init();
  }

  private async init() {
    // Load Theme from synced storage
    const { theme } = await chrome.storage.sync.get('theme');
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
      const icon = document.querySelector('#theme-toggle .icon');
      if (icon) {
        icon.className = 'icon icon-md icon-sun';
      }
    }

    // Setup event listeners
    this.setupEventListeners();
    
    // Initial load
    await this.loadAndRenderTabs();
    
    // Auto-focus search bar
    this.searchBar.focus();
    
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
    document.getElementById('open-sidepanel')?.addEventListener('click', async () => {
       const win = await chrome.windows.getCurrent();
       if (win.id) {
           await chrome.sidePanel.open({ windowId: win.id });
           window.close();
       }
    });

    document.getElementById('view-list')?.addEventListener('click', () => {
      this.setViewMode('list');
    });
    document.getElementById('view-compact')?.addEventListener('click', () => {
      this.setViewMode('compact');
    });
    document.getElementById('view-grid')?.addEventListener('click', () => {
      this.setViewMode('grid');
    });

    // Theme Toggle
    document.getElementById('theme-toggle')?.addEventListener('click', async () => {
      document.body.classList.toggle('dark-theme');
      const isDark = document.body.classList.contains('dark-theme');
      await chrome.storage.sync.set({ theme: isDark ? 'dark' : 'light' });
      
      // Update icon class instead of destroying the span
      const icon = document.querySelector('#theme-toggle .icon');
      if (icon) {
        icon.className = isDark ? 'icon icon-md icon-sun' : 'icon icon-md icon-moon';
      }
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

    // Window selection changes
    this.tabList.onWindowSelectionChange((selectedWindowIds) => {
      document
        .getElementById('merge-windows-btn')
        ?.classList.toggle('hidden', selectedWindowIds.length < 2);
    });

    // Merge windows button
    document.getElementById('merge-windows-btn')?.addEventListener('click', async () => {
      await this.mergeSelectedWindows();
    });

    // Tab click
    this.tabList.onTabClick(async (tabId) => {
      try {
        const tab = await chrome.tabs.get(tabId);
        
        if (!tab.windowId) return;
        
        // Get current window state
        const win = await chrome.windows.get(tab.windowId);
        const updateInfo: chrome.windows.UpdateInfo = { focused: true };
        
        // Handle different window states
        if (win.state === 'minimized') {
          // Restore minimized window
          updateInfo.state = 'normal';
        } else if (win.state === 'fullscreen') {
          // For fullscreen windows, we need to focus first, then activate tab
          await chrome.windows.update(tab.windowId, { focused: true });
          await chrome.tabs.update(tabId, { active: true });
          return;
        } else if (win.state === 'maximized') {
          // Keep maximized state when focusing
          updateInfo.state = 'maximized';
        }
        
        // Focus the window first for better cross-display/cross-desktop support
        await chrome.windows.update(tab.windowId, updateInfo);
        
        // Then activate the tab
        await chrome.tabs.update(tabId, { active: true });
      } catch (e) {
        console.error('Failed to switch tab:', e);
        showToast('Could not switch to that tab — the window may have been closed', 'error');
      }
    });

    // Balance Windows
    document.getElementById('action-balance-windows')?.addEventListener('click', async () => {
      const { minTabs, maxTabs } = this.balancer.getConfig();
      const ok = await confirmDialog({
        title: 'Balance windows?',
        message: `Tabs will be rearranged so each window holds between ${minTabs} and ${maxTabs} tabs. Small windows are consolidated and tab groups are preserved.`,
        confirmLabel: 'Balance'
      });
      if (!ok) return;
       
      const btn = document.getElementById('action-balance-windows') as HTMLButtonElement | null;
      if (btn) btn.disabled = true;

      try {
        const moved = await this.balancer.balanceWindows();
        showToast(moved > 0 ? `Rebalanced ${moved} tabs` : 'Windows are already balanced', 'success');
      } catch (e) {
        console.error('Balance error:', e);
        showToast('Failed to balance windows', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    // Group All
    document.getElementById('action-group-all')?.addEventListener('click', async () => {
      const btn = document.getElementById('action-group-all') as HTMLButtonElement | null;
      if (btn) btn.disabled = true;
      try {
        await this.balancer.groupAll();
        showToast('Grouped ungrouped tabs by domain', 'success');
      } catch (e) {
        console.error('Grouping error:', e);
        showToast('Failed to group tabs', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    // Ungroup All
    document.getElementById('action-ungroup-all')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Ungroup all tabs?',
        message: 'Every tab group in every window will be dissolved.',
        confirmLabel: 'Ungroup all',
        danger: true
      });
      if (!ok) return;
      
      const btn = document.getElementById('action-ungroup-all') as HTMLButtonElement | null;
      if (btn) btn.disabled = true;
      try {
        await this.balancer.ungroupAll();
        showToast('All tab groups removed', 'success');
      } catch (e) {
        console.error('Ungrouping error:', e);
        showToast('Failed to ungroup tabs', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    // Session manager
    document.getElementById('action-save-session')?.addEventListener('click', () => {
      this.sessionManager.showModal();
    });

    // Bookmark all tabs
    document.getElementById('action-bookmark-all')?.addEventListener('click', async () => {
      try {
        const allTabs = await getAllTabs();
        const bookmarkableTabs = allTabs.filter(t => t.url && !isChromeInternalUrl(t.url));
        
        if (bookmarkableTabs.length === 0) {
          showToast('No tabs available to bookmark', 'error');
          return;
        }
        
        const tabsByWindow = await getTabsByWindow();
        const windowCount = tabsByWindow.size;
        
        const name = await promptDialog({
          title: 'Bookmark all tabs',
          message: `Save ${bookmarkableTabs.length} tabs from ${windowCount} window(s) into a new folder.`,
          defaultValue: `All Tabs (${windowCount} windows) - ${new Date().toLocaleDateString()}`,
          confirmLabel: 'Bookmark'
        });
        
        if (!name) return;
        const bookmarks = await bulkBookmarkTabs(bookmarkableTabs, name);
        showToast(`Bookmarked ${bookmarks.length} tabs to "${name}"`, 'success');
      } catch (e) {
        console.error('Failed to bookmark all tabs:', e);
        showToast('Failed to bookmark tabs', 'error');
      }
    });

    // Close all duplicates button
    document.getElementById('action-close-duplicates')?.addEventListener('click', async () => {
      await this.closeAllDuplicates();
    });
  }

  private async loadAndRenderTabs(searchQuery?: string, filters?: SearchFilters | null) {
    // Coalesce concurrent renders so no update is silently dropped
    if (this.isRendering) {
      this.pendingRender = true;
      return;
    }
    this.isRendering = true;
    
    try {
    // Optimization: Get tabs by window only, then flatten to get all tabs
    // This saves one expensive chrome.tabs.query({}) call
    const tabsByWindow = await getTabsByWindow();
    const tabs: chrome.tabs.Tab[] = [];
    for (const windowTabs of tabsByWindow.values()) {
      tabs.push(...windowTabs);
    }
    
    // Calculate duplicate URLs for highlighting
    const duplicates = findDuplicatesByUrl(tabs);
    this.duplicateUrls = new Set(duplicates.keys());
    
    // Update duplicate count badge
    const dupCountEl = document.getElementById('duplicate-count');
    if (dupCountEl) {
      const dupTabCount = tabs.filter(t => t.url && this.duplicateUrls.has(normalizeUrl(t.url))).length;
      dupCountEl.textContent = String(dupTabCount);
    }
    
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
    this.tabList.setTabGroups(await chrome.tabGroups.query({}));
    this.tabList.render(filteredByWindow, this.currentView);
    
    // Update media controls
    this.mediaControls.update(tabs);
    } finally {
      this.isRendering = false;
      if (this.pendingRender) {
        this.pendingRender = false;
        await this.loadAndRenderTabs(this.currentSearchQuery, this.currentFilters);
      }
    }
  }

  private updateStats(tabs: chrome.tabs.Tab[], windowCount: number) {
    const tabCountEl = document.getElementById('tab-count');
    const windowCountEl = document.getElementById('window-count');
    
    if (tabCountEl) {
      tabCountEl.textContent = `${tabs.length} tabs`;
    }
    if (windowCountEl) {
      windowCountEl.textContent = `${windowCount} windows`;
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
    this.loadAndRenderTabs(this.currentSearchQuery, this.currentFilters);
  }

  private async handleQuickAction(action: string, tabs: number[]) {
    switch (action) {
      case 'close':
        await chrome.tabs.remove(tabs);
        this.selectedTabs.clear();
        this.tabList.clearSelection();
        showToast(`Closed ${tabs.length} tab(s)`, 'success');
        break;
      case 'bookmark':
        try {
          const allTabs = await getAllTabs();
          const selectedTabObjs = allTabs.filter(t => t.id && tabs.includes(t.id));
          
          if (selectedTabObjs.length === 0) {
            showToast('No tabs selected to bookmark', 'error');
            return;
          }
          
          // Count unique windows
          const windowIds = new Set(selectedTabObjs.map(t => t.windowId).filter(Boolean));
          const windowCount = windowIds.size;
          
          const name = await promptDialog({
            title: 'Bookmark selected tabs',
            message: `Save ${selectedTabObjs.length} tab(s) from ${windowCount} window(s) into a new folder.`,
            defaultValue: `Selected Tabs (${selectedTabObjs.length}) - ${new Date().toLocaleDateString()}`,
            confirmLabel: 'Bookmark'
          });
          
          if (!name) return;
          const bookmarks = await bulkBookmarkTabs(selectedTabObjs, name);
          showToast(`Bookmarked ${bookmarks.length} tabs to "${name}"`, 'success');
        } catch (e) {
          console.error('Failed to bookmark selected tabs:', e);
          showToast('Failed to bookmark tabs', 'error');
        }
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
      const sorted = [...group.tabs].sort((a, b) => 
        (b.lastAccessed || 0) - (a.lastAccessed || 0)
      );
      const duplicateIds = sorted
        .slice(1)
        .map(t => t.id)
        .filter((id): id is number => id !== undefined);
      toClose.push(...duplicateIds);
    }

    if (toClose.length === 0) {
      showToast('No duplicate tabs found', 'info');
      return;
    }

    const ok = await confirmDialog({
      title: `Close ${toClose.length} duplicate tab(s)?`,
      message: 'The most recently used copy of each URL is kept.',
      confirmLabel: 'Close duplicates',
      danger: true
    });
    if (!ok) return;

    await chrome.tabs.remove(toClose);
    showToast(`Closed ${toClose.length} duplicate tab(s)`, 'success');
  }

  private async mergeSelectedWindows() {
    await mergeSelectedWindows(this.tabList, () => 
      this.loadAndRenderTabs(this.currentSearchQuery, this.currentFilters)
    );
  }
}

// Initialize app
new TabManagerApp();
