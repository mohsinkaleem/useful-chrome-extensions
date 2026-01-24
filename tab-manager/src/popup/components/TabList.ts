// Tab list component
import { normalizeUrl } from '../../shared/url-utils.js';

export class TabList {
  private container: HTMLElement | null;
  private selectionCallbacks: Array<(selectedIds: number[]) => void> = [];
  private clickCallbacks: Array<(tabId: number) => void> = [];
  private selectedTabs: Set<number> = new Set();
  private highlightDuplicates: boolean = false;
  private duplicateUrls: Set<string> = new Set();
  private showCheckboxes: boolean = true;
  private selectedWindows: Set<number> = new Set();
  private windowSelectionCallbacks: Array<(selectedWindowIds: number[]) => void> = [];

  constructor() {
    this.container = document.getElementById('tabs-container');
  }

  setDuplicateHighlight(enabled: boolean, duplicateUrls: Set<string>) {
    this.highlightDuplicates = enabled;
    this.duplicateUrls = duplicateUrls;
  }

  setShowCheckboxes(enabled: boolean) {
    this.showCheckboxes = enabled;
  }

  render(groups: Map<number | string, chrome.tabs.Tab[]>, viewMode: 'list' | 'compact' | 'grid') {
    if (!this.container) return;
    
    // Clean up
    const existingTooltips = document.querySelectorAll('.tab-tooltip');
    existingTooltips.forEach(tooltip => tooltip.remove());
    
    this.container.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    
    for (const [key, tabs] of groups.entries()) {
      const groupElement = this.createGroup(key, tabs, viewMode);
      fragment.appendChild(groupElement);
    }
    
    this.container.appendChild(fragment);
  }

  private createGroup(key: number | string, tabs: chrome.tabs.Tab[], viewMode: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'window-group'; // Reuse window-group style, or rename class to 'tab-group-container' in CSS
    
    // Header
    const header = document.createElement('div');
    header.className = 'window-header';
    
    const title = document.createElement('div');
    title.className = 'window-title';
    
    // Add collapse indicator
    const arrow = document.createElement('span');
    arrow.textContent = '▼ ';
    arrow.style.transition = 'transform 0.2s';
    
    const displayTitle = typeof key === 'number' ? `Window ${key}` : `${key}`;
    const titleText = document.createTextNode(`${displayTitle} (${tabs.length})`);

    title.appendChild(arrow);
    title.appendChild(titleText);
    
    const actions = document.createElement('div');
    actions.className = 'window-actions';
    
    // Only show window-specific actions if key is a window ID (number)
    if (typeof key === 'number') {
        const bookmarkBtn = this.createButton('★', async () => {
          // ... (existing bookmark logic)
          // Simplified for brevity of replacement, assuming reused logic context
           try {
            const bookmarkableTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://'));
            if (bookmarkableTabs.length === 0) return;
            const defaultName = `Window ${key} (${bookmarkableTabs.length} tabs)`;
            const name = prompt(`Bookmark tabs?`, defaultName);
            if (name) {
              const { bulkBookmarkTabs } = await import('../../shared/bookmark-utils.js');
              await bulkBookmarkTabs(bookmarkableTabs, name);
            }
          } catch (e) { console.error(e); }
        });
        actions.appendChild(bookmarkBtn);

        const closeBtn = this.createButton('✕', async () => {
          if(confirm('Close window?')) await chrome.windows.remove(key);
        });
        actions.appendChild(closeBtn);
    } else {
        // Group Actions (e.g. for Domain groups)
        const newGroupBtn = this.createButton('New Group', async () => {
             const ids = tabs.map(t => t.id).filter(id => id !== undefined) as number[];
             if (ids.length > 0) {
                 const groupId = await chrome.tabs.group({ tabIds: ids });
                 await chrome.tabGroups.update(groupId, { title: String(key) });
             }
        });
        actions.appendChild(newGroupBtn);
    }
    
    header.appendChild(title);
    header.appendChild(actions);
    
    // Window checkbox (only for window view, not domain) - add at the end so it appears on right
    if (typeof key === 'number') {
      const windowCheckbox = document.createElement('input');
      windowCheckbox.type = 'checkbox';
      windowCheckbox.className = 'window-checkbox';
      windowCheckbox.checked = this.selectedWindows.has(key);
      windowCheckbox.onclick = (e) => {
        e.stopPropagation();
        if (windowCheckbox.checked) {
          this.selectedWindows.add(key);
        } else {
          this.selectedWindows.delete(key);
        }
        this.notifyWindowSelectionChange();
      };
      header.appendChild(windowCheckbox);
    }
    
    // Tab list
    const tabList = document.createElement('div');
    tabList.className = `tab-list ${viewMode}`;
    
    const tabsFragment = document.createDocumentFragment();
    for (const tab of tabs) {
      const tabItem = this.createTabItem(tab, viewMode);
      tabsFragment.appendChild(tabItem);
    }
    tabList.appendChild(tabsFragment);
    
    group.appendChild(header);
    group.appendChild(tabList);
    
    // Toggle Collapse - set up after tabList is created
    title.style.cursor = 'pointer';
    title.onclick = (e) => {
        e.stopPropagation();
        const isHidden = tabList.style.display === 'none';
        tabList.style.display = isHidden ? '' : 'none';
        arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    };
    
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
    let checkbox: HTMLInputElement | null = null;
    if (this.showCheckboxes) {
      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'tab-checkbox';
      checkbox.checked = tab.id ? this.selectedTabs.has(tab.id) : false;
      checkbox.onclick = (e) => {
        e.stopPropagation();
        if (tab.id && checkbox) {
          if (checkbox.checked) {
            this.selectedTabs.add(tab.id);
          } else {
            this.selectedTabs.delete(tab.id);
          }
          this.notifySelectionChange();
        }
      };
    }
    
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
    if (checkbox) {
      item.appendChild(checkbox);
    }
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

  onWindowSelectionChange(callback: (selectedWindowIds: number[]) => void) {
    this.windowSelectionCallbacks.push(callback);
  }

  private notifySelectionChange() {
    const selectedIds = Array.from(this.selectedTabs);
    this.selectionCallbacks.forEach(cb => cb(selectedIds));
  }

  private notifyClick(tabId: number) {
    this.clickCallbacks.forEach(cb => cb(tabId));
  }

  private notifyWindowSelectionChange() {
    const selectedWindowIds = Array.from(this.selectedWindows);
    this.windowSelectionCallbacks.forEach(cb => cb(selectedWindowIds));
  }

  getSelectedWindows(): number[] {
    return Array.from(this.selectedWindows);
  }

  clearWindowSelection() {
    this.selectedWindows.clear();
  }
}
