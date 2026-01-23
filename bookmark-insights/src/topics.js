// Topic detection and categorization for bookmarks
// Analyzes metadata, content, and context to assign topic tags

/**
 * Topic taxonomy with primary topics and subtopics
 * Each topic has:
 * - id: unique identifier used in filters
 * - name: display name
 * - icon: emoji for visual identification
 * - keywords: words/phrases that indicate this topic
 * - domains: domains strongly associated with this topic
 * - subtopics: optional nested topics for finer categorization
 */
export const TOPIC_TAXONOMY = {
  tech: {
    id: 'tech',
    name: 'Technology',
    icon: '💻',
    keywords: [
      'technology', 'tech', 'software', 'hardware', 'computer', 'digital',
      'gadget', 'device', 'smartphone', 'laptop', 'pc', 'server', 'cloud',
      'saas', 'startup', 'silicon valley', 'innovation'
    ],
    domains: [
      'techcrunch.com', 'theverge.com', 'arstechnica.com', 'wired.com',
      'engadget.com', 'gizmodo.com', 'cnet.com', 'zdnet.com', 'venturebeat.com'
    ],
    subtopics: {
      ai: {
        id: 'tech/ai',
        name: 'AI & Machine Learning',
        keywords: [
          'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
          'nlp', 'natural language', 'computer vision', 'llm', 'gpt', 'transformer',
          'reinforcement learning', 'supervised learning', 'unsupervised', 'chatgpt',
          'openai', 'anthropic', 'claude', 'gemini', 'stable diffusion', 'midjourney',
          'data science', 'ml ops', 'model training', 'inference', 'embeddings'
        ],
        domains: ['openai.com', 'huggingface.co', 'arxiv.org', 'paperswithcode.com']
      },
      web3: {
        id: 'tech/web3',
        name: 'Web3 & Blockchain',
        keywords: [
          'blockchain', 'cryptocurrency', 'crypto', 'bitcoin', 'ethereum', 'web3',
          'defi', 'nft', 'smart contract', 'solidity', 'wallet', 'token', 'dao'
        ],
        domains: ['coinbase.com', 'binance.com', 'etherscan.io', 'opensea.io']
      }
    }
  },
  
  coding: {
    id: 'coding',
    name: 'Programming',
    icon: '👨‍💻',
    keywords: [
      'programming', 'coding', 'developer', 'development', 'code', 'software engineering',
      'backend', 'frontend', 'fullstack', 'full-stack', 'devops', 'api', 'sdk',
      'framework', 'library', 'package', 'module', 'dependency', 'npm', 'pip',
      'git', 'version control', 'debugging', 'testing', 'deployment', 'ci/cd'
    ],
    domains: [
      'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
      'npmjs.com', 'pypi.org', 'crates.io', 'packagist.org', 'rubygems.org'
    ],
    subtopics: {
      javascript: {
        id: 'coding/javascript',
        name: 'JavaScript',
        keywords: [
          'javascript', 'typescript', 'node.js', 'nodejs', 'react', 'vue', 'angular',
          'svelte', 'nextjs', 'next.js', 'nuxt', 'express', 'deno', 'bun', 'vite',
          'webpack', 'esbuild', 'rollup', 'jsx', 'tsx', 'ecmascript', 'es6', 'es2020'
        ],
        domains: ['nodejs.org', 'reactjs.org', 'vuejs.org', 'svelte.dev']
      },
      python: {
        id: 'coding/python',
        name: 'Python',
        keywords: [
          'python', 'django', 'flask', 'fastapi', 'pandas', 'numpy', 'pytorch',
          'tensorflow', 'scikit-learn', 'jupyter', 'notebook', 'pip', 'conda',
          'virtualenv', 'asyncio', 'pydantic', 'sqlalchemy'
        ],
        domains: ['python.org', 'pypi.org', 'realpython.com', 'djangoproject.com']
      },
      rust: {
        id: 'coding/rust',
        name: 'Rust',
        keywords: ['rust', 'rustlang', 'cargo', 'crate', 'tokio', 'async-std', 'wasm'],
        domains: ['rust-lang.org', 'crates.io', 'docs.rs']
      },
      go: {
        id: 'coding/go',
        name: 'Go',
        keywords: ['golang', 'go language', 'goroutine', 'gin', 'fiber', 'echo'],
        domains: ['golang.org', 'go.dev', 'pkg.go.dev']
      }
    }
  },
  
  tutorials: {
    id: 'tutorials',
    name: 'Tutorials',
    icon: '📚',
    keywords: [
      'tutorial', 'how to', 'howto', 'how-to', 'guide', 'learn', 'learning',
      'beginner', 'introduction', 'intro to', 'getting started', 'step by step',
      'step-by-step', 'walkthrough', 'explained', 'crash course', 'masterclass',
      'fundamentals', 'basics', 'complete guide', 'definitive guide', 'cheatsheet',
      'cheat sheet', 'quick start', 'quickstart'
    ],
    domains: [
      'tutorialspoint.com', 'w3schools.com', 'freecodecamp.org', 'codecademy.com',
      'coursera.org', 'udemy.com', 'pluralsight.com', 'egghead.io', 'frontendmasters.com',
      'levelup.gitconnected.com'
    ]
  },
  
  blogs: {
    id: 'blogs',
    name: 'Blogs & Articles',
    icon: '📝',
    keywords: [
      'blog', 'article', 'post', 'opinion', 'essay', 'thoughts on', 'my experience',
      'story', 'journey', 'lessons learned', 'reflection', 'review'
    ],
    domains: [
      'medium.com', 'dev.to', 'hashnode.com', 'substack.com', 'wordpress.com',
      'blogger.com', 'ghost.io', 'mirror.xyz'
    ]
  },
  
  videos: {
    id: 'videos',
    name: 'Videos',
    icon: '🎬',
    keywords: [
      'video', 'watch', 'stream', 'streaming', 'episode', 'podcast', 'webinar',
      'talk', 'presentation', 'conference talk', 'keynote', 'demo', 'screencast'
    ],
    domains: [
      'youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'dailymotion.com',
      'loom.com', 'wistia.com', 'ted.com'
    ]
  },
  
  religious: {
    id: 'religious',
    name: 'Religious & Spiritual',
    icon: '🕌',
    keywords: [
      'islam', 'islamic', 'muslim', 'quran', 'hadith', 'sunnah', 'prophet',
      'allah', 'prayer', 'salah', 'fasting', 'ramadan', 'hajj', 'zakat',
      'mosque', 'masjid', 'imam', 'sheikh', 'fatwa', 'halal', 'haram',
      'christianity', 'christian', 'bible', 'jesus', 'church', 'gospel',
      'judaism', 'jewish', 'torah', 'synagogue', 'rabbi',
      'buddhism', 'buddhist', 'meditation', 'dharma', 'zen',
      'hinduism', 'hindu', 'yoga', 'vedic', 'spirituality', 'spiritual',
      'faith', 'belief', 'worship', 'religious', 'religion', 'scripture',
      'sermon', 'dua', 'tafsir', 'recitation', 'tilawah'
    ],
    domains: [
      'islamqa.info', 'sunnah.com', 'quran.com', 'islamweb.net',
      'biblegateway.com', 'gotquestions.org', 'chabad.org', 'myjewishlearning.com'
    ]
  },
  
  news: {
    id: 'news',
    name: 'News',
    icon: '📰',
    keywords: [
      'news', 'breaking', 'headline', 'report', 'latest', 'update', 'announcement',
      'press release', 'coverage', 'journalism', 'current events', 'world news'
    ],
    domains: [
      'reuters.com', 'apnews.com', 'bbc.com', 'cnn.com', 'nytimes.com',
      'theguardian.com', 'washingtonpost.com', 'wsj.com', 'bloomberg.com',
      'aljazeera.com', 'news.ycombinator.com'
    ]
  },
  
  tools: {
    id: 'tools',
    name: 'Tools & Apps',
    icon: '🛠️',
    keywords: [
      'tool', 'app', 'application', 'utility', 'extension', 'plugin', 'addon',
      'software', 'platform', 'service', 'saas', 'free tool', 'online tool',
      'generator', 'converter', 'calculator', 'formatter', 'validator', 'linter'
    ],
    domains: [
      'notion.so', 'figma.com', 'canva.com', 'trello.com', 'asana.com',
      'slack.com', 'discord.com', 'vercel.com', 'netlify.com', 'heroku.com',
      'postman.com', 'insomnia.rest'
    ]
  },
  
  documentation: {
    id: 'documentation',
    name: 'Documentation',
    icon: '📖',
    keywords: [
      'documentation', 'docs', 'api reference', 'api docs', 'reference',
      'specification', 'spec', 'manual', 'handbook', 'wiki', 'changelog',
      'release notes', 'readme'
    ],
    domains: [
      'docs.github.com', 'developer.mozilla.org', 'devdocs.io', 'readthedocs.org',
      'gitbook.io', 'notion.site', 'confluence.atlassian.com'
    ]
  },
  
  research: {
    id: 'research',
    name: 'Research & Papers',
    icon: '🔬',
    keywords: [
      'research', 'paper', 'study', 'academic', 'journal', 'publication',
      'thesis', 'dissertation', 'peer-reviewed', 'scientific', 'experiment',
      'findings', 'methodology', 'abstract', 'citation', 'arxiv'
    ],
    domains: [
      'arxiv.org', 'scholar.google.com', 'researchgate.net', 'academia.edu',
      'semanticscholar.org', 'paperswithcode.com', 'nature.com', 'sciencedirect.com'
    ]
  },
  
  design: {
    id: 'design',
    name: 'Design & UI/UX',
    icon: '🎨',
    keywords: [
      'design', 'ui', 'ux', 'user interface', 'user experience', 'graphic design',
      'web design', 'visual design', 'typography', 'color', 'layout', 'wireframe',
      'prototype', 'mockup', 'figma', 'sketch', 'adobe', 'illustration',
      'icon', 'logo', 'branding', 'animation', 'motion design'
    ],
    domains: [
      'figma.com', 'dribbble.com', 'behance.net', 'awwwards.com',
      'uxdesign.cc', 'smashingmagazine.com', 'nngroup.com', 'invisionapp.com'
    ]
  },
  
  career: {
    id: 'career',
    name: 'Career & Jobs',
    icon: '💼',
    keywords: [
      'career', 'job', 'hiring', 'interview', 'resume', 'cv', 'portfolio',
      'salary', 'remote work', 'freelance', 'contract', 'employment',
      'recruiting', 'linkedin', 'networking', 'job search', 'tech job'
    ],
    domains: [
      'linkedin.com', 'indeed.com', 'glassdoor.com', 'levels.fyi',
      'wellfound.com', 'remoteok.io', 'weworkremotely.com', 'dice.com'
    ]
  },
  
  entertainment: {
    id: 'entertainment',
    name: 'Entertainment',
    icon: '🎮',
    keywords: [
      'entertainment', 'game', 'gaming', 'movie', 'film', 'tv', 'series',
      'anime', 'manga', 'comic', 'music', 'song', 'album', 'artist',
      'sports', 'esports', 'hobby', 'fun', 'leisure'
    ],
    domains: [
      'imdb.com', 'rottentomatoes.com', 'ign.com', 'gamespot.com',
      'spotify.com', 'netflix.com', 'twitch.tv', 'steamcommunity.com'
    ]
  },
  
  finance: {
    id: 'finance',
    name: 'Finance & Investing',
    icon: '💰',
    keywords: [
      'finance', 'investing', 'investment', 'stock', 'market', 'trading',
      'portfolio', 'dividend', 'etf', 'mutual fund', 'retirement', '401k',
      'savings', 'budgeting', 'financial planning', 'wealth', 'money'
    ],
    domains: [
      'yahoo.com/finance', 'investopedia.com', 'fool.com', 'seekingalpha.com',
      'morningstar.com', 'robinhood.com', 'fidelity.com', 'vanguard.com'
    ]
  },
  
  productivity: {
    id: 'productivity',
    name: 'Productivity',
    icon: '⚡',
    keywords: [
      'productivity', 'workflow', 'automation', 'efficiency', 'time management',
      'task management', 'project management', 'organization', 'habit',
      'goal setting', 'focus', 'gtd', 'getting things done', 'lifehack'
    ],
    domains: [
      'notion.so', 'todoist.com', 'asana.com', 'monday.com', 'clickup.com',
      'obsidian.md', 'roamresearch.com', 'zapier.com', 'make.com'
    ]
  },
  
  security: {
    id: 'security',
    name: 'Security & Privacy',
    icon: '🔒',
    keywords: [
      'security', 'cybersecurity', 'privacy', 'hacking', 'vulnerability',
      'exploit', 'penetration testing', 'pentest', 'encryption', 'authentication',
      'authorization', 'oauth', 'jwt', 'ssl', 'tls', 'firewall', 'vpn',
      'password', 'malware', 'ransomware', 'phishing', 'data breach'
    ],
    domains: [
      'owasp.org', 'hackerone.com', 'security.stackexchange.com',
      'krebsonsecurity.com', 'schneier.com', 'thehackernews.com'
    ]
  }
};

