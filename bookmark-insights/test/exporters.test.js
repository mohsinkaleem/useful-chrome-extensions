import { describe, it, expect } from 'vitest';
import { toCsv, toMarkdown, toNetscapeHtml } from '../src/exporters.js';

const bookmarks = [
  {
    id: '1',
    title: 'Rollup Guide',
    url: 'https://rollupjs.org/guide/',
    domain: 'rollupjs.org',
    folderPath: 'Dev/Tools',
    description: 'Bundler docs',
    keywords: ['bundler', 'js'],
    topics: ['dev/tooling'],
    dateAdded: 1700000000000,
    accessCount: 3,
  },
  {
    id: '2',
    title: '=SUM(A1:A2) "quoted", comma',
    url: 'https://example.com/a?b=1&c=2',
    domain: 'example.com',
    folderPath: '',
    dateAdded: 1700000001000,
  },
];

describe('toCsv', () => {
  it('emits a header row and one row per bookmark', () => {
    const rows = toCsv(bookmarks).split('\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[0].startsWith('"title","url"')).toBe(true);
  });

  it('escapes embedded quotes and commas', () => {
    expect(toCsv(bookmarks)).toContain('""quoted"", comma');
  });

  it('neutralises spreadsheet formula injection', () => {
    // A title starting with = would otherwise be evaluated on open.
    expect(toCsv(bookmarks)).toContain(`"'=SUM(A1:A2)`);
  });
});

describe('toMarkdown', () => {
  it('groups by folder and links every bookmark', () => {
    const md = toMarkdown(bookmarks);
    expect(md).toContain('## Dev/Tools');
    expect(md).toContain('## Unfiled');
    expect(md).toContain('[Rollup Guide](https://rollupjs.org/guide/)');
  });

  it('escapes brackets in titles so links stay intact', () => {
    const md = toMarkdown([{ ...bookmarks[0], title: 'A [B] C' }]);
    expect(md).toContain('[A \\[B\\] C]');
  });
});

describe('toNetscapeHtml', () => {
  it('emits the doctype browsers require for import', () => {
    expect(toNetscapeHtml(bookmarks).startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
  });

  it('escapes markup in titles and urls', () => {
    const html = toNetscapeHtml([{ ...bookmarks[0], title: '<script>x</script>' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('writes ADD_DATE in seconds', () => {
    expect(toNetscapeHtml(bookmarks)).toContain('ADD_DATE="1700000000"');
  });
});
