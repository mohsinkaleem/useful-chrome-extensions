// Platform-specific URL parsers for extracting structured data from bookmark URLs
// Extracts platform, content type, creator, and other structured info without additional fetches

/**
 * Main entry point - parse a bookmark URL and extract structured platform data
 * @param {string} url - The bookmark URL to parse
 * @param {Object} metadata - Optional metadata object with Schema.org types for enhanced detection
 * @returns {Object} Structured platform data
 */
export function parseBookmarkUrl(url, metadata = null) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Try platform-specific parsers
    if (isYouTube(hostname)) {
      return parseYouTubeUrl(urlObj, metadata);
    }
    if (isGitHub(hostname)) {
      return parseGitHubUrl(urlObj, metadata);
    }
    if (isMedium(hostname)) {
      return parseMediumUrl(urlObj, metadata);
    }
    if (isDevTo(hostname)) {
      return parseDevToUrl(urlObj, metadata);
    }
    if (isSubstack(hostname)) {
      return parseSubstackUrl(urlObj, metadata);
    }
    if (isTwitter(hostname)) {
      return parseTwitterUrl(urlObj, metadata);
    }
    if (isReddit(hostname)) {
      return parseRedditUrl(urlObj, metadata);
    }
    if (isStackOverflow(hostname)) {
      return parseStackOverflowUrl(urlObj, metadata);
    }
    if (isNpm(hostname)) {
      return parseNpmUrl(urlObj, metadata);
    }
    
    // Generic parsing for unknown platforms (use Schema.org if available)
    return parseGenericUrl(urlObj, metadata);
  } catch (e) {
    console.warn('Error parsing URL:', url, e);
    return null;
  }
}

/**
 * Enhance content type detection using Schema.org structured data
 * @param {Object} platformData - Platform data from URL parsing
 * @param {Object} metadata - Raw metadata with schemaOrg field
 * @returns {Object} Enhanced platform data with refined type
 */
export function enhanceWithSchemaOrg(platformData, metadata) {
  if (!metadata || !metadata.schemaOrg || !platformData) {
    return platformData;
  }

  const schemas = Array.isArray(metadata.schemaOrg) ? metadata.schemaOrg : [metadata.schemaOrg];
  
  for (const schema of schemas) {
    const schemaType = schema['@type'];
    
    // Map Schema.org types to more specific content types
    switch (schemaType) {
      case 'TechArticle':
        platformData.type = 'tech-article';
        platformData.subtype = 'technical';
        break;
      case 'BlogPosting':
        platformData.type = 'blog-post';
        platformData.subtype = 'blog';
        break;
      case 'NewsArticle':
        platformData.type = 'news-article';
        platformData.subtype = 'news';
        break;
      case 'ScholarlyArticle':
        platformData.type = 'scholarly-article';
        platformData.subtype = 'academic';
        break;
      case 'VideoObject':
        if (platformData.type !== 'video') {
          platformData.type = 'video';
        }
        platformData.subtype = 'video-content';
        break;
      case 'Course':
        platformData.type = 'course';
        platformData.subtype = 'education';
        break;
      case 'HowTo':
        platformData.type = 'tutorial';
        platformData.subtype = 'how-to';
        break;
      case 'FAQPage':
        platformData.type = 'faq';
        platformData.subtype = 'reference';
        break;
      case 'SoftwareApplication':
        platformData.type = 'software';
        platformData.subtype = 'tool';
        break;
      case 'APIReference':
        platformData.type = 'api-docs';
        platformData.subtype = 'documentation';
        break;
    }
    
    // Extract author from Schema.org if not already set
    if (schema.author && !platformData.creator) {
      if (typeof schema.author === 'object') {
        platformData.creator = schema.author.name || schema.author['@id'];
      } else {
        platformData.creator = schema.author;
      }
    }
  }
  
  return platformData;
}

// Platform detection helpers
function isYouTube(hostname) {
  return hostname === 'youtube.com' || 
         hostname === 'www.youtube.com' || 
         hostname === 'm.youtube.com' ||
         hostname === 'youtu.be' ||
         hostname === 'music.youtube.com';
}

