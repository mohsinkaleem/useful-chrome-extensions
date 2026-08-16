import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, smartMergeBookmarks } from '../src/db.js';

// smartMergeBookmarks is the only IndexedDB-touching function under test here,
// and it uses exactly three table operations. Swapping the Dexie table for a
// recording stub keeps the real merge logic in the loop without needing a
// browser database.
let stored;
let bulkPutCalls;
let bulkDeleteCalls;

function chromeRecord(overrides = {}) {
  return {
    id: '1',
    title: 'Title',
    url: 'https://example.com/',
    dateAdded: 1700000000000,
    parentId: '10',
    folderPath: 'Bar',
    domain: 'example.com',
    ...overrides,
  };
}

beforeEach(() => {
  stored = [];
  bulkPutCalls = [];
  bulkDeleteCalls = [];

  db.bookmarks = {
    toArray: vi.fn(async () => stored),
    bulkPut: vi.fn(async (rows) => {
      bulkPutCalls.push(rows);
    }),
    bulkDelete: vi.fn(async (ids) => {
      bulkDeleteCalls.push(ids);
    }),
  };
});

describe('smartMergeBookmarks', () => {
  it('preserves Deep Analysis fields the merge has never heard of', async () => {
    stored = [
      chromeRecord({
        title: 'Old title',
        topics: ['machine-learning'],
        smartTags: ['paper', 'llm'],
        readingTime: 12,
        publishedDate: '2024-03-01',
        contentQualityScore: 87,
        description: 'stored description',
      }),
    ];

    // Chrome reports a renamed bookmark, so this row genuinely needs writing.
    await smartMergeBookmarks([chromeRecord({ title: 'New title' })]);

    expect(bulkPutCalls).toHaveLength(1);
    const [merged] = bulkPutCalls[0];

    expect(merged.title).toBe('New title');
    expect(merged.topics).toEqual(['machine-learning']);
    expect(merged.smartTags).toEqual(['paper', 'llm']);
    expect(merged.readingTime).toBe(12);
    expect(merged.publishedDate).toBe('2024-03-01');
    expect(merged.contentQualityScore).toBe(87);
    expect(merged.description).toBe('stored description');
  });

  it('preserves arbitrary future fields, not just the known analysis ones', async () => {
    stored = [chromeRecord({ someFieldAddedNextYear: { nested: true } })];

    await smartMergeBookmarks([chromeRecord({ folderPath: 'Bar/Nested' })]);

    const [merged] = bulkPutCalls[0];
    expect(merged.someFieldAddedNextYear).toEqual({ nested: true });
    expect(merged.folderPath).toBe('Bar/Nested');
  });

  it('writes nothing when no Chrome-owned field changed', async () => {
    stored = [chromeRecord({ topics: ['x'], contentQualityScore: 50 })];

    await smartMergeBookmarks([chromeRecord()]);

    expect(db.bookmarks.bulkPut).not.toHaveBeenCalled();
    expect(db.bookmarks.bulkDelete).not.toHaveBeenCalled();
  });

  it('writes only the rows that actually changed', async () => {
    stored = [
      chromeRecord({ id: '1' }),
      chromeRecord({ id: '2', title: 'Two' }),
      chromeRecord({ id: '3', title: 'Three' }),
    ];

    await smartMergeBookmarks([
      chromeRecord({ id: '1' }),
      chromeRecord({ id: '2', title: 'Two renamed' }),
      chromeRecord({ id: '3', title: 'Three' }),
    ]);

    expect(bulkPutCalls).toHaveLength(1);
    expect(bulkPutCalls[0]).toHaveLength(1);
    expect(bulkPutCalls[0][0].id).toBe('2');
    expect(bulkPutCalls[0][0].title).toBe('Two renamed');
  });

  it('gives brand new bookmarks the enrichment defaults', async () => {
    stored = [];

    await smartMergeBookmarks([chromeRecord({ id: '99' })]);

    const [created] = bulkPutCalls[0];
    expect(created.id).toBe('99');
    expect(created.isAlive).toBeNull();
    expect(created.enrichedAt).toBeNull();
    expect(created.accessCount).toBe(0);
    expect(created.keywords).toEqual([]);
  });

  it('prunes rows Chrome no longer reports', async () => {
    stored = [chromeRecord({ id: '1' }), chromeRecord({ id: '2' })];

    const { removedIds } = await smartMergeBookmarks([chromeRecord({ id: '1' })]);

    expect(removedIds).toEqual(['2']);
    expect(bulkDeleteCalls).toEqual([['2']]);
  });

  it('detects a moved bookmark through parentId alone', async () => {
    stored = [chromeRecord({ parentId: '10' })];

    await smartMergeBookmarks([chromeRecord({ parentId: '20' })]);

    expect(bulkPutCalls[0][0].parentId).toBe('20');
  });
});
