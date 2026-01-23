// Sidepanel script
import { TabEventManager, getAllTabs, getTabsByWindow } from '../shared/tab-utils.js';
import { findDuplicatesByUrl, normalizeUrl } from '../shared/url-utils.js';
import { TabList } from '../popup/components/TabList.js';
import { SearchBar } from '../popup/components/SearchBar.js';
import { AutoGrouper } from '../background/auto-grouper.js';

class SidepanelApp {
  private tabEventManager: TabEventManager;
  private tabList: TabList;
  private searchBar: SearchBar;
  private currentSearchQuery: string = '';
  private currentFilters: any = null;
  private groupView: 'window' | 'domain' = 'window';

  constructor() {
    this.tabEventManager = new TabEventManager();
    this.tabList = new TabList();
    this.tabList.setShowCheckboxes(false);
    this.searchBar = new SearchBar();
    
    this.init();
  }

  private async init() {
    // Load Theme
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
    }

    this.setupEventListeners();
    await this.loadAndRenderTabs();
    
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
      const tab = await chrome.tabs.get(tabId);
      if (tab.windowId && tab.id) {
         await chrome.windows.update(tab.windowId, { focused: true });
         await chrome.tabs.update(tab.id, { active: true });
      }
    });

    // Theme Toggle
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
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

  private async loadAndRenderTabs(query: string = '', filters: any = null) {
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
  }

  private async performSmartGrouping() {
      const grouper = new AutoGrouper();
      // We leverage the enhanced logic which handles multi-window grouping
      await grouper.groupAllBySimilarity();
      
      // Reload tabs to show groups
      await this.loadAndRenderTabs(this.currentSearchQuery, this.currentFilters);
  }
}

new SidepanelApp();