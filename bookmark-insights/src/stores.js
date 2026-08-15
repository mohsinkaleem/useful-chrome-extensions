// Svelte stores for reactive state management
// This centralizes the stats and enables real-time updates

import { writable } from 'svelte/store';
import { getAllBookmarksWithReadingList } from './db.js';

// =============================================
// UI State Stores - Filters, Search, Selection
// =============================================

// Store for all bookmarks with caching to avoid repeated fetching
function createBookmarksStore() {
  const { subscribe, set } = writable([]);
  let lastFetchTime = 0;
  let fetchPromise = null;
  const CACHE_TTL = 30000; // 30 seconds cache

  return {
    subscribe,
    set,
    /**
     * Get cached bookmarks or fetch fresh if stale
     * @param {number} maxAge - Max age in ms before refresh (default: 30s)
     * @returns {Promise<Array>} Bookmarks array
     */
    getCached: async (maxAge = CACHE_TTL) => {
      const now = Date.now();
      let currentData = [];

      // Get current value synchronously
      const unsubscribe = subscribe((value) => {
        currentData = value;
      });
      unsubscribe();

      // Return cached if fresh enough
      if (currentData.length > 0 && now - lastFetchTime < maxAge) {
        return currentData;
      }

      // Return existing promise if fetching
      if (fetchPromise) {
        const result = await fetchPromise;
        return result !== null ? result : currentData;
      }

      // Fetch fresh data
      fetchPromise = (async () => {
        try {
          const bookmarks = await getAllBookmarksWithReadingList();
          set(bookmarks);
          lastFetchTime = Date.now();
          return bookmarks;
        } catch (error) {
          console.error('Error fetching bookmarks:', error);
          return null;
        } finally {
          fetchPromise = null;
        }
      })();

      const result = await fetchPromise;
      return result !== null ? result : currentData;
    },
    refresh: async () => {
      // Force new fetch
      fetchPromise = (async () => {
        try {
          const bookmarks = await getAllBookmarksWithReadingList();
          set(bookmarks);
          lastFetchTime = Date.now();
          return bookmarks;
        } catch (error) {
          console.error('Error refreshing bookmarks:', error);
          return null;
        } finally {
          fetchPromise = null;
        }
      })();

      const result = await fetchPromise;
      return result !== null ? result : [];
    },
    invalidate: () => {
      lastFetchTime = 0;
    },
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
