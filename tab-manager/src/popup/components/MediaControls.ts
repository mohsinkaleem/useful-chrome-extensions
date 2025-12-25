// Media controls component

export class MediaControls {
  private section: HTMLElement | null;
  private list: HTMLElement | null;
  private badge: HTMLElement | null;

  constructor() {
    this.section = document.getElementById('media-section');
    this.list = document.getElementById('media-tabs');
    this.badge = document.getElementById('media-badge');
  }

  update(tabs: chrome.tabs.Tab[]) {
    const mediaTabs = tabs.filter(tab => tab.audible);
    
    if (!this.section || !this.list) return;
    
    // Update badge count
    if (this.badge) {
      this.badge.textContent = mediaTabs.length.toString();
    }
    
    if (mediaTabs.length === 0) {
      this.section.classList.add('hidden');
      return;
    }
    
    this.section.classList.remove('hidden');
    this.list.innerHTML = '';
    
    for (const tab of mediaTabs) {
      const item = this.createMediaTabItem(tab);
      this.list.appendChild(item);
    }
  }

  private createMediaTabItem(tab: chrome.tabs.Tab): HTMLElement {
    const item = document.createElement('div');
    item.className = 'media-tab-item';
    
    const title = document.createElement('div');
    title.className = 'media-tab-title';
    title.textContent = tab.title || 'Untitled';
    
    const controls = document.createElement('div');
    controls.className = 'media-controls';
    
    // Mute/Unmute button
    const muteBtn = document.createElement('button');
    muteBtn.className = 'media-btn';
    muteBtn.textContent = tab.mutedInfo?.muted ? '🔊' : '🔇';
    muteBtn.title = tab.mutedInfo?.muted ? 'Unmute' : 'Mute';
    muteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (tab.id) {
        await chrome.tabs.update(tab.id, { 
          muted: !tab.mutedInfo?.muted 
        });
      }
    };
    
    // Go to tab button
    const goToBtn = document.createElement('button');
    goToBtn.className = 'media-btn';
    goToBtn.textContent = '→';
    goToBtn.title = 'Go to tab';
    goToBtn.onclick = async (e) => {
      e.stopPropagation();
      if (tab.id) {
        await chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
      }
    };
    
    controls.appendChild(muteBtn);
    controls.appendChild(goToBtn);
    
    item.appendChild(title);
    item.appendChild(controls);
    
    return item;
  }
}