/**
 * Flatten topic taxonomy for quick lookup
 * Returns array of all topics with their full paths
 */
export function getFlatTopics() {
  const topics = [];
  
  for (const [key, topic] of Object.entries(TOPIC_TAXONOMY)) {
    topics.push({
      id: topic.id,
      name: topic.name,
      icon: topic.icon,
      isSubtopic: false,
      parentId: null
    });
    
    if (topic.subtopics) {
      for (const [subKey, subtopic] of Object.entries(topic.subtopics)) {
        topics.push({
          id: subtopic.id,
          name: subtopic.name,
          icon: topic.icon, // Inherit parent icon
          isSubtopic: true,
          parentId: topic.id
        });
      }
    }
  }
  
  return topics;
}

/**
 * Get topic display info by ID
 * @param {string} topicId - Topic ID (e.g., 'tech' or 'tech/ai')
 * @returns {Object|null} Topic info
 */
export function getTopicInfo(topicId) {
  if (!topicId) return null;
  
  const parts = topicId.split('/');
  const mainTopic = TOPIC_TAXONOMY[parts[0]];
  
  if (!mainTopic) return null;
  
  if (parts.length === 1) {
    return {
      id: mainTopic.id,
      name: mainTopic.name,
      icon: mainTopic.icon,
      isSubtopic: false
    };
  }
  
  // Subtopic
  const subtopic = mainTopic.subtopics?.[parts[1]];
  if (!subtopic) return null;
  
  return {
    id: subtopic.id,
    name: subtopic.name,
    icon: mainTopic.icon,
    isSubtopic: true,
    parentId: mainTopic.id,
    parentName: mainTopic.name
  };
}