function isGitHub(hostname) {
  return hostname === 'github.com' || 
         hostname === 'www.github.com' ||
         hostname === 'gist.github.com';
}

function isMedium(hostname) {
  return hostname === 'medium.com' || 
         hostname.endsWith('.medium.com');
}

function isDevTo(hostname) {
  return hostname === 'dev.to' || hostname === 'www.dev.to';
}

function isSubstack(hostname) {
  return hostname.endsWith('.substack.com');
}

function isTwitter(hostname) {
  return hostname === 'twitter.com' || 
         hostname === 'www.twitter.com' ||
         hostname === 'x.com' ||
         hostname === 'www.x.com';
}

function isReddit(hostname) {
  return hostname === 'reddit.com' || 
         hostname === 'www.reddit.com' ||
         hostname === 'old.reddit.com' ||
         hostname.endsWith('.reddit.com');
}

function isStackOverflow(hostname) {
  return hostname === 'stackoverflow.com' || 
         hostname === 'www.stackoverflow.com' ||
         hostname.endsWith('.stackexchange.com');
}

function isNpm(hostname) {
  return hostname === 'npmjs.com' || 
         hostname === 'www.npmjs.com';
}

/**
 * Parse YouTube URLs
 * Extracts video ID, channel handle, playlist ID, etc.
 */
function parseYouTubeUrl(urlObj) {
  const pathname = urlObj.pathname;
  const searchParams = urlObj.searchParams;
  const hostname = urlObj.hostname;
  
  const result = {
    platform: 'youtube',
    type: null,
    creator: null,
    identifier: null,
    subtype: null,
    extra: {}
  };
  
  // Short URL format: youtu.be/VIDEO_ID
  if (hostname === 'youtu.be') {
    const videoId = pathname.slice(1);
    if (videoId) {
      result.type = 'video';
      result.identifier = videoId;
      
      // Check for timestamp
      const timestamp = searchParams.get('t');
      if (timestamp) {
        result.extra.timestamp = timestamp;
      }
    }
    return result;
  }
  
  // YouTube Music
  if (hostname === 'music.youtube.com') {
    result.subtype = 'music';
  }
  
  // Video page: /watch?v=VIDEO_ID
  if (pathname === '/watch') {
    const videoId = searchParams.get('v');
    if (videoId) {
      result.type = 'video';
      result.identifier = videoId;
      
      // Check for playlist
      const listId = searchParams.get('list');
      if (listId) {
        result.extra.playlistId = listId;
      }
      
      // Check for timestamp
      const timestamp = searchParams.get('t');
      if (timestamp) {
        result.extra.timestamp = timestamp;
      }
    }
    return result;
  }
  
  // Shorts: /shorts/VIDEO_ID
  if (pathname.startsWith('/shorts/')) {
    const videoId = pathname.split('/shorts/')[1]?.split('/')[0];
    if (videoId) {
      result.type = 'video';
      result.subtype = 'short';
      result.identifier = videoId;
    }
    return result;
  }
  
  // Live streams: /live/VIDEO_ID
  if (pathname.startsWith('/live/')) {
    const videoId = pathname.split('/live/')[1]?.split('/')[0];
    if (videoId) {
      result.type = 'video';
      result.subtype = 'live';
      result.identifier = videoId;
    }
    return result;
  }
  
  // Channel by handle: /@handle
  if (pathname.startsWith('/@')) {
    const parts = pathname.slice(2).split('/');
    const handle = parts[0];
    result.type = 'channel';
    result.creator = `@${handle}`;
    result.identifier = handle;
    
    // Sub-sections of channel
    if (parts[1]) {
      result.extra.section = parts[1]; // videos, shorts, live, playlists, community, etc.
    }
    return result;
  }
  
  // Channel by ID: /channel/CHANNEL_ID
  if (pathname.startsWith('/channel/')) {
    const parts = pathname.split('/channel/')[1]?.split('/');
    const channelId = parts?.[0];
    if (channelId) {
      result.type = 'channel';
      result.identifier = channelId;
      
      if (parts?.[1]) {
        result.extra.section = parts[1];
      }
    }
    return result;
  }
  
  // Legacy channel URL: /c/CHANNEL_NAME or /user/USERNAME
  if (pathname.startsWith('/c/') || pathname.startsWith('/user/')) {
    const match = pathname.match(/^\/(c|user)\/([^\/]+)/);
    if (match) {
      result.type = 'channel';
      result.identifier = match[2];
      result.extra.urlType = match[1]; // 'c' or 'user'
    }
    return result;
  }
  
  // Playlist: /playlist?list=PLAYLIST_ID
  if (pathname === '/playlist') {
    const listId = searchParams.get('list');
    if (listId) {
      result.type = 'playlist';
      result.identifier = listId;
    }
    return result;
  }
  
  // Search results: /results?search_query=QUERY
  if (pathname === '/results') {
    const query = searchParams.get('search_query');
    if (query) {
      result.type = 'search';
      result.extra.query = query;
    }
    return result;
  }
  
  return result;
}

