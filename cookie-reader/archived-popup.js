// Constants
const ITEMS_PER_PAGE = 50;
let currentPage = 0;
let allDomainStats = [];

// Tab switching
document.querySelectorAll('.tab-btn').forEach(button => {
  button.addEventListener('click', () => {
    const tabName = button.dataset.tab;
    
    // Update active states
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    button.classList.add('active');
    document.getElementById(tabName).classList.add('active');
    
    // Load data for the selected tab
    if (tabName === 'current-site') {
      loadCurrentSiteCookies();
    } else if (tabName === 'stats') {
      loadStatistics();
    }
  });
});

// Load cookies for current site
async function loadCurrentSiteCookies() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    const domain = url.hostname;
    
    document.getElementById('current-domain').textContent = domain;
    
    const cookies = await chrome.cookies.getAll({ domain });
    displayCookies(cookies);
  } catch (error) {
    console.error('Error loading cookies:', error);
    document.getElementById('current-domain').textContent = 'Error loading domain';
  }
}

// Display cookies
function displayCookies(cookies) {
  const cookieList = document.getElementById('cookie-list');
  cookieList.innerHTML = '';
  
  if (cookies.length === 0) {
    cookieList.innerHTML = '<p class="no-cookies">No cookies found for this site</p>';
    return;
  }
  
  cookies.forEach(cookie => {
    const cookieItem = document.createElement('div');
    cookieItem.className = 'cookie-item';
    
    cookieItem.innerHTML = `
      <div class="cookie-header">
        <strong>${escapeHtml(cookie.name)}</strong>
        <button class="btn-delete" data-name="${escapeHtml(cookie.name)}" data-domain="${escapeHtml(cookie.domain)}">Delete</button>
      </div>
      <div class="cookie-details">
        <div><strong>Value:</strong> ${escapeHtml(truncate(cookie.value, 100))}</div>
        <div><strong>Domain:</strong> ${escapeHtml(cookie.domain)}</div>
        <div><strong>Path:</strong> ${escapeHtml(cookie.path)}</div>
        <div><strong>Expires:</strong> ${cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toLocaleString() : 'Session'}</div>
        <div><strong>Secure:</strong> ${cookie.secure ? 'Yes' : 'No'}</div>
        <div><strong>HttpOnly:</strong> ${cookie.httpOnly ? 'Yes' : 'No'}</div>
        <div><strong>SameSite:</strong> ${cookie.sameSite || 'None'}</div>
      </div>
    `;
    
    cookieList.appendChild(cookieItem);
  });
  
  // Add delete event listeners
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const name = e.target.dataset.name;
      const domain = e.target.dataset.domain;
      await deleteCookie(name, domain);
      loadCurrentSiteCookies();
    });
  });
}

// Delete a single cookie
async function deleteCookie(name, domain) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    
    await chrome.cookies.remove({
      name: name,
      url: `${url.protocol}//${domain}`
    });
  } catch (error) {
    console.error('Error deleting cookie:', error);
  }
}

// Delete all cookies for current site
document.getElementById('delete-all-btn').addEventListener('click', async () => {
  if (!confirm('Are you sure you want to delete all cookies for this site?')) {
    return;
  }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    const domain = url.hostname;
    
    const cookies = await chrome.cookies.getAll({ domain });
    
    for (const cookie of cookies) {
      await chrome.cookies.remove({
        name: cookie.name,
        url: `${url.protocol}//${cookie.domain}`
      });
    }
    
    loadCurrentSiteCookies();
  } catch (error) {
    console.error('Error deleting all cookies:', error);
  }
});

// Load statistics
async function loadStatistics() {
  try {
    const allCookies = await chrome.cookies.getAll({});
    const domainMap = {};
    
    allCookies.forEach(cookie => {
      const domain = cookie.domain;
      if (!domainMap[domain]) {
        domainMap[domain] = {
          count: 0,
          size: 0,
          secure: 0,
          httpOnly: 0,
          session: 0
        };
      }
      
      const stats = domainMap[domain];
      stats.count++;
      stats.size += (cookie.name.length + cookie.value.length);
      if (cookie.secure) stats.secure++;
      if (cookie.httpOnly) stats.httpOnly++;
      if (!cookie.expirationDate) stats.session++;
    });
    
    allDomainStats = Object.entries(domainMap)
      .map(([domain, stats]) => ({ domain, ...stats }))
      .sort((a, b) => b.count - a.count);
    
    currentPage = 0;
    renderNextBatch();
  } catch (error) {
    console.error('Error loading statistics:', error);
  }
}

// Render next batch of statistics
function renderNextBatch() {
  const statsBody = document.getElementById('stats-body');
  const loadMoreContainer = document.getElementById('load-more-container');
  
  if (currentPage === 0) {
    statsBody.innerHTML = '';
  }
  
  const start = currentPage * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const batch = allDomainStats.slice(start, end);
  
  batch.forEach(stat => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(stat.domain)}</td>
      <td>${stat.count}</td>
      <td>${formatBytes(stat.size)}</td>
      <td>${stat.secure}</td>
      <td>${stat.httpOnly}</td>
      <td>${stat.session}</td>
    `;
    statsBody.appendChild(row);
  });
  
  currentPage++;
  
  // Show/hide load more button
  if (end < allDomainStats.length) {
    loadMoreContainer.style.display = 'block';
  } else {
    loadMoreContainer.style.display = 'none';
  }
}

// Load more button
document.getElementById('load-more-btn').addEventListener('click', () => {
  renderNextBatch();
});

// Export data
document.getElementById('export-btn').addEventListener('click', async () => {
  try {
    const allCookies = await chrome.cookies.getAll({});
    const data = {
      exportDate: new Date().toISOString(),
      totalCookies: allCookies.length,
      cookies: allCookies
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cookies-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting data:', error);
  }
});

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Initialize
loadCurrentSiteCookies();
