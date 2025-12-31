// Deep metadata analyzer for extracting reading time, published date, content quality, and smart tags
// Works with existing rawMetadata without requiring additional network requests

/**
 * Extract reading time estimate from metadata and content
 * @param {Object} metadata - Raw metadata object with Open Graph, Schema.org, etc.
 * @param {string} contentSnippet - Optional content snippet for word count
 * @returns {number|null} - Estimated reading time in minutes, or null if cannot determine
 */
export function extractReadingTime(metadata, contentSnippet = '') {
  if (!metadata) return null;

  // 1. Check for explicit video duration (YouTube, Vimeo, etc.)
  if (metadata['og:video:duration']) {
    const durationSeconds = parseInt(metadata['og:video:duration'], 10);
    return Math.ceil(durationSeconds / 60); // Convert to minutes
  }

  if (metadata['video:duration']) {
    const durationSeconds = parseInt(metadata['video:duration'], 10);
    return Math.ceil(durationSeconds / 60);
  }

  // 2. Check Schema.org VideoObject duration (ISO 8601 format like PT1H23M45S)
  if (metadata.schemaOrg) {
    const schemas = Array.isArray(metadata.schemaOrg) ? metadata.schemaOrg : [metadata.schemaOrg];
    for (const schema of schemas) {
      if (schema['@type'] === 'VideoObject' && schema.duration) {
        const minutes = parseISO8601Duration(schema.duration);
        if (minutes) return minutes;
      }
    }
  }

  // 3. Estimate from word count for articles
  const wordCount = estimateWordCount(metadata, contentSnippet);
  if (wordCount > 0) {
    // Average reading speed: 200-250 words per minute, use 225
    return Math.ceil(wordCount / 225);
  }

  return null;
}

/**
 * Extract published date from metadata with smart fallback
 * @param {Object} metadata - Raw metadata object
 * @returns {number|null} - Published date as Unix timestamp, or null if not found
 */
export function extractPublishedDate(metadata) {
  if (!metadata) return null;

  // Priority order: article:published_time > datePublished > og:updated_time > dateModified
  const dateFields = [
    'article:published_time',
    'datePublished',
    'og:published_time',
    'publication_date',
    'publishedDate',
    'date',
    'og:updated_time',
    'article:modified_time',
    'dateModified',
    'lastmod'
  ];

  for (const field of dateFields) {
    const dateValue = metadata[field];
    if (dateValue) {
      const timestamp = parseDate(dateValue);
      if (timestamp) return timestamp;
    }
  }

  // Check Schema.org structured data
  if (metadata.schemaOrg) {
    const schemas = Array.isArray(metadata.schemaOrg) ? metadata.schemaOrg : [metadata.schemaOrg];
    for (const schema of schemas) {
      // Check datePublished, dateCreated, dateModified
      const schemaDate = schema.datePublished || schema.dateCreated || schema.dateModified;
      if (schemaDate) {
        const timestamp = parseDate(schemaDate);
        if (timestamp) return timestamp;
      }
    }
  }

  return null;
}

/**
 * Generate smart tags by aggregating keywords from multiple metadata sources
 * @param {Object} metadata - Raw metadata object
 * @param {string} title - Bookmark title
 * @param {string} description - Bookmark description
 * @returns {string[]} - Array of unique smart tags
 */
export function extractSmartTags(metadata, title = '', description = '') {
  const tags = new Set();

  if (!metadata) return [];

  // 1. Extract from meta keywords
  if (metadata.keywords) {
    const keywords = typeof metadata.keywords === 'string' 
      ? metadata.keywords.split(',').map(k => k.trim())
      : metadata.keywords;
    keywords.forEach(tag => {
      if (tag && tag.length >= 3 && tag.length <= 30) {
        tags.add(tag.toLowerCase());
      }
    });
  }

  // 2. Extract from article:tag (common in blogs)
  if (metadata['article:tag']) {
    const articleTags = Array.isArray(metadata['article:tag']) 
      ? metadata['article:tag'] 
      : [metadata['article:tag']];
    articleTags.forEach(tag => {
      if (tag && tag.length >= 3 && tag.length <= 30) {
        tags.add(tag.toLowerCase());
      }
    });
  }

  // 3. Extract from Schema.org keywords
  if (metadata.schemaOrg) {
    const schemas = Array.isArray(metadata.schemaOrg) ? metadata.schemaOrg : [metadata.schemaOrg];
    for (const schema of schemas) {
      if (schema.keywords) {
        const schemaKeywords = typeof schema.keywords === 'string'
          ? schema.keywords.split(',').map(k => k.trim())
          : Array.isArray(schema.keywords) ? schema.keywords : [];
        schemaKeywords.forEach(tag => {
          if (tag && tag.length >= 3 && tag.length <= 30) {
            tags.add(tag.toLowerCase());
          }
        });
      }
    }
  }

  // 4. Extract from og:video:tag or similar
  if (metadata['og:video:tag']) {
    const videoTags = Array.isArray(metadata['og:video:tag']) 
      ? metadata['og:video:tag'] 
      : [metadata['og:video:tag']];
    videoTags.forEach(tag => {
      if (tag && tag.length >= 3 && tag.length <= 30) {
        tags.add(tag.toLowerCase());
      }
    });
  }

  // 5. Extract content type as tag
  if (metadata['og:type']) {
    tags.add(metadata['og:type'].toLowerCase());
  }

  // 6. Extract common technical terms from title/description (optional - can be noisy)
  const technicalTerms = extractTechnicalTerms(title + ' ' + description);
  technicalTerms.forEach(term => tags.add(term));

  // Limit to top 20 most relevant tags
  return Array.from(tags).slice(0, 20);
}

