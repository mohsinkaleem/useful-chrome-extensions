// Tab list component
import { normalizeUrl } from '../../shared/url-utils.js';

interface TabResourceInfo {
  tabId: number;
  memory: number;
  cpu: number;
}

export class TabList {
  private container: HTMLElement | null;
  private selectionCallbacks: Array<(selectedIds: number[]) => void> = [];
  private clickCallbacks: Array<(tabId: number) => void> = [];
  private selectedTabs: Set<number> = new Set();
  private highlightDuplicates: boolean = false;
  private duplicateUrls: Set<string> = new Set();
  private tabResourceMap: Map<number, TabResourceInfo> = new Map();

  constructor() {
    this.container = document.getElementById('tabs-container');
  }

  setDuplicateHighlight(enabled: boolean, duplicateUrls: Set<string>) {
    this.highlightDuplicates = enabled;
    this.duplicateUrls = duplicateUrls;
  }

  setTabResources(resources: TabResourceInfo[]) {
    this.tabResourceMap.clear();
    resources.forEach(r => {
      this.tabResourceMap.set(r.tabId, r);
    });
  }

  render(tabsByWindow: Map<number, chrome.tabs.Tab[]>, viewMode: 'list' | 'compact' | 'grid') {
    if (!this.container) return;
    
    // Clean up all existing tooltips before re-rendering
    // Note: We are moving to native tooltips for performance, but keeping cleanup just in case
    const existingTooltips = document.querySelectorAll('.tab-tooltip');
    existingTooltips.forEach(tooltip => tooltip.remove());
    
    this.container.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    
    for (const [windowId, tabs] of tabsByWindow.entries()) {
      const windowGroup = this.createWindowGroup(windowId, tabs, viewMode);
      fragment.appendChild(windowGroup);
    }
    
    this.container.appendChild(fragment);
  }

  private createWindowGroup(windowId: number, tabs: chrome.tabs.Tab[], viewMode: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'window-group';
    
    // Window header
    const header = document.createElement('div');
    header.className = 'window-header';
    
    const title = document.createElement('div');
    title.className = 'window-title';
    title.textContent = `Window ${windowId} (${tabs.length} tabs)`;
    
    const actions = document.createElement('div');
    actions.className = 'window-actions';
    
    const bookmarkBtn = this.createButton('★ All', async () => {
      try {
        const bookmarkableTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://'));
        
        if (bookmarkableTabs.length === 0) {
          alert('No bookmarkable tabs in this window.');
          return;
        }
        
        const defaultName = `Window ${windowId} (${bookmarkableTabs.length} tabs) - ${new Date().toLocaleDateString()}`;
        const name = prompt(
          `Bookmark ${bookmarkableTabs.length} tab(s) from Window ${windowId}?\n\nEnter folder name:`,
          defaultName
        );
        
        if (name) {
          const { bulkBookmarkTabs } = await import('../../shared/bookmark-utils.js');
          const bookmarks = await bulkBookmarkTabs(bookmarkableTabs, name);
          alert(`✅ Successfully bookmarked ${bookmarks.length} tabs from Window ${windowId} to folder "${name}"`);
        }
      } catch (e) {
        console.error('Failed to bookmark window tabs:', e);
        alert('❌ Failed to bookmark tabs.');
      }
    });
    
    const closeBtn = this.createButton('✕ Window', async () => {
      await chrome.windows.remove(windowId);
    });
    
    actions.appendChild(bookmarkBtn);
    actions.appendChild(closeBtn);
    
    header.appendChild(title);
    header.appendChild(actions);
    
    // Tab list
    const tabList = document.createElement('div');
    tabList.className = `tab-list ${viewMode}`;
    
    // Use fragment for tabs
    const tabsFragment = document.createDocumentFragment();
    for (const tab of tabs) {
      const tabItem = this.createTabItem(tab, viewMode);
      tabsFragment.appendChild(tabItem);
    }
    tabList.appendChild(tabsFragment);
    
    group.appendChild(header);
    group.appendChild(tabList);
    
    return group;
  }

