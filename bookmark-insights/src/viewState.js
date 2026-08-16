// Dashboard UI state that should survive a reload.
//
// `currentView` already persists via the URL hash; the view mode, sort order
// and active filters did not, so every reopen dropped whatever the user had set
// up. Stored in chrome.storage.local next to the dark-mode preference.

const STORAGE_KEY = 'dashboardViewState';

/** @returns {Promise<Object|null>} */
export async function loadViewState() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY] || null;
  } catch (error) {
    console.error('Error loading view state:', error);
    return null;
  }
}

/** @param {Object} state */
export async function saveViewState(state) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  } catch (error) {
    console.error('Error saving view state:', error);
  }
}
