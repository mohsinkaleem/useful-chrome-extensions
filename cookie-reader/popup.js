// State
let currentDomain = '';
let currentUrl = '';
let currentTabId = null;
let allStats = [];
let statsOffset = 0;
const STATS_BATCH_SIZE = 50;

function renderNextBatch() {
  const tbody = document.getElementById('stats-body');
  const loadMoreContainer = document.getElementById('load-more-container');
  
  if (allStats.length === 0) {
    showEmptyState('stats-body', 'No cookies found');
    loadMoreContainer.style.display = 'none';
    return;
  }
  
  const nextBatch = allStats.slice(statsOffset, statsOffset + STATS_BATCH_SIZE);
  
  nextBatch.forEach(stat => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${escapeHtml(stat.domain)}">${escapeHtml(stat.domain)}</td>
      <td>${stat.count}</td>
      <td>${formatBytes(stat.size)}</td>
      <td>${stat.secure}</td>
      <td>${stat.httpOnly}</td>
      <td>${stat.session}</td>
    `;
    tbody.appendChild(row);
  });

  statsOffset += nextBatch.length;

  // Show/hide load more button
  if (statsOffset < allStats.length) {
    loadMoreContainer.style.display = 'block';
  } else {
    loadMoreContainer.style.display = 'none';
  }
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showEmptyState(containerId, message) {
  const container = document.getElementById(containerId);
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  emptyState.textContent = message;
  
  if (containerId === 'cookie-list') {
    container.innerHTML = '';
    container.appendChild(emptyState);
  } else if (containerId === 'stats-body') {
    container.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">${message}</td></tr>`;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Set up tab switching
  setupTabs();
  
  // Set up export button
  document.getElementById('export-btn').addEventListener('click', exportData);
  
  // Set up delete all button
  document.getElementById('delete-all-btn').addEventListener('click', deleteAllCookies);

  // Set up load more button
  document.getElementById('load-more-btn').addEventListener('click', renderNextBatch);

  // Load current site cookies
  await loadCurrentSiteCookies();
}

function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      // Remove active class from all tabs
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
      
      // Load stats if stats tab is clicked
      if (tabId === 'stats') {
        await loadStats();
      }
    });
  });
}

async function loadCurrentSiteCookies() {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      showEmptyState('cookie-list', 'No active tab found');
      return;
    }

    currentTabId = tab.id;
    currentUrl = tab.url;
    
    // Extract domain from URL
    const url = new URL(tab.url);
    currentDomain = url.hostname;
    document.getElementById('current-domain').textContent = currentDomain;
    
    // Get cookies for this domain
    const cookies = await chrome.cookies.getAll({ url: currentUrl });
    
    renderCookieList(cookies);
  } catch (error) {
    console.error('Error loading cookies:', error);
    showEmptyState('cookie-list', 'Error loading cookies');
  }
}

function renderCookieList(cookies) {
  const container = document.getElementById('cookie-list');
  
  if (!cookies || cookies.length === 0) {
    showEmptyState('cookie-list', 'No cookies found for this site');
    return;
  }
  
  container.innerHTML = '';
  
  cookies.forEach(cookie => {
    const cookieItem = createCookieElement(cookie);
    container.appendChild(cookieItem);
  });
}

function createCookieElement(cookie) {
  const item = document.createElement('div');
  item.className = 'cookie-item';
  
  item.innerHTML = `
    <div class="cookie-header">
      <div class="cookie-name">${escapeHtml(cookie.name)}</div>
      <div class="cookie-actions">
        <button class="btn-delete">Delete</button>
      </div>
    </div>
    <div class="cookie-details">
      <div class="detail-line"><span class="detail-key">Value:</span>${escapeHtml(cookie.value)}</div>
      <div class="detail-line" style="display: flex; flex-wrap: wrap; gap: 8px; row-gap: 2px;">
        <div><span class="detail-key">Domain:</span>${escapeHtml(cookie.domain)}</div>
        <div><span class="detail-key">Path:</span>${escapeHtml(cookie.path)}</div>
        <div><span class="detail-key">Expires:</span>${cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toLocaleString() : 'Session'}</div>
      </div>
      <div class="detail-line flags-container">
        <span class="detail-key">Flags:</span>
        <span class="flag-item">Secure:${cookie.secure}</span>
        <span class="flag-item">HttpOnly:${cookie.httpOnly}</span>
        <span class="flag-item">SameSite:${cookie.sameSite || '-'}</span>
        <span class="flag-item">HostOnly:${cookie.hostOnly}</span>
        <span class="flag-item">Session:${cookie.session}</span>
      </div>
    </div>
  `;

  item.querySelector('.btn-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteCookie(cookie);
    item.remove();
    // If no cookies left, show empty state
    if (document.getElementById('cookie-list').children.length === 0) {
      showEmptyState('cookie-list', 'No cookies found for this site');
    }
  });
  
  return item;
}

