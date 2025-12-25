// Core tab and window data types and utilities

export interface TabInfo extends chrome.tabs.Tab {
  windowTitle?: string;
  isActive?: boolean;
  isDuplicate?: boolean;
  duplicateCount?: number;
}

export interface WindowInfo extends chrome.windows.Window {
  tabCount?: number;
}

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

// Tab event listeners
export class TabEventManager {
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    chrome.tabs.onCreated.addListener(() => this.notifyListeners());
    chrome.tabs.onUpdated.addListener(() => this.notifyListeners());
    chrome.tabs.onRemoved.addListener(() => this.notifyListeners());
    chrome.tabs.onMoved.addListener(() => this.notifyListeners());
    chrome.tabs.onAttached.addListener(() => this.notifyListeners());
    chrome.tabs.onDetached.addListener(() => this.notifyListeners());
    chrome.tabs.onActivated.addListener(() => this.notifyListeners());
  }

  onChange(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
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