/**
 * Get display name for a topic
 * @param {string} topicId - Topic ID
 * @returns {string} Display name with icon
 */
export function getTopicDisplayName(topicId) {
  const info = getTopicInfo(topicId);
  if (!info) return topicId;
  return `${info.icon} ${info.name}`;
}

/**
 * Get just the icon for a topic
 * @param {string} topicId - Topic ID
 * @returns {string} Topic icon
 */
export function getTopicIcon(topicId) {
  const info = getTopicInfo(topicId);
  return info?.icon || '📌';
}

/**
 * Detect topics for a bookmark based on its metadata
 * @param {Object} bookmark - Bookmark object with metadata
 * @returns {string[]} Array of topic IDs that match
 */
export function detectTopics(bookmark) {
  if (!bookmark) return [];
  
  const detectedTopics = new Set();
  const scores = new Map(); // Track confidence scores for each topic
  
  // Build searchable text from all available metadata
  const title = (bookmark.title || '').toLowerCase();
  const description = (bookmark.description || '').toLowerCase();
  const domain = (bookmark.domain || '').toLowerCase();
  const url = (bookmark.url || '').toLowerCase();
  const category = (bookmark.category || '').toLowerCase();
  const contentSnippet = (bookmark.contentSnippet || '').toLowerCase();
  const keywords = Array.isArray(bookmark.keywords) 
    ? bookmark.keywords.map(k => k.toLowerCase()).join(' ') 
    : '';
  const folderPath = (bookmark.folderPath || '').toLowerCase();
  
  // Combine all text for keyword matching
  const allText = `${title} ${description} ${keywords} ${contentSnippet} ${folderPath}`;
  
  // Extract og:type, article:section, article:tag from rawMetadata
  let metaSection = '';
  let metaTags = '';
  let ogType = '';
  
  if (bookmark.rawMetadata) {
    const meta = bookmark.rawMetadata.meta || {};
    const og = bookmark.rawMetadata.openGraph || {};
    
    metaSection = (meta['article:section'] || '').toLowerCase();
    metaTags = (meta['article:tag'] || '').toLowerCase();
    ogType = (og['og:type'] || '').toLowerCase();
  }
  
  // Score multipliers for different matches
  const DOMAIN_MATCH_SCORE = 10;
  const KEYWORD_TITLE_SCORE = 5;
  const KEYWORD_DESC_SCORE = 3;
  const KEYWORD_CONTENT_SCORE = 2;
  const KEYWORD_FOLDER_SCORE = 2;
  const META_SECTION_SCORE = 4;
  const THRESHOLD_SCORE = 3; // Minimum score to include a topic
  
  // Helper to add score for a topic
  const addScore = (topicId, points) => {
    const current = scores.get(topicId) || 0;
    scores.set(topicId, current + points);
  };
  
  // Check each topic in taxonomy
  for (const [topicKey, topic] of Object.entries(TOPIC_TAXONOMY)) {
    // Check domain matches (high confidence)
    if (topic.domains) {
      for (const topicDomain of topic.domains) {
        if (domain.includes(topicDomain.replace('www.', ''))) {
          addScore(topic.id, DOMAIN_MATCH_SCORE);
          break;
        }
      }
    }
    
    // Check keyword matches
    if (topic.keywords) {
      for (const keyword of topic.keywords) {
        const keywordLower = keyword.toLowerCase();
        
        // Match whole words to avoid false positives
        const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'i');
        
        if (wordBoundaryRegex.test(title)) {
          addScore(topic.id, KEYWORD_TITLE_SCORE);
        }
        if (wordBoundaryRegex.test(description)) {
          addScore(topic.id, KEYWORD_DESC_SCORE);
        }
        if (wordBoundaryRegex.test(contentSnippet)) {
          addScore(topic.id, KEYWORD_CONTENT_SCORE);
        }
        if (wordBoundaryRegex.test(folderPath)) {
          addScore(topic.id, KEYWORD_FOLDER_SCORE);
        }
      }
    }
    
    // Check subtopics (more specific)
    if (topic.subtopics) {
      for (const [subKey, subtopic] of Object.entries(topic.subtopics)) {
        // Check subtopic domains
        if (subtopic.domains) {
          for (const subDomain of subtopic.domains) {
            if (domain.includes(subDomain.replace('www.', ''))) {
              addScore(subtopic.id, DOMAIN_MATCH_SCORE);
              addScore(topic.id, DOMAIN_MATCH_SCORE / 2); // Also add to parent
              break;
            }
          }
        }
        
        // Check subtopic keywords
        if (subtopic.keywords) {
          for (const keyword of subtopic.keywords) {
            const keywordLower = keyword.toLowerCase();
            const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'i');
            
            if (wordBoundaryRegex.test(title)) {
              addScore(subtopic.id, KEYWORD_TITLE_SCORE);
              addScore(topic.id, KEYWORD_TITLE_SCORE / 2);
            }
            if (wordBoundaryRegex.test(description)) {
              addScore(subtopic.id, KEYWORD_DESC_SCORE);
              addScore(topic.id, KEYWORD_DESC_SCORE / 2);
            }
            if (wordBoundaryRegex.test(allText)) {
              addScore(subtopic.id, KEYWORD_CONTENT_SCORE);
            }
          }
        }
      }
    }
  }
  
  // Special case: video detection from category or og:type
  if (category === 'video' || ogType.includes('video')) {
    addScore('videos', DOMAIN_MATCH_SCORE);
  }
  
  // Special case: blog detection from category or og:type
  if (category === 'blog' || ogType === 'article') {
    addScore('blogs', DOMAIN_MATCH_SCORE / 2);
  }
  
  // Collect topics that meet the threshold
  for (const [topicId, score] of scores.entries()) {
    if (score >= THRESHOLD_SCORE) {
      detectedTopics.add(topicId);
    }
  }
  
  // Convert to sorted array (by score descending)
  const sortedTopics = Array.from(detectedTopics).sort((a, b) => {
    return (scores.get(b) || 0) - (scores.get(a) || 0);
  });
  
  // Limit to top 5 topics to avoid noise
  return sortedTopics.slice(0, 5);
}

