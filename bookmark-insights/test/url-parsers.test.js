import { describe, it, expect } from 'vitest';
import { parseBookmarkUrl } from '../src/url-parsers.js';

describe('parseBookmarkUrl', () => {
  it('parses a YouTube video URL', () => {
    const result = parseBookmarkUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.platform).toBe('youtube');
    expect(result.type).toBe('video');
    expect(result.identifier).toBe('dQw4w9WgXcQ');
  });

  it('parses a youtu.be short link', () => {
    const result = parseBookmarkUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(result.platform).toBe('youtube');
    expect(result.identifier).toBe('dQw4w9WgXcQ');
  });

  it('parses a GitHub repository', () => {
    const result = parseBookmarkUrl('https://github.com/sveltejs/svelte');
    expect(result.platform).toBe('github');
    expect(result.creator).toBe('sveltejs');
  });

  it('classifies non-http schemes as the generic platform', () => {
    expect(parseBookmarkUrl('javascript:void(0)').platform).toBe('other');
    expect(parseBookmarkUrl('chrome://settings').platform).toBe('other');
  });

  it('returns null for malformed input', () => {
    expect(parseBookmarkUrl('')).toBeNull();
    expect(parseBookmarkUrl(null)).toBeNull();
    expect(parseBookmarkUrl('not a url')).toBeNull();
  });

  it('still produces a result for an unrecognised domain', () => {
    const result = parseBookmarkUrl('https://example.com/some/page');
    expect(result).not.toBeNull();
    expect(result.platform).toBeDefined();
  });
});
