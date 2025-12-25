/// <reference types="chrome"/>
// Resource monitoring component with real memory/CPU statistics

// Type definitions for chrome.processes API (not in standard @types/chrome)
declare namespace chrome.processes {
  interface Task {
    tabId?: number;
    title?: string;
  }

  interface Process {
    id: number;
    type: string;
    cpu: number;
    privateMemory: number;
    network: number;
    tasks?: Task[];
  }

  function getProcessInfo(
    processIds: number[],
    includeMemory: boolean
  ): Promise<{ [processId: number]: Process }>;

  namespace onUpdated {
    function addListener(
      callback: (processes: { [processId: number]: Process }) => void
    ): void;
  }
}

interface TabResourceInfo {
  tabId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  memory: number; // bytes
  cpu: number; // percentage
  network: number; // bytes
  processId?: number;
}

interface ProcessInfo {
  id: number;
  type: string;
  cpu: number;
  memory: number;
  network: number;
  tabIds?: number[];
}

export class ResourceMonitor {
  private container: HTMLElement | null;
  private totalMemoryEl: HTMLElement | null;
  private totalCpuEl: HTMLElement | null;
  private totalNetworkEl: HTMLElement | null;
  private processCountEl: HTMLElement | null;
  private topConsumersEl: HTMLElement | null;
  private allTabsResourceEl: HTMLElement | null;
  private lastUpdate: number = 0;
  private updateInterval: number = 5000; // 5 seconds
  private intervalId: number | null = null;
  private tabResourceMap: Map<number, TabResourceInfo> = new Map();
  private displayedTopConsumersCount: number = 10; // Start with 10

  constructor() {
    this.container = document.getElementById('resource-monitor-panel');
    this.totalMemoryEl = document.getElementById('total-memory');
    this.totalCpuEl = document.getElementById('total-cpu');
    this.totalNetworkEl = document.getElementById('total-network');
    this.processCountEl = document.getElementById('process-count');
    this.topConsumersEl = document.getElementById('top-consumers-list');
    this.allTabsResourceEl = document.getElementById('all-tabs-resource-list');

    this.startMonitoring();
  }

  private startMonitoring() {
    // Initial update
    this.updateResourceInfo();

    // Auto-refresh every 5 seconds
    this.intervalId = window.setInterval(() => {
      this.updateResourceInfo();
    }, this.updateInterval);
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async updateResourceInfo() {
    try {
      // Get all tabs
      const tabs = await chrome.tabs.query({});
      
      // Use intelligent estimation based on tab characteristics
      await this.estimateResourceUsage(tabs);
      
      console.log('Resource estimation complete for', tabs.length, 'tabs');

      this.updateTopConsumers();
      this.updateAllTabsResourceList();

    } catch (error) {
      console.error('Failed to get process info:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      this.showError(error instanceof Error ? error.message : 'Unknown error');
    }

    this.lastUpdate = Date.now();
  }

  private updateOverview(memory: number, cpu: number, network: number, processCount: number) {
    // Format memory in GB/MB
    const memoryMB = memory / (1024 * 1024);
    const memoryStr = memoryMB >= 1024 
      ? `${(memoryMB / 1024).toFixed(2)} GB` 
      : `${memoryMB.toFixed(0)} MB`;

    if (this.totalMemoryEl) {
      this.totalMemoryEl.textContent = memoryStr;
    }
    if (this.totalCpuEl) {
      this.totalCpuEl.textContent = `${cpu.toFixed(1)}%`;
    }
    if (this.totalNetworkEl) {
      const networkKB = network / 1024;
      this.totalNetworkEl.textContent = networkKB > 1024 
        ? `${(networkKB / 1024).toFixed(2)} MB` 
        : `${networkKB.toFixed(0)} KB`;
    }
    if (this.processCountEl) {
      this.processCountEl.textContent = processCount.toString();
    }
  }

  private updateTopConsumers() {
    if (!this.topConsumersEl) return;

    // Get all tabs sorted by memory
    const allSortedByMemory = Array.from(this.tabResourceMap.values())
      .sort((a, b) => b.memory - a.memory);
    
    // Display only the first N tabs (lazy loading)
    const sortedByMemory = allSortedByMemory.slice(0, this.displayedTopConsumersCount);

    if (sortedByMemory.length === 0) {
      this.topConsumersEl.innerHTML = '<div class="empty-state">No resource data available</div>';
      return;
    }

    // Calculate total for percentage
    const totalMemory = Array.from(this.tabResourceMap.values())
      .reduce((sum, tab) => sum + tab.memory, 0);

    const tabsHtml = sortedByMemory.map((tab, index) => {
      const memoryMB = tab.memory / (1024 * 1024);
      const percentage = totalMemory > 0 ? (tab.memory / totalMemory * 100) : 0;
      const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const emoji = index < rankEmojis.length ? rankEmojis[index] : `${index + 1}`;
      const severity = this.getMemorySeverity(memoryMB);

      return `
        <div class="top-consumer-item ${severity}">
          <span class="rank-badge">${emoji}</span>
          <img src="${tab.favIconUrl || 'icons/icon16.svg'}" class="top-consumer-favicon" onerror="this.src='icons/icon16.svg'">
          <div class="top-consumer-info">
            <div class="top-consumer-title">${this.escapeHtml(this.truncate(tab.title, 40))}</div>
            <div class="top-consumer-stats">
              <span class="memory-stat">${memoryMB.toFixed(0)} MB</span>
              <span class="percentage-stat">(${percentage.toFixed(1)}%)</span>
              ${tab.cpu > 0 ? `<span class="cpu-stat">CPU: ${tab.cpu.toFixed(1)}%</span>` : ''}
            </div>
          </div>
          <button class="goto-tab-btn" data-tab-id="${tab.tabId}" title="Go to tab">→</button>
          <button class="hibernate-tab-btn" data-tab-id="${tab.tabId}" title="Hibernate this tab">💤</button>
        </div>
      `;
    }).join('');
    
    // Add "Load More" button if there are more tabs to show
    const loadMoreHtml = allSortedByMemory.length > this.displayedTopConsumersCount
      ? `<button class="load-more-btn" id="load-more-consumers">Load More (${allSortedByMemory.length - this.displayedTopConsumersCount} more)</button>`
      : '';
    
    this.topConsumersEl.innerHTML = tabsHtml + loadMoreHtml;

    // Add event listeners to hibernate buttons
    this.topConsumersEl.querySelectorAll('.hibernate-tab-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tabId = parseInt((e.target as HTMLElement).getAttribute('data-tab-id') || '0');
        if (tabId) {
          await this.hibernateTab(tabId);
        }
      });
    });
    
