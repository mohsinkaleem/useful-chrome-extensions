// Enhanced database compatibility wrapper
// Adds new search and similarity features while preserving old API

export * from './database.js';

// Export FlexSearch functions
export { searchBookmarks as flexSearch, advancedSearch, getSearchSuggestions } from './search.js';

// Export enhanced similarity functions
export { findSimilarBookmarksEnhanced, findDuplicatesEnhanced, findRelatedBookmarks } from './similarity.js';
