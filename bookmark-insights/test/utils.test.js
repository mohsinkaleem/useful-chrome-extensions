import { describe, it, expect } from 'vitest';
import { highlightSegments, getDomainLabel, getSortFunction, getGeneratedFavicon } from '../src/utils.js';

describe('highlightSegments', () => {
  const query = { positive: [], phrases: [], regular: ['svelte'], regexPatterns: [] };

  it('splits text into plain and matched segments', () => {
    expect(highlightSegments('I like svelte a lot', query)).toEqual([
      { text: 'I like ', match: false },
      { text: 'svelte', match: true },
      { text: ' a lot', match: false }
    ]);
  });

  it('is case-insensitive and preserves original casing', () => {
    const segments = highlightSegments('Svelte rocks', query);
    expect(segments[0]).toEqual({ text: 'Svelte', match: true });
  });

  it('returns the whole string unmatched when there is no query', () => {
    expect(highlightSegments('plain text', null)).toEqual([{ text: 'plain text', match: false }]);
  });

  it('returns nothing for empty text', () => {
    expect(highlightSegments('', query)).toEqual([]);
  });

  it('merges overlapping matches instead of emitting nested segments', () => {
    const overlapping = { positive: [], phrases: [], regular: ['abc', 'bcd'], regexPatterns: [] };
    const segments = highlightSegments('xabcdy', overlapping);
    expect(segments).toEqual([
      { text: 'x', match: false },
      { text: 'abcd', match: true },
      { text: 'y', match: false }
    ]);
  });

  it('never emits markup - callers render segments as text', () => {
    const segments = highlightSegments('<script>svelte</script>', query);
    expect(segments.map(s => s.text).join('')).toBe('<script>svelte</script>');
  });

  it('applies regex patterns without leaking lastIndex between calls', () => {
    const withRegex = { positive: [], phrases: [], regular: [], regexPatterns: [/sv\w+/g] };
    const first = highlightSegments('svelte here', withRegex);
    const second = highlightSegments('svelte here', withRegex);
    expect(first).toEqual(second);
  });
});

describe('getDomainLabel', () => {
  it('maps pseudo-domains to readable labels', () => {
    expect(getDomainLabel({ domain: 'javascript-bookmarklet' })).toBe('Bookmarklet');
    expect(getDomainLabel({ domain: 'local-file' })).toBe('Local File');
  });

  it('passes real domains through', () => {
    expect(getDomainLabel({ domain: 'example.com' })).toBe('example.com');
  });
});

describe('getGeneratedFavicon', () => {
  it('produces a local data URL, never a remote request', () => {
    const icon = getGeneratedFavicon({ url: 'https://example.com', domain: 'example.com' });
    expect(icon.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('is stable for the same domain', () => {
    const bookmark = { url: 'https://example.com', domain: 'example.com' };
    expect(getGeneratedFavicon(bookmark)).toBe(getGeneratedFavicon(bookmark));
  });
});

describe('getSortFunction', () => {
  it('sorts newest first by default for an unknown key', () => {
    const sort = getSortFunction('nonsense');
    const items = [{ dateAdded: 1 }, { dateAdded: 3 }, { dateAdded: 2 }];
    expect(items.sort(sort).map(i => i.dateAdded)).toEqual([3, 2, 1]);
  });

  it('sorts titles ascending', () => {
    const sort = getSortFunction('title_asc');
    const items = [{ title: 'b' }, { title: 'a' }];
    expect(items.sort(sort).map(i => i.title)).toEqual(['a', 'b']);
  });
});
