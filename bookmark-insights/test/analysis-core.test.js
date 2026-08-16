import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  fuzzyTitleSimilarity,
  wordJaccardSimilarity,
  getMetadataCoverage,
  computeSimilarPairs,
} from '../src/analysis-core.js';

describe('levenshteinDistance', () => {
  it('is zero for identical strings', () => {
    expect(levenshteinDistance('kitten', 'kitten')).toBe(0);
  });

  it('matches the known distance for kitten/sitting', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('falls back to the other length when one string is empty', () => {
    expect(levenshteinDistance('', 'abcd')).toBe(4);
    expect(levenshteinDistance('abcd', '')).toBe(4);
  });

  it('is symmetric', () => {
    expect(levenshteinDistance('flaw', 'lawn')).toBe(levenshteinDistance('lawn', 'flaw'));
  });
});

describe('fuzzyTitleSimilarity', () => {
  it('returns 1 for identical titles ignoring case and padding', () => {
    expect(fuzzyTitleSimilarity('  React Docs ', 'react docs')).toBe(1);
  });

  it('returns 0 when both titles are empty', () => {
    expect(fuzzyTitleSimilarity('', '')).toBe(1);
    expect(fuzzyTitleSimilarity('abc', '')).toBe(0);
  });

  // The length-ratio shortcut must never report more than the true similarity.
  it('never exceeds the exact value when the shortcut fires', () => {
    const short = 'a';
    const long = 'a'.repeat(40);
    const exact = 1 - levenshteinDistance(short, long) / long.length;
    expect(fuzzyTitleSimilarity(short, long)).toBeCloseTo(exact, 10);
  });

  it('scores similar titles higher than dissimilar ones', () => {
    const similar = fuzzyTitleSimilarity('Getting started with Svelte', 'Getting started in Svelte');
    const dissimilar = fuzzyTitleSimilarity('Getting started with Svelte', 'Tax return checklist');
    expect(similar).toBeGreaterThan(dissimilar);
  });
});

describe('wordJaccardSimilarity', () => {
  it('is 1 for the same word set', () => {
    expect(wordJaccardSimilarity('alpha beta gamma', 'gamma beta alpha')).toBe(1);
  });

  it('is 0 when either side has no words longer than two characters', () => {
    expect(wordJaccardSimilarity('a an', 'alpha beta')).toBe(0);
  });
});

describe('getMetadataCoverage', () => {
  it('reports zero coverage for an empty bookmark', () => {
    expect(getMetadataCoverage({})).toEqual({ coverage: 0, percentage: 0 });
  });

  it('counts each populated field once', () => {
    const result = getMetadataCoverage({
      title: 'A long enough title',
      description: 'A description longer than ten characters',
      keywords: ['a'],
      category: 'dev',
      domain: 'example.com',
    });
    expect(result).toEqual({ coverage: 5, percentage: 100 });
  });
});

describe('computeSimilarPairs', () => {
  const bookmark = (id, overrides = {}) => ({
    id,
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    domain: 'example.com',
    description: '',
    keywords: [],
    category: null,
    ...overrides,
  });

  it('returns nothing for fewer than two bookmarks', () => {
    expect(computeSimilarPairs([bookmark('1')]).pairs).toEqual([]);
    expect(computeSimilarPairs([]).stats.total).toBe(0);
  });

  it('pairs near-identical titles on the same domain', () => {
    const { pairs } = computeSimilarPairs([
      bookmark('1', {
        title: 'Introduction to Rust ownership',
        url: 'https://example.com/rust-ownership',
      }),
      bookmark('2', {
        title: 'Introduction to Rust ownership guide',
        url: 'https://example.com/rust-ownership-2',
      }),
      bookmark('3', { title: 'Sourdough bread recipe', url: 'https://example.com/bread' }),
    ]);

    expect(pairs.length).toBe(1);
    const ids = [pairs[0].bookmark1Id, pairs[0].bookmark2Id].sort();
    expect(ids).toEqual(['1', '2']);
  });

  it('references bookmarks by id so results survive a worker boundary', () => {
    const { pairs } = computeSimilarPairs([
      bookmark('1', { title: 'Same title here', url: 'https://example.com/a' }),
      bookmark('2', { title: 'Same title here', url: 'https://example.com/b' }),
    ]);

    expect(pairs[0]).toHaveProperty('bookmark1Id');
    expect(pairs[0]).not.toHaveProperty('bookmark1');
  });

  it('skips exact URL duplicates, which the duplicates view handles', () => {
    const { pairs } = computeSimilarPairs([
      bookmark('1', { title: 'Same', url: 'https://example.com/same' }),
      bookmark('2', { title: 'Same', url: 'https://example.com/same' }),
    ]);
    expect(pairs).toEqual([]);
  });

  it('honours maxPairs', () => {
    const bookmarks = Array.from({ length: 12 }, (_, i) =>
      bookmark(String(i), { title: 'Almost the same title', url: `https://example.com/${i}` }),
    );
    expect(computeSimilarPairs(bookmarks, { maxPairs: 4 }).pairs).toHaveLength(4);
  });

  it('drops bookmarks below the coverage floor when asked', () => {
    const rich = bookmark('1', {
      title: 'A shared headline about caching',
      description: 'A description longer than ten characters',
      keywords: ['cache'],
      category: 'dev',
      url: 'https://example.com/a',
    });
    const bare = { id: '2', title: 'A shared headline about caching', url: 'https://example.com/b' };

    const { pairs } = computeSimilarPairs([rich, bare], {
      requireHighCoverage: true,
      minCoveragePercent: 80,
    });
    expect(pairs).toEqual([]);
  });
});
