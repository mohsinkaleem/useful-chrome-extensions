// Quick actions component

export class QuickActions {
  private closeBtn: HTMLButtonElement | null;
  private bookmarkBtn: HTMLButtonElement | null;
  private groupBtn: HTMLButtonElement | null;
  private selectedTabs: number[] = [];
  private callbacks: Array<(action: string, tabs: number[]) => void> = [];

  constructor() {
    this.closeBtn = document.getElementById('action-close-selected') as HTMLButtonElement;
    this.bookmarkBtn = document.getElementById('action-bookmark-selected') as HTMLButtonElement;
    this.groupBtn = document.getElementById('action-group-selected') as HTMLButtonElement;
    
    this.setupListeners();
  }

  private setupListeners() {
    this.closeBtn?.addEventListener('click', () => {
      this.notifyAction('close', this.selectedTabs);
    });

    this.bookmarkBtn?.addEventListener('click', () => {
      this.notifyAction('bookmark', this.selectedTabs);
    });

    this.groupBtn?.addEventListener('click', () => {
      this.notifyAction('group', this.selectedTabs);
    });
  }

  updateSelectedTabs(tabs: number[]) {
    this.selectedTabs = tabs;
    const hasSelection = tabs.length > 0;
    
    if (this.closeBtn) this.closeBtn.disabled = !hasSelection;
    if (this.bookmarkBtn) this.bookmarkBtn.disabled = !hasSelection;
    if (this.groupBtn) this.groupBtn.disabled = !hasSelection;
  }

  onAction(callback: (action: string, tabs: number[]) => void) {
    this.callbacks.push(callback);
  }

  private notifyAction(action: string, tabs: number[]) {
    this.callbacks.forEach(cb => cb(action, tabs));
  }
}
