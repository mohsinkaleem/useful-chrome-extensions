let activeProfileCredentials = null;

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'setProxy') {
    setProxyConfig(message.profile);
  } else if (message.action === 'clearProxy') {
    clearProxyConfig();
  }
});

// Handle proxy authentication
browser.proxy.onAuthRequired.addListener(
  (details) => {
    if (activeProfileCredentials && activeProfileCredentials.username) {
      return {
        authCredentials: {
          username: activeProfileCredentials.username,
          password: activeProfileCredentials.password
        }
      };
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// Set proxy configuration
async function setProxyConfig(profile) {
  // Store or clear credentials for onAuthRequired
  if (profile.username || profile.password) {
    activeProfileCredentials = {
      username: profile.username,
      password: profile.password
    };
  } else {
    activeProfileCredentials = null;
  }

  let config;
  
  if (profile.type === 'none' || profile.type === 'system') {
    config = {
      proxyType: profile.type
    };
  } else {
    // Build bypass list with defaults
    let bypassList = 'localhost, 127.0.0.1';
    if (profile.bypass) {
      bypassList = profile.bypass;
    }
    
    config = {
      proxyType: 'manual',
      http: profile.type === 'http' ? `${profile.host}:${profile.port}` : undefined,
      httpAll: profile.type === 'http' ? true : undefined,
      ssl: profile.type === 'http' ? `${profile.host}:${profile.port}` : undefined,
      socks: (profile.type === 'socks' || profile.type === 'socks5') ? profile.host : undefined,
      socksVersion: profile.type === 'socks' ? 4 : (profile.type === 'socks5' ? 5 : undefined),
      socksPort: (profile.type === 'socks' || profile.type === 'socks5') ? profile.port : undefined,
      passthrough: bypassList,
      proxyDNS: profile.proxyDNS || false
    };
  }

  try {
    await browser.proxy.settings.set({
      value: config,
      scope: 'regular'
    });
    
    console.log('Proxy configuration updated:', profile.name || profile.type);
    
    // Update browser action icon to show active state
    updateIcon(profile.type !== 'system' && profile.type !== 'none');
  } catch (error) {
    console.error('Error setting proxy:', error);
  }
}

// Clear proxy configuration (reverts to browser defaults)
async function clearProxyConfig() {
  try {
    activeProfileCredentials = null;
    await browser.proxy.settings.clear({ scope: 'regular' });
    console.log('Proxy settings cleared');
    updateIcon(false);
  } catch (error) {
    console.error('Error clearing proxy:', error);
  }
}

// Update extension icon based on proxy status
function updateIcon(isActive) {
  // Firefox doesn't support dynamic icon colors as easily,
  // but we could change the badge text
  if (isActive) {
    browser.browserAction.setBadgeText({ text: '●' });
    browser.browserAction.setBadgeBackgroundColor({ color: '#2196F3' });
  } else {
    browser.browserAction.setBadgeText({ text: '' });
  }
}

// Initialize - check if there's an active profile on startup
async function initialize() {
  const result = await browser.storage.local.get(['activeProfile', 'profiles']);
  const activeProfileId = result.activeProfile || 'system';
  
  // Check if it's a default profile
  if (activeProfileId === 'direct') {
    await setProxyConfig({ id: 'direct', type: 'none', name: 'No Proxy' });
  } else if (activeProfileId === 'system') {
    await setProxyConfig({ id: 'system', type: 'system', name: 'System Proxy' });
  } else if (result.profiles) {
    const activeProfile = result.profiles.find(p => p.id === activeProfileId);
    if (activeProfile) {
      await setProxyConfig(activeProfile);
    } else {
      await setProxyConfig({ id: 'system', type: 'system', name: 'System Proxy' });
    }
  } else {
    await setProxyConfig({ id: 'system', type: 'system', name: 'System Proxy' });
  }
}

// Run initialization
initialize();
