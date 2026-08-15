import { describe, it, expect } from 'vitest';
import { isFetchableUrl, safeImageUrl } from '../src/url-safety.js';

describe('isFetchableUrl', () => {
  it('accepts public http and https URLs', () => {
    expect(isFetchableUrl('https://example.com/a')).toBe(true);
    expect(isFetchableUrl('http://sub.example.co.uk')).toBe(true);
  });

  it('rejects non-http schemes', () => {
    for (const url of ['file:///etc/passwd', 'chrome://settings', 'javascript:alert(1)', 'data:text/html,x', 'ftp://example.com']) {
      expect(isFetchableUrl(url)).toBe(false);
    }
  });

  it('rejects loopback and localhost', () => {
    for (const url of ['http://localhost:8080', 'http://127.0.0.1/', 'http://[::1]/', 'http://app.localhost/']) {
      expect(isFetchableUrl(url)).toBe(false);
    }
  });

  it('rejects RFC1918 private ranges', () => {
    for (const url of ['http://10.1.2.3/', 'http://192.168.1.1/', 'http://172.16.0.1/', 'http://172.31.255.254/']) {
      expect(isFetchableUrl(url)).toBe(false);
    }
  });

  it('allows 172.32.x, which is outside the private block', () => {
    expect(isFetchableUrl('http://172.32.0.1/')).toBe(true);
  });

  it('rejects the cloud metadata link-local address', () => {
    expect(isFetchableUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('rejects internal hostname suffixes and bare hostnames', () => {
    for (const url of ['http://printer.local/', 'http://wiki.internal/', 'http://intranet/']) {
      expect(isFetchableUrl(url)).toBe(false);
    }
  });

  it('rejects IPv6 unique-local and link-local addresses', () => {
    expect(isFetchableUrl('http://[fc00::1]/')).toBe(false);
    expect(isFetchableUrl('http://[fe80::1]/')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isFetchableUrl('')).toBe(false);
    expect(isFetchableUrl('not a url')).toBe(false);
    expect(isFetchableUrl(null)).toBe(false);
  });
});

describe('safeImageUrl', () => {
  it('resolves relative paths against the base', () => {
    expect(safeImageUrl('/favicon.ico', 'https://example.com/page')).toBe('https://example.com/favicon.ico');
  });

  it('rejects javascript: even when a base is supplied', () => {
    // new URL() ignores the base for absolute-scheme inputs
    expect(safeImageUrl('javascript:alert(1)', 'https://example.com/')).toBeNull();
  });

  it('allows data:image but not other data URIs', () => {
    expect(safeImageUrl('data:image/png;base64,iVBOR')).toBe('data:image/png;base64,iVBOR');
    expect(safeImageUrl('data:text/html,<script>')).toBeNull();
  });

  it('rejects empty or non-string input', () => {
    expect(safeImageUrl('')).toBeNull();
    expect(safeImageUrl(undefined)).toBeNull();
  });
});