  private createTabItem(tab: chrome.tabs.Tab, viewMode: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'tab-item';
    
    if (tab.active) {
      item.classList.add('active');
    }
    
    if (tab.id && this.selectedTabs.has(tab.id)) {
      item.classList.add('selected');
    }

    // Check if this tab is a duplicate and highlighting is enabled
    if (this.highlightDuplicates && tab.url) {
      const normalizedUrl = normalizeUrl(tab.url);
      if (this.duplicateUrls.has(normalizedUrl)) {
        item.classList.add('duplicate-highlight');
      }
    }
    
    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tab-checkbox';
    checkbox.checked = tab.id ? this.selectedTabs.has(tab.id) : false;
    checkbox.onclick = (e) => {
      e.stopPropagation();
      if (tab.id) {
        if (checkbox.checked) {
          this.selectedTabs.add(tab.id);
        } else {
          this.selectedTabs.delete(tab.id);
        }
        this.notifySelectionChange();
      }
    };
    
    // Favicon - use a visible default
    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    const defaultIcon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="%23ccc" width="16" height="16" rx="2"/></svg>');
    favicon.src = tab.favIconUrl || defaultIcon;
    favicon.onerror = () => {
      favicon.src = defaultIcon;
    };
    
    // Tab info
    const info = document.createElement('div');
    info.className = 'tab-info';
    
    const title = document.createElement('div');
    title.className = 'tab-title';
    // Use pendingUrl as fallback, or show tab id if no title
    const displayTitle = tab.title || tab.pendingUrl || `Tab ${tab.id}`;
    title.textContent = displayTitle;
    
    const url = document.createElement('div');
    url.className = 'tab-url';
    const displayUrl = tab.url || tab.pendingUrl || '';
    // Extract hostname from URL and remove www. prefix
    let urlText = displayUrl;
    try {
      if (displayUrl) {
        // Optimization: Simple string manipulation for common protocols instead of new URL()
        if (displayUrl.startsWith('http')) {
          const parts = displayUrl.split('/');
          if (parts.length >= 3) {
            urlText = parts[2].replace(/^www\./, '');
          } else {
            urlText = displayUrl;
          }
        } else {
          const urlObj = new URL(displayUrl);
          urlText = urlObj.hostname.replace(/^www\./, '');
        }
      }
    } catch (e) {
      // If URL parsing fails, use the original
      urlText = displayUrl;
    }
    url.textContent = urlText;
    
    info.appendChild(title);
    if (viewMode !== 'compact') {
      info.appendChild(url);
      
      // Add memory indicator if available
      if (tab.id && this.tabResourceMap.has(tab.id)) {
        const resourceInfo = this.tabResourceMap.get(tab.id)!;
        const memoryMB = resourceInfo.memory / (1024 * 1024);
        
        const memoryIndicator = document.createElement('div');
        memoryIndicator.className = 'tab-memory-indicator';
        memoryIndicator.innerHTML = `
          <span class="memory-icon">⚡</span>
          <span class="memory-text">${memoryMB.toFixed(0)} MB</span>
        `;
        
        // Add color coding based on memory usage
        if (memoryMB < 100) {
          memoryIndicator.classList.add('low');
        } else if (memoryMB < 300) {
          memoryIndicator.classList.add('medium');
        } else {
          memoryIndicator.classList.add('high');
        }
        
        info.appendChild(memoryIndicator);
      }
    }
    
    // Badges
    const badges = document.createElement('div');
    badges.className = 'tab-badges';
    
    if (tab.audible) {
      badges.appendChild(this.createBadge('🔊', 'audible'));
    }
    if (tab.pinned) {
      badges.appendChild(this.createBadge('📌', 'pinned'));
    }
    if (tab.discarded) {
      badges.appendChild(this.createBadge('💤', 'discarded'));
    }
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'tab-actions';
    
    const closeBtn = this.createButton('✕', async () => {
      if (tab.id) {
        await chrome.tabs.remove(tab.id);
      }
    });
    closeBtn.className = 'tab-btn';
    
    actions.appendChild(closeBtn);
    
    // Assemble
    item.appendChild(checkbox);
    item.appendChild(favicon);
    item.appendChild(info);
    item.appendChild(badges);
    item.appendChild(actions);
    
    // Use native tooltip for better performance with large number of tabs
    item.title = `${displayTitle}\n${displayUrl}`;
    
    // Click to switch
    item.onclick = (e) => {
      if ((e.target as HTMLElement).tagName !== 'INPUT' && 
          (e.target as HTMLElement).tagName !== 'BUTTON') {
        if (tab.id) {
          this.notifyClick(tab.id);
        }
      }
    };
    
    return item;
  }

  private createBadge(text: string, className: string): HTMLElement {
    const badge = document.createElement('span');
    badge.className = `badge ${className}`;
    badge.textContent = text;
    return badge;
  }

  private createButton(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'window-btn';
    btn.textContent = text;
    btn.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };
    return btn;
  }

  onSelectionChange(callback: (selectedIds: number[]) => void) {
    this.selectionCallbacks.push(callback);
  }

  onTabClick(callback: (tabId: number) => void) {
    this.clickCallbacks.push(callback);
  }

  private notifySelectionChange() {
    const selectedIds = Array.from(this.selectedTabs);
    this.selectionCallbacks.forEach(cb => cb(selectedIds));
  }

  private notifyClick(tabId: number) {
    this.clickCallbacks.forEach(cb => cb(tabId));
  }
}