/**
 * Parse GitHub URLs
 * Extracts owner, repo, content type, branch, file path, etc.
 */
function parseGitHubUrl(urlObj) {
  const pathname = urlObj.pathname;
  const hostname = urlObj.hostname;
  
  const result = {
    platform: 'github',
    type: null,
    creator: null,
    identifier: null,
    subtype: null,
    extra: {}
  };
  
  // Gist: gist.github.com/USER/GIST_ID
  if (hostname === 'gist.github.com') {
    const parts = pathname.slice(1).split('/').filter(Boolean);
    if (parts.length >= 1) {
      result.type = 'gist';
      result.creator = parts[0];
      if (parts.length >= 2) {
        result.identifier = parts[1];
      }
    }
    return result;
  }
  
  const parts = pathname.slice(1).split('/').filter(Boolean);
  
  if (parts.length === 0) {
    result.type = 'home';
    return result;
  }
  
  // User/Org profile: /USER
  if (parts.length === 1) {
    const username = parts[0];
    // Check if it's a special page
    if (['explore', 'trending', 'topics', 'collections', 'sponsors', 'marketplace', 'settings', 'notifications'].includes(username)) {
      result.type = 'special';
      result.identifier = username;
    } else {
      result.type = 'profile';
      result.creator = username;
      result.identifier = username;
    }
    return result;
  }
  
  // Repository or sub-pages: /OWNER/REPO[/...]
  const owner = parts[0];
  const repo = parts[1];
  
  result.creator = owner;
  result.identifier = repo;
  result.extra.owner = owner;
  result.extra.repo = repo;
  
  // Just the repo root: /OWNER/REPO
  if (parts.length === 2) {
    result.type = 'repo';
    return result;
  }
  
  const subPath = parts[2];
  
  // Issues
  if (subPath === 'issues') {
    if (parts.length === 3) {
      result.type = 'issues';
      result.subtype = 'list';
    } else {
      const issueNumber = parts[3];
      if (issueNumber === 'new') {
        result.type = 'issues';
        result.subtype = 'new';
      } else if (/^\d+$/.test(issueNumber)) {
        result.type = 'issue';
        result.extra.number = parseInt(issueNumber, 10);
      }
    }
    return result;
  }
  
  // Pull Requests
  if (subPath === 'pull') {
    if (parts.length >= 4) {
      const prNumber = parts[3];
      if (/^\d+$/.test(prNumber)) {
        result.type = 'pr';
        result.extra.number = parseInt(prNumber, 10);
        
        if (parts.length >= 5) {
          result.extra.tab = parts[4]; // commits, files, checks, etc.
        }
      }
    }
    return result;
  }
  
  // Pull Requests list
  if (subPath === 'pulls') {
    result.type = 'pulls';
    result.subtype = 'list';
    return result;
  }
  
  // Actions
  if (subPath === 'actions') {
    result.type = 'actions';
    if (parts.length >= 4) {
      if (parts[3] === 'runs' && parts[4]) {
        result.subtype = 'run';
        result.extra.runId = parts[4];
      } else if (parts[3] === 'workflows' && parts[4]) {
        result.subtype = 'workflow';
        result.extra.workflowFile = parts[4];
      }
    }
    return result;
  }
  
  // Releases
  if (subPath === 'releases') {
    result.type = 'releases';
    if (parts.length >= 4) {
      if (parts[3] === 'tag') {
        result.subtype = 'tag';
        result.extra.tag = parts[4];
      } else if (parts[3] === 'latest') {
        result.subtype = 'latest';
      }
    }
    return result;
  }
  
  // Wiki
  if (subPath === 'wiki') {
    result.type = 'wiki';
    if (parts.length >= 4) {
      result.extra.page = parts.slice(3).join('/');
    }
    return result;
  }
  
  // Discussions
  if (subPath === 'discussions') {
    result.type = 'discussions';
    if (parts.length >= 4 && /^\d+$/.test(parts[3])) {
      result.subtype = 'discussion';
      result.extra.number = parseInt(parts[3], 10);
    }
    return result;
  }
  
  // Commits
  if (subPath === 'commits' || subPath === 'commit') {
    if (subPath === 'commit' && parts.length >= 4) {
      result.type = 'commit';
      result.extra.sha = parts[3];
    } else {
      result.type = 'commits';
      if (parts.length >= 4) {
        result.extra.branch = parts[3];
      }
    }
    return result;
  }
  
  // Branches
  if (subPath === 'branches') {
    result.type = 'branches';
    return result;
  }
  
  // Tags
  if (subPath === 'tags') {
    result.type = 'tags';
    return result;
  }
  
  // File browsing: blob or tree
  if (subPath === 'blob' || subPath === 'tree') {
    result.type = 'file';
    result.subtype = subPath; // 'blob' = file, 'tree' = directory
    
    if (parts.length >= 4) {
      result.extra.branch = parts[3];
      if (parts.length >= 5) {
        result.extra.path = parts.slice(4).join('/');
        
        // Extract file extension for files
        if (subPath === 'blob') {
          const fileName = parts[parts.length - 1];
          const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
          if (extMatch) {
            result.extra.extension = extMatch[1].toLowerCase();
          }
        }
      }
    }
    return result;
  }
  
  // Search in repo
  if (subPath === 'search') {
    result.type = 'search';
    result.extra.query = urlObj.searchParams.get('q');
    return result;
  }
  
  // Default - repository with unknown subpath
  result.type = 'repo';
  result.extra.subPath = parts.slice(2).join('/');
  
  return result;
}

