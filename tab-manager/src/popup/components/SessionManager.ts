// Session manager component

import { isChromeInternalUrl } from '../../shared/url-utils.js';
import { confirmDialog, showToast } from '../../shared/dialogs.js';

export interface SessionTab {
  url: string;
  title: string;
  pinned: boolean;
  /** Original chrome tab group id, used only as a key into `SessionWindow.groups`. */
  groupId?: number;
}

export interface SessionGroup {
  title?: string;
  color: chrome.tabGroups.ColorEnum;
}

export interface SessionWindow {
  tabs: SessionTab[];
  groups?: Record<string, SessionGroup>;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  state?: chrome.windows.windowStateEnum;
}

export interface Session {
  id: string;
  name: string;
  timestamp: number;
  windows: SessionWindow[];
}

export class SessionManager {
  private modal: HTMLElement | null;
  private sessionsList: HTMLElement | null;
  private sessionNameInput: HTMLInputElement | null;
  private saveBtn: HTMLButtonElement | null;
  private closeBtn: HTMLButtonElement | null;

  private static readonly MAX_SESSIONS = 50;

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
    const name = this.sessionNameInput?.value.trim() || `Session ${new Date().toLocaleString()}`;
    
    const windows = await chrome.windows.getAll({ populate: true });
    const groupsById = new Map((await chrome.tabGroups.query({})).map(g => [g.id, g]));
    
    const session: Session = {
      id: Date.now().toString(),
      name,
      timestamp: Date.now(),
      windows: windows
        .filter(w => w.type === 'normal')
        .map(window => {
          const groups: Record<string, SessionGroup> = {};

          const tabs: SessionTab[] = (window.tabs || []).map(tab => {
            const grouped =
              tab.groupId !== undefined && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE;

            if (grouped) {
              const group = groupsById.get(tab.groupId);
              if (group) groups[String(tab.groupId)] = { title: group.title, color: group.color };
            }

            return {
              url: tab.url || '',
              title: tab.title || 'Untitled',
              pinned: tab.pinned || false,
              groupId: grouped ? tab.groupId : undefined
            };
          });

          return {
            tabs,
            groups,
            left: window.left,
            top: window.top,
            width: window.width,
            height: window.height,
            state: window.state
          };
        })
    };
    
    // Save to storage (with limit)
    const { sessions = [] } = await chrome.storage.local.get('sessions');
    sessions.push(session);
    
    // Enforce max sessions limit to prevent unbounded storage growth
    while (sessions.length > SessionManager.MAX_SESSIONS) {
      sessions.shift(); // Remove oldest
    }
    
    try {
      await chrome.storage.local.set({ sessions });
    } catch (e) {
      console.error('Failed to save session (storage quota may be exceeded):', e);
      showToast('Storage is full — delete an old session and retry', 'error');
      return;
    }
    
    if (this.sessionNameInput) {
      this.sessionNameInput.value = '';
    }
    
    await this.loadSessions();
    showToast(`Saved session "${name}"`, 'success');
  }

  private async loadSessions() {
    if (!this.sessionsList) return;
    
    const { sessions = [] } = await chrome.storage.local.get('sessions');
    
    this.sessionsList.innerHTML = '';
    
    if (sessions.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'sessions-empty';
      empty.textContent = 'No saved sessions yet.';
      this.sessionsList.appendChild(empty);
      return;
    }
    
    for (const session of [...sessions].reverse()) {
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
    actions.className = 'session-actions';
    
    const restoreBtn = document.createElement('button');
    restoreBtn.textContent = 'Restore';
    restoreBtn.className = 'action-btn session-btn';
    restoreBtn.onclick = async (e) => {
      e.stopPropagation();
      await this.restoreSession(session);
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'action-btn session-btn session-btn-danger';
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog({
        title: 'Delete session?',
        message: `"${session.name}" will be removed permanently.`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (ok) await this.deleteSession(session.id);
    };
    
    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);
    
    item.appendChild(name);
    item.appendChild(meta);
    item.appendChild(actions);
    
    return item;
  }

  private async restoreSession(session: Session) {
    let restoredWindows = 0;

    for (const windowData of session.windows) {
      const validTabs = windowData.tabs.filter(tab => tab.url && !isChromeInternalUrl(tab.url));
      if (validTabs.length === 0) continue;
      
      try {
        const newWindow = await chrome.windows.create(this.buildCreateData(windowData, validTabs[0].url));
        if (!newWindow.id) continue;
        restoredWindows++;

        const createdIds: Array<number | undefined> = [newWindow.tabs?.[0]?.id];
        
        if (validTabs[0].pinned && createdIds[0] !== undefined) {
          await chrome.tabs.update(createdIds[0], { pinned: true });
        }
        
        for (let i = 1; i < validTabs.length; i++) {
          const tabData = validTabs[i];
          try {
            const created = await chrome.tabs.create({
              windowId: newWindow.id,
              url: tabData.url,
              pinned: tabData.pinned
            });
            createdIds.push(created.id);
          } catch (e) {
            console.error(`Failed to restore tab ${tabData.url}:`, e);
            createdIds.push(undefined);
          }
        }

        await this.restoreGroups(newWindow.id, windowData, validTabs, createdIds);
      } catch (e) {
        console.error('Failed to restore window:', e);
      }
    }
    
    this.hideModal();
    showToast(
      restoredWindows > 0
        ? `Restored ${restoredWindows} window(s)`
        : 'Nothing to restore in this session',
      restoredWindows > 0 ? 'success' : 'error'
    );
  }

  // Chrome rejects explicit bounds together with a maximized/fullscreen state.
  private buildCreateData(windowData: SessionWindow, url: string): chrome.windows.CreateData {
    const createData: chrome.windows.CreateData = { url };

    if (windowData.state === 'maximized' || windowData.state === 'fullscreen') {
      createData.state = windowData.state;
    } else if (windowData.width !== undefined && windowData.height !== undefined) {
      createData.left = windowData.left;
      createData.top = windowData.top;
      createData.width = windowData.width;
      createData.height = windowData.height;
    }

    return createData;
  }

  private async restoreGroups(
    windowId: number,
    windowData: SessionWindow,
    tabs: SessionTab[],
    createdIds: Array<number | undefined>
  ) {
    if (!windowData.groups) return;

    const byOriginalGroup = new Map<string, number[]>();
    tabs.forEach((tab, index) => {
      const newId = createdIds[index];
      // Chrome does not allow pinned tabs in a group.
      if (tab.groupId === undefined || newId === undefined || tab.pinned) return;
      const key = String(tab.groupId);
      if (!byOriginalGroup.has(key)) byOriginalGroup.set(key, []);
      byOriginalGroup.get(key)!.push(newId);
    });

    for (const [key, tabIds] of byOriginalGroup) {
      try {
        const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
        const meta = windowData.groups[key];
        if (meta) {
          await chrome.tabGroups.update(groupId, { title: meta.title, color: meta.color });
        }
      } catch (e) {
        console.error('Failed to restore tab group:', e);
      }
    }
  }

  private async deleteSession(sessionId: string) {
    const { sessions = [] } = await chrome.storage.local.get('sessions');
    const filtered = sessions.filter((s: Session) => s.id !== sessionId);
    await chrome.storage.local.set({ sessions: filtered });
    await this.loadSessions();
    showToast('Session deleted', 'success');
  }
}
