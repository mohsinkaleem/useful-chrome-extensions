import { describe, it, expect } from 'vitest';
import { compileUserRegex, publishedTimestamp } from '../src/search.js';

describe('compileUserRegex', () => {
  it('strips g and y so .test() is not stateful across bookmarks', () => {
    const regex = compileUserRegex('a', 'gi');
    expect(regex.flags).not.toContain('g');
    expect(regex.test('a')).toBe(true);
    expect(regex.test('a')).toBe(true);
    expect(regex.test('a')).toBe(true);
  });

  it('defaults to case-insensitive', () => {
    expect(compileUserRegex('abc').flags).toBe('i');
    expect(compileUserRegex('abc', 'g').flags).toBe('i');
  });

  it('keeps other flags', () => {
    expect(compileUserRegex('a.b', 's').flags).toBe('s');
  });

  it('rejects nested quantifiers', () => {
    expect(compileUserRegex('(a+)+$')).toBeNull();
    expect(compileUserRegex('(x*)*')).toBeNull();
  });

  it('allows ordinary quantified groups', () => {
    expect(compileUserRegex('(\\d{2})+')).toBeInstanceOf(RegExp);
    expect(compileUserRegex('foo.*bar')).toBeInstanceOf(RegExp);
  });

  it('rejects over-long patterns', () => {
    expect(compileUserRegex('a'.repeat(201))).toBeNull();
  });

  it('rejects invalid and empty patterns', () => {
    expect(compileUserRegex('(unclosed')).toBeNull();
    expect(compileUserRegex('')).toBeNull();
  });
});

describe('publishedTimestamp', () => {
  it('accepts numeric timestamps', () => {
    expect(publishedTimestamp({ publishedDate: 1700000000000 })).toBe(1700000000000);
  });

  it('parses ISO strings', () => {
    expect(publishedTimestamp({ publishedDate: '2020-01-02T00:00:00Z' })).toBe(
      Date.parse('2020-01-02T00:00:00Z'),
    );
  });

  it('falls back to rawMetadata', () => {
    expect(publishedTimestamp({ rawMetadata: { publishedDate: '2019-05-05' } })).toBe(
      Date.parse('2019-05-05'),
    );
  });

  it('returns null when absent or unparseable', () => {
    expect(publishedTimestamp({})).toBeNull();
    expect(publishedTimestamp({ publishedDate: '' })).toBeNull();
    expect(publishedTimestamp({ publishedDate: 'not a date' })).toBeNull();
    expect(publishedTimestamp(null)).toBeNull();
  });
});