/**
 * Parse Medium URLs
 * Extracts author and publication info
 */
function parseMediumUrl(urlObj) {
  const hostname = urlObj.hostname;
  const pathname = urlObj.pathname;
  
  const result = {
    platform: 'medium',
    type: 'article',
    creator: null,
    identifier: null,
    subtype: null,
    extra: {}
  };
  
  // Publication subdomain: publication.medium.com
  if (hostname !== 'medium.com' && hostname.endsWith('.medium.com')) {
    const publication = hostname.replace('.medium.com', '');
    result.extra.publication = publication;
    
    const parts = pathname.slice(1).split('/').filter(Boolean);
    if (parts.length > 0 && parts[0].startsWith('@')) {
      result.creator = parts[0];
    }
    
    // Article slug is usually the last part with a hash ID
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.includes('-')) {
      result.identifier = lastPart;
    }
    
    return result;
  }
  
  const parts = pathname.slice(1).split('/').filter(Boolean);
  
  // Author page: medium.com/@username
  if (parts.length >= 1 && parts[0].startsWith('@')) {
    result.creator = parts[0];
    
    if (parts.length === 1) {
      result.type = 'profile';
    } else {
      // Article: medium.com/@username/article-slug-id
      result.type = 'article';
      result.identifier = parts[1];
    }
    return result;
  }
  
  // Publication on main domain: medium.com/publication/article
  if (parts.length >= 1) {
    result.extra.publication = parts[0];
    
    if (parts.length >= 2) {
      result.identifier = parts[parts.length - 1];
    }
  }
  
  return result;
}

