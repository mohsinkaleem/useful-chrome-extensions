/// <reference types="chrome"/>
// Resource Monitor Page Script - Standalone page for detailed resource monitoring

import { ResourceMonitor } from './components/ResourceMonitor.js';
import { estimateTabMemory } from '../shared/tab-utils.js';

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
      
      const estimate = estimateTabMemory(tab);
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
      
      const estimate = estimateTabMemory(tab);
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
}

// Initialize page
new ResourceMonitorPage();
