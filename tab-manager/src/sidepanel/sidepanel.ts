// Sidepanel script
import { TabEventManager, getAllTabs, getTabsByWindow } from '../shared/tab-utils.js';
import { findDuplicatesByUrl, normalizeUrl } from '../shared/url-utils.js';
import { mergeSelectedWindows } from '../shared/window-utils.js';
import { TabList } from '../popup/components/TabList.js';
import { SearchBar, SearchFilters } from '../popup/components/SearchBar.js';
import { AutoGrouper } from '../background/auto-grouper.js';

class SidepanelApp {
  private tabEventManager: TabEventManager;
  private tabList: TabList;
  private searchBar: SearchBar;
  private currentSearchQuery: string = '';
  private currentFilters: SearchFilters | null = null;
  private groupView: 'window' | 'domain' = 'window';
  private isRendering: boolean = false;

  constructor() {
    this.tabEventManager = new TabEventManager();
    this.tabList = new TabList();
    this.tabList.setShowCheckboxes(false);
    this.searchBar = new SearchBar();
    
    this.init();
  }

  private async init() {
    // Load Theme from synced storage
    const { theme } = await chrome.storage.sync.get('theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        const icon = document.querySelector('#theme-toggle .icon');
        if (icon) {
          icon.className = 'icon icon-sun';
        }
    }

    this.setupEventListeners();
    await this.loadAndRenderTabs();
    
    // Auto-focus search bar
    this.searchBar.focus();
    
    this.tabEventManager.onChange(() => {
      this.loadAndRenderTabs(this.currentSearchQuery, this.currentFilters);
    });

    // Auto Group Button
    document.getElementById('auto-group-btn')?.addEventListener('click', async () => {
       await this.performSmartGrouping();
    });
  }

  private setupEventListeners() {
    this.searchBar.onSearch((query, filters) => {
      this.currentSearchQuery = query;
      this.currentFilters = filters;
      this.loadAndRenderTabs(query, filters);
    });

    this.tabList.onTabClick(async (tabId) => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId !== undefined && tab.id) {
           await chrome.windows.update(tab.windowId, { focused: true });
           await chrome.tabs.update(tab.id, { active: true });
        }
      } catch (e) {
        console.error('Failed to switch tab:', e);
      }
    });

    // Window selection changes
    this.tabList.onWindowSelectionChange((selectedWindowIds) => {
      const mergeBtn = document.getElementById('merge-windows-btn');
      if (mergeBtn) {
        if (selectedWindowIds.length >= 2) {
          mergeBtn.style.display = 'block';
        } else {
          mergeBtn.style.display = 'none';
        }
      }
    });

    // Merge windows button
    document.getElementById('merge-windows-btn')?.addEventListener('click', async () => {
      await this.mergeSelectedWindows();
    });

    // Theme Toggle
    document.getElementById('theme-toggle')?.addEventListener('click', async () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        await chrome.storage.sync.set({ theme: isDark ? 'dark' : 'light' });
        const icon = document.querySelector('#theme-toggle .icon');
        if (icon) {
          icon.className = isDark ? 'icon icon-sun' : 'icon icon-moon';
        }
    });

    // View Grouping
    const groupSelect = document.getElementById('group-view-select') as HTMLSelectElement;
    if (groupSelect) {
        groupSelect.addEventListener('change', () => {
            this.groupView = groupSelect.value as 'window' | 'domain';
            this.loadAndRenderTabs(this.currentSearchQuery, this.currentFilters);
        });
    }
  }

  private async loadAndRenderTabs(query: string = '', filters: SearchFilters | null = null) {
    // Prevent concurrent renders
    if (this.isRendering) return;
    this.isRendering = true;
    
    try {
    let tabs = await getAllTabs();
    
    // Calculate duplicates for all tabs (before filtering)
    const duplicates = findDuplicatesByUrl(tabs);
    const dupUrls = new Set<string>();
    for (const [url] of duplicates) {
        dupUrls.add(normalizeUrl(url));
    }

    // Configure duplicate highlighting
    const showDuplicates = filters?.duplicates || false;
    this.tabList.setDuplicateHighlight(showDuplicates, dupUrls);

    // Apply duplicate filter if enabled
    if (showDuplicates) {
        tabs = tabs.filter(t => t.url && dupUrls.has(normalizeUrl(t.url)));
    }

    // Process other filters
    if (query) {
      const q = query.toLowerCase();
      tabs = tabs.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) || 
        (t.url && t.url.toLowerCase().includes(q))
      );
    }

    if (filters?.audible) {
      tabs = tabs.filter(t => t.audible);
    }

    if (filters?.pinned) {
      tabs = tabs.filter(t => t.pinned);
    }
    
    // Grouping Logic
    const groups = new Map<string | number, chrome.tabs.Tab[]>();
    
    if (this.groupView === 'domain') {
        for (const tab of tabs) {
             let domain = 'Other';
             try {
                 if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
                    domain = new URL(tab.url).hostname.replace(/^www\./, '');
                 } else {
                    domain = 'System';
                 }
             } catch {}
             
             if (!groups.has(domain)) {
                 groups.set(domain, []);
             }
             groups.get(domain)?.push(tab);
        }
        
        // Sort by Count Descending
        const sortedEntries = [...groups.entries()].sort((a, b) => {
            return b[1].length - a[1].length;
        });
        
        const sortedGroups = new Map<string | number, chrome.tabs.Tab[]>(sortedEntries);
        this.tabList.render(sortedGroups, 'list');

    } else {
        // Default: Window
        for (const tab of tabs) {
            if (!groups.has(tab.windowId)) {
                groups.set(tab.windowId, []);
            }
            groups.get(tab.windowId)?.push(tab);
        }
        this.tabList.render(groups, 'list');
    }
    
    // Update count
    const countEl = document.getElementById('tab-count');
    if (countEl) countEl.textContent = `${tabs.length} tabs`;
    } finally {
      this.isRendering = false;
    }
  }

  private async performSmartGrouping() {
      const grouper = new AutoGrouper();
      // We leverage the enhanced logic which handles multi-window grouping
      await grouper.groupAllBySimilarity();
      
      // Reload tabs to show groups
      await this.loadAndRenderTabs(this.currentSearchQuery, this.currentFilters);
  }

  private async mergeSelectedWindows() {
    await mergeSelectedWindows(this.tabList, () =>
      this.loadAndRenderTabs(this.currentSearchQuery, this.currentFilters)
    );
  }
}

new SidepanelApp();