/**
 * Parse dev.to URLs
 * Extracts author, tags, and series info
 */
function parseDevToUrl(urlObj) {
  const pathname = urlObj.pathname;
  const parts = pathname.slice(1).split('/').filter(Boolean);
  
  const result = {
    platform: 'devto',
    type: 'article',
    creator: null,
    identifier: null,
    subtype: null,
    extra: {}
  };
  
  if (parts.length === 0) {
    result.type = 'home';
    return result;
  }
  
  // Tag page: dev.to/t/tagname
  if (parts[0] === 't' && parts.length >= 2) {
    result.type = 'tag';
    result.identifier = parts[1];
    return result;
  }
  
  // Author profile: dev.to/username
  if (parts.length === 1) {
    result.type = 'profile';
    result.creator = parts[0];
    result.identifier = parts[0];
    return result;
  }
  
  // Article: dev.to/username/article-slug
  if (parts.length >= 2) {
    result.type = 'article';
    result.creator = parts[0];
    result.identifier = parts[1];
  }
  
  return result;
}

/**
 * Parse Substack URLs
 * Extracts publication from subdomain
 */
function parseSubstackUrl(urlObj) {
  const hostname = urlObj.hostname;
  const pathname = urlObj.pathname;
  
  const publication = hostname.replace('.substack.com', '');
  const parts = pathname.slice(1).split('/').filter(Boolean);
  
  const result = {
    platform: 'substack',
    type: 'publication',
    creator: publication,
    identifier: publication,
    subtype: null,
    extra: {
      publication: publication
    }
  };
  
  // Post: publication.substack.com/p/post-slug
  if (parts.length >= 2 && parts[0] === 'p') {
    result.type = 'article';
    result.identifier = parts[1];
    return result;
  }
  
  // Archive page
  if (parts.length >= 1 && parts[0] === 'archive') {
    result.type = 'archive';
    return result;
  }
  
  // About page
  if (parts.length >= 1 && parts[0] === 'about') {
    result.type = 'about';
    return result;
  }
  
  return result;
}

/**
 * Parse Twitter/X URLs
 */
function parseTwitterUrl(urlObj) {
  const pathname = urlObj.pathname;
  const parts = pathname.slice(1).split('/').filter(Boolean);
  
  const result = {
    platform: 'twitter',
    type: null,
    creator: null,
    identifier: null,
    subtype: null,
    extra: {}
  };
  
  if (parts.length === 0) {
    result.type = 'home';
    return result;
  }
  
  // Special pages
  if (['home', 'explore', 'search', 'notifications', 'messages', 'settings', 'i'].includes(parts[0])) {
    result.type = 'special';
    result.identifier = parts[0];
    return result;
  }
  
  // Hashtag: twitter.com/hashtag/tagname
  if (parts[0] === 'hashtag' && parts.length >= 2) {
    result.type = 'hashtag';
    result.identifier = parts[1];
    return result;
  }
  
  // User profile or tweet
  const username = parts[0];
  result.creator = `@${username}`;
  
  if (parts.length === 1) {
    result.type = 'profile';
    result.identifier = username;
    return result;
  }
  
  // Tweet: twitter.com/username/status/TWEET_ID
  if (parts[1] === 'status' && parts.length >= 3) {
    result.type = 'tweet';
    result.identifier = parts[2];
    return result;
  }
  
  // Profile sections
  if (['followers', 'following', 'likes', 'lists', 'moments'].includes(parts[1])) {
    result.type = 'profile';
    result.identifier = username;
    result.extra.section = parts[1];
    return result;
  }
  
  return result;
}

/**
 * Parse Reddit URLs
 */
