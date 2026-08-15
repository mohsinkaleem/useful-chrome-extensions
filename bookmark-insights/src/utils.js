// Shared utility functions for Bookmark Insight

/**
 * Common stop words for text processing
 * Used by similarity detection and word frequency analysis
 */
export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'about', 'from', 'up', 'out',
  'into', 'over', 'under', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same', 'so', 'than',
  'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once', 'if', 'any', 'as'
]);

/**
 * Format a timestamp to a localized date string
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Generate a favicon URL for a bookmark
 * Uses letter-based SVG icons for reliability
 * @param {Object} bookmark - Bookmark object with url and domain properties
 * @returns {string} Data URL for the favicon SVG
 */
export function getGeneratedFavicon(bookmark) {
  // For HTTP/HTTPS URLs, create a simple domain-based icon
  if (bookmark.url.startsWith('http://') || bookmark.url.startsWith('https://')) {
    const domain = bookmark.domain || 'unknown';
    const firstLetter = domain.charAt(0).toUpperCase();
    const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
    const colorIndex = domain.length % colors.length;
    const color = colors[colorIndex];

    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${color}"/><text x="8" y="12" font-family="Arial" font-size="10" text-anchor="middle" fill="white" font-weight="bold">${firstLetter}</text></svg>`;
  }

  // Return specific icons for different URL types
  const domain = bookmark.domain || '';
  switch (domain) {
    case 'chrome-internal':
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23EA4335"/><circle cx="8" cy="8" r="3" fill="white"/></svg>';
    case 'local-file':
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23F59E0B"/><text x="8" y="12" font-family="Arial" font-size="10" text-anchor="middle" fill="white">📄</text></svg>';
    case 'javascript-bookmarklet':
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23F7DF1E"/><text x="8" y="12" font-family="Arial" font-size="8" text-anchor="middle" fill="black" font-weight="bold">JS</text></svg>';
    case 'data-uri':
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%2310B981"/><text x="8" y="12" font-family="Arial" font-size="8" text-anchor="middle" fill="white" font-weight="bold">D</text></svg>';
    case 'contact-link':
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%238B5CF6"/><text x="8" y="12" font-family="Arial" font-size="10" text-anchor="middle" fill="white">@</text></svg>';
    case 'other-protocol':
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%236B7280"/><text x="8" y="12" font-family="Arial" font-size="10" text-anchor="middle" fill="white">⚡</text></svg>';
    default:
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23E5E7EB"/><text x="8" y="12" font-family="Arial" font-size="10" text-anchor="middle" fill="%236B7280">?</text></svg>';
  }
}

/**
 * Get the best available favicon URL for a bookmark.
 * Only locally-derived sources are used - no third-party favicon service, so
 * rendering a bookmark never discloses the domain to anyone.
 * @param {Object} bookmark - Bookmark object
 * @returns {string} Favicon URL
 */
export function getFaviconUrl(bookmark) {
  // Favicons captured during enrichment come from the site itself
  if (bookmark.faviconUrl && /^https?:|^data:image\//i.test(bookmark.faviconUrl)) {
    return bookmark.faviconUrl;
  }

  return getGeneratedFavicon(bookmark);
}

/**
 * Get a human-readable label for a bookmark's domain type
 * @param {Object} bookmark - Bookmark object with domain property
 * @returns {string} Human-readable domain label
 */
export function getDomainLabel(bookmark) {
  switch (bookmark.domain) {
    case 'chrome-internal':
      return 'Chrome';
    case 'local-file':
      return 'Local File';
    case 'javascript-bookmarklet':
      return 'Bookmarklet';
    case 'data-uri':
      return 'Data URI';
    case 'contact-link':
      return 'Contact';
    case 'other-protocol':
      return 'Other';
    case 'invalid-url':
      return 'Invalid URL';
    default:
      return bookmark.domain;
  }
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Sort options for bookmarks
 */
export const SORT_OPTIONS = {
  RELEVANCE: { key: 'relevance', label: 'Best Match', sort: (a, b) => (b._searchScore || 0) - (a._searchScore || 0) },
  DATE_DESC: { key: 'date_desc', label: 'Newest First', sort: (a, b) => b.dateAdded - a.dateAdded },
  DATE_ASC: { key: 'date_asc', label: 'Oldest First', sort: (a, b) => a.dateAdded - b.dateAdded },
  TITLE_ASC: { key: 'title_asc', label: 'Title A-Z', sort: (a, b) => (a.title || '').localeCompare(b.title || '') },
  TITLE_DESC: { key: 'title_desc', label: 'Title Z-A', sort: (a, b) => (b.title || '').localeCompare(a.title || '') },
  DOMAIN_ASC: { key: 'domain_asc', label: 'Domain A-Z', sort: (a, b) => (a.domain || '').localeCompare(b.domain || '') },
};

/**
 * Get sort function by key
 * @param {string} key - Sort option key
 * @returns {Function} Sort function
 */
export function getSortFunction(key) {
  const option = Object.values(SORT_OPTIONS).find(opt => opt.key === key);
  return option ? option.sort : SORT_OPTIONS.DATE_DESC.sort;
}

/**
 * Split text into plain and matched segments for search-term highlighting.
 * Returns data, not markup, so callers never need `{@html}`.
 * @param {string} text - The text to highlight
 * @param {Object} parsedQuery - The parsed search query
 * @returns {Array<{text: string, match: boolean}>}
 */
export function highlightSegments(text, parsedQuery) {
  if (!text) return [];
  if (!parsedQuery) return [{ text, match: false }];

  const { positive, phrases, regular, regexPatterns } = parsedQuery;
  const terms = [...(positive || []), ...(phrases || []), ...(regular || [])];

  if (terms.length === 0 && (!regexPatterns || regexPatterns.length === 0)) {
    return [{ text, match: false }];
  }
  
  // Find all ranges to highlight
  const ranges = [];
  
  // Find matches for text terms
  terms.forEach(term => {
    if (!term) return;
    // Escape special regex characters in the term
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedTerm, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  });
  
  // Find matches for regex patterns
  if (regexPatterns) {
    regexPatterns.forEach(regex => {
      // Ensure global flag for finding all matches
      const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
      try {
        const globalRegex = new RegExp(regex.source, flags);
        let match;
        while ((match = globalRegex.exec(text)) !== null) {
          ranges.push({ start: match.index, end: match.index + match[0].length });
          // Prevent infinite loops with zero-width matches
          if (match.index === globalRegex.lastIndex) {
            globalRegex.lastIndex++;
          }
        }
      } catch (e) {
        console.warn('Invalid regex for highlighting:', e);
      }
    });
  }
  
  // Merge overlapping ranges
  ranges.sort((a, b) => a.start - b.start);
  
  const mergedRanges = [];
  if (ranges.length > 0) {
    let current = ranges[0];
    for (let i = 1; i < ranges.length; i++) {
      const next = ranges[i];
      if (next.start < current.end) {
        current.end = Math.max(current.end, next.end);
      } else {
        mergedRanges.push(current);
        current = next;
      }
    }
    mergedRanges.push(current);
  }

  const segments = [];
  let lastIndex = 0;
  for (const { start, end } of mergedRanges) {
    if (start > lastIndex) segments.push({ text: text.slice(lastIndex, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    lastIndex = end;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), match: false });

  return segments;
}

