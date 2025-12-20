// Database Explorer utility functions
// Provides APIs for exploring and analyzing the IndexedDB database

import { db } from './db.js';

/**
 * Table metadata with icons and descriptions
 */
const TABLE_META = {
  bookmarks: { icon: '📚', description: 'Primary bookmark data with enrichment fields' },
  events: { icon: '📊', description: 'Activity log (create, delete, access, enrichment events)' },
  cache: { icon: '💾', description: 'General purpose cache storage' },
  settings: { icon: '⚙️', description: 'Application settings and preferences' },
  similarities: { icon: '🔗', description: 'Precomputed bookmark similarity scores' },
  computedMetrics: { icon: '📈', description: 'Cached computed metrics with TTL' },
  enrichmentQueue: { icon: '⏳', description: 'Queue of bookmarks pending enrichment' }
};

/**
 * Known computed metrics with their expected TTLs
 */
const KNOWN_METRICS = [
  { key: 'domainStats', ttl: '1 hour', description: 'Top domains by bookmark count' },
  { key: 'activityTimeline', ttl: '6 hours', description: 'Monthly bookmark creation timeline' },
  { key: 'quickStats', ttl: '5 minutes', description: 'Dashboard quick statistics' },
  { key: 'wordFrequency', ttl: '24 hours', description: 'Title word frequency analysis' },
  { key: 'ageDistribution', ttl: '6 hours', description: 'Bookmark age distribution' },
  { key: 'categoryTrends', ttl: '24 hours', description: 'Category distribution over time' },
  { key: 'expertiseAreas', ttl: '24 hours', description: 'User expertise based on bookmarks' },
  { key: 'duplicates', ttl: '24 hours', description: 'Detected duplicate bookmarks' },
  { key: 'similarities', ttl: '24 hours', description: 'Similar bookmark pairs' },
  { key: 'insightsSummary', ttl: '5 minutes', description: 'Aggregated insights summary' }
];

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
          ...TABLE_META[name]
        };
      } catch (e) {
        return {
          name,
          count: 0,
          ...TABLE_META[name],
          error: e.message
        };
      }
    })
  );
  
  const totalRecords = tables.reduce((sum, t) => sum + t.count, 0);
  const estimatedSize = await estimateDatabaseSize();
  
  return {
    tables,
    totalRecords,
    estimatedSize,
    lastChecked: Date.now()
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
    fieldFilter = null // { field: 'category', hasValue: true/false }
  } = options;
  
  let records = await db[tableName].toArray();
  
  // Apply field filter (show only records with/without a specific field)
  if (fieldFilter) {
    records = records.filter(record => {
      const value = record[fieldFilter.field];
      const hasValue = value !== null && value !== undefined && value !== '' && 
                       !(Array.isArray(value) && value.length === 0);
      return fieldFilter.hasValue ? hasValue : !hasValue;
    });
  }
  
  // Apply search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    records = records.filter(record => {
      if (searchField === 'all') {
        return JSON.stringify(record).toLowerCase().includes(query);
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
    hasPrev: page > 0
  };
}

/**
 * Get a single record by primary key
 */
export async function getRecord(tableName, key) {
  try {
    return await db[tableName].get(key);
  } catch (e) {
    console.error(`Error getting record from ${tableName}:`, e);
    return null;
  }
}

/**
 * Analyze field coverage in a table
 */
