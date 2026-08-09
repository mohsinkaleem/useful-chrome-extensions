import { getAllWindows, WindowInfo, TabInfo } from './tab-utils.js';
import { extractBaseDomain } from './url-utils.js';
import { groupAllByDomain, ungroupAll } from './grouping.js';

export interface BalancingConfig {
  maxTabs: number;
  minTabs: number;
  respectGrouping: boolean;
}

interface MoveOperation {
  tabIds: number[];
  targetWindowId: number | 'new';
  groupId?: number;
}

interface WindowState {
  id: number;
  tabs: TabInfo[];
  tabCount: number;
  primaryDomain: string | null;
  domains: Set<string>;
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
      ...config
    };
  }

  getConfig(): Readonly<BalancingConfig> {
    return this.config;
  }

  async balanceWindows(): Promise<number> {
    const windows = await getAllWindows();
    const normalWindows = windows.filter(w => w.type === 'normal' && w.id !== undefined);

    const simWindows = this.buildState(normalWindows);
    const moves: MoveOperation[] = [];
    const doomedWindows = new Set<number>();

    // 1. Relieve overloaded windows
    for (const win of simWindows) {
      if (win.tabCount > this.config.maxTabs) {
        this.planRelief(win, simWindows, moves, doomedWindows);
      }
    }

    // 2. Fill under-loaded windows, consolidating small ones away entirely where possible
    for (const win of simWindows) {
      if (doomedWindows.has(win.id)) continue;
      if (win.tabCount > 0 && win.tabCount < this.config.minTabs) {
        this.planConsolidation(win, simWindows, moves, doomedWindows);
      }
    }

    await this.executeMoves(moves);
    return moves.reduce((sum, m) => sum + m.tabIds.length, 0);
  }

  private buildState(windows: WindowInfo[]): WindowState[] {
    return windows
      .filter(w => w.id !== undefined)
      .map(w => {
        const tabs = (w.tabs || []) as TabInfo[];
        return {
          id: w.id as number,
          tabs,
          tabCount: tabs.length,
          primaryDomain: this.getDominantDomain(tabs),
          domains: this.collectDomains(tabs)
        };
      });
  }

  private collectDomains(tabs: TabInfo[]): Set<string> {
    const domains = new Set<string>();
    for (const tab of tabs) {
      const domain = tab.url ? extractBaseDomain(tab.url) : null;
      if (domain) domains.add(domain);
    }
    return domains;
  }

  private getDominantDomain(tabs: TabInfo[]): string | null {
    const counts = new Map<string, number>();
    for (const tab of tabs) {
      if (!tab.url) continue;
      // Base domain so mail.google.com and docs.google.com count together.
      const domain = extractBaseDomain(tab.url);
      if (domain) counts.set(domain, (counts.get(domain) || 0) + 1);
    }

    let bestDomain: string | null = null;
    let max = 0;
    for (const [domain, count] of counts) {
      if (count > max) {
        max = count;
        bestDomain = domain;
      }
    }
    return bestDomain;
  }

  // Applies a planned move to the simulation so later decisions see up-to-date counts.
  private applyToSim(target: WindowState, unit: MoveableUnit) {
    target.tabCount += unit.size;
    target.tabs.push(...unit.tabs);
    if (unit.domain) target.domains.add(unit.domain);
  }

  private planRelief(
    source: WindowState,
    allWindows: WindowState[],
    moves: MoveOperation[],
    doomedWindows: Set<number>
  ) {
    // Move the window's outlier domains out first and never split its dominant domain —
    // a window of 80 YouTube tabs is left intact rather than torn in half.
    const units = this.getMoveableUnits(source);
    const outliers = units.filter(u => !source.primaryDomain || u.domain !== source.primaryDomain);
    outliers.sort((a, b) => a.size - b.size);

    let currentCount = source.tabCount;

    while (currentCount > this.config.maxTabs && outliers.length > 0) {
      const unit = outliers.shift()!;
      const target = this.findBestTarget(unit, allWindows, source, doomedWindows);
      if (!target) continue;

      moves.push({
        tabIds: unit.tabIds,
        targetWindowId: target === 'new' ? 'new' : target.id,
        groupId: unit.groupId !== -1 ? unit.groupId : undefined
      });

      currentCount -= unit.size;
      source.tabCount = currentCount;

      if (target !== 'new') {
        this.applyToSim(target, unit);
      }
    }
  }

  private planConsolidation(
    target: WindowState,
    allWindows: WindowState[],
    moves: MoveOperation[],
    doomedWindows: Set<number>
  ) {
    const units = this.getMoveableUnits(target);
    const proposed: Array<{ op: MoveOperation; dest: WindowState; unit: MoveableUnit }> = [];
    let fullyMoved = true;

    for (const unit of units) {
      const dest = this.findBestTarget(unit, allWindows, target, doomedWindows);
      // Emptying this window only to open a new one does not reduce the window count.
      if (!dest || dest === 'new') {
        fullyMoved = false;
        break;
      }

      proposed.push({
        op: {
          tabIds: unit.tabIds,
          targetWindowId: dest.id,
          groupId: unit.groupId !== -1 ? unit.groupId : undefined
        },
        dest,
        unit
      });
    }

    if (fullyMoved && proposed.length > 0) {
      for (const { op, dest, unit } of proposed) {
        moves.push(op);
        this.applyToSim(dest, unit);
      }
      doomedWindows.add(target.id);
      target.tabCount = 0;
      return;
    }

    this.refillWindow(target, allWindows, moves, doomedWindows);
  }

  private refillWindow(
    target: WindowState,
    allWindows: WindowState[],
    moves: MoveOperation[],
    doomedWindows: Set<number>
  ) {
    let needed = this.config.minTabs - target.tabCount;
    if (needed <= 0) return;

    const donors = allWindows.filter(
      w => w.id !== target.id && !doomedWindows.has(w.id) && w.tabCount > this.config.minTabs
    );

    for (const donor of donors) {
      if (needed <= 0) break;

      const matchingUnits = this.getMoveableUnits(donor).filter(
        u => u.domain && target.domains.has(u.domain)
      );

      for (const unit of matchingUnits) {
        if (needed <= 0) break;
        if (donor.tabCount - unit.size < this.config.minTabs) continue;

        moves.push({
          tabIds: unit.tabIds,
          targetWindowId: target.id,
          groupId: unit.groupId !== -1 ? unit.groupId : undefined
        });

        this.applyToSim(target, unit);
        donor.tabCount -= unit.size;
        needed -= unit.size;
      }
    }
  }

  // A unit is the smallest thing worth moving as a whole: a tab group, or all the
  // loose tabs sharing a base domain. Pinned tabs are never moved.
  private getMoveableUnits(window: WindowState): MoveableUnit[] {
    const units: MoveableUnit[] = [];
    const claimed = new Set<number>();
    const movable = window.tabs.filter(t => t.id !== undefined && !t.pinned);

    if (this.config.respectGrouping) {
      const groups = new Map<number, TabInfo[]>();
      for (const tab of movable) {
        if (tab.groupId === undefined || tab.groupId === -1) continue;
        if (!groups.has(tab.groupId)) groups.set(tab.groupId, []);
        groups.get(tab.groupId)!.push(tab);
      }

      for (const [groupId, groupTabs] of groups) {
        units.push({
          tabIds: groupTabs.map(t => t.id as number),
          tabs: groupTabs,
          domain: this.getDominantDomain(groupTabs),
          groupId,
          size: groupTabs.length
        });
        groupTabs.forEach(t => claimed.add(t.id as number));
      }
    }

    const looseByDomain = new Map<string, TabInfo[]>();
    for (const tab of movable) {
      if (claimed.has(tab.id as number)) continue;
      const domain = tab.url ? extractBaseDomain(tab.url) : null;

      if (domain) {
        if (!looseByDomain.has(domain)) looseByDomain.set(domain, []);
        looseByDomain.get(domain)!.push(tab);
      } else {
        units.push({ tabIds: [tab.id as number], tabs: [tab], domain: null, groupId: -1, size: 1 });
      }
    }

    for (const [domain, tabs] of looseByDomain) {
      units.push({
        tabIds: tabs.map(t => t.id as number),
        tabs,
        domain,
        groupId: -1,
        size: tabs.length
      });
    }

    return units;
  }

  private findBestTarget(
    unit: MoveableUnit,
    allWindows: WindowState[],
    source: WindowState,
    doomedWindows: Set<number>
  ): WindowState | 'new' | null {
    const fits = allWindows.filter(
      w =>
        w.id !== source.id &&
        !doomedWindows.has(w.id) &&
        w.tabCount + unit.size <= this.config.maxTabs
    );

    if (fits.length === 0) return 'new';

    // Prefer a window that already holds this domain; among candidates take the
    // emptiest, which spreads load instead of piling onto whichever window came first.
    const byEmptiest = (a: WindowState, b: WindowState) => a.tabCount - b.tabCount;

    if (unit.domain) {
      const domainMatches = fits.filter(w => w.domains.has(unit.domain as string));
      if (domainMatches.length > 0) {
        return domainMatches.sort(byEmptiest)[0];
      }
    }

    return fits.sort(byEmptiest)[0];
  }

  private async executeMoves(moves: MoveOperation[]) {
    if (moves.length === 0) return;

    // Moving a tab to another window drops its group, so read the title and colour
    // before anything moves and re-apply them afterwards.
    const groupMeta = new Map<number, { title?: string; color: chrome.tabGroups.ColorEnum }>();
    if (this.config.respectGrouping) {
      for (const move of moves) {
        if (move.groupId === undefined || groupMeta.has(move.groupId)) continue;
        try {
          const group = await chrome.tabGroups.get(move.groupId);
          groupMeta.set(move.groupId, { title: group.title, color: group.color });
        } catch {
          // Group no longer exists — nothing to restore.
        }
      }
    }

    const movesByTarget = new Map<number | 'new', MoveOperation[]>();
    for (const move of moves) {
      if (!movesByTarget.has(move.targetWindowId)) movesByTarget.set(move.targetWindowId, []);
      movesByTarget.get(move.targetWindowId)!.push(move);
    }

    for (const [targetId, ops] of movesByTarget) {
      const allTabIds = ops.flatMap(o => o.tabIds);
      if (allTabIds.length === 0) continue;

      let finalTargetId: number;

      try {
        if (targetId === 'new') {
          const created = await chrome.windows.create({ tabId: allTabIds[0] });
          if (!created?.id) continue;
          finalTargetId = created.id;

          const remaining = allTabIds.slice(1);
          if (remaining.length > 0) {
            await chrome.tabs.move(remaining, { windowId: finalTargetId, index: -1 });
          }
        } else {
          finalTargetId = targetId;
          await chrome.tabs.move(allTabIds, { windowId: finalTargetId, index: -1 });
        }
      } catch (e) {
        console.error('Failed to move tabs:', e);
        continue;
      }

      if (!this.config.respectGrouping) continue;

      for (const op of ops) {
        if (op.groupId === undefined) continue;
        try {
          const newGroupId = await chrome.tabs.group({
            tabIds: op.tabIds,
            createProperties: { windowId: finalTargetId }
          });
          const meta = groupMeta.get(op.groupId);
          if (meta) {
            await chrome.tabGroups.update(newGroupId, { title: meta.title, color: meta.color });
          }
        } catch (e) {
          console.error('Failed to restore tab group after move:', e);
        }
      }
    }
  }

  async groupAll() {
    await groupAllByDomain();
  }

  async ungroupAll() {
    await ungroupAll();
  }
}
