// Database Explorer utility functions
// Provides APIs for exploring and analyzing the IndexedDB database

import { db, CACHE_KEYS, CACHE_DURATIONS } from './db.js';

/**
 * Table metadata with icons and descriptions
 */
const TABLE_META = {
  bookmarks: { icon: '📚', description: 'Primary bookmark data with enrichment fields' },
  events: { icon: '📊', description: 'Activity log (create, delete, access, enrichment events)' },
  cache: { icon: '💾', description: 'General purpose cache storage' },
  settings: { icon: '⚙️', description: 'Application settings and preferences' },
  computedMetrics: { icon: '📈', description: 'Cached computed metrics with TTL' },
  enrichmentQueue: { icon: '⏳', description: 'Queue of bookmarks pending enrichment' },
};

/**
 * Known computed metrics, derived from the single CACHE_KEYS/CACHE_DURATIONS
 * source of truth in db.js so this list cannot drift from what is actually cached.
 */
const METRIC_DESCRIPTIONS = {
  [CACHE_KEYS.DOMAIN_ANALYTICS]: 'Consolidated domain analytics',
  [CACHE_KEYS.AGE_DISTRIBUTION]: 'Bookmark age distribution',
  [CACHE_KEYS.CREATION_PATTERNS]: 'Hourly/daily/monthly creation patterns',
  [CACHE_KEYS.WORD_FREQUENCY]: 'Title word frequency analysis',
  [CACHE_KEYS.DUPLICATES]: 'Detected duplicate bookmarks',
  [CACHE_KEYS.QUICK_STATS]: 'Dashboard quick statistics',
  [CACHE_KEYS.QUICK_DUPLICATE_COUNT]: 'Duplicate count for the stats store',
  [CACHE_KEYS.SIMILARITIES]: 'Similar bookmark pairs',
};

function formatTtl(ms) {
  if (!ms) return 'Unknown';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

const KNOWN_METRICS = Object.values(CACHE_KEYS).map((key) => ({
  key,
  ttl: formatTtl(CACHE_DURATIONS[key]),
  description: METRIC_DESCRIPTIONS[key] || 'Custom metric',
}));

/**
 * Resolve a table by name. Bracket access on `db` would otherwise let a name
 * like 'constructor' or '_dbSchema' reach a Dexie internal.
 */
function table(tableName) {
  if (!Object.prototype.hasOwnProperty.call(TABLE_META, tableName)) {
    throw new Error(`Unknown table: ${tableName}`);
  }
  return db[tableName];
}

/**
 * Case-insensitive substring match over a record's scalar fields.
 * JSON.stringify on whole records allocated tens of MB per query on the
 * bookmarks table, most of it nested `rawMetadata` blobs nobody searches for.
 */
function recordMatchesQuery(record, query) {
  for (const value of Object.values(record)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      if (value.some((item) => String(item).toLowerCase().includes(query))) return true;
      continue;
    }

    if (typeof value === 'object') continue;
    if (String(value).toLowerCase().includes(query)) return true;
  }
  return false;
}

/**
 * Get all table names and record counts
 */
export async function getDatabaseOverview() {
  const tableNames = Object.keys(TABLE_META);

  const tables = await Promise.all(
    tableNames.map(async (name) => {
      try {
        const count = await db[name].count();
        return {
          name,
          count,
          ...TABLE_META[name],
        };
      } catch (e) {
        return {
          name,
          count: 0,
          ...TABLE_META[name],
          error: e.message,
        };
      }
    }),
  );

  const totalRecords = tables.reduce((sum, t) => sum + t.count, 0);
  const estimatedSize = await estimateDatabaseSize();

  return {
    tables,
    totalRecords,
    estimatedSize,
    lastChecked: Date.now(),
  };
}

/**
 * Get paginated records from a table with sorting & filtering
 */
