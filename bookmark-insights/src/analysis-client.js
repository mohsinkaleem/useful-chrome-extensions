// Main-thread client for analysis-worker.js.
//
// Falls back to running the same function inline when Workers are not available
// - notably in the MV3 service worker, which cannot spawn one.

import { computeSimilarPairs, analyzeBookmarkDeep } from './analysis-core.js';

const WORKER_URL = 'analysis-worker.js';

let worker = null;
let workerUnavailable = false;
let nextTaskId = 1;
const pending = new Map();

function getWorker() {
  if (workerUnavailable) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') {
    workerUnavailable = true;
    return null;
  }

  try {
    worker = new Worker(chrome.runtime.getURL(WORKER_URL), { type: 'module' });

    worker.addEventListener('message', (event) => {
      const { id, ok, result, error } = event.data || {};
      const task = pending.get(id);
      if (!task) return;
      pending.delete(id);
      if (ok) task.resolve(result);
      else task.reject(new Error(error));
    });

    worker.addEventListener('error', (event) => {
      console.error('Analysis worker error:', event.message);
      for (const task of pending.values()) task.reject(new Error(event.message));
      pending.clear();
      worker.terminate();
      worker = null;
      workerUnavailable = true;
    });

    return worker;
  } catch (error) {
    console.warn('Could not start analysis worker, running inline:', error);
    workerUnavailable = true;
    return null;
  }
}

function runInWorker(task, payload) {
  const target = getWorker();
  if (!target) return null;

  const id = nextTaskId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    target.postMessage({ id, task, payload });
  });
}

// Only the fields the scoring functions read. Posting whole records would clone
// every `rawMetadata` blob across the thread boundary.
function projectForSimilarity(bookmark) {
  return {
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    domain: bookmark.domain,
    description: bookmark.description,
    keywords: bookmark.keywords,
    category: bookmark.category,
  };
}

/**
 * Score bookmark pairs off the UI thread.
 * @param {Array} bookmarks
 * @param {Object} options - forwarded to computeSimilarPairs
 * @returns {Promise<{pairs: Array, stats: Object}>}
 */
export async function runSimilarityAnalysis(bookmarks, options = {}) {
  const projected = bookmarks.map(projectForSimilarity);
  const result =
    (await runInWorker('similarity', { bookmarks: projected, options })) ??
    computeSimilarPairs(projected, options);

  const byId = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));

  return {
    stats: result.stats,
    pairs: result.pairs
      .map(({ bookmark1Id, bookmark2Id, ...rest }) => ({
        ...rest,
        bookmark1: byId.get(bookmark1Id),
        bookmark2: byId.get(bookmark2Id),
      }))
      .filter((pair) => pair.bookmark1 && pair.bookmark2),
  };
}

/**
 * Run deep metadata analysis off the UI thread.
 *
 * Unlike similarity, this needs `rawMetadata`, so callers must pass bounded
 * chunks rather than the whole corpus.
 *
 * @param {Array} bookmarks
 * @returns {Promise<Array<Object|null>>} One patch per input, null when there was nothing to analyze.
 */
export async function runDeepAnalysis(bookmarks) {
  return (await runInWorker('deepAnalysis', { bookmarks })) ?? bookmarks.map(analyzeBookmarkDeep);
}
