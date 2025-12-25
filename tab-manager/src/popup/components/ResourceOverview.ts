/// <reference types="chrome"/>
// Compact Resource Overview Component - Single row with key metrics and link to full page

interface ResourceStats {
  totalMemory: number;
  totalTabs: number;
  heavyTabs: number;
  estimatedGB: number;
}

export class ResourceOverview {
  private container: HTMLElement | null;
  private memoryEl: HTMLElement | null;
  private heavyTabsEl: HTMLElement | null;
  private detailsLink: HTMLElement | null;

  constructor() {
    this.container = document.getElementById('resource-overview');
    this.memoryEl = document.getElementById('overview-memory');
    this.heavyTabsEl = document.getElementById('overview-heavy-tabs');
    this.detailsLink = document.getElementById('view-resource-details');

    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Navigate to full resource monitor page in same popup
    this.detailsLink?.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'resource-monitor.html';
    });
  }

  async update(tabs: chrome.tabs.Tab[]) {
    const stats = await this.calculateStats(tabs);
    this.render(stats);
  }

  private async calculateStats(tabs: chrome.tabs.Tab[]): Promise<ResourceStats> {
    let totalMemory = 0;
    let heavyTabs = 0;

    for (const tab of tabs) {
      const estimate = this.estimateTabMemory(tab);
      totalMemory += estimate;
      
      // Consider a tab "heavy" if it uses more than 200MB
      if (estimate > 200 * 1024 * 1024) {
        heavyTabs++;
      }
    }

    return {
      totalMemory,
      totalTabs: tabs.length,
      heavyTabs,
      estimatedGB: totalMemory / (1024 * 1024 * 1024)
    };
  }

  private estimateTabMemory(tab: chrome.tabs.Tab): number {
    // Base memory estimate
    let memoryBytes = 30 * 1024 * 1024; // 30MB base

    // Discarded tabs use minimal memory
    if (tab.discarded) {
      return 5 * 1024 * 1024; // 5MB
    }

    // URL-based heuristics
    const url = tab.url || '';
    const domain = this.getDomain(url);

    // Heavy websites
    if (domain.includes('youtube.com') || domain.includes('twitch.tv')) {
      memoryBytes += 150 * 1024 * 1024; // +150MB for video sites
    } else if (domain.includes('meet.google.com') || domain.includes('zoom.us')) {
      memoryBytes += 200 * 1024 * 1024; // +200MB for video conferencing
    } else if (domain.includes('gmail.com') || domain.includes('outlook.com')) {
      memoryBytes += 80 * 1024 * 1024; // +80MB for webmail
    } else if (domain.includes('docs.google.com') || domain.includes('sheets.google.com')) {
      memoryBytes += 60 * 1024 * 1024; // +60MB for Google Docs
    } else if (domain.includes('figma.com') || domain.includes('miro.com')) {
      memoryBytes += 120 * 1024 * 1024; // +120MB for design tools
    }

    // Active tab penalty (usually loaded with more resources)
    if (tab.active) {
      memoryBytes += 20 * 1024 * 1024; // +20MB
    }

    // Audible tabs (video/audio playing)
    if (tab.audible) {
      memoryBytes += 50 * 1024 * 1024; // +50MB
    }

    // Age penalty (older tabs accumulate memory)
    if (tab.lastAccessed) {
      const ageHours = (Date.now() - tab.lastAccessed) / (1000 * 60 * 60);
      if (ageHours > 24) {
        memoryBytes += 30 * 1024 * 1024; // +30MB for old tabs
      }
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

  private render(stats: ResourceStats) {
    if (this.memoryEl) {
      const memoryStr = stats.estimatedGB >= 1 
        ? `${stats.estimatedGB.toFixed(1)} GB` 
        : `${(stats.totalMemory / (1024 * 1024)).toFixed(0)} MB`;
      this.memoryEl.textContent = memoryStr;
    }

    if (this.heavyTabsEl) {
      this.heavyTabsEl.textContent = stats.heavyTabs.toString();
      
      // Color code based on severity
      if (stats.heavyTabs > 10) {
        this.heavyTabsEl.style.color = '#e74c3c'; // red
      } else if (stats.heavyTabs > 5) {
        this.heavyTabsEl.style.color = '#f39c12'; // orange
      } else {
        this.heavyTabsEl.style.color = '#27ae60'; // green
      }
    }
  }
}
