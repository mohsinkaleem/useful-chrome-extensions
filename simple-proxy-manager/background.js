// Current active proxy profile (kept in memory for proxy.onRequest)
let activeProfile = null;
let activeBypassList = [];

// Register the proxy.onRequest listener — this is the Firefox-recommended approach.
// Unlike proxy.settings.set() which modifies global Firefox proxy settings (and can
// conflict with or be overridden by the Firefox Settings > Network Settings page),
// proxy.onRequest intercepts each request and the extension controls the proxy
// decision directly, independent of Firefox's built-in proxy settings page.
browser.proxy.onRequest.addListener(
  handleProxyRequest,
  { urls: ["<all_urls>"] }
);

// Handle proxy errors
browser.proxy.onError.addListener((error) => {
  console.error('Proxy error:', error.message);
});

// Determine proxy for each request
function handleProxyRequest(requestInfo) {
  // No active profile or system proxy — let Firefox handle it natively
  if (!activeProfile || activeProfile.type === 'system') {
    // Returning null tells Firefox to fall back to its own proxy settings
    return null;
  }

  // Direct connection (no proxy)
  if (activeProfile.type === 'none') {
    return { type: 'direct' };
  }

  // Check bypass list
  if (shouldBypass(requestInfo.url)) {
    return { type: 'direct' };
  }

  // Build ProxyInfo based on profile type
  if (activeProfile.type === 'http') {
    return {
      type: 'http',
      host: activeProfile.host,
      port: parseInt(activeProfile.port, 10)
    };
  }

  if (activeProfile.type === 'https') {
    return {
      type: 'https',
      host: activeProfile.host,
      port: parseInt(activeProfile.port, 10)
    };
  }

  if (activeProfile.type === 'socks' || activeProfile.type === 'socks4') {
    return {
      type: 'socks4',
      host: activeProfile.host,
      port: parseInt(activeProfile.port, 10),
      proxyDNS: activeProfile.proxyDNS || false
    };
  }

  if (activeProfile.type === 'socks5') {
    return {
      type: 'socks',
      host: activeProfile.host,
      port: parseInt(activeProfile.port, 10),
      username: activeProfile.username || undefined,
      password: activeProfile.password || undefined,
      proxyDNS: activeProfile.proxyDNS || false
    };
  }

  // Fallback — direct
  return { type: 'direct' };
}

// Check if a URL should bypass the proxy
function shouldBypass(url) {
  if (activeBypassList.length === 0) return false;

  try {
    const hostname = new URL(url).hostname;

    // Always bypass localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return true;
    }

    for (const pattern of activeBypassList) {
      const trimmed = pattern.trim().toLowerCase();
      if (!trimmed) continue;

      // <local> matches hostnames without dots
      if (trimmed === '<local>') {
        if (!hostname.includes('.')) return true;
        continue;
      }

      // Wildcard / suffix match: ".example.com" matches "foo.example.com"
      if (trimmed.startsWith('.')) {
        if (hostname.endsWith(trimmed) || hostname === trimmed.substring(1)) {
          return true;
        }
        continue;
      }

      // Exact hostname match (ignore port in bypass entry)
      const bypassHost = trimmed.split(':')[0];
      if (hostname === bypassHost) return true;

      // Suffix match without leading dot
      if (hostname.endsWith('.' + bypassHost)) return true;
    }
  } catch (e) {
    // If URL parsing fails, don't bypass
  }

  return false;
}

// Parse bypass string into array
function parseBypassList(bypassString) {
  if (!bypassString) return [];
  return bypassString.split(',').map(s => s.trim()).filter(Boolean);
}

// Handle proxy authentication via webRequest.onAuthRequired
browser.webRequest.onAuthRequired.addListener(
  (details) => {
    // Only handle proxy auth, not website auth
    if (details.isProxy && activeProfile && activeProfile.username) {
      return {
        authCredentials: {
          username: activeProfile.username,
          password: activeProfile.password || ''
        }
      };
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'setProxy') {
    return setProxyConfig(message.profile);
  } else if (message.action === 'clearProxy') {
    return clearProxyConfig();
  }
});

// Set proxy configuration (update in-memory state)
async function setProxyConfig(profile) {
  activeProfile = profile;
  activeBypassList = parseBypassList(profile.bypass);

  console.log('Proxy profile activated:', profile.name || profile.type);

  // Update browser action icon to show active state
  const isCustomProxy = profile.type !== 'system' && profile.type !== 'none';
  updateIcon(isCustomProxy);
}

// Clear proxy configuration (revert to system/default)
async function clearProxyConfig() {
  activeProfile = null;
  activeBypassList = [];
  console.log('Proxy settings cleared — falling back to system');
  updateIcon(false);
}

// Update extension icon based on proxy status
function updateIcon(isActive) {
  if (isActive) {
    browser.browserAction.setBadgeText({ text: '●' });
    browser.browserAction.setBadgeBackgroundColor({ color: '#2196F3' });
  } else {
    browser.browserAction.setBadgeText({ text: '' });
  }
}

// Initialize — restore active profile from storage on startup
async function initialize() {
  const result = await browser.storage.local.get(['activeProfile', 'profiles']);
  const activeProfileId = result.activeProfile || 'system';

  if (activeProfileId === 'direct') {
    await setProxyConfig({ id: 'direct', type: 'none', name: 'No Proxy' });
  } else if (activeProfileId === 'system') {
    await setProxyConfig({ id: 'system', type: 'system', name: 'System Proxy' });
  } else if (result.profiles) {
    const savedProfile = result.profiles.find(p => p.id === activeProfileId);
    if (savedProfile) {
      await setProxyConfig(savedProfile);
    } else {
      await setProxyConfig({ id: 'system', type: 'system', name: 'System Proxy' });
    }
  } else {
    await setProxyConfig({ id: 'system', type: 'system', name: 'System Proxy' });
  }
}

// Run initialization
initialize();
