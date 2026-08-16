import { describe, it, expect } from 'vitest';
import {
  isEnriched,
  isEnrichable,
  isPendingEnrichment,
  isDead,
  isNeverAccessed,
  isStale,
  STALE_AGE_DAYS,
} from '../src/predicates.js';

const DAY = 24 * 60 * 60 * 1000;

describe('isEnriched', () => {
  it('is true when enrichedAt is set', () => {
    expect(isEnriched({ enrichedAt: 1 })).toBe(true);
  });

  it('is false for a failed attempt, even though lastChecked was stamped', () => {
    expect(isEnriched({ lastChecked: Date.now(), enrichmentError: 'timeout' })).toBe(false);
  });

  it('is false when only lastChecked is set', () => {
    expect(isEnriched({ lastChecked: Date.now() })).toBe(false);
  });

  it('infers legacy records from their stored metadata', () => {
    expect(isEnriched({ description: 'x' })).toBe(true);
    expect(isEnriched({ keywords: ['a'] })).toBe(true);
    expect(isEnriched({ contentSnippet: 'x' })).toBe(true);
    expect(isEnriched({ keywords: [] })).toBe(false);
  });

  it('handles missing input', () => {
    expect(isEnriched(null)).toBe(false);
  });
});

describe('isEnrichable', () => {
  it('accepts http and https', () => {
    expect(isEnrichable({ url: 'http://example.com' })).toBe(true);
    expect(isEnrichable({ url: 'https://example.com' })).toBe(true);
  });

  it('rejects schemes that can never be fetched', () => {
    expect(isEnrichable({ url: 'chrome://bookmarks' })).toBe(false);
    expect(isEnrichable({ url: 'file:///tmp/a.html' })).toBe(false);
    expect(isEnrichable({ url: 'javascript:void(0)' })).toBe(false);
  });

  it('honours the terminal enrichable:false flag', () => {
    expect(isEnrichable({ url: 'https://example.com', enrichable: false })).toBe(false);
  });
});

describe('isPendingEnrichment', () => {
  it('is true only for enrichable and not-yet-enriched bookmarks', () => {
    expect(isPendingEnrichment({ url: 'https://a.com' })).toBe(true);
    expect(isPendingEnrichment({ url: 'https://a.com', enrichedAt: 1 })).toBe(false);
    expect(isPendingEnrichment({ url: 'chrome://a' })).toBe(false);
  });
});

describe('isDead', () => {
  it('distinguishes checked-and-dead from never checked', () => {
    expect(isDead({ isAlive: false })).toBe(true);
    expect(isDead({ isAlive: true })).toBe(false);
    expect(isDead({ isAlive: null })).toBe(false);
    expect(isDead({})).toBe(false);
  });
});

describe('isNeverAccessed', () => {
  it('is driven by accessCount', () => {
    expect(isNeverAccessed({})).toBe(true);
    expect(isNeverAccessed({ accessCount: 0 })).toBe(true);
    expect(isNeverAccessed({ accessCount: 3 })).toBe(false);
  });
});

describe('isStale', () => {
  const now = Date.now();
  const old = now - (STALE_AGE_DAYS + 1) * DAY;

  it('requires old, unaccessed and not dead', () => {
    expect(isStale({ dateAdded: old }, now)).toBe(true);
    expect(isStale({ dateAdded: now - DAY }, now)).toBe(false);
    expect(isStale({ dateAdded: old, accessCount: 1 }, now)).toBe(false);
    expect(isStale({ dateAdded: old, isAlive: false }, now)).toBe(false);
  });
});