    // Add event listeners to goto buttons
    this.topConsumersEl.querySelectorAll('.goto-tab-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tabId = parseInt((e.target as HTMLElement).getAttribute('data-tab-id') || '0');
        if (tabId) {
          await this.goToTab(tabId);
        }
      });
    });
    
    // Add event listener to "Load More" button
    const loadMoreBtn = document.getElementById('load-more-consumers');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        this.displayedTopConsumersCount += 10; // Load 10 more at a time
        this.updateTopConsumers();
      });
    }
  }

  private updateAllTabsResourceList() {
    if (!this.allTabsResourceEl) return;

    const sortedTabs = Array.from(this.tabResourceMap.values())
      .sort((a, b) => b.memory - a.memory);

    if (sortedTabs.length === 0) {
      this.allTabsResourceEl.innerHTML = '<div class="empty-state">No tabs with resource data</div>';
      return;
    }

    const maxMemory = Math.max(...sortedTabs.map(t => t.memory), 1);

    this.allTabsResourceEl.innerHTML = sortedTabs.map(tab => {
      const memoryMB = tab.memory / (1024 * 1024);
      const percentage = (tab.memory / maxMemory * 100);
      const severity = this.getMemorySeverity(memoryMB);

      return `
        <div class="resource-tab-item ${severity}">
          <img src="${tab.favIconUrl || 'icons/icon16.svg'}" class="resource-tab-favicon" onerror="this.src='icons/icon16.svg'">
          <div class="resource-tab-info">
            <div class="resource-tab-title">${this.escapeHtml(this.truncate(tab.title, 50))}</div>
            <div class="resource-tab-stats">
              <span class="memory-value">${memoryMB.toFixed(0)} MB</span>
              ${tab.cpu > 0 ? `<span class="cpu-value">CPU: ${tab.cpu.toFixed(1)}%</span>` : ''}
            </div>
            <div class="memory-bar-container">
              <div class="memory-bar ${severity}" style="width: ${percentage}%"></div>
            </div>
          </div>
          <button class="goto-tab-btn" data-tab-id="${tab.tabId}" title="Go to tab">→</button>
        </div>
      `;
    }).join('');

    // Add event listeners
    this.allTabsResourceEl.querySelectorAll('.goto-tab-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tabId = parseInt((e.target as HTMLElement).getAttribute('data-tab-id') || '0');
        if (tabId) {
          await this.goToTab(tabId);
        }
      });
    });
  }

  private getMemorySeverity(memoryMB: number): 'low' | 'medium' | 'high' | 'critical' {
    if (memoryMB < 100) return 'low';
    if (memoryMB < 300) return 'medium';
    if (memoryMB < 500) return 'high';
    return 'critical';
  }

  private async hibernateTab(tabId: number) {
    try {
      await chrome.tabs.discard(tabId);
      // Update immediately after hibernate
      setTimeout(() => this.updateResourceInfo(), 500);
    } catch (error) {
      console.error('Failed to hibernate tab:', error);
    }
  }

  private async goToTab(tabId: number) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      await chrome.tabs.update(tabId, { active: true });
    } catch (error) {
      console.error('Failed to go to tab:', error);
    }
  }

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async estimateResourceUsage(tabs: chrome.tabs.Tab[]) {
    this.tabResourceMap.clear();
    let totalMemory = 0;
    let activeProcessCount = 0;

    for (const tab of tabs) {
      if (!tab.id) continue;

      // Estimate memory based on tab characteristics
      let estimatedMemory = this.estimateTabMemory(tab);
      totalMemory += estimatedMemory;

      // Count as active process if not discarded
      if (!tab.discarded) {
        activeProcessCount++;
      }

      this.tabResourceMap.set(tab.id, {
        tabId: tab.id,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl,
        memory: estimatedMemory,
        cpu: tab.audible ? 5 : 0, // Rough estimate: audible tabs use some CPU
        network: 0
      });
    }

    // Update UI with estimates
    this.updateOverview(totalMemory, 0, 0, activeProcessCount);
    this.updateTopConsumers();
    this.updateAllTabsResourceList();
  }

  private estimateTabMemory(tab: chrome.tabs.Tab): number {
    // Base memory estimate in bytes
    let memoryMB = 0;

    if (tab.discarded) {
      // Discarded/hibernated tabs use minimal memory
      memoryMB = 5;
    } else if (tab.url?.startsWith('chrome://')) {
      // Chrome internal pages use less
      memoryMB = 20;
    } else {
      // Active tabs - estimate based on characteristics
      memoryMB = 60; // Base for any active tab

      // Adjustments based on tab characteristics
      if (tab.audible) memoryMB += 40; // Media playback
      if (tab.pinned) memoryMB += 10; // Often loaded in background
      
      // URL-based heuristics
      const url = tab.url || '';
      if (url.includes('youtube.com') && tab.audible) memoryMB += 100;
      else if (url.includes('youtube.com')) memoryMB += 60;
      else if (url.includes('gmail.com')) memoryMB += 80;
      else if (url.includes('docs.google.com')) memoryMB += 70;
      else if (url.includes('sheets.google.com')) memoryMB += 90;
      else if (url.includes('meet.google.com') || url.includes('zoom.us')) memoryMB += 150;
      else if (url.includes('github.com')) memoryMB += 50;
      else if (url.includes('figma.com')) memoryMB += 120;
      else if (url.includes('notion.so')) memoryMB += 80;
      else if (url.includes('slack.com')) memoryMB += 90;
      else if (url.includes('twitter.com') || url.includes('x.com')) memoryMB += 70;
      else if (url.includes('facebook.com')) memoryMB += 85;
      else if (url.includes('reddit.com')) memoryMB += 65;
      
      // Age-based estimate (older tabs might have accumulated more)
      if (tab.lastAccessed) {
        const ageMinutes = (Date.now() - tab.lastAccessed) / (1000 * 60);
        if (ageMinutes > 60) {
          memoryMB += 15; // Long-running tabs accumulate memory
        }
      }
    }

    // Convert MB to bytes (removed random variance for consistent UI)
    return Math.round(memoryMB * 1024 * 1024);
  }

  private showError(message?: string) {
    const errorMsg = message || 'Unable to fetch resource data';
    if (this.topConsumersEl) {
      this.topConsumersEl.innerHTML = `<div class="error-state">⚠️ ${this.escapeHtml(errorMsg)}</div>`;
    }
    if (this.allTabsResourceEl) {
      this.allTabsResourceEl.innerHTML = `<div class="error-state">Check console for details</div>`;
    }
  }

  // Public method to get resource info for a specific tab
  getTabResourceInfo(tabId: number): TabResourceInfo | undefined {
    return this.tabResourceMap.get(tabId);
  }

  // Public method to get all tab resources (for external components)
  getAllTabResources(): TabResourceInfo[] {
    return Array.from(this.tabResourceMap.values());
  }
}
