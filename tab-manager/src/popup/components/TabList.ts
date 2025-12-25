// Tab list component
import { normalizeUrl } from '../../shared/url-utils.js';

export class TabList {
  private container: HTMLElement | null;
  private selectionCallbacks: Array<(selectedIds: number[]) => void> = [];
  private clickCallbacks: Array<(tabId: number) => void> = [];
  private selectedTabs: Set<number> = new Set();
  private highlightDuplicates: boolean = false;
  private duplicateUrls: Set<string> = new Set();

  constructor() {
    this.container = document.getElementById('tabs-container');
  }

  setDuplicateHighlight(enabled: boolean, duplicateUrls: Set<string>) {
    this.highlightDuplicates = enabled;
    this.duplicateUrls = duplicateUrls;
  }

  render(tabsByWindow: Map<number, chrome.tabs.Tab[]>, viewMode: 'list' | 'compact' | 'grid') {
    if (!this.container) return;
    
    // Clean up all existing tooltips before re-rendering
    const existingTooltips = document.querySelectorAll('.tab-tooltip');
    existingTooltips.forEach(tooltip => tooltip.remove());
    
    this.container.innerHTML = '';
    
    for (const [windowId, tabs] of tabsByWindow.entries()) {
      const windowGroup = this.createWindowGroup(windowId, tabs, viewMode);
      this.container.appendChild(windowGroup);
    }
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
      const { bulkBookmarkTabs } = await import('../../shared/bookmark-utils.js');
      await bulkBookmarkTabs(tabs, `Window ${windowId}`);
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
    
    for (const tab of tabs) {
      const tabItem = this.createTabItem(tab, viewMode);
      tabList.appendChild(tabItem);
    }
    
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
        const urlObj = new URL(displayUrl);
        urlText = urlObj.hostname.replace(/^www\./, '');
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
    item.appendChild(checkbox);
    item.appendChild(favicon);
    item.appendChild(info);
    item.appendChild(badges);
    item.appendChild(actions);
    
    // Create hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'tab-tooltip hidden';
    const tooltipContent = document.createElement('div');
    tooltipContent.className = 'tooltip-content';
    // Truncate title to max 60 characters
    tooltipContent.textContent = displayTitle.length > 60 ? displayTitle.substring(0, 60) + '...' : displayTitle;
    const tooltipUrl = document.createElement('div');
    tooltipUrl.className = 'tooltip-url';
    // Truncate URL to max 80 characters
    tooltipUrl.textContent = displayUrl.length > 80 ? displayUrl.substring(0, 80) + '...' : displayUrl;
    tooltip.appendChild(tooltipContent);
    tooltip.appendChild(tooltipUrl);
    document.body.appendChild(tooltip);
    
    // Show tooltip on hover
    item.onmouseenter = (e) => {
      const rect = item.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipHeight = 50; // estimated
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      
      let top: number;
      // Position tooltip based on available space
      if (spaceAbove > tooltipHeight || spaceAbove > spaceBelow) {
        // Show above
        top = rect.top - tooltipHeight - 4;
      } else {
        // Show below
        top = rect.bottom + 4;
      }
      
      tooltip.style.position = 'fixed';
      tooltip.style.top = top + 'px';
      tooltip.style.left = (rect.left + rect.width / 2) + 'px';
      tooltip.style.transform = 'translateX(-50%)';
      tooltip.classList.remove('hidden');
    };
    item.onmouseleave = () => {
      tooltip.classList.add('hidden');
    };
    
    // Clean up tooltip when item is removed
    const cleanupTooltip = () => {
      if (tooltip.parentElement) {
        tooltip.remove();
      }
    };
    
    const observer = new MutationObserver(() => {
      if (!document.body.contains(item)) {
        cleanupTooltip();
        observer.disconnect();
      }
    });
    if (item.parentElement) {
      observer.observe(item.parentElement, { childList: true });
    }
    
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
