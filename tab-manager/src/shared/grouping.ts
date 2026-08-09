// Shared tab-grouping strategies used by the popup, side panel, balancer and service worker.

import { extractBaseDomain, isChromeInternalUrl } from './url-utils.js';

export const MIN_GROUP_SIZE = 2;

const GROUP_COLORS: chrome.tabGroups.ColorEnum[] = [
  'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'
];

// Deterministic so the same label keeps its colour between runs.
export function colorForLabel(label: string): chrome.tabGroups.ColorEnum {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return GROUP_COLORS[hash % GROUP_COLORS.length];
}

function isGroupable(tab: chrome.tabs.Tab): boolean {
  return tab.id !== undefined && !!tab.url && !isChromeInternalUrl(tab.url) && !tab.pinned;
}

function isUngrouped(tab: chrome.tabs.Tab): boolean {
  return tab.groupId === undefined || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE;
}

export function clusterByDomain(tabs: chrome.tabs.Tab[]): Map<string, number[]> {
  const clusters = new Map<string, number[]>();

  for (const tab of tabs) {
    if (!isGroupable(tab)) continue;
    const domain = extractBaseDomain(tab.url!);
    if (!domain) continue;
    if (!clusters.has(domain)) clusters.set(domain, []);
    clusters.get(domain)!.push(tab.id!);
  }

  return clusters;
}

export function tokenize(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

export function calculateSimilarity(words1: string[], words2: string[]): number {
  if (!words1.length || !words2.length) return 0;
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = [...set1].filter(w => set2.has(w)).length;
  const union = new Set([...set1, ...set2]).size;
  return intersection / union;
}

export function generateClusterName(titles: string[]): string {
  if (titles.length === 0) return 'Group';
  const tokenSets = titles.map(t => tokenize(t));
  const common = tokenSets[0].filter(w => tokenSets.slice(1).every(other => other.includes(w)));
  if (common.length === 0) return 'Group';
  // Titles are often "Page — Site"; the first few shared words read best as a label.
  return common.slice(0, 3).join(' ');
}

export function clusterByTitle(tabs: chrome.tabs.Tab[], threshold = 0.6): Map<string, number[]> {
  const clusters = new Map<string, number[]>();
  const claimed = new Set<number>();

  const candidates = tabs.filter(t => isGroupable(t) && !!t.title);
  const sorted = [...candidates].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  const titleById = new Map(sorted.map(t => [t.id!, t.title || '']));

  for (const tab of sorted) {
    if (claimed.has(tab.id!)) continue;

    const seedTokens = tokenize(tab.title!);
    const cluster = [tab.id!];

    for (const other of sorted) {
      if (other.id === tab.id || claimed.has(other.id!)) continue;
      if (calculateSimilarity(seedTokens, tokenize(other.title!)) > threshold) {
        cluster.push(other.id!);
        claimed.add(other.id!);
      }
    }

    if (cluster.length < MIN_GROUP_SIZE) continue;
    claimed.add(tab.id!);

    const base = generateClusterName(cluster.map(id => titleById.get(id) || ''));
    // Distinct clusters can generate the same label; keep them as separate groups.
    let name = base;
    let suffix = 2;
    while (clusters.has(name)) {
      name = `${base} ${suffix++}`;
    }
    clusters.set(name, cluster);
  }

  return clusters;
}

// Adds tabs to an existing group of the same title in that window, or creates a new one.
export async function applyCluster(windowId: number, label: string, tabIds: number[]): Promise<void> {
  if (tabIds.length < MIN_GROUP_SIZE) return;

  try {
    const existing = await chrome.tabGroups.query({ windowId, title: label });
    if (existing.length > 0) {
      await chrome.tabs.group({ tabIds, groupId: existing[0].id });
      return;
    }

    const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, {
      title: label,
      color: colorForLabel(label),
      collapsed: false
    });
  } catch (e) {
    console.error(`Failed to group "${label}":`, e);
  }
}

async function normalWindows(): Promise<chrome.windows.Window[]> {
  const windows = await chrome.windows.getAll({ populate: true });
  return windows.filter(w => w.type === 'normal' && w.id !== undefined && !!w.tabs);
}

export async function groupWindowByDomain(windowId: number, tabs: chrome.tabs.Tab[]): Promise<void> {
  for (const [domain, tabIds] of clusterByDomain(tabs.filter(isUngrouped))) {
    await applyCluster(windowId, domain, tabIds);
  }
}

export async function groupAllByDomain(): Promise<void> {
  for (const win of await normalWindows()) {
    await groupWindowByDomain(win.id!, win.tabs!);
  }
}

// Domain is the strongest signal; title clustering then catches what is left over.
export async function groupAllBySimilarity(): Promise<void> {
  for (const win of await normalWindows()) {
    await groupWindowByDomain(win.id!, win.tabs!);

    const refreshed = await chrome.tabs.query({ windowId: win.id });
    const remaining = refreshed.filter(isUngrouped);
    if (remaining.length < MIN_GROUP_SIZE) continue;

    for (const [label, tabIds] of clusterByTitle(remaining)) {
      await applyCluster(win.id!, label, tabIds);
    }
  }
}

export async function ungroupAll(): Promise<void> {
  for (const win of await normalWindows()) {
    const tabIds = win.tabs!
      .filter(t => t.id !== undefined && !isUngrouped(t))
      .map(t => t.id as number);

    if (tabIds.length === 0) continue;
    try {
      await chrome.tabs.ungroup(tabIds);
    } catch (e) {
      console.error(`Ungroup failed for window ${win.id}:`, e);
    }
  }
}
