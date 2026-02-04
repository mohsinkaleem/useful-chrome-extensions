const DEFAULT_PROFILES = [
  { id: 'direct', name: 'No Proxy (Direct)', type: 'none', host: 'Direct Connection', port: '' },
  { id: 'system', name: 'System Proxy', type: 'system', host: 'System Settings', port: '' }
];

// Load and display proxy profiles
async function loadProfiles() {
  const result = await browser.storage.local.get(['profiles', 'activeProfile']);
  const customProfiles = result.profiles || [];
  const activeProfileId = result.activeProfile || 'system';
  
  const profilesList = document.getElementById('profilesList');
  profilesList.innerHTML = '';
  
  const allProfiles = [...DEFAULT_PROFILES, ...customProfiles];
  
  allProfiles.forEach(profile => {
    const profileDiv = document.createElement('div');
    profileDiv.className = 'profile-item';
    if (activeProfileId === profile.id) {
      profileDiv.classList.add('active');
    }
    
    const details = profile.type === 'none' || profile.type === 'system' 
      ? profile.host 
      : `${escapeHtml(profile.host)}:${profile.port}`;

    profileDiv.innerHTML = `
      <div class="profile-info">
        <div class="profile-name">${escapeHtml(profile.name)}</div>
        <div class="profile-details">${details}</div>
      </div>
    `;
    
    profileDiv.addEventListener('click', () => activateProfile(profile));
    profilesList.appendChild(profileDiv);
  });
  
  updateStatus(activeProfileId, allProfiles);
}

// Activate a proxy profile
async function activateProfile(profile) {
  try {
    await browser.runtime.sendMessage({
      action: 'setProxy',
      profile: profile
    });
    await browser.storage.local.set({ activeProfile: profile.id });
    loadProfiles();
  } catch (error) {
    console.error('Error activating profile:', error);
  }
}

// Set direct connection (quick switch to system proxy)
async function setDirectConnection() {
  const systemProfile = DEFAULT_PROFILES.find(p => p.id === 'system');
  activateProfile(systemProfile);
}

// Update status display
function updateStatus(activeProfileId, profiles) {
  const statusEl = document.getElementById('currentStatus');
  const activeProfile = profiles.find(p => p.id === activeProfileId);
  
  if (!activeProfile || activeProfile.id === 'system') {
    statusEl.textContent = '🟢 System Proxy';
    statusEl.className = 'status-system';
  } else if (activeProfile.id === 'direct') {
    statusEl.textContent = '⚪ No Proxy (Direct)';
    statusEl.className = 'status-direct';
  } else {
    statusEl.textContent = `🔵 Active: ${activeProfile.name}`;
    statusEl.className = 'status-active';
  }
}

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
document.getElementById('openOptions').addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

// Load profiles on popup open
loadProfiles();

// Listen for storage changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.profiles || changes.activeProfile)) {
    loadProfiles();
  }
});
