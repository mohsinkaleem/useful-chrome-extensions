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
      if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url || 
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
    this.debounceTimer = setTimeout(() => {
      this.notifyListeners();
    }, this.debounceDelay);
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

// Centralized memory estimation - use this instead of duplicating logic
export function estimateTabMemory(tab: chrome.tabs.Tab): number {
  // Base memory estimate in bytes
  let memoryBytes = 30 * 1024 * 1024; // 30MB base

  // Discarded tabs use minimal memory
  if (tab.discarded) {
    return 5 * 1024 * 1024; // 5MB
  }

  const url = tab.url || '';
  const domain = getTabDomain(tab as TabInfo) || '';

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
  } else if (domain.includes('slack.com') || domain.includes('notion.so')) {
    memoryBytes += 85 * 1024 * 1024; // +85MB for productivity apps
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