async function deleteCookie(cookie) {
  // Fix URL construction: strip leading dot from domain
  const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
  
  // Determine protocols to try
  const protocols = cookie.secure ? ['https'] : ['https', 'http'];
  
  let removed = false;
  
  for (const protocol of protocols) {
    const url = `${protocol}://${domain}${cookie.path}`;
    
    const details = {
      url: url,
      name: cookie.name,
      storeId: cookie.storeId
    };
    
    // Support for partitioned cookies (CHIPS)
    if (cookie.partitionKey) {
      details.partitionKey = cookie.partitionKey;
    }
    
    try {
      const result = await chrome.cookies.remove(details);
      if (result) {
        removed = true;
        break;
      }
    } catch (error) {
      console.error(`Failed to delete cookie with URL ${url}:`, error);
    }
  }
  
  if (!removed) {
    console.warn('Failed to delete cookie: matching URL not found');
  }
}

async function deleteAllCookies() {
  if (!confirm('Are you sure you want to delete all cookies for this domain?')) {
    return;
  }

  const container = document.getElementById('cookie-list');
  
  try {
    // Clear LocalStorage, SessionStorage, and IndexedDB (Once)
    if (currentTabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTabId },
          func: () => {
            localStorage.clear();
            sessionStorage.clear();
            if (window.indexedDB && window.indexedDB.databases) {
              window.indexedDB.databases().then(dbs => {
                dbs.forEach(db => window.indexedDB.deleteDatabase(db.name));
              });
            }
            console.log('Site data cleared by Cookie Manager');
          }
        });
      } catch (err) {
        console.error('Failed to clear site data:', err);
      }
    }

    // Delete all cookies
    const cookies = await chrome.cookies.getAll({ url: currentUrl });
    await Promise.all(cookies.map(cookie => deleteCookie(cookie)));
    
    // Clear list
    container.innerHTML = '';
    showEmptyState('cookie-list', 'No cookies found for this site');
  } catch (error) {
    console.error('Error deleting all cookies:', error);
    alert('Failed to delete some cookies.');
  }
}

async function loadStats() {
  try {
    allStats = await calculateStats();
    statsOffset = 0;
    document.getElementById('stats-body').innerHTML = '';
    renderNextBatch();
  } catch (error) {
    console.error('Error loading stats:', error);
    showEmptyState('stats-body', 'Error loading statistics');
  }
}

async function calculateStats() {
  // Get all cookies
  const allCookies = await chrome.cookies.getAll({});
  
  // Group by domain
  const domainMap = new Map();
  
  allCookies.forEach(cookie => {
    const domain = cookie.domain;
    const size = cookie.name.length + cookie.value.length;
    
    if (!domainMap.has(domain)) {
      domainMap.set(domain, {
        domain: domain,
        count: 0,
        size: 0,
        secure: 0,
        httpOnly: 0,
        session: 0
      });
    }
    
    const stats = domainMap.get(domain);
    stats.count++;
    stats.size += size;
    if (cookie.secure) stats.secure++;
    if (cookie.httpOnly) stats.httpOnly++;
    if (cookie.session) stats.session++;
  });
  
  // Convert to array and sort by size descending
  const statsArray = Array.from(domainMap.values());
  statsArray.sort((a, b) => b.size - a.size);
  
  return statsArray;
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function exportData() {
  try {
    // Determine which tab is active
    const activeTab = document.querySelector('.tab-content.active');
    const tabId = activeTab.id;
    
    let data;
    let filename;
    
    if (tabId === 'current-site') {
      // Export current site cookies
      const cookies = await chrome.cookies.getAll({ url: currentUrl });
      data = {
        domain: currentDomain,
        url: currentUrl,
        exportDate: new Date().toISOString(),
        cookies: cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
          expirationDate: c.expirationDate
        }))
      };
      filename = `cookies-${currentDomain}-${Date.now()}.json`;
    } else {
      // Export stats
      data = {
        exportDate: new Date().toISOString(),
        statistics: allStats
      };
      filename = `cookie-stats-${Date.now()}.json`;
    }
    
    // Create blob and download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting data:', error);
    alert('Error exporting data. Please try again.');
  }
}