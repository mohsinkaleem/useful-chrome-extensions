
import { getAllWindows, WindowInfo, TabInfo } from './tab-utils';
import { extractDomain, extractBaseDomain } from './url-utils';

interface BalancingConfig {
  maxTabs: number;
  minTabs: number;
  respectGrouping: boolean;
  autoGroup: boolean;
}

interface MoveOperation {
  tabIds: number[];
  targetWindowId: number | 'new';
  groupId?: number; // If these tabs belonged to a group, we might want to preserve it
}

interface WindowState {
  id: number;
  tabs: TabInfo[];
  tabCount: number;
  primaryDomain: string | null;
}

interface MoveableUnit {
  tabIds: number[];
  tabs: TabInfo[];
  domain: string | null;
  groupId: number | -1;
  size: number;
}

export class TabBalancer {
  private config: BalancingConfig;

  constructor(config: Partial<BalancingConfig> = {}) {
    this.config = {
      maxTabs: 30,
      minTabs: 10,
      respectGrouping: true,
      autoGroup: false,
      ...config
    };
  }

  async balanceWindows() {
    const windows = await getAllWindows();
    const normalWindows = windows.filter(w => w.type === 'normal' && w.id !== undefined);
    
    // Build Simulation State
    const simWindows = this.buildState(normalWindows);
    const moves: MoveOperation[] = [];

    // Track windows that are decided to be emptied/closed
    const doomedWindows = new Set<number>();

    // 1. Relieve Overloaded Windows
    for (const win of simWindows) {
      if (win.tabCount > this.config.maxTabs) {
        this.planRelief(win, simWindows, moves, doomedWindows);
      }
    }

    // 2. Fill Underloaded Windows & Consolidate Small Windows
    // Sort logic removed, we iterate simWindows and check threshold inside to allow updates    
    for (const win of simWindows) {
      if (doomedWindows.has(win.id)) continue;
      
      if (win.tabCount < this.config.minTabs && win.tabCount > 0) { 
          this.planConsolidation(win, simWindows, moves, doomedWindows);
      }
    }

    // 3. Execute Moves
    await this.executeMoves(moves);

    // 4. Auto Group if requested
    if (this.config.autoGroup) {
       await this.autoGroupTabs();
    }
  }

  private buildState(windows: WindowInfo[]): WindowState[] {
    return windows.map(w => {
      const tabs = (w.tabs || []) as TabInfo[];
      return {
        id: w.id!,
        tabs: tabs,
        tabCount: tabs.length,
        primaryDomain: this.getDominantDomain(tabs)
      };
    });
  }

  private getDominantDomain(tabs: TabInfo[]): string | null {
    const counts = new Map<string, number>();
    for (const t of tabs) {
      if (!t.url) continue;
      const d = extractBaseDomain(t.url); // Use base domain for better grouping (google.com includes mail.google.com)
      if (d) counts.set(d, (counts.get(d) || 0) + 1);
    }
    
    let bestDomain = null;
    let max = 0;
    for (const [domain, count] of counts.entries()) {
      if (count > max) {
        max = count;
        bestDomain = domain;
      }
    }
    return bestDomain;
  }

  private planRelief(source: WindowState, allWindows: WindowState[], moves: MoveOperation[], doomedWindows: Set<number>) {
    // Strategy: Move least frequent domains first (outliers).
    // Exception Policy: If the window is dominated by a single domain (> 50 tabs of same domain),
    // we do not split that domain, even if it exceeds the limit.
    
    const units = this.getMoveableUnits(source);
    
    const dominantUnits: MoveableUnit[] = [];
    const otherUnits: MoveableUnit[] = [];

    for (const unit of units) {
      const unitDomain = unit.domain; 
      
      if (source.primaryDomain && unitDomain === source.primaryDomain) {
        dominantUnits.push(unit);
      } else {
        otherUnits.push(unit);
      }
    }

    // Sort other units by size (ascending) to move small "outliers" first
    otherUnits.sort((a, b) => a.size - b.size);

    // Candidates are ONLY the non-dominant domains initially
    // If we clear all outliers and still exceed maxTabs (e.g. 80 Youtube tabs), 
    // the Exception Policy says we leave them alone. So we do NOT add dominantUnits to candidates.
    const candidates = [...otherUnits];
    
    let currentCount = source.tabCount;

    while (currentCount > this.config.maxTabs && candidates.length > 0) {
      const unit = candidates.shift()!;
      
      const target = this.findBestTarget(unit, allWindows, source, doomedWindows);
      
      // If we found a target (even new), move it.
      if (target) {
        // Record move
        moves.push({
          tabIds: unit.tabIds,
          targetWindowId: target === 'new' ? 'new' : target.id,
          groupId: unit.groupId !== -1 ? unit.groupId : undefined
        });

        // Update Sim
        currentCount -= unit.size;
        source.tabCount = currentCount;

        if (target !== 'new') {
          target.tabCount += unit.size;
          target.tabs.push(...unit.tabs); 
        }
      }
    }
  }

  private planConsolidation(target: WindowState, allWindows: WindowState[], moves: MoveOperation[], doomedWindows: Set<number>) {
    // ... logic same ...
    
    const units = this.getMoveableUnits(target);
    
    // Try to empty this window
    let fullyMoved = true;
    const proposedMoves: MoveOperation[] = [];
    
    for (const unit of units) {
        const dest = this.findBestTarget(unit, allWindows, target, doomedWindows);
        
        // Ensure we don't merge into a doomed window (already checked via doomedWindows passing?)
        // findBestTarget should check doomedWindows.
        
        if (!dest || dest === 'new') {
            // If the only option is 'new', we aren't really complying with "minimize window count" by closing one to open another.
             fullyMoved = false;
             break;
        }
        
        proposedMoves.push({
             tabIds: unit.tabIds,
             targetWindowId: dest.id,
             groupId: unit.groupId !== -1 ? unit.groupId : undefined
        });
    }

    if (fullyMoved && proposedMoves.length > 0) {
        moves.push(...proposedMoves);
        doomedWindows.add(target.id);
        target.tabCount = 0; 
        
        for (const pm of proposedMoves) {
             const dest = allWindows.find(w => w.id === pm.targetWindowId);
             if (dest) {
                 dest.tabCount += pm.tabIds.length;
             }
        }
        return; 
    }

    this.refillWindow(target, allWindows, moves, doomedWindows);
  }

  private refillWindow(target: WindowState, allWindows: WindowState[], moves: MoveOperation[], doomedWindows: Set<number>) {
    // ...
    // ...
    // Note: Don't take from doomed windows.
    // Logic below handles it? 
    // "const donors = allWindows.filter(...)" - Yes, I updated filter previously.
    // Just ensuring we pass doomedWindows down or check it.
    
    let needed = this.config.minTabs - target.tabCount;
    if (needed <= 0) return;

    const donors = allWindows.filter(w => w.id !== target.id && !doomedWindows.has(w.id) && w.tabCount > this.config.minTabs);
    
    for (const donor of donors) {
      if (needed <= 0) break;
      
      const units = this.getMoveableUnits(donor);
      const matchingUnits = units.filter(u => u.domain && this.hasDomain(target, u.domain));
      
      for (const unit of matchingUnits) {
        if (needed <= 0) break;
        if (donor.tabCount - unit.size < this.config.minTabs) continue; 

        moves.push({
          tabIds: unit.tabIds,
          targetWindowId: target.id,
          groupId: unit.groupId !== -1 ? unit.groupId : undefined
        });
        
        target.tabCount += unit.size;
        target.tabs.push(...unit.tabs);
        donor.tabCount -= unit.size;
        needed -= unit.size;
      }
    }
  }

  private getMoveableUnits(window: WindowState): MoveableUnit[] {
    const units: MoveableUnit[] = [];
    const processedTabs = new Set<number>();

    // 1. Groups
    // ...

    // 2. Loose Tabs
    // update logic to use extractBaseDomain for looseByDomain grouping
    
    if (this.config.respectGrouping) {
      const groups = new Map<number, TabInfo[]>();
      for (const tab of window.tabs) {
        if (tab.groupId && tab.groupId !== -1) {
          if (!groups.has(tab.groupId)) groups.set(tab.groupId, []);
          groups.get(tab.groupId)!.push(tab);
        }
      }

      for (const [groupId, groupTabs] of groups) {
        units.push({
          tabIds: groupTabs.map(t => t.id!),
          tabs: groupTabs,
          domain: this.getDominantDomain(groupTabs), 
          groupId: groupId,
          size: groupTabs.length
        });
        groupTabs.forEach(t => processedTabs.add(t.id!));
      }
    }

    const backendLooseTabs = window.tabs.filter(t => !processedTabs.has(t.id!));
    const looseByDomain = new Map<string, TabInfo[]>();
    const looseMisc: TabInfo[] = [];

    for (const tab of backendLooseTabs) {
        const d = tab.url ? extractBaseDomain(tab.url) : null; // Use Base Domain
        if (d) {
            if (!looseByDomain.has(d)) looseByDomain.set(d, []);
            looseByDomain.get(d)!.push(tab);
        } else {
            looseMisc.push(tab);
        }
    }
    
    // ... (rest is same-ish)
    for (const [domain, tabs] of looseByDomain) {
        units.push({
            tabIds: tabs.map(t => t.id!),
            tabs: tabs,
            domain: domain,
            groupId: -1,
            size: tabs.length
        });
    }

    for (const tab of looseMisc) {
        units.push({
            tabIds: [tab.id!],
            tabs: [tab],
            domain: null,
            groupId: -1,
            size: 1
        });
    }

    return units;
  }