function parseRedditUrl(urlObj) {
  const pathname = urlObj.pathname;
  const parts = pathname.slice(1).split('/').filter(Boolean);
  
  const result = {
    platform: 'reddit',
    type: null,
    creator: null,
    identifier: null,
    subtype: null,
    extra: {}
  };
  
  if (parts.length === 0) {
    result.type = 'home';
    return result;
  }
  
  // Subreddit: reddit.com/r/subreddit
  if (parts[0] === 'r' && parts.length >= 2) {
    const subreddit = parts[1];
    result.type = 'subreddit';
    result.creator = `r/${subreddit}`;
    result.identifier = subreddit;
    
    // Post: reddit.com/r/subreddit/comments/POST_ID/title
    if (parts.length >= 4 && parts[2] === 'comments') {
      result.type = 'post';
      result.extra.postId = parts[3];
      result.extra.subreddit = subreddit;
      if (parts.length >= 5) {
        result.extra.title = parts[4];
      }
    }
    
    return result;
  }
  
  // User profile: reddit.com/u/username or reddit.com/user/username
  if ((parts[0] === 'u' || parts[0] === 'user') && parts.length >= 2) {
    result.type = 'profile';
    result.creator = `u/${parts[1]}`;
    result.identifier = parts[1];
    
    if (parts.length >= 3) {
      result.extra.section = parts[2]; // posts, comments, submitted, etc.
    }
    return result;
  }
  
  return result;
}

/**
 * Parse Stack Overflow URLs
 */
