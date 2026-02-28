// Shared window management utilities

import { TabList } from '../popup/components/TabList.js';

/**
 * Merge multiple windows into one by moving all tabs from source windows to the target.
 * Uses the first selected window as the target.
 */
export async function mergeSelectedWindows(
  tabList: TabList,
  onComplete?: () => Promise<void>
): Promise<void> {
  const selectedWindowIds = tabList.getSelectedWindows();

  if (selectedWindowIds.length < 2) {
    alert('Please select at least 2 windows to merge');
    return;
  }

  try {
    // Use the first selected window as the target
    const targetWindowId = selectedWindowIds[0];
    const sourceWindowIds = selectedWindowIds.slice(1);

    // Move all tabs from source windows to target window
    for (const sourceWindowId of sourceWindowIds) {
      const tabs = await chrome.tabs.query({ windowId: sourceWindowId });
      const tabIds = tabs.map(t => t.id).filter((id): id is number => id !== undefined);

      if (tabIds.length > 0) {
        await chrome.tabs.move(tabIds, { windowId: targetWindowId, index: -1 });
      }
    }

    // Focus the target window
    await chrome.windows.update(targetWindowId, { focused: true });

    // Clear selection
    tabList.clearWindowSelection();

    // Callback for re-rendering
    if (onComplete) {
      await onComplete();
    }
  } catch (error) {
    console.error('Error merging windows:', error);
    alert('Failed to merge windows. Please try again.');
  }
}
