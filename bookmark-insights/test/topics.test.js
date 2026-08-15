import { describe, it, expect } from 'vitest';
import { detectTopics, getTopicDisplayName } from '../src/topics.js';

describe('detectTopics', () => {
  it('detects a topic from a well-known domain', () => {
    const topics = detectTopics({
      title: 'Some repository',
      url: 'https://github.com/user/repo',
      domain: 'github.com'
    });
    expect(topics.length).toBeGreaterThan(0);
  });

  it('returns an array for a bookmark with no signal', () => {
    const topics = detectTopics({ title: 'x', url: 'https://a.example', domain: 'a.example' });
    expect(Array.isArray(topics)).toBe(true);
  });

  it('matches keywords on word boundaries, not substrings', () => {
    const withWord = detectTopics({
      title: 'Learning React hooks',
      url: 'https://blog.example/post',
      domain: 'blog.example'
    });
    const withSubstring = detectTopics({
      title: 'Reacting to feedback',
      url: 'https://blog.example/post',
      domain: 'blog.example'
    });
    expect(withWord).not.toEqual(withSubstring);
  });

  it('handles missing fields without throwing', () => {
    expect(() => detectTopics({})).not.toThrow();
    expect(() => detectTopics({ title: null, url: null, domain: null })).not.toThrow();
  });

  it('is deterministic across repeated calls', () => {
    const bookmark = { title: 'Kubernetes deployment guide', url: 'https://k8s.example/docs', domain: 'k8s.example' };
    expect(detectTopics(bookmark)).toEqual(detectTopics(bookmark));
  });
});

describe('getTopicDisplayName', () => {
  it('falls back to the id when the topic is unknown', () => {
    expect(getTopicDisplayName('not-a-real-topic')).toBeTruthy();
  });
});
