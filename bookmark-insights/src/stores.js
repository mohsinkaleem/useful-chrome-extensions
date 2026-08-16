// Svelte stores for reactive state management
// This centralizes the stats and enables real-time updates

import { writable } from 'svelte/store';
import { getAllBookmarksWithReadingList, invalidateBookmarkCorpus } from './db.js';

// =============================================
// UI State Stores - Filters, Search, Selection
// =============================================

// Thin reactive wrapper over the corpus cache in db.js. Caching lives there so
// search, insights and similarity share one read; this store only mirrors the
// latest result for components that want it reactively.
function createBookmarksStore() {
  const { subscribe, set } = writable([]);

  const load = async () => {
    try {
      const bookmarks = await getAllBookmarksWithReadingList();
      set(bookmarks);
      return bookmarks;
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
      return [];
    }
  };

  return {
    subscribe,
    set,
    getCached: load,
    refresh: async () => {
      invalidateBookmarkCorpus();
      return load();
    },
    invalidate: invalidateBookmarkCorpus,
  };
}

export const allBookmarks = createBookmarksStore();

function createActiveFiltersStore() {
  const { subscribe, set, update } = writable({
    domains: [],
    folders: [],
    topics: [],
    tags: [],
    deadLinks: false,
    stale: false,
    dateRange: null,
    readingTimeRange: null,
    qualityScoreRange: null,
    hasPublishedDate: null,
    contentAgeYears: null, // Content (not the bookmark) published at least N years ago
    readingList: false, // Filter to show only reading list items
  });

  return {
    subscribe,
    set,
    addFilter: (category, value) =>
      update((state) => {
        if (Array.isArray(state[category])) {
          // Use case-insensitive comparison for string values
          const valueStr = String(value).toLowerCase();
          const exists = state[category].some((i) => String(i).toLowerCase() === valueStr);
          if (!exists) {
            return { ...state, [category]: [...state[category], value] };
          }
        } else if (typeof state[category] === 'boolean') {
          return { ...state, [category]: value };
        } else {
          // For objects/nulls like dateRange
          return { ...state, [category]: value };
        }
        return state;
      }),
    removeFilter: (category, value) =>
      update((state) => {
        if (Array.isArray(state[category])) {
          // Use case-insensitive comparison for string values
          const valueStr = String(value).toLowerCase();
          return {
            ...state,
            [category]: state[category].filter((i) => String(i).toLowerCase() !== valueStr),
          };
        } else if (typeof state[category] === 'boolean') {
          return { ...state, [category]: false };
        } else {
          return { ...state, [category]: null };
        }
      }),
    toggleFilter: (category, value) =>
      update((state) => {
        if (Array.isArray(state[category])) {
          // Use case-insensitive comparison for string values (domains, folders, topics)
          const valueStr = String(value).toLowerCase();
          const existingIndex = state[category].findIndex(
            (i) => String(i).toLowerCase() === valueStr,
          );
          if (existingIndex !== -1) {
            return {
              ...state,
              [category]: state[category].filter((_, idx) => idx !== existingIndex),
            };
          } else {
            return { ...state, [category]: [...state[category], value] };
          }
        } else if (typeof state[category] === 'boolean') {
          return { ...state, [category]: !state[category] };
        }
        return state;
      }),
    setFilter: (category, value) => update((state) => ({ ...state, [category]: value })),
    clearFilters: () =>
      set({
        domains: [],
        folders: [],
        topics: [],
        tags: [],
        deadLinks: false,
        stale: false,
        dateRange: null,
        readingTimeRange: null,
        qualityScoreRange: null,
        hasPublishedDate: null,
        contentAgeYears: null,
        readingList: false,
      }),
    /** @deprecated Use clearFilters() instead */
    reset: function () {
      this.clearFilters();
    },
  };
}

export const activeFilters = createActiveFiltersStore();

export const searchQuery = writable('');

function createSelectedBookmarksStore() {
  const { subscribe, set, update } = writable(new Set());

  return {
    subscribe,
    set,
    toggle: (id) =>
      update((s) => {
        const newSet = new Set(s);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        return newSet;
      }),
    add: (id) =>
      update((s) => {
        const newSet = new Set(s);
        newSet.add(id);
        return newSet;
      }),
    remove: (id) =>
      update((s) => {
        const newSet = new Set(s);
        newSet.delete(id);
        return newSet;
      }),
    selectAll: (ids) => set(new Set(ids)),
    clear: () => set(new Set()),
  };
}

export const selectedBookmarks = createSelectedBookmarksStore();
