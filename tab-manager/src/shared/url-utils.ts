// URL utilities for duplicate detection and domain grouping

export interface DuplicateGroup {
  url: string;
  domain: string;
  tabs: chrome.tabs.Tab[];
  count: number;
}

// Extract domain from URL
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

// Extract base domain (without subdomains, except for common hosting platforms)
export function extractBaseDomain(url: string): string | null {
  const domain = extractDomain(url);
  if (!domain) return null;
  
  const hostingDomains = ['github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'herokuapp.com'];
  
  // Check if it matches a known hosting domain
  for (const host of hostingDomains) {
      if (domain.endsWith(host)) {
          // Return the full domain for these (e.g. user.github.io)
          // or at least one level deeper
          return domain;
      }
  }

  const parts = domain.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return domain;
}

// Normalize URL for comparison (remove fragments, some params)
export function normalizeUrl(url: string): string {
  if (!url) return '';
  // Optimization: split by hash is much faster than new URL()
  // and covers 99% of use cases for duplicate detection
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    return url.substring(0, hashIndex);
  }
  return url;
}

// Find duplicate tabs by exact URL
export function findDuplicatesByUrl(tabs: chrome.tabs.Tab[]): Map<string, chrome.tabs.Tab[]> {
  const duplicates = new Map<string, chrome.tabs.Tab[]>();
  
  for (const tab of tabs) {
    if (!tab.url) continue;
    const normalizedUrl = normalizeUrl(tab.url);
    
    if (!duplicates.has(normalizedUrl)) {
      duplicates.set(normalizedUrl, []);
    }
    duplicates.get(normalizedUrl)!.push(tab);
  }
  
  // Filter to only include URLs with multiple tabs
  for (const [url, tabList] of duplicates.entries()) {
    if (tabList.length <= 1) {
      duplicates.delete(url);
    }
  }
  
  return duplicates;
}

// Find duplicate tabs by domain
export function findDuplicatesByDomain(tabs: chrome.tabs.Tab[]): Map<string, chrome.tabs.Tab[]> {
  const duplicates = new Map<string, chrome.tabs.Tab[]>();
  
  for (const tab of tabs) {
    if (!tab.url) continue;
    const domain = extractDomain(tab.url);
    if (!domain) continue;
    
    if (!duplicates.has(domain)) {
      duplicates.set(domain, []);
    }
    duplicates.get(domain)!.push(tab);
  }
  
  // Filter to only include domains with multiple tabs
  for (const [domain, tabList] of duplicates.entries()) {
    if (tabList.length <= 1) {
      duplicates.delete(domain);
    }
  }
  
  return duplicates;
}

// Get duplicate groups with metadata
export function getDuplicateGroups(tabs: chrome.tabs.Tab[]): DuplicateGroup[] {
  const duplicateMap = findDuplicatesByUrl(tabs);
  const groups: DuplicateGroup[] = [];
  
  for (const [url, tabList] of duplicateMap.entries()) {
    const domain = extractDomain(url) || 'Unknown';
    groups.push({
      url,
      domain,
      tabs: tabList,
      count: tabList.length
    });
  }
  
  return groups.sort((a, b) => b.count - a.count);
}

// Check if URL is internal Chrome page
export function isChromeInternalUrl(url: string): boolean {
  return url.startsWith('chrome://') || 
         url.startsWith('chrome-extension://') ||
         url.startsWith('edge://') ||
         url.startsWith('about:');
}
