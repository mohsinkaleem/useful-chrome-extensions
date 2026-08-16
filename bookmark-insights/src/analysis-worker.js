// Web Worker entry for CPU-bound analysis.
//
// Both tasks are pure functions over plain objects, so they run off the UI
// thread. Similarity scoring receives bookmarks projected down to the fields the
// scorer reads, which keeps the structured clone small - the full corpus carries
// multi-MB `rawMetadata` blobs the scorer never touches. Deep analysis does need
// `rawMetadata`, so the caller sends it in bounded chunks instead.
//
// Neither task is reachable from the MV3 service worker, which cannot spawn a
// dedicated worker; analysis-client.js falls back to running them inline there.

import { computeSimilarPairs, analyzeBookmarkDeep } from './analysis-core.js';

const tasks = {
  similarity: ({ bookmarks, options }) => computeSimilarPairs(bookmarks, options),
  deepAnalysis: ({ bookmarks }) => bookmarks.map(analyzeBookmarkDeep),
};

self.addEventListener('message', (event) => {
  const { id, task, payload } = event.data || {};
  const run = tasks[task];

  if (!run) {
    self.postMessage({ id, ok: false, error: `Unknown analysis task: ${task}` });
    return;
  }

  try {
    self.postMessage({ id, ok: true, result: run(payload) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
});
