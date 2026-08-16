import { describe, it, expect } from 'vitest';
import { compileUserRegex } from '../src/search.js';

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
