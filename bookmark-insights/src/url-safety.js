// URL validation and hardened network access.
// Every outbound fetch the extension makes must go through this module.

const FETCHABLE_SCHEMES = new Set(['http:', 'https:']);

// Hostname suffixes reserved for private / internal networks.
const PRIVATE_SUFFIXES = ['.local', '.localhost', '.internal', '.intranet', '.home.arpa', '.lan'];

const MAX_BODY_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

function isPrivateIPv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;

  const octets = parts.map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(hostname) {
  // URL.hostname keeps IPv6 literals bracketed.
  const addr = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!addr.includes(':')) return false;
  if (addr === '::1' || addr === '::') return true;
  if (/^f[cd]/.test(addr)) return true; // unique local fc00::/7
  if (/^fe[89ab]/.test(addr)) return true; // link-local fe80::/10
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * True when the hostname resolves to a private, loopback or link-local target.
 * @param {string} hostname
 * @returns {boolean}
 */
function isPrivateHost(hostname) {
  if (!hostname) return true;
  const host = hostname.toLowerCase();

  if (host === 'localhost') return true;
  if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  // A bare label with no dot is an intranet name, never a public site.
  if (!host.includes('.') && !host.includes(':')) return true;
  if (isPrivateIPv4(host)) return true;
  if (isPrivateIPv6(host)) return true;

  return false;
}

/**
 * True when a URL is safe for the extension to fetch: public http(s) only.
 * @param {string} url
 * @returns {boolean}
 */
export function isFetchableUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  try {
    const parsed = new URL(url);
    if (!FETCHABLE_SCHEMES.has(parsed.protocol)) return false;
    if (isPrivateHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a possibly-relative image reference and allow only renderable schemes.
 * `new URL()` ignores the base for absolute-scheme inputs, so `javascript:` must
 * be rejected after resolution, not before.
 * @param {string} rawUrl
 * @param {string} [baseUrl]
 * @returns {string|null} Absolute URL, or null when unsafe.
 */
export function safeImageUrl(rawUrl, baseUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return null;
  try {
    const resolved = new URL(rawUrl, baseUrl);
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') return resolved.href;
    if (resolved.protocol === 'data:' && /^data:image\//i.test(resolved.href)) return resolved.href;
    return null;
  } catch {
    return null;
  }
}

/**
 * Scheme allowlist for anything rendered as an `href`. The data model expects
 * `javascript:` bookmarklets and `data:` URLs, so navigable links must be
 * restricted here rather than relying on the extension CSP to block them.
 * @param {string} url
 * @returns {string|null} The URL when navigable, otherwise null.
 */
export function safeHref(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Fetch with a timeout that also covers body download, a hard body-size cap and
 * an optional Content-Type gate. Rejects non-fetchable URLs outright.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {string} [options.method='GET']
 * @param {number} [options.timeout=8000] Total budget for headers *and* body.
 * @param {number} [options.maxBytes=524288]
 * @param {RegExp} [options.expectContentType] Applied to the Content-Type header.
 * @param {boolean} [options.readBody=true]
 * @returns {Promise<{ok: boolean, status: number, retryAfter: string|null, body: string}>}
 */
export async function safeFetch(url, options = {}) {
  const {
    method = 'GET',
    timeout = DEFAULT_TIMEOUT_MS,
    maxBytes = MAX_BODY_BYTES,
    expectContentType = null,
    readBody = true,
  } = options;

  if (!isFetchableUrl(url)) {
    throw new Error('Blocked URL: not a public http(s) address');
  }

  const controller = new AbortController();
  // Cleared only after the body is fully read, so a trickled body still aborts.
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });

    // A redirect can leave the public range; re-check the final URL.
    if (response.url && !isFetchableUrl(response.url)) {
      throw new Error('Blocked redirect into a private address');
    }

    if (!readBody || method === 'HEAD' || !response.body) {
      return {
        ok: response.ok,
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        body: '',
      };
    }

    if (expectContentType && !expectContentType.test(response.headers.get('content-type') || '')) {
      return {
        ok: response.ok,
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        body: '',
      };
    }

    const body = await readCapped(response.body, maxBytes);
    return {
      ok: response.ok,
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
      body,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readCapped(stream, maxBytes) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let received = 0;
  let text = '';

  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      text += decoder.decode(
        received > maxBytes ? value.subarray(0, value.byteLength - (received - maxBytes)) : value,
        { stream: true },
      );
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  return text;
}
