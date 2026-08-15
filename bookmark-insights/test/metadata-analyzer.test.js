import { describe, it, expect } from 'vitest';
import { flattenRawMetadata, analyzeBookmarkMetadata } from '../src/metadata-analyzer.js';

// The nested shape enrichment.js actually writes. Before the C2 fix the
// analyzer read flat keys plus a `schemaOrg` key that never existed, so
// publishedDate was null on 100% of enriched records.
const nested = {
  meta: {
    'article:published_time': '2024-03-15T10:00:00Z',
    keywords: 'svelte, indexeddb, extensions',
    description: 'A long enough description to count as real metadata coverage.'
  },
  openGraph: {
    'og:description': 'Open Graph description',
    'og:image': 'https://example.com/cover.png',
    'og:video:duration': '600'
  },
  twitterCard: { 'twitter:card': 'summary' },
  jsonLd: [{ '@type': 'Article', datePublished: '2024-03-15', wordCount: 900 }],
  other: { title: 'Real Title', canonical: 'https://example.com/post', language: 'en' }
};

describe('flattenRawMetadata', () => {
  it('flattens the nested shape into prefixed top-level keys', () => {
    const flat = flattenRawMetadata(nested);
    expect(flat['article:published_time']).toBe('2024-03-15T10:00:00Z');
    expect(flat['og:description']).toBe('Open Graph description');
    expect(flat['twitter:card']).toBe('summary');
    expect(flat.canonical).toBe('https://example.com/post');
  });

  it('exposes jsonLd as schemaOrg, the key the extractors read', () => {
    const flat = flattenRawMetadata(nested);
    expect(Array.isArray(flat.schemaOrg)).toBe(true);
    expect(flat.schemaOrg[0]['@type']).toBe('Article');
  });

  it('unwraps @graph containers', () => {
    const flat = flattenRawMetadata({
      jsonLd: [{ '@graph': [{ '@type': 'WebPage' }, { '@type': 'Article', datePublished: '2020-01-01' }] }]
    });
    expect(flat.schemaOrg).toHaveLength(2);
    expect(flat.schemaOrg[1]['@type']).toBe('Article');
  });

  it('passes an already-flat object through unchanged', () => {
    const flat = { 'og:title': 'x' };
    expect(flattenRawMetadata(flat)).toBe(flat);
  });

  it('returns an empty object for missing or non-object input', () => {
    expect(flattenRawMetadata(null)).toEqual({});
    expect(flattenRawMetadata('nope')).toEqual({});
  });
});

describe('analyzeBookmarkMetadata', () => {
  it('resolves publishedDate from the nested shape', () => {
    const result = analyzeBookmarkMetadata({ title: 'Post', rawMetadata: nested });
    expect(result.publishedDate).toBe(Date.parse('2024-03-15T10:00:00Z'));
  });

  it('derives readingTime from og:video:duration', () => {
    const result = analyzeBookmarkMetadata({ title: 'Video', rawMetadata: nested });
    expect(result.readingTime).toBe(10); // 600s
  });

  it('produces smart tags from the keywords meta tag', () => {
    const result = analyzeBookmarkMetadata({ title: 'Post', rawMetadata: nested });
    expect(result.smartTags).toEqual(expect.arrayContaining(['svelte', 'indexeddb']));
  });

  it('scores content quality above zero when metadata is rich', () => {
    const result = analyzeBookmarkMetadata({ title: 'Post', rawMetadata: nested });
    expect(result.contentQualityScore).toBeGreaterThan(0);
  });

  it('returns null for a missing bookmark and empty results for a bare one', () => {
    expect(analyzeBookmarkMetadata(null)).toBeNull();
    const bare = analyzeBookmarkMetadata({ title: 'Bare' });
    expect(bare.publishedDate).toBeNull();
    expect(bare.readingTime).toBeNull();
  });
});
