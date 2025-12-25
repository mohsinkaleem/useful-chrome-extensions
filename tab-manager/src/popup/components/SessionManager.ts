// Session manager component

export interface Session {
  id: string;
  name: string;
  timestamp: number;
  windows: Array<{
    tabs: Array<{
      url: string;
      title: string;
      pinned: boolean;
    }>;
  }>;
}

export class SessionManager {
  private modal: HTMLElement | null;
  private sessionsList: HTMLElement | null;
  private sessionNameInput: HTMLInputElement | null;
  private saveBtn: HTMLButtonElement | null;
  private closeBtn: HTMLButtonElement | null;

  constructor() {
    this.modal = document.getElementById('session-modal');
    this.sessionsList = document.getElementById('sessions-list');
    this.sessionNameInput = document.getElementById('session-name') as HTMLInputElement;
    this.saveBtn = document.getElementById('save-session-btn') as HTMLButtonElement;
    this.closeBtn = document.getElementById('close-modal-btn') as HTMLButtonElement;
    
    this.setupListeners();
  }

  private setupListeners() {
    this.saveBtn?.addEventListener('click', async () => {
      await this.saveCurrentSession();
    });

    this.closeBtn?.addEventListener('click', () => {
      this.hideModal();
    });

    // Close on outside click
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hideModal();
      }
    });
  }

  async showModal() {
    if (!this.modal) return;
    
    this.modal.classList.remove('hidden');
    await this.loadSessions();
  }

  hideModal() {
    if (!this.modal) return;
    this.modal.classList.add('hidden');
  }

  private async saveCurrentSession() {
    const name = this.sessionNameInput?.value || `Session ${new Date().toLocaleString()}`;
    
    // Get all windows and tabs
    const windows = await chrome.windows.getAll({ populate: true });
    
    const session: Session = {
      id: Date.now().toString(),
      name,
      timestamp: Date.now(),
      windows: windows.map(window => ({
        tabs: (window.tabs || []).map(tab => ({
          url: tab.url || '',
          title: tab.title || 'Untitled',
          pinned: tab.pinned || false
        }))
      }))
    };
    
    // Save to storage
    const { sessions = [] } = await chrome.storage.local.get('sessions');
    sessions.push(session);
    await chrome.storage.local.set({ sessions });
    
    // Clear input
    if (this.sessionNameInput) {
      this.sessionNameInput.value = '';
    }
    
    // Reload list
    await this.loadSessions();
  }

  private async loadSessions() {
    if (!this.sessionsList) return;
    
    const { sessions = [] } = await chrome.storage.local.get('sessions');
    
    this.sessionsList.innerHTML = '';
    
    if (sessions.length === 0) {
      this.sessionsList.innerHTML = '<p style="color: #666;">No saved sessions</p>';
      return;
    }
    
    for (const session of sessions.reverse()) {
      const item = this.createSessionItem(session);
      this.sessionsList.appendChild(item);
    }
  }

  private createSessionItem(session: Session): HTMLElement {
    const item = document.createElement('div');
    item.className = 'session-item';
    
    const name = document.createElement('div');
    name.className = 'session-name';
    name.textContent = session.name;
    
    const meta = document.createElement('div');
    meta.className = 'session-meta';
    const tabCount = session.windows.reduce((sum, w) => sum + w.tabs.length, 0);
    meta.textContent = `${session.windows.length} windows, ${tabCount} tabs - ${new Date(session.timestamp).toLocaleString()}`;
    
    const actions = document.createElement('div');
    actions.style.marginTop = '8px';
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    
    const restoreBtn = document.createElement('button');
    restoreBtn.textContent = 'Restore';
    restoreBtn.className = 'action-btn';
    restoreBtn.style.fontSize = '12px';
    restoreBtn.style.padding = '4px 8px';
    restoreBtn.onclick = async (e) => {
      e.stopPropagation();
      await this.restoreSession(session);
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'action-btn';
    deleteBtn.style.fontSize = '12px';
    deleteBtn.style.padding = '4px 8px';
    deleteBtn.style.background = '#d32f2f';
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      await this.deleteSession(session.id);
    };
    
    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);
    
    item.appendChild(name);
    item.appendChild(meta);
    item.appendChild(actions);
    
    return item;
  }

  private async restoreSession(session: Session) {
    // Create windows with tabs and restore pinned state
    for (const windowData of session.windows) {
      const validTabs = windowData.tabs.filter(tab => tab.url);
      if (validTabs.length === 0) continue;
      
      // Create window with first tab
      const newWindow = await chrome.windows.create({ url: validTabs[0].url });
      if (!newWindow.id) continue;
      
      // Pin first tab if it was pinned
      if (validTabs[0].pinned && newWindow.tabs?.[0]?.id) {
        await chrome.tabs.update(newWindow.tabs[0].id, { pinned: true });
      }
      
      // Create remaining tabs
      for (let i = 1; i < validTabs.length; i++) {
        const tabData = validTabs[i];
        const newTab = await chrome.tabs.create({
          windowId: newWindow.id,
          url: tabData.url,
          pinned: tabData.pinned
        });
      }
    }
    
    this.hideModal();
  }

  private async deleteSession(sessionId: string) {
    const { sessions = [] } = await chrome.storage.local.get('sessions');
    const filtered = sessions.filter((s: Session) => s.id !== sessionId);
    await chrome.storage.local.set({ sessions: filtered });
    await this.loadSessions();
  }
}