export async function analyzeTableFields(tableName) {
  const records = await db[tableName].toArray();
  const fieldStats = {};
  
  records.forEach(record => {
    Object.keys(record).forEach(key => {
      if (!fieldStats[key]) {
        fieldStats[key] = { 
          field: key,
          populated: 0, 
          empty: 0, 
          samples: [],
          types: new Set()
        };
      }
      
      const value = record[key];
      const isEmpty = value === null || value === undefined || value === '' || 
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
  return Object.values(fieldStats).map(stat => ({
    ...stat,
    types: [...stat.types],
    total,
    coverage: total > 0 ? parseFloat(((stat.populated / total) * 100).toFixed(1)) : 0
  })).sort((a, b) => b.coverage - a.coverage);
}

/**
 * Get the list of field names for a table
 */
export async function getTableFields(tableName) {
  const records = await db[tableName].limit(100).toArray();
  const fields = new Set();
  
  records.forEach(record => {
    Object.keys(record).forEach(key => fields.add(key));
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
  const cachedKeys = new Set(metrics.map(m => m.key));
  
  const result = metrics.map(m => {
    const timeRemaining = m.validUntil - now;
    let status = 'valid';
    if (timeRemaining <= 0) status = 'stale';
    else if (timeRemaining < 60 * 60 * 1000) status = 'expiring'; // < 1 hour
    
    const knownMeta = KNOWN_METRICS.find(km => km.key === m.key);
    
    return {
      key: m.key,
      description: knownMeta?.description || 'Custom metric',
      expectedTtl: knownMeta?.ttl || 'Unknown',
      computedAt: m.computedAt,
      validUntil: m.validUntil,
      timeRemaining,
      status,
      dataSize: JSON.stringify(m.data || {}).length,
      hasData: !!m.data
    };
  });
  
  // Add known metrics that haven't been cached yet
  KNOWN_METRICS.forEach(km => {
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
        hasData: false
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
 * Invalidate (delete) a cached metric
 */
export async function invalidateMetric(key) {
  try {
    await db.computedMetrics.delete(key);
    return true;
  } catch (e) {
    console.error(`Error invalidating metric ${key}:`, e);
    return false;
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
 * Clear all cached metrics
 */
export async function clearAllMetrics() {
  try {
    await db.computedMetrics.clear();
    return true;
  } catch (e) {
    console.error('Error clearing metrics:', e);
    return false;
  }
}

/**
 * Get Mermaid diagram definition based on actual cache status
 */
export async function getMetricsFlowDiagram() {
  const cacheStatus = await getCachedMetricsStatus();
  const statusMap = Object.fromEntries(cacheStatus.map(c => [c.key, c.status]));
  
  const getStyle = (key) => {
    switch(statusMap[key]) {
      case 'valid': return 'fill:#10b981,color:#fff'; // green
      case 'expiring': return 'fill:#f59e0b,color:#fff'; // yellow
      case 'stale': return 'fill:#ef4444,color:#fff'; // red
      default: return 'fill:#9ca3af,color:#fff'; // gray
    }
  };
  
  return `
graph TD
    subgraph Sources["📥 Data Sources"]
        A[Chrome Bookmarks API]
        B[User Activity]
    end
    
    subgraph Storage["🗄️ Primary Storage"]
        C[(Bookmarks Table)]
        D[(Events Table)]
    end
    
    subgraph Enrichment["🔄 Enrichment Engine"]
        E[Fetch Metadata]
        F[Auto-Categorize]
        G[Dead Link Check]
    end
    
    subgraph Metrics["📊 Computed Metrics"]
        H[domainStats]
        I[activityTimeline]
        J[quickStats]
        K[similarities]
        L[wordFrequency]
    end
    
    subgraph Insights["🎯 Final Insights"]
        M[insightsSummary]
        N[expertiseAreas]
        O[Stale Detection]
    end
    
    A --> C
    B --> D
    C --> E
    E --> F
    E --> G
    C --> H
    C --> I
    C --> J
    C --> L
    F --> K
    H --> M
    I --> M
    K --> M
    L --> M
    M --> N
    M --> O
    
    style H ${getStyle('domainStats')}
    style I ${getStyle('activityTimeline')}
    style J ${getStyle('quickStats')}
    style K ${getStyle('similarities')}
    style L ${getStyle('wordFrequency')}
    style M ${getStyle('insightsSummary')}
    style N ${getStyle('expertiseAreas')}
  `;
}

/**
 * Export table as JSON with optional filtering
 */
export async function exportTableAsJSON(tableName, options = {}) {
  const { records } = await getTableRecords(tableName, { 
    ...options, 
    pageSize: 999999 // Get all matching records
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
 * Estimate database size in bytes
 */
async function estimateDatabaseSize() {
  let totalSize = 0;
  
  const tableNames = Object.keys(TABLE_META);
  
  for (const tableName of tableNames) {
    try {
      const records = await db[tableName].toArray();
      totalSize += JSON.stringify(records).length;
    } catch (e) {
      // Table might not exist yet
    }
  }
  
  // Format as human readable
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

/**
 * Format bytes for display
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