  private findBestTarget(unit: MoveableUnit, allWindows: WindowState[], source: WindowState, doomedWindows: Set<number>): WindowState | 'new' | null {
    // 1. Matching domain AND has space
    const matchAndFits = allWindows.find(w => 
      w.id !== source.id && 
      !doomedWindows.has(w.id) &&
      unit.domain && 
      this.hasDomain(w, unit.domain) &&
      w.tabCount + unit.size <= this.config.maxTabs
    );

    if (matchAndFits) return matchAndFits;

    // 2. If we have a matching domain window but it's FULL, we prefer opening a NEW window 
    // rather than dumping into a generic window?
    // Actually, "Best Fit" (fill under-utilized windows) is good for reducing window count.
    
    // 3. Best fit (not doomed, has space)
    // We prefer windows that are relatively empty (closest to minTabs?) or just any that fits?
    // Any that fits is fine.
    const bestFit = allWindows.find(w => 
        w.id !== source.id && 
        !doomedWindows.has(w.id) &&
        w.tabCount + unit.size <= this.config.maxTabs
    );

    // Only use best fit if we aren't creating a "mess" of domains?
    // Use best fit if the unit is small/misc.
    if (bestFit) return bestFit;

    return 'new';
  }

  // update hasDomain to use base domain
  private hasDomain(window: WindowState, domain: string): boolean {
      if (window.primaryDomain === domain) return true;
      return window.tabs.some(t => t.url && extractBaseDomain(t.url) === domain);
  }

  private async executeMoves(moves: MoveOperation[]) {
    // Process 'new' windows first to get IDs?
    // Process existing target moves.
    
    const movesByTarget = new Map<number | 'new', MoveOperation[]>();
    for (const m of moves) {
        if (!movesByTarget.has(m.targetWindowId)) movesByTarget.set(m.targetWindowId, []);
        movesByTarget.get(m.targetWindowId)!.push(m);
    }

    for (const [targetId, ops] of movesByTarget) {
        const allTabIds = ops.flatMap(o => o.tabIds);
        if (allTabIds.length === 0) continue;

        let finalTargetId: number;

        if (targetId === 'new') {
            // Create window with first tab
            const firstTab = allTabIds[0];
            const created = await chrome.windows.create({ tabId: firstTab });
            if (!created || !created.id) continue;
            finalTargetId = created.id;
            
            // Move rest
            const remaining = allTabIds.slice(1);
            if (remaining.length > 0) {
                await chrome.tabs.move(remaining, { windowId: finalTargetId, index: -1 });
            }
        } else {
             finalTargetId = targetId as number;
             await chrome.tabs.move(allTabIds, { windowId: finalTargetId, index: -1 });
        }

        // Restore groups?
        if (this.config.respectGrouping) {
            // Re-group tabs that were grouped
            for (const op of ops) {
                if (op.groupId !== undefined && op.groupId !== -1) {
                    try {
                         await chrome.tabs.group({ tabIds: op.tabIds });
                    } catch (e) {
                        console.error("Failed to regroup", e);
                    }
                }
            }
        }
    }
  }

  async groupAll() {
      await this.autoGroupTabs();
  }

  async ungroupAll() {
      const windows = await getAllWindows();
      for (const win of windows) {
          if (win.type !== 'normal' || !win.tabs) continue;
          
          const tabIds = win.tabs.map(t => t.id!).filter(id => id !== undefined);
          if (tabIds.length > 0) {
              try {
                  await chrome.tabs.ungroup(tabIds);
              } catch (e) {
                  console.error("Ungroup failed for window " + win.id, e);
              }
          }
      }
  }

  private async autoGroupTabs() {
      const windows = await getAllWindows();
      for (const win of windows) {
          if (win.type !== 'normal' || !win.tabs) continue;
          
          const byDomain = new Map<string, number[]>();
          for (const tab of win.tabs) {
              if (tab.url) {
                  const d = extractDomain(tab.url);
                  if (d) {
                    if (!byDomain.has(d)) byDomain.set(d, []);
                    byDomain.get(d)!.push(tab.id!);
                  }
              }
          }

          for (const [domain, tabIds] of byDomain.entries()) {
              if (tabIds.length >= 2) {
                  try {
                    const groupId = await chrome.tabs.group({ tabIds: tabIds });
                    // Optional: could set title here if needed
                    // await chrome.tabGroups.update(groupId, { title: domain });
                  } catch (e) {
                      console.error("Auto-group failed", e);
                  }
              }
          }
      }
  }
}
