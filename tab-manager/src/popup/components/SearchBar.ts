// Search bar component

export interface SearchFilters {
  audible: boolean;
  pinned: boolean;
  duplicates: boolean;
}

export class SearchBar {
  private input: HTMLInputElement | null;
  private filterAudible: HTMLInputElement | null;
  private filterPinned: HTMLInputElement | null;
  private filterDuplicates: HTMLInputElement | null;
  private callbacks: Array<(query: string, filters: SearchFilters) => void> = [];

  constructor() {
    this.input = document.getElementById('search-input') as HTMLInputElement;
    this.filterAudible = document.getElementById('filter-audible') as HTMLInputElement;
    this.filterPinned = document.getElementById('filter-pinned') as HTMLInputElement;
    this.filterDuplicates = document.getElementById('filter-duplicates') as HTMLInputElement;
    
    this.setupListeners();
  }

  private setupListeners() {
    // Debounced search
    let timeout: NodeJS.Timeout;
    this.input?.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        this.notifyChange();
      }, 300);
    });

    // Filter checkboxes
    this.filterAudible?.addEventListener('change', () => this.notifyChange());
    this.filterPinned?.addEventListener('change', () => this.notifyChange());
    this.filterDuplicates?.addEventListener('change', () => this.notifyChange());
  }

  private notifyChange() {
    const query = this.input?.value || '';
    const filters: SearchFilters = {
      audible: this.filterAudible?.checked || false,
      pinned: this.filterPinned?.checked || false,
      duplicates: this.filterDuplicates?.checked || false
    };
    
    this.callbacks.forEach(cb => cb(query, filters));
  }

  onSearch(callback: (query: string, filters: SearchFilters) => void) {
    this.callbacks.push(callback);
  }
}
