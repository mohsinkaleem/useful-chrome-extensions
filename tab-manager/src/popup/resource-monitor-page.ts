/// <reference types="chrome"/>
// Resource Monitor Page Script - Standalone page for detailed resource monitoring

import { ResourceMonitor } from './components/ResourceMonitor.js';

class ResourceMonitorPage {
  private resourceMonitor: ResourceMonitor;

  constructor() {
    this.resourceMonitor = new ResourceMonitor();
    this.init();
  }

  private init() {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Back button
    const backBtn = document.getElementById('back-to-popup');
    backBtn?.addEventListener('click', () => {
      window.location.href = 'popup.html';
    });

    // Hibernate heavy tabs (>200MB)
    const hibernateBtn = document.getElementById('action-hibernate-heavy');
    hibernateBtn?.addEventListener('click', async () => {
      await this.hibernateHeavyTabs();
    });

    // Reload heavy tabs
    const reloadBtn = document.getElementById('action-reload-heavy');
    reloadBtn?.addEventListener('click', async () => {
      await this.reloadHeavyTabs();
    });

    // Refresh monitor
    const refreshBtn = document.getElementById('action-refresh-monitor');
    refreshBtn?.addEventListener('click', () => {
      // Force refresh
      this.resourceMonitor.stopMonitoring();
      this.resourceMonitor = new ResourceMonitor();
    });
  }

  private async hibernateHeavyTabs() {
    const tabs = await chrome.tabs.query({});
    const toDiscard: number[] = [];

    for (const tab of tabs) {
      if (!tab.id || tab.active || tab.pinned || tab.audible) continue;
      
      const estimate = this.estimateTabMemory(tab);
      if (estimate > 200 * 1024 * 1024) { // >200MB
        toDiscard.push(tab.id);
      }
    }

    if (toDiscard.length > 0) {
      for (const tabId of toDiscard) {
        await chrome.tabs.discard(tabId);
      }
      alert(`Hibernated ${toDiscard.length} heavy tabs`);
    } else {
      alert('No heavy tabs to hibernate');
    }
  }

  private async reloadHeavyTabs() {
    const tabs = await chrome.tabs.query({});
    const toReload: number[] = [];

    for (const tab of tabs) {
      if (!tab.id) continue;
      
      const estimate = this.estimateTabMemory(tab);
      if (estimate > 200 * 1024 * 1024) { // >200MB
        toReload.push(tab.id);
      }
    }

    if (toReload.length > 0) {
      for (const tabId of toReload) {
        await chrome.tabs.reload(tabId);
      }
      alert(`Reloaded ${toReload.length} heavy tabs`);
    } else {
      alert('No heavy tabs found');
    }
  }

  private estimateTabMemory(tab: chrome.tabs.Tab): number {
    let memoryBytes = 30 * 1024 * 1024; // 30MB base

    if (tab.discarded) return 5 * 1024 * 1024;

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
}

// Initialize page
new ResourceMonitorPage();
