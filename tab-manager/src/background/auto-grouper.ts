// Auto-grouping engine

export interface GroupingRule {
  id: string;
  name: string;
  enabled: boolean;
  type: 'domain' | 'pattern' | 'keyword';
  matcher: string; // domain name, URL pattern, or keyword
  groupName?: string;
  color?: chrome.tabGroups.ColorEnum;
}

export class AutoGrouper {
  private rules: GroupingRule[] = [];
  private enabled: boolean = false;
  private initialized: Promise<void>;

  constructor() {
    this.initialized = this.init();
  }

  private async init() {
    await Promise.all([
      this.loadRules(),
      this.loadEnabledState()
    ]);
  }

  private async loadEnabledState() {
    const { autoGroupingEnabled = false } = await chrome.storage.sync.get('autoGroupingEnabled');
    this.enabled = autoGroupingEnabled;
  }

  async setEnabled(enabled: boolean) {
    this.enabled = enabled;
    await chrome.storage.sync.set({ autoGroupingEnabled: enabled });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async loadRules() {
    const { groupingRules = [] } = await chrome.storage.sync.get('groupingRules');
    this.rules = groupingRules;
    
    // If no rules, create default ones
    if (this.rules.length === 0) {
      this.rules = this.createDefaultRules();
      await this.saveRules();
    }
  }

  private async saveRules() {
    await chrome.storage.sync.set({ groupingRules: this.rules });
  }

  private createDefaultRules(): GroupingRule[] {
    return [
      {
        id: '1',
        name: 'Group YouTube',
        enabled: true,
        type: 'domain',
        matcher: 'youtube.com',
        groupName: 'YouTube',
        color: 'red'
      },
      {
        id: '2',
        name: 'Group GitHub',
        enabled: true,
        type: 'domain',
        matcher: 'github.com',
        groupName: 'GitHub',
        color: 'grey'
      },
      {
        id: '3',
        name: 'Group Google Docs',
        enabled: true,
        type: 'domain',
        matcher: 'docs.google.com',
        groupName: 'Google Docs',
        color: 'blue'
      },
      {
        id: '4',
        name: 'Group Gmail',
        enabled: true,
        type: 'domain',
        matcher: 'mail.google.com',
        groupName: 'Gmail',
        color: 'yellow'
      }
    ];
  }

  async onTabCreated(tab: chrome.tabs.Tab) {
    await this.initialized; // Wait for rules to be loaded
    await this.applyRules(tab);
  }

  async onTabUpdated(tab: chrome.tabs.Tab) {
    await this.initialized; // Wait for rules to be loaded
    await this.applyRules(tab);
  }

  private async applyRules(tab: chrome.tabs.Tab) {
    // Only apply rules if auto-grouping is enabled
    if (!this.enabled) return;
    
    if (!tab.id || !tab.url) return;
    
    // Don't group if already in a group
    if (tab.groupId && tab.groupId !== -1) return;
    
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      
      if (this.matchesRule(tab, rule)) {
        await this.groupTab(tab, rule);
        break; // Only apply first matching rule
      }
    }
  }

