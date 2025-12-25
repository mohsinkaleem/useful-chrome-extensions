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

  constructor() {
    this.loadRules();
    this.loadEnabledState();
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
    await this.applyRules(tab);
  }

  async onTabUpdated(tab: chrome.tabs.Tab) {
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
    const tabs = await chrome.tabs.query({});
    const domainGroups = new Map<string, chrome.tabs.Tab[]>();
    
    // Group tabs by domain
    for (const tab of tabs) {
      if (!tab.url) continue;
      try {
        const domain = new URL(tab.url).hostname;
        if (!domainGroups.has(domain)) {
          domainGroups.set(domain, []);
        }
        domainGroups.get(domain)!.push(tab);
      } catch {
        continue;
      }
    }
    
    // Create groups for domains with multiple tabs
    for (const [domain, domainTabs] of domainGroups.entries()) {
      if (domainTabs.length > 1) {
        const ids = domainTabs.map(t => t.id).filter(Boolean) as number[];
        const windowId = domainTabs[0].windowId;
        
        // Only group tabs in the same window
        const windowTabs = ids.filter(id => {
          const tab = domainTabs.find(t => t.id === id);
          return tab?.windowId === windowId;
        });
        
        if (windowTabs.length > 1) {
          try {
            const groupId = await chrome.tabs.group({ tabIds: windowTabs });
            await chrome.tabGroups.update(groupId, {
              title: domain,
              collapsed: false
            });
          } catch (error) {
            console.error(`Failed to group ${domain}:`, error);
          }
        }
      }
    }
  }
}
