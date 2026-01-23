// Core tab and window data types and utilities

export interface TabInfo extends chrome.tabs.Tab {
  windowTitle?: string;
}

export interface WindowInfo extends chrome.windows.Window {}

export interface TabGroup {
  id: number;
  tabs: TabInfo[];
  windowId: number;
}

// Get all tabs across all windows
export async function getAllTabs(): Promise<TabInfo[]> {
  return await chrome.tabs.query({});
}

// Get all windows with populated tabs
export async function getAllWindows(): Promise<WindowInfo[]> {
  return await chrome.windows.getAll({ populate: true });
}

// Get tabs grouped by window
export async function getTabsByWindow(): Promise<Map<number, TabInfo[]>> {
  const windows = await getAllWindows();
  const tabsByWindow = new Map<number, TabInfo[]>();
  
  for (const window of windows) {
    if (window.id && window.tabs) {
      tabsByWindow.set(window.id, window.tabs as TabInfo[]);
    }
  }
  
  return tabsByWindow;
}

// Get currently active tab
export async function getActiveTab(): Promise<TabInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

// Tab event listeners with debouncing
export class TabEventManager {
  private listeners: Set<() => void> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceDelay: number = 150; // ms

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    // Debounced handlers for high-frequency events
    chrome.tabs.onCreated.addListener(() => this.debouncedNotify());
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      // Only notify on meaningful changes (not every favicon/loading state update)
      // Removed 'status' check to prevent re-render on loading completion
      if (changeInfo.title || changeInfo.url || 
          changeInfo.audible !== undefined || changeInfo.pinned !== undefined ||
          changeInfo.discarded !== undefined) {
        this.debouncedNotify();
      }
    });
    chrome.tabs.onRemoved.addListener(() => this.debouncedNotify());
    chrome.tabs.onMoved.addListener(() => this.debouncedNotify());
    chrome.tabs.onAttached.addListener(() => this.debouncedNotify());
    chrome.tabs.onDetached.addListener(() => this.debouncedNotify());
    chrome.tabs.onActivated.addListener(() => this.debouncedNotify());
  }

  onChange(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private debouncedNotify() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    // Increased debounce to 300ms to batch more updates for large tab counts
    this.debounceTimer = setTimeout(() => {
      this.notifyListeners();
    }, 300);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }
}

// Utility functions
export function sortTabsByLastAccessed(tabs: TabInfo[]): TabInfo[] {
  return [...tabs].sort((a, b) => {
    const timeA = a.lastAccessed || 0;
    const timeB = b.lastAccessed || 0;
    return timeB - timeA;
  });
}

export function getTabDomain(tab: TabInfo): string | null {
  if (!tab.url) return null;
  try {
    const url = new URL(tab.url);
    return url.hostname;
  } catch {
    return null;
  }
}

export function isTabDiscarded(tab: TabInfo): boolean {
  return tab.discarded || false;
}

export function isTabAudible(tab: TabInfo): boolean {
  return tab.audible || false;
}
