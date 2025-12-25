/// <reference types="chrome"/>
// Compact Resource Overview Component - Single row with key metrics and link to full page

import { estimateTabMemory } from '../../shared/tab-utils.js';

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
      const estimate = estimateTabMemory(tab);
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
