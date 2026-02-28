// Shared dark mode store and utilities
// Extracted from duplicated code in App.svelte, SidePanel.svelte, and Dashboard.svelte

import { writable } from 'svelte/store';

export const darkMode = writable(false);

/**
 * Apply dark mode to the document
 * @param {boolean} enabled - Whether dark mode is enabled
 */
export function applyDarkMode(enabled) {
  if (typeof document !== 'undefined') {
    if (enabled) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}

/**
 * Initialize dark mode from chrome storage
 */
export async function initDarkMode() {
  try {
    const stored = await chrome.storage.local.get('darkMode');
    const enabled = stored.darkMode || false;
    darkMode.set(enabled);
    applyDarkMode(enabled);
    return enabled;
  } catch (error) {
    console.error('Error loading dark mode preference:', error);
    return false;
  }
}

/**
 * Toggle dark mode and persist to chrome storage
 */
export async function toggleDarkMode() {
  let newValue;
  darkMode.update(current => {
    newValue = !current;
    return newValue;
  });
  applyDarkMode(newValue);
  try {
    await chrome.storage.local.set({ darkMode: newValue });
  } catch (error) {
    console.error('Error saving dark mode preference:', error);
  }
  return newValue;
}