export async function getTableRecords(tableName, options = {}) {
  const {
    page = 0,
    pageSize = 50,
    sortBy = null,
    sortOrder = 'desc',
    searchQuery = '',
    searchField = 'all',
    fieldFilter = null, // { field: 'category', hasValue: true/false }
  } = options;

  const needsClientFilter = searchQuery || fieldFilter;

  // Fast path: no filtering needed, use Dexie's native pagination
  if (!needsClientFilter && !sortBy) {
    const totalCount = await table(tableName).count();
    const totalPages = Math.ceil(totalCount / pageSize);
    const records = await table(tableName)
      .offset(page * pageSize)
      .limit(pageSize)
      .toArray();

    return {
      records,
      totalCount,
      page,
      pageSize,
      totalPages,
      hasMore: (page + 1) * pageSize < totalCount,
      hasPrev: page > 0,
    };
  }

  // Slow path: need to load all for client-side filtering/sorting
  let records = await table(tableName).toArray();

  // Apply field filter (show only records with/without a specific field)
  if (fieldFilter) {
    records = records.filter((record) => {
      const value = record[fieldFilter.field];
      const hasValue =
        value !== null &&
        value !== undefined &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0);
      return fieldFilter.hasValue ? hasValue : !hasValue;
    });
  }

  // Apply search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    records = records.filter((record) => {
      if (searchField === 'all') {
        return recordMatchesQuery(record, query);
      }
      const value = record[searchField];
      return value && String(value).toLowerCase().includes(query);
    });
  }

  // Apply sorting
  if (sortBy) {
    records.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      // Handle different types
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      }

      const result = String(aVal).localeCompare(String(bVal));
      return sortOrder === 'desc' ? -result : result;
    });
  }

  // Calculate pagination
  const totalCount = records.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const paginatedRecords = records.slice(page * pageSize, (page + 1) * pageSize);

  return {
    records: paginatedRecords,
    totalCount,
    page,
    pageSize,
    totalPages,
    hasMore: (page + 1) * pageSize < totalCount,
    hasPrev: page > 0,
  };
}

/**
 * Analyze field coverage in a table
 */