/**
 * Helper to escape special regex characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Batch detect topics for multiple bookmarks
 * @param {Object[]} bookmarks - Array of bookmark objects
 * @returns {Map<string, string[]>} Map of bookmark ID to topics array
 */
export function batchDetectTopics(bookmarks) {
  const results = new Map();
  
  for (const bookmark of bookmarks) {
    const topics = detectTopics(bookmark);
    results.set(bookmark.id, topics);
  }
  
  return results;
}

/**
 * Get all unique topics from a set of bookmarks
 * @param {Object[]} bookmarks - Array of bookmark objects
 * @returns {Object[]} Array of { topic, count } sorted by count
 */
export function aggregateTopics(bookmarks) {
  const topicCounts = new Map();
  
  for (const bookmark of bookmarks) {
    const topics = bookmark.topics || [];
    for (const topic of topics) {
      const current = topicCounts.get(topic) || 0;
      topicCounts.set(topic, current + 1);
    }
  }
  
  return Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Migrate existing bookmarks to add topics
 * This runs topic detection on bookmarks that don't have topics yet
 * @param {Function} getAllBookmarks - Function to get all bookmarks
 * @param {Function} bulkUpsertBookmarks - Function to bulk update bookmarks
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Promise<{migrated: number, total: number}>} Migration stats
 */
