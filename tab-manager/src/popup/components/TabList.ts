// Tab list component
import { normalizeUrl, isChromeInternalUrl } from '../../shared/url-utils.js';
import { bulkBookmarkTabs } from '../../shared/bookmark-utils.js';
import { confirmDialog, promptDialog, showToast } from '../../shared/dialogs.js';

const GROUP_COLOR_HEX: Record<chrome.tabGroups.ColorEnum, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#188038',
  pink: '#d01884',
  purple: '#9334e6',
  cyan: '#007b83',
  orange: '#fa903e'
};

// Chrome's own favicon cache: avoids a live request to each third-party origin
// (and the browsing-data leak that comes with it).
function faviconUrl(pageUrl: string, size = 32): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

const FALLBACK_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="#c4c7c5" width="16" height="16" rx="3"/></svg>'
  );

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
  private collapsedGroups: Set<number | string> = new Set();
  private tabGroups: Map<number, chrome.tabGroups.TabGroup> = new Map();

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

  setTabGroups(groups: chrome.tabGroups.TabGroup[]) {
    this.tabGroups = new Map(groups.map(g => [g.id, g]));
  }

  render(groups: Map<number | string, chrome.tabs.Tab[]>, viewMode: 'list' | 'compact' | 'grid') {
    if (!this.container) return;
    
    this.container.innerHTML = '';

    if (groups.size === 0) {
      this.container.appendChild(this.createEmptyState());
      return;
    }
    
    const fragment = document.createDocumentFragment();
    
    for (const [key, tabs] of groups.entries()) {
      const groupElement = this.createGroup(key, tabs, viewMode);
      fragment.appendChild(groupElement);
    }
    
    this.container.appendChild(fragment);
  }

  private createEmptyState(): HTMLElement {
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const title = document.createElement('div');
    title.className = 'empty-state-title';
    title.textContent = 'No tabs match';

    const hint = document.createElement('div');
    hint.className = 'empty-state-hint';
    hint.textContent = 'Try clearing the search box or the active filters.';

    empty.append(title, hint);
    return empty;
  }

  private createGroup(key: number | string, tabs: chrome.tabs.Tab[], viewMode: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'window-group'; // Reuse window-group style, or rename class to 'tab-group-container' in CSS

    // Enable drop for window groups
    if (typeof key === 'number') {
      group.ondragover = (e) => {
        e.preventDefault(); // Allow drop
        e.dataTransfer!.dropEffect = 'move';
        group.classList.add('drag-over');
      };
      
      group.ondragleave = (e) => {
        group.classList.remove('drag-over');
      };

      group.ondrop = async (e) => {
        e.preventDefault();
        group.classList.remove('drag-over');
        
        try {
          const data = e.dataTransfer!.getData('text/plain');
          if (!data) return;
          
          const { tabId, windowId: sourceWindowId } = JSON.parse(data);
          const targetWindowId = key;
          
          // Only move if different window
          if (tabId && sourceWindowId !== targetWindowId) {
            await chrome.tabs.move(tabId, {
              windowId: targetWindowId,
              index: -1 // Append to end
            });
          }
        } catch (err) {
          console.error('Drop failed:', err);
        }
      };
    }
    
    // Header
    const header = document.createElement('div');
    header.className = 'window-header';
    
    const title = document.createElement('div');
    title.className = 'window-title';
    
    // Add collapse indicator
    const arrow = document.createElement('span');
    arrow.className = 'collapse-arrow';
    arrow.textContent = '\u25BC';
    
    const displayTitle = typeof key === 'number' ? `Window ${key}` : `${key}`;
    const titleText = document.createTextNode(` ${displayTitle} (${tabs.length})`);

    title.appendChild(arrow);
    title.appendChild(titleText);
    
    const actions = document.createElement('div');
    actions.className = 'window-actions';
    
    // Only show window-specific actions if key is a window ID (number)
    if (typeof key === 'number') {
        const bookmarkBtn = this.createButton('\u2605', async () => {
          try {
            const bookmarkableTabs = tabs.filter(t => t.url && !isChromeInternalUrl(t.url));
            if (bookmarkableTabs.length === 0) {
              showToast('No bookmarkable tabs in this window', 'error');
              return;
            }
            const name = await promptDialog({
              title: 'Bookmark window',
              message: `Save ${bookmarkableTabs.length} tabs into a new bookmark folder.`,
              defaultValue: `Window ${key} (${bookmarkableTabs.length} tabs)`,
              confirmLabel: 'Bookmark'
            });
            if (!name) return;
            const saved = await bulkBookmarkTabs(bookmarkableTabs, name);
            showToast(`Bookmarked ${saved.length} tabs to "${name}"`, 'success');
          } catch (e) {
            console.error('Failed to bookmark window:', e);
            showToast('Failed to bookmark window', 'error');
          }
        });
        bookmarkBtn.title = 'Bookmark all tabs in this window';
        actions.appendChild(bookmarkBtn);

        const closeBtn = this.createButton('\u2715', async () => {
          const ok = await confirmDialog({
            title: 'Close window?',
            message: `${tabs.length} tab(s) will be closed.`,
            confirmLabel: 'Close window',
            danger: true
          });
          if (ok) await chrome.windows.remove(key);
        });
        closeBtn.title = 'Close this window';
        actions.appendChild(closeBtn);
    } else {
        // Group Actions (e.g. for Domain groups)
        const newGroupBtn = this.createButton('New Group', async () => {
             const ids = tabs.map(t => t.id).filter((id): id is number => id !== undefined);
             if (ids.length === 0) return;
             const groupId = await chrome.tabs.group({ tabIds: ids });
             await chrome.tabGroups.update(groupId, { title: String(key) });
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
    const applyCollapsed = (collapsed: boolean) => {
        tabList.classList.toggle('collapsed', collapsed);
        arrow.classList.toggle('collapsed', collapsed);
    };
    applyCollapsed(this.collapsedGroups.has(key));

    title.onclick = (e) => {
        e.stopPropagation();
        const collapsed = !this.collapsedGroups.has(key);
        applyCollapsed(collapsed);
        if (collapsed) {
          this.collapsedGroups.add(key);
        } else {
          this.collapsedGroups.delete(key);
        }
    };
    
    return group;

  }

  private createTabItem(tab: chrome.tabs.Tab, viewMode: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'tab-item';
    
    // Add drag support
    item.draggable = true;
    item.ondragstart = (e) => {
      if (tab.id !== undefined && tab.windowId !== undefined) {
        e.dataTransfer!.setData('text/plain', JSON.stringify({
          tabId: tab.id,
          windowId: tab.windowId
        }));
        e.dataTransfer!.effectAllowed = 'move';
      }
    };
    
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
    
    // Favicon - served from Chrome's cache rather than the page's own origin
    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.alt = '';
    favicon.src = tab.url ? faviconUrl(tab.url) : FALLBACK_ICON;
    favicon.onerror = () => {
      favicon.src = FALLBACK_ICON;
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

    const group = tab.groupId !== undefined ? this.tabGroups.get(tab.groupId) : undefined;
    if (group) {
      badges.appendChild(this.createGroupChip(group));
    }
    
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

  private createGroupChip(group: chrome.tabGroups.TabGroup): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'badge group-chip';
    chip.style.background = GROUP_COLOR_HEX[group.color] ?? GROUP_COLOR_HEX.grey;
    chip.textContent = group.title || '';
    chip.title = `Tab group: ${group.title || 'Untitled'}`;
    if (!group.title) chip.classList.add('group-chip-dot');
    return chip;
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

  clearSelection() {
    this.selectedTabs.clear();
    this.notifySelectionChange();
  }

  clearWindowSelection() {
    this.selectedWindows.clear();
  }
}