function parseStackOverflowUrl(urlObj) {
  const hostname = urlObj.hostname;
  const pathname = urlObj.pathname;
  const parts = pathname.slice(1).split('/').filter(Boolean);
  
  const result = {
    platform: 'stackoverflow',
    type: null,
    creator: null,
    identifier: null,
    subtype: null,
    extra: {}
  };
  
  // Check for Stack Exchange sites
  if (hostname.endsWith('.stackexchange.com')) {
    result.extra.site = hostname.replace('.stackexchange.com', '');
  }
  
  if (parts.length === 0) {
    result.type = 'home';
    return result;
  }
  
  // Question: stackoverflow.com/questions/ID/title
  if (parts[0] === 'questions' && parts.length >= 2) {
    const questionId = parts[1];
    if (/^\d+$/.test(questionId)) {
      result.type = 'question';
      result.identifier = questionId;
      result.extra.questionId = parseInt(questionId, 10);
      
      // Check for answer anchor
      const hash = urlObj.hash;
      if (hash && hash.startsWith('#')) {
        const answerMatch = hash.match(/^#(\d+)$/);
        if (answerMatch) {
          result.subtype = 'answer';
          result.extra.answerId = parseInt(answerMatch[1], 10);
        }
      }
    } else if (questionId === 'tagged') {
      result.type = 'tag';
      result.identifier = parts[2];
    }
    return result;
  }
  
  // User profile: stackoverflow.com/users/ID/username
  if (parts[0] === 'users' && parts.length >= 2) {
    result.type = 'profile';
    result.identifier = parts[1];
    if (parts.length >= 3) {
      result.creator = parts[2];
    }
    return result;
  }
  
  // Tags
  if (parts[0] === 'tags') {
    result.type = 'tags';
    if (parts.length >= 2) {
      result.identifier = parts[1];
    }
    return result;
  }
  
  return result;
}

/**
 * Parse NPM package URLs
 */
function parseNpmUrl(urlObj) {
  const pathname = urlObj.pathname;
  const parts = pathname.slice(1).split('/').filter(Boolean);
  
  const result = {
    platform: 'npm',
    type: 'home',
    creator: null,
    identifier: null,
    subtype: null,
    extra: {}
  };
  
  if (parts.length === 0) {
    return result;
  }
  
  // Package page: npmjs.com/package/PACKAGE_NAME
  if (parts[0] === 'package') {
    result.type = 'package';
    
    // Handle scoped packages: @scope/package
    if (parts.length >= 2 && parts[1].startsWith('@')) {
      result.identifier = `${parts[1]}/${parts[2] || ''}`;
      result.creator = parts[1]; // scope
    } else if (parts.length >= 2) {
      result.identifier = parts[1];
    }
    
    // Tab: readme, versions, dependencies, etc.
    const lastPart = parts[parts.length - 1];
    if (['readme', 'versions', 'dependencies', 'dependents', 'code'].includes(lastPart)) {
      result.extra.tab = lastPart;
    }
    
    return result;
  }
  
  // User/org profile: npmjs.com/~username
  if (parts[0].startsWith('~')) {
    result.type = 'profile';
    result.creator = parts[0].slice(1);
    result.identifier = parts[0].slice(1);
    return result;
  }
  
  // Org: npmjs.com/org/ORG_NAME
  if (parts[0] === 'org' && parts.length >= 2) {
    result.type = 'org';
    result.creator = parts[1];
    result.identifier = parts[1];
    return result;
  }
  
  // Search: npmjs.com/search?q=QUERY
  if (parts[0] === 'search') {
    result.type = 'search';
    result.extra.query = urlObj.searchParams.get('q');
    return result;
  }
  
  return result;
}

/**
 * Generic URL parser for unknown platforms
 */
function parseGenericUrl(urlObj) {
  const hostname = urlObj.hostname;
  const pathname = urlObj.pathname;
  const parts = pathname.slice(1).split('/').filter(Boolean);
  
  const result = {
    platform: 'other',
    type: 'page',
    creator: null,
    identifier: null,
    subtype: null,
    extra: {
      domain: hostname.replace(/^www\./, '')
    }
  };
  
  // Detect blog-like URL patterns
  if (pathname.includes('/blog/') || pathname.includes('/article/') || pathname.includes('/post/')) {
    result.type = 'article';
    result.identifier = parts[parts.length - 1];
  }
  
  // Detect documentation
  if (pathname.includes('/docs/') || pathname.includes('/documentation/') || pathname.includes('/api/')) {
    result.type = 'documentation';
    result.identifier = parts[parts.length - 1];
  }
  
  // Detect profile patterns
  if (parts.length >= 1 && (parts[0].startsWith('@') || parts[0] === 'user' || parts[0] === 'profile')) {
    result.type = 'profile';
    result.creator = parts[0].startsWith('@') ? parts[0] : (parts[1] || parts[0]);
  }
  
  return result;
}

/**
 * Get platform display name
 * @param {string} platform - Platform identifier
 * @returns {string} Human-readable platform name
 */
export function getPlatformDisplayName(platform) {
  const names = {
    'youtube': 'YouTube',
    'github': 'GitHub',
    'medium': 'Medium',
    'devto': 'DEV Community',
    'substack': 'Substack',
    'twitter': 'Twitter/X',
    'reddit': 'Reddit',
    'stackoverflow': 'Stack Overflow',
    'npm': 'npm',
    'other': 'Other'
  };
  return names[platform] || platform;
}

/**
 * Get platform icon/emoji
 * @param {string} platform - Platform identifier
 * @returns {string} Emoji representing the platform
 */
export function getPlatformIcon(platform) {
  const icons = {
    'youtube': '📺',
    'github': '🐙',
    'medium': '📝',
    'devto': '👩‍💻',
    'substack': '📨',
    'twitter': '🐦',
    'reddit': '🤖',
    'stackoverflow': '📚',
    'npm': '📦',
    'other': '🌐'
  };
  return icons[platform] || '🔗';
}

/**
 * Get content type display name
 * @param {string} type - Content type identifier
 * @returns {string} Human-readable content type
 */
export function getContentTypeDisplayName(type) {
  const names = {
    'video': 'Video',
    'short': 'Short',
    'channel': 'Channel',
    'playlist': 'Playlist',
    'repo': 'Repository',
    'issue': 'Issue',
    'pr': 'Pull Request',
    'gist': 'Gist',
    'file': 'File',
    'wiki': 'Wiki',
    'article': 'Article',
    'profile': 'Profile',
    'question': 'Question',
    'package': 'Package',
    'subreddit': 'Subreddit',
    'post': 'Post',
    'tweet': 'Tweet',
    'home': 'Home',
    'search': 'Search',
    'page': 'Page'
  };
  return names[type] || type;
}