export async function analyzeTableFields(tableName) {
  const records = await table(tableName).toArray();
  const fieldStats = {};

  records.forEach((record) => {
    Object.keys(record).forEach((key) => {
      if (!fieldStats[key]) {
        fieldStats[key] = {
          field: key,
          populated: 0,
          empty: 0,
          samples: [],
          types: new Set(),
        };
      }

      const value = record[key];
      const isEmpty =
        value === null ||
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);

      if (isEmpty) {
        fieldStats[key].empty++;
      } else {
        fieldStats[key].populated++;
        fieldStats[key].types.add(Array.isArray(value) ? 'array' : typeof value);
        if (fieldStats[key].samples.length < 3) {
          // Truncate long samples
          let sample = value;
          if (typeof value === 'string' && value.length > 50) {
            sample = value.substring(0, 50) + '...';
          } else if (Array.isArray(value)) {
            sample = value.slice(0, 3);
          } else if (typeof value === 'object') {
            sample = '{...}';
          }
          fieldStats[key].samples.push(sample);
        }
      }
    });
  });

  const total = records.length;
  return Object.values(fieldStats)
    .map((stat) => ({
      ...stat,
      types: [...stat.types],
      total,
      coverage: total > 0 ? parseFloat(((stat.populated / total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.coverage - a.coverage);
}

/**
 * Get the list of field names for a table
 */
export async function getTableFields(tableName) {
  const records = await table(tableName).limit(100).toArray();
  const fields = new Set();

  records.forEach((record) => {
    Object.keys(record).forEach((key) => fields.add(key));
  });

  return [...fields].sort();
}

/**
 * Get cached metrics status with live validity info
 */
export async function getCachedMetricsStatus() {
  let metrics = [];

  try {
    metrics = await db.computedMetrics.toArray();
  } catch (e) {
    console.error('Error fetching computedMetrics:', e);
  }

  const now = Date.now();
  const cachedKeys = new Set(metrics.map((m) => m.key));

  const result = metrics.map((m) => {
    const timeRemaining = m.validUntil - now;
    let status = 'valid';
    if (timeRemaining <= 0) status = 'stale';
    else if (timeRemaining < 60 * 60 * 1000) status = 'expiring'; // < 1 hour

    const knownMeta = KNOWN_METRICS.find((km) => km.key === m.key);

    return {
      key: m.key,
      description: knownMeta?.description || 'Custom metric',
      expectedTtl: knownMeta?.ttl || 'Unknown',
      computedAt: m.computedAt,
      validUntil: m.validUntil,
      timeRemaining,
      status,
      dataSize: JSON.stringify(m.data || {}).length,
      hasData: !!m.data,
    };
  });

  // Add known metrics that haven't been cached yet
  KNOWN_METRICS.forEach((km) => {
    if (!cachedKeys.has(km.key)) {
      result.push({
        key: km.key,
        description: km.description,
        expectedTtl: km.ttl,
        computedAt: null,
        validUntil: null,
        timeRemaining: null,
        status: 'never',
        dataSize: 0,
        hasData: false,
      });
    }
  });

  return result.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Get the cached data for a specific metric
 */
export async function getCachedMetricData(key) {
  try {
    const metric = await db.computedMetrics.get(key);
    return metric?.data || null;
  } catch (e) {
    console.error(`Error getting cached metric ${key}:`, e);
    return null;
  }
}

/**
 * Invalidate multiple cached metrics
 */
export async function invalidateMetrics(keys) {
  try {
    await db.computedMetrics.bulkDelete(keys);
    return true;
  } catch (e) {
    console.error('Error invalidating metrics:', e);
    return false;
  }
}

/**
 * Get Mermaid diagram definition based on actual cache status
 */
export async function getMetricsFlowDiagram() {
  const cacheStatus = await getCachedMetricsStatus();
  const statusMap = Object.fromEntries(cacheStatus.map((c) => [c.key, c.status]));

  // Return structured data for simple HTML rendering (no mermaid dependency)
  return {
    layers: [
      {
        title: '📥 Data Sources',
        items: [
          { id: 'chromeApi', label: 'Chrome Bookmarks API', status: 'source' },
          { id: 'activity', label: 'User Activity', status: 'source' },
        ],
      },
      {
        title: '🗄️ Storage',
        items: [
          { id: 'bookmarks', label: 'Bookmarks Table', status: 'storage' },
          { id: 'events', label: 'Events Table', status: 'storage' },
        ],
      },
      {
        title: '📊 Computed Metrics',
        items: [
          { id: 'domainStats', label: 'Domain Stats', status: statusMap['domainStats'] || 'none' },
          {
            id: 'activityTimeline',
            label: 'Activity Timeline',
            status: statusMap['activityTimeline'] || 'none',
          },
          { id: 'quickStats', label: 'Quick Stats', status: statusMap['quickStats'] || 'none' },
          {
            id: 'similarities',
            label: 'Similarities',
            status: statusMap['similarities'] || 'none',
          },
          {
            id: 'wordFrequency',
            label: 'Word Frequency',
            status: statusMap['wordFrequency'] || 'none',
          },
        ],
      },
      {
        title: '🎯 Insights',
        items: [
          {
            id: 'insightsSummary',
            label: 'Summary',
            status: statusMap['insightsSummary'] || 'none',
          },
          {
            id: 'expertiseAreas',
            label: 'Expertise',
            status: statusMap['expertiseAreas'] || 'none',
          },
        ],
      },
    ],
  };
}

/**
 * Export table as JSON with optional filtering
 */
export async function exportTableAsJSON(tableName, options = {}) {
  const { records } = await getTableRecords(tableName, {
    ...options,
    pageSize: 999999, // Get all matching records
  });
  return JSON.stringify(records, null, 2);
}

/**
 * Export table and trigger download
 */
export function downloadJSON(data, filename) {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Estimate database size using Storage API or sampling
 */
async function estimateDatabaseSize() {
  // Try Storage Manager API first (most accurate, no full load)
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usedBytes = estimate.usage || 0;
      if (usedBytes > 1024 * 1024) {
        return `~${(usedBytes / (1024 * 1024)).toFixed(1)} MB`;
      }
      return `~${(usedBytes / 1024).toFixed(0)} KB`;
    } catch (e) {
      // Fall through to sampling method
    }
  }

  // Fallback: estimate from record counts and sample sizes
  let totalSize = 0;
  const tableNames = Object.keys(TABLE_META);

  for (const tableName of tableNames) {
    try {
      const count = await db[tableName].count();
      if (count === 0) continue;

      // Sample up to 10 records to estimate average size
      const sampleSize = Math.min(count, 10);
      const sample = await db[tableName].limit(sampleSize).toArray();
      const sampleBytes = JSON.stringify(sample).length;
      const avgRecordSize = sampleBytes / sampleSize;
      totalSize += avgRecordSize * count;
    } catch (e) {
      // Table might not exist yet
    }
  }

  if (totalSize > 1024 * 1024) {
    return `~${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `~${(totalSize / 1024).toFixed(0)} KB`;
}

/**
 * Format a timestamp for display
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return '-';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Format time remaining for display
 */
export function formatTimeRemaining(ms) {
  if (!ms || ms <= 0) return 'expired';

  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);

  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}