/**
 * Calculate content quality score based on metadata completeness and richness
 * @param {Object} metadata - Raw metadata object
 * @param {Object} bookmark - Bookmark object with title, description
 * @returns {number} - Quality score from 0-100
 */
export function calculateContentQuality(metadata, bookmark = {}) {
  if (!metadata) return 0;

  let score = 0;
  const maxScore = 100;

  // 1. Title quality (20 points)
  if (bookmark.title && bookmark.title.length > 10) {
    score += 10;
    if (bookmark.title.length > 30 && bookmark.title.length < 100) {
      score += 10; // Good length
    }
  }

  // 2. Description quality (20 points)
  if (metadata.description || metadata['og:description']) {
    const desc = metadata.description || metadata['og:description'];
    if (desc.length > 50) {
      score += 10;
      if (desc.length > 150 && desc.length < 500) {
        score += 10; // Detailed description
      }
    }
  }

  // 3. Image presence (10 points)
  if (metadata['og:image'] || metadata.image || metadata['twitter:image']) {
    score += 10;
  }

  // 4. Structured data presence (15 points)
  if (metadata.schemaOrg) {
    score += 10;
    // Bonus for rich schema types
    const schemas = Array.isArray(metadata.schemaOrg) ? metadata.schemaOrg : [metadata.schemaOrg];
    const hasRichSchema = schemas.some(s => 
      ['Article', 'BlogPosting', 'TechArticle', 'VideoObject', 'Course'].includes(s['@type'])
    );
    if (hasRichSchema) score += 5;
  }

  // 5. Author/creator metadata (10 points)
  if (metadata['article:author'] || metadata.author || metadata['og:author']) {
    score += 10;
  }

  // 6. Published date (10 points)
  if (extractPublishedDate(metadata)) {
    score += 10;
  }

  // 7. Keywords/tags (10 points)
  const tags = extractSmartTags(metadata, bookmark.title, bookmark.description);
  if (tags.length > 0) {
    score += 5;
    if (tags.length >= 5) {
      score += 5; // Rich tagging
    }
  }

  // 8. Content type specified (5 points)
  if (metadata['og:type']) {
    score += 5;
  }

  return Math.min(score, maxScore);
}

/**
 * Main analysis function - extracts all deep metadata fields
 * @param {Object} bookmark - Full bookmark object with rawMetadata
 * @returns {Object} - Object with readingTime, publishedDate, contentQualityScore, smartTags
 */
export function analyzeBookmarkMetadata(bookmark) {
  if (!bookmark) return null;

  const metadata = bookmark.rawMetadata || {};
  
  return {
    readingTime: extractReadingTime(metadata, bookmark.contentSnippet),
    publishedDate: extractPublishedDate(metadata),
    contentQualityScore: calculateContentQuality(metadata, bookmark),
    smartTags: extractSmartTags(metadata, bookmark.title, bookmark.description)
  };
}

// ========== Helper Functions ==========

/**
 * Parse ISO 8601 duration format (PT1H23M45S) to minutes
 */
function parseISO8601Duration(duration) {
  if (!duration || typeof duration !== 'string') return null;

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 60 + minutes + Math.ceil(seconds / 60);
}

/**
 * Estimate word count from metadata and content snippet
 */
function estimateWordCount(metadata, contentSnippet) {
  let wordCount = 0;

  // Check Schema.org wordCount
  if (metadata.schemaOrg) {
    const schemas = Array.isArray(metadata.schemaOrg) ? metadata.schemaOrg : [metadata.schemaOrg];
    for (const schema of schemas) {
      if (schema.wordCount) {
        return parseInt(schema.wordCount, 10);
      }
    }
  }

  // Estimate from content snippet if available
  if (contentSnippet && contentSnippet.length > 100) {
    wordCount = contentSnippet.split(/\s+/).length;
    // Extrapolate: if we have a snippet, assume full article is ~5x longer
    wordCount = wordCount * 5;
  }

  // Fallback: estimate from description length
  const description = metadata.description || metadata['og:description'] || '';
  if (description.length > 200 && wordCount === 0) {
    // Very rough estimate: description hints at article length
    // Short desc (200-500) = 500-1000 words
    // Medium desc (500-1000) = 1000-2000 words
    // Long desc (1000+) = 2000+ words
    if (description.length < 500) {
      wordCount = 750;
    } else if (description.length < 1000) {
      wordCount = 1500;
    } else {
      wordCount = 2500;
    }
  }

  return wordCount;
}

/**
 * Parse various date formats to Unix timestamp
 */
function parseDate(dateString) {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  } catch (e) {
    // Invalid date
  }

  return null;
}

/**
 * Extract common technical terms from text
 */
function extractTechnicalTerms(text) {
  if (!text) return [];

  const terms = new Set();
  const techKeywords = [
    'javascript', 'typescript', 'python', 'java', 'react', 'vue', 'angular', 
    'node', 'express', 'api', 'rest', 'graphql', 'sql', 'nosql', 'mongodb',
    'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'cloud', 'serverless',
    'ml', 'ai', 'machine learning', 'deep learning', 'neural network',
    'frontend', 'backend', 'fullstack', 'devops', 'ci/cd', 'testing',
    'security', 'performance', 'optimization', 'design', 'architecture'
  ];

  const lowerText = text.toLowerCase();
  for (const keyword of techKeywords) {
    if (lowerText.includes(keyword)) {
      terms.add(keyword);
    }
  }

  return Array.from(terms).slice(0, 10); // Limit to 10 technical terms
}
