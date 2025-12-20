// Shared utility functions for Bookmark Insight

/**
 * Format a timestamp to a localized date string
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Format a timestamp to a relative time string (e.g., "2 days ago")
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Relative time string
 */
export function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (weeks < 4) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

/**
 * Generate a favicon URL for a bookmark
 * Uses letter-based SVG icons for reliability
 * @param {Object} bookmark - Bookmark object with url and domain properties
 * @returns {string} Data URL for the favicon SVG
 */
export function getFaviconUrl(bookmark) {
  // For HTTP/HTTPS URLs, create a simple domain-based icon
  if (bookmark.url.startsWith('http://') || bookmark.url.startsWith('https://')) {
    const firstLetter = bookmark.domain.charAt(0).toUpperCase();
    const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
    const colorIndex = bookmark.domain.length % colors.length;
    const color = colors[colorIndex];

    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${color}"/><text x="8" y="12" font-family="Arial" font-size="10" text-anchor="middle" fill="white" font-weight="bold">${firstLetter}</text></svg>`;
  }

  // Return specific icons for different URL types
  switch (bookmark.domain) {
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
 * Truncate a string to a maximum length with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string
 */
export function truncateString(str, maxLength = 50) {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
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
  DATE_DESC: { key: 'date_desc', label: 'Newest First', sort: (a, b) => b.dateAdded - a.dateAdded },
  DATE_ASC: { key: 'date_asc', label: 'Oldest First', sort: (a, b) => a.dateAdded - b.dateAdded },
  TITLE_ASC: { key: 'title_asc', label: 'Title A-Z', sort: (a, b) => a.title.localeCompare(b.title) },
  TITLE_DESC: { key: 'title_desc', label: 'Title Z-A', sort: (a, b) => b.title.localeCompare(a.title) },
  DOMAIN_ASC: { key: 'domain_asc', label: 'Domain A-Z', sort: (a, b) => a.domain.localeCompare(b.domain) },
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