  private matchesRule(tab: chrome.tabs.Tab, rule: GroupingRule): boolean {
    if (!tab.url) return false;
    
    try {
      const url = new URL(tab.url);
      
      switch (rule.type) {
        case 'domain':
          return url.hostname.includes(rule.matcher);
        
        case 'pattern':
          const regex = new RegExp(rule.matcher);
          return regex.test(tab.url);
        
        case 'keyword':
          return tab.title?.toLowerCase().includes(rule.matcher.toLowerCase()) || false;
        
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  private async groupTab(tab: chrome.tabs.Tab, rule: GroupingRule) {
    if (!tab.id) return;
    
    try {
      // Check if a group with this name already exists in the window
      const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
      const existingGroup = groups.find(g => g.title === rule.groupName);
      
      if (existingGroup && existingGroup.id) {
        // Add to existing group
        await chrome.tabs.group({
          tabIds: [tab.id],
          groupId: existingGroup.id
        });
      } else {
        // Create new group
        const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
        await chrome.tabGroups.update(groupId, {
          title: rule.groupName || rule.matcher,
          color: rule.color || 'grey',
          collapsed: false
        });
      }
    } catch (error) {
      console.error('Failed to group tab:', error);
    }
  }

  // Public API for managing rules
  async addRule(rule: GroupingRule) {
    this.rules.push(rule);
    await this.saveRules();
  }

  async updateRule(ruleId: string, updates: Partial<GroupingRule>) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.rules[index] = { ...this.rules[index], ...updates };
      await this.saveRules();
    }
  }

  async deleteRule(ruleId: string) {
    this.rules = this.rules.filter(r => r.id !== ruleId);
    await this.saveRules();
  }

  async getRules(): Promise<GroupingRule[]> {
    await this.loadRules();
    return this.rules;
  }

  // Manual grouping by domain for all tabs
  async groupAllByDomain() {
    await this.groupAllByStrategy('domain');
  }

  async groupAllBySimilarity() {
    await this.groupAllByStrategy('similarity');
  }

  private async groupAllByStrategy(strategy: 'domain' | 'similarity') {
    const windows = await chrome.windows.getAll({ populate: true });
    
    for (const win of windows) {
        if (!win.tabs || win.tabs.length < 2) continue;
        
        const ungroupedTabs = win.tabs.filter(t => t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
        if (ungroupedTabs.length < 2) continue;

        if (strategy === 'domain') {
            await this.groupByDomainInWindow(ungroupedTabs);
        } else {
            await this.groupBySimilarityInWindow(ungroupedTabs);
        }
    }
  }

  private async groupByDomainInWindow(tabs: chrome.tabs.Tab[]) {
      const domainGroups = new Map<string, number[]>();
      
      for (const tab of tabs) {
          if (!tab.url || !tab.id) continue;
          try {
              const url = new URL(tab.url);
              // Use base domain? e.g. docs.google.com -> google.com logic could be better but let's stick to hostname
              const domain = url.hostname.replace(/^www\./, '');
              if (!domainGroups.has(domain)) {
                  domainGroups.set(domain, []);
              }
              domainGroups.get(domain)?.push(tab.id);
          } catch {}
      }

      for (const [domain, ids] of domainGroups.entries()) {
          if (ids.length >= 2) {
             const groupId = await chrome.tabs.group({ tabIds: ids });
             await chrome.tabGroups.update(groupId, { title: domain });
          }
      }
  }

  private async groupBySimilarityInWindow(tabs: chrome.tabs.Tab[]) {
      // 1. Group by Exact Domain first (strongest signal)
      // We will remove grouped tabs from further consideration
      await this.groupByDomainInWindow(tabs);
      
      // Re-fetch tabs to see what's left ungrouped? 
      // Or just assume `groupByDomainInWindow` handles the obvious ones.
      // Let's look for Title clusters in the remaining ungrouped tabs.
      // But we need "live" status. 
      // Simplified: Just run title clustering on remaining tabs.
      
      const win = await chrome.windows.get(tabs[0].windowId, { populate: true });
      const remainingTabs = win.tabs?.filter(t => t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
      
      if (!remainingTabs || remainingTabs.length < 2) return;

      const clusters = this.findTitleClusters(remainingTabs);
      
      for (const [name, ids] of clusters.entries()) {
          if (ids.length >= 2) {
              const groupId = await chrome.tabs.group({ tabIds: ids });
              await chrome.tabGroups.update(groupId, { title: name, color: 'blue' });
          }
      }
  }

  private findTitleClusters(tabs: chrome.tabs.Tab[]): Map<string, number[]> {
      const clusters = new Map<string, number[]>();
      const processedIds = new Set<number>();
      
      // Simple algorithm: Look for common prefixes >= 10 chars or 3 words
      // sorting by title helps finding neighbors
      const sortedTabs = [...tabs].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      
      for (let i = 0; i < sortedTabs.length; i++) {
          const tab = sortedTabs[i];
          if (!tab.id || !tab.title || processedIds.has(tab.id)) continue;
          
          const currentCluster = [tab.id];
          const titleWords = this.tokenize(tab.title);
          
          for (let j = i + 1; j < sortedTabs.length; j++) {
              const other = sortedTabs[j];
              if (!other.id || !other.title || processedIds.has(other.id)) continue;

              if (this.calculateSimilarity(titleWords, this.tokenize(other.title)) > 0.6) {
                   currentCluster.push(other.id);
                   processedIds.add(other.id);
              }
          }
          
          if (currentCluster.length >= 2) {
              processedIds.add(tab.id);
              // Generate name from common words
              const name = this.generateClusterName(currentCluster.map(id => sortedTabs.find(t => t.id === id)?.title || ''));
              clusters.set(name, currentCluster);
          }
      }
      return clusters;
  }
  
  private tokenize(str: string): string[] {
      return str.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  }
  
  private calculateSimilarity(words1: string[], words2: string[]): number {
      if (!words1.length || !words2.length) return 0;
      const set1 = new Set(words1);
      const set2 = new Set(words2);
      const intersection = [...set1].filter(x => set2.has(x)).length;
      const union = new Set([...words1, ...words2]).size;
      return intersection / union;
  }

  private generateClusterName(titles: string[]): string {
      // Find common words
      if (titles.length === 0) return 'Group';
      const words = titles.map(t => this.tokenize(t));
      const common = words[0].filter(w => words.slice(1).every(wa => wa.includes(w)));
      if (common.length > 0) return common.join(' ');
      return 'Group'; // Fallback
  }
}
