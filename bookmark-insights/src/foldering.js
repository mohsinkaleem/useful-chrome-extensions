// Auto-foldering suggestions.
//
// `topics.js` already assigns a taxonomy path to every bookmark during Deep
// Analysis, and the result is stored on the record — but nothing ever acted on
// it. This turns that classification into a concrete proposal: "42 bookmarks
// look like DevOps but live in 9 different folders — create /DevOps?".

import { getAllBookmarks } from './db.js';
import { getTopicDisplayName } from './topics.js';

// A suggestion is only worth showing when the topic is well represented *and*
// currently scattered; otherwise it is just noise about an existing folder.
const MIN_BOOKMARKS = 8;
const MIN_DISTINCT_FOLDERS = 3;

function normalizeFolderName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Topics whose bookmarks are spread across many folders and have no folder of
 * their own yet.
 * @returns {Promise<Array<{topic: string, name: string, count: number, folders: Array, bookmarks: Array}>>}
 */
export async function getFolderingSuggestions() {
  const bookmarks = await getAllBookmarks();

  const existingFolders = new Set(
    bookmarks.flatMap((b) => (b.folderPath || '').split('/').map(normalizeFolderName)),
  );

  const byTopic = new Map();
  for (const bookmark of bookmarks) {
    // Only the leaf of the taxonomy path: `dev/devops` folders as "DevOps".
    for (const topic of bookmark.topics || []) {
      if (!byTopic.has(topic)) byTopic.set(topic, []);
      byTopic.get(topic).push(bookmark);
    }
  }

  const suggestions = [];

  for (const [topic, items] of byTopic) {
    if (items.length < MIN_BOOKMARKS) continue;

    const name = getTopicDisplayName(topic);
    if (existingFolders.has(normalizeFolderName(name))) continue;

    const folderCounts = new Map();
    for (const bookmark of items) {
      const folder = bookmark.folderPath || 'Unfiled';
      folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
    }
    if (folderCounts.size < MIN_DISTINCT_FOLDERS) continue;

    suggestions.push({
      topic,
      name,
      count: items.length,
      folders: [...folderCounts.entries()]
        .map(([folder, count]) => ({ folder, count }))
        .sort((a, b) => b.count - a.count),
      bookmarks: items,
    });
  }

  return suggestions.sort((a, b) => b.count - a.count);
}

/**
 * Create the folder and move every bookmark in the suggestion into it.
 * Chrome's onMoved listener keeps IndexedDB in step, so nothing is written here.
 *
 * @param {Object} suggestion From getFolderingSuggestions().
 * @param {string} [parentId] Defaults to "Other Bookmarks".
 */
export async function applyFolderingSuggestion(suggestion, parentId = '2') {
  const folder = await chrome.bookmarks.create({ parentId, title: suggestion.name });

  let moved = 0;
  const errors = [];

  for (const bookmark of suggestion.bookmarks) {
    try {
      await chrome.bookmarks.move(bookmark.id, { parentId: folder.id });
      moved++;
    } catch (error) {
      errors.push({ id: bookmark.id, error: error.message });
    }
  }

  return { folderId: folder.id, moved, errors };
}
