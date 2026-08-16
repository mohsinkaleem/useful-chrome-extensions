import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Every probe goes through safeFetch, so faking that module is enough to drive
// checkBookmarkAlive through each real-world failure mode the old check got
// wrong.
vi.mock('../src/url-safety.js', () => ({
  safeFetch: vi.fn(),
  isFetchableUrl: vi.fn(() => true),
  safeImageUrl: vi.fn((href) => href),
}));

const { safeFetch, isFetchableUrl } = await import('../src/url-safety.js');
const {
  checkBookmarkAlive,
  classifyStatus,
  LINK_ALIVE,
  LINK_DEAD,
  LINK_BLOCKED,
  LINK_UNKNOWN,
} = await import('../src/enrichment.js');

function response(status, extra = {}) {
  return { ok: status >= 200 && status < 300, status, ...extra };
}

function abortError() {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

// checkBookmarkAlive waits for a per-host politeness slot between the HEAD and
// the GET. Fake timers keep that from costing a real second per case.
async function probe(url) {
  const pending = checkBookmarkAlive(url);
  await vi.advanceTimersByTimeAsync(10000);
  return pending;
}

// Each case gets its own hostname: the per-host backoff map is module state and
// a 429 in one test would otherwise delay the next.
let hostCounter = 0;
function freshUrl() {
  hostCounter += 1;
  return `https://host-${hostCounter}.example.com/page`;
}

beforeEach(() => {
  vi.useFakeTimers();
  safeFetch.mockReset();
  isFetchableUrl.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('classifyStatus', () => {
  it('treats 2xx and 3xx as alive', () => {
    expect(classifyStatus(200)).toBe(LINK_ALIVE);
    expect(classifyStatus(204)).toBe(LINK_ALIVE);
    expect(classifyStatus(301)).toBe(LINK_ALIVE);
    expect(classifyStatus(202)).toBe(LINK_ALIVE);
  });

  it('treats rate limits and gateway failures as unknown, not dead', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504, 526]) {
      expect(classifyStatus(status)).toBe(LINK_UNKNOWN);
    }
  });

  it('treats anonymous-client rejections as blocked, not dead', () => {
    for (const status of [401, 403, 406, 451]) {
      expect(classifyStatus(status)).toBe(LINK_BLOCKED);
    }
  });

  it('treats 404 and 410 as dead', () => {
    expect(classifyStatus(404)).toBe(LINK_DEAD);
    expect(classifyStatus(410)).toBe(LINK_DEAD);
  });
});

describe('checkBookmarkAlive', () => {
  it('accepts a HEAD 200 without a second request', async () => {
    safeFetch.mockResolvedValueOnce(response(200));

    const result = await probe(freshUrl());

    expect(result.state).toBe(LINK_ALIVE);
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to GET when HEAD answers 405, and believes the GET', async () => {
    safeFetch.mockResolvedValueOnce(response(405)).mockResolvedValueOnce(response(200));

    const result = await probe(freshUrl());

    expect(result.state).toBe(LINK_ALIVE);
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(safeFetch.mock.calls[0][1].method).toBe('HEAD');
    expect(safeFetch.mock.calls[1][1].method).toBe('GET');
  });

  it('falls back to GET when HEAD answers 404 - HEAD alone may not declare a link dead', async () => {
    safeFetch.mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(200));

    const result = await probe(freshUrl());

    expect(result.state).toBe(LINK_ALIVE);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it('reports dead only when the GET also says so', async () => {
    safeFetch.mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(404));

    const result = await probe(freshUrl());

    expect(result.state).toBe(LINK_DEAD);
    expect(result.status).toBe(404);
  });

  it('reports a rate-limited host as unknown without retrying', async () => {
    safeFetch.mockResolvedValueOnce(response(429, { retryAfter: '1' }));

    const result = await probe(freshUrl());

    expect(result.state).toBe(LINK_UNKNOWN);
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a 503 as unknown rather than dead', async () => {
    safeFetch.mockResolvedValueOnce(response(503));

    const result = await probe(freshUrl());

    expect(result.state).toBe(LINK_UNKNOWN);
  });

  it('reports a bot-blocked 403 as blocked', async () => {
    safeFetch.mockResolvedValueOnce(response(403));

    const result = await probe(freshUrl());

    expect(result.state).toBe(LINK_BLOCKED);
    expect(result.status).toBe(403);
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a 406 as blocked', async () => {
    safeFetch.mockResolvedValueOnce(response(406));

    const result = await probe(freshUrl());

    expect(result.state).toBe(LINK_BLOCKED);
  });

  it('reports a timeout as unknown', async () => {
    safeFetch.mockRejectedValueOnce(abortError());

    const result = await probe(freshUrl());

    expect(result.state).toBe(LINK_UNKNOWN);
    expect(result.networkError).toBe(false);
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('retries with GET when HEAD throws, and succeeds', async () => {
    safeFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response(200));

    const result = await probe(freshUrl());

    expect(result.state).toBe(LINK_ALIVE);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it('flags a network error rather than declaring the link dead outright', async () => {
    safeFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await probe(freshUrl());

    // A VPN-gated internal host and a domain that no longer resolves are
    // indistinguishable here, so the verdict is deferred to the caller.
    expect(result.state).toBe(LINK_UNKNOWN);
    expect(result.networkError).toBe(true);
  });

  it('reports unknown for URLs it must not fetch', async () => {
    isFetchableUrl.mockReturnValue(false);

    const result = await probe('http://localhost:3000/');

    expect(result.state).toBe(LINK_UNKNOWN);
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