export async function migrateBookmarksWithTopics(getAllBookmarks, bulkUpsertBookmarks, onProgress = null) {
  try {
    const allBookmarks = await getAllBookmarks();
    
    // Find bookmarks without topics that have been enriched (have metadata)
    const needsMigration = allBookmarks.filter(b => 
      !b.topics || b.topics.length === 0
    );
    
    if (needsMigration.length === 0) {
      console.log('Topic migration: All bookmarks already have topics');
      return { migrated: 0, total: allBookmarks.length };
    }
    
    console.log(`Topic migration: Processing ${needsMigration.length} bookmarks...`);
    
    // Process in batches for better performance
    const BATCH_SIZE = 100;
    let migrated = 0;
    
    for (let i = 0; i < needsMigration.length; i += BATCH_SIZE) {
      const batch = needsMigration.slice(i, i + BATCH_SIZE);
      
      // Detect topics for each bookmark in the batch
      const updatedBatch = batch.map(bookmark => ({
        ...bookmark,
        topics: detectTopics(bookmark)
      }));
      
      // Only update bookmarks that got topics assigned
      const withTopics = updatedBatch.filter(b => b.topics && b.topics.length > 0);
      
      if (withTopics.length > 0) {
        await bulkUpsertBookmarks(withTopics);
        migrated += withTopics.length;
      }
      
      // Report progress
      if (onProgress) {
        onProgress({
          processed: i + batch.length,
          total: needsMigration.length,
          migrated
        });
      }
    }
    
    console.log(`Topic migration complete: ${migrated} bookmarks updated with topics`);
    return { migrated, total: allBookmarks.length };
  } catch (error) {
    console.error('Topic migration error:', error);
    throw error;
  }
}
