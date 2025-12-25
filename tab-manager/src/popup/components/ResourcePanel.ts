// Resource management panel component

export class ResourcePanel {
  private discardedCount: HTMLElement | null;
  private activeCount: HTMLElement | null;
  private pinnedCount: HTMLElement | null;
  private duplicateCount: HTMLElement | null;
  private resourceBadge: HTMLElement | null;
  private hibernateBtn: HTMLButtonElement | null;
  private panel: HTMLElement | null;

  constructor() {
    this.discardedCount = document.getElementById('discarded-count');
    this.activeCount = document.getElementById('active-count');
    this.pinnedCount = document.getElementById('pinned-count');
    this.duplicateCount = document.getElementById('duplicate-count');
    this.resourceBadge = document.getElementById('resource-badge');
    this.hibernateBtn = document.getElementById('action-hibernate-inactive') as HTMLButtonElement;
    this.panel = document.getElementById('resource-panel');
    
    this.setupListeners();
  }

  private setupListeners() {
    this.hibernateBtn?.addEventListener('click', async () => {
      await this.hibernateInactiveTabs();
    });
  }

  update(tabs: chrome.tabs.Tab[], duplicateUrlCount: number = 0) {
    const discarded = tabs.filter(tab => tab.discarded).length;
    const active = tabs.filter(tab => !tab.discarded).length;
    const pinned = tabs.filter(tab => tab.pinned).length;
    
    if (this.discardedCount) {
      this.discardedCount.textContent = discarded.toString();
    }
    if (this.activeCount) {
      this.activeCount.textContent = active.toString();
    }
    if (this.pinnedCount) {
      this.pinnedCount.textContent = pinned.toString();
    }
    if (this.duplicateCount) {
      this.duplicateCount.textContent = duplicateUrlCount.toString();
    }
    if (this.resourceBadge) {
      // Show active/total in badge
      this.resourceBadge.textContent = `${active}/${tabs.length}`;
    }
  }

  private async hibernateInactiveTabs() {
    // Get tabs that haven't been accessed recently (e.g., in last hour)
    const tabs = await chrome.tabs.query({});
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    const toDiscard = tabs.filter(tab => 
      !tab.active && 
      !tab.pinned && 
      !tab.audible &&
      !tab.discarded &&
      (tab.lastAccessed || 0) < oneHourAgo &&
      tab.id
    );
    
    let discardedCount = 0;
    for (const tab of toDiscard) {
      if (tab.id) {
        try {
          await chrome.tabs.discard(tab.id);
          discardedCount++;
        } catch (e) {
          console.error('Failed to discard tab:', e);
        }
      }
    }
    
    // Provide feedback
    if (this.hibernateBtn) {
      const originalText = this.hibernateBtn.textContent;
      this.hibernateBtn.textContent = `✓ Hibernated ${discardedCount}`;
      setTimeout(() => {
        if (this.hibernateBtn) {
          this.hibernateBtn.textContent = originalText;
        }
      }, 2000);
    }
  }
}
