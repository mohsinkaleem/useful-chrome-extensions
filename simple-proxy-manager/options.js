let editingProfileId = null;

// Load and display all profiles
async function loadProfiles() {
  const result = await browser.storage.local.get('profiles');
  const profiles = result.profiles || [];
  
  const profilesList = document.getElementById('profilesList');
  profilesList.innerHTML = '';
  
  if (profiles.length === 0) {
    profilesList.innerHTML = '<div class="no-profiles">No profiles saved yet.</div>';
    return;
  }
  
  profiles.forEach(profile => {
    const profileCard = createProfileCard(profile);
    profilesList.appendChild(profileCard);
  });
}

// Create a profile card element
function createProfileCard(profile) {
  const card = document.createElement('div');
  card.className = 'profile-card';
  
  const typeLabel = profile.type.toUpperCase();
  const authLabel = profile.username ? '🔐 Auth' : '🔓 No Auth';
  
  card.innerHTML = `
    <div class="profile-card-header">
      <h3>${escapeHtml(profile.name)}</h3>
      <div class="profile-actions">
        <button class="btn-icon" data-action="edit" data-id="${profile.id}" title="Edit">✏️</button>
        <button class="btn-icon" data-action="delete" data-id="${profile.id}" title="Delete">🗑️</button>
      </div>
    </div>
    <div class="profile-card-body">
      <div class="profile-detail">
        <span class="label">Address:</span>
        <span class="value">${escapeHtml(profile.host)}:${profile.port}</span>
      </div>
      <div class="profile-detail">
        <span class="label">Type:</span>
        <span class="value">${typeLabel}</span>
      </div>
      <div class="profile-detail">
        <span class="label">Auth:</span>
        <span class="value">${authLabel}</span>
      </div>
      ${profile.bypass ? `<div class="profile-detail">
        <span class="label">Bypass:</span>
        <span class="value">${escapeHtml(profile.bypass)}</span>
      </div>` : ''}
      ${profile.proxyDNS && profile.type === 'socks5' ? `<div class="profile-detail">
        <span class="label">DNS:</span>
        <span class="value">🔒 Proxied</span>
      </div>` : ''}
    </div>
  `;
  
  // Add event listeners for action buttons
  card.querySelector('[data-action="edit"]').addEventListener('click', () => editProfile(profile));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteProfile(profile.id));
  
  return card;
}

// Handle form submission
document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const profile = {
    id: editingProfileId || Date.now().toString(),
    name: document.getElementById('profileName').value.trim(),
    type: document.getElementById('proxyType').value,
    host: document.getElementById('proxyHost').value.trim(),
    port: parseInt(document.getElementById('proxyPort').value),
    username: document.getElementById('proxyUsername').value.trim(),
    password: document.getElementById('proxyPassword').value.trim(),
    bypass: document.getElementById('proxyBypass').value.trim(),
    proxyDNS: document.getElementById('proxyDNS').checked
  };
  
  const result = await browser.storage.local.get('profiles');
  let profiles = result.profiles || [];
  
  if (editingProfileId) {
    // Update existing profile
    profiles = profiles.map(p => p.id === editingProfileId ? profile : p);
  } else {
    // Add new profile
    profiles.push(profile);
  }
  
  await browser.storage.local.set({ profiles });
  
  // Reset form
  resetForm();
  loadProfiles();
  
  // Show success message
  showMessage(editingProfileId ? 'Profile updated!' : 'Profile added!');
});

// Edit a profile
function editProfile(profile) {
  editingProfileId = profile.id;
  
  document.getElementById('profileName').value = profile.name;
  document.getElementById('proxyType').value = profile.type;
  document.getElementById('proxyHost').value = profile.host;
  document.getElementById('proxyPort').value = profile.port;
  document.getElementById('proxyUsername').value = profile.username || '';
  document.getElementById('proxyPassword').value = profile.password || '';
  document.getElementById('proxyBypass').value = profile.bypass || '';
  document.getElementById('proxyDNS').checked = profile.proxyDNS || false;
  
  document.getElementById('submitBtn').textContent = 'Update Profile';
  document.getElementById('cancelBtn').style.display = 'inline-block';
  
  // Scroll to form
  document.querySelector('.add-profile').scrollIntoView({ behavior: 'smooth' });
}

// Delete a profile
async function deleteProfile(profileId) {
  if (!confirm('Are you sure you want to delete this profile?')) {
    return;
  }
  
  const result = await browser.storage.local.get(['profiles', 'activeProfile']);
  let profiles = result.profiles || [];
  
  profiles = profiles.filter(p => p.id !== profileId);
  
  await browser.storage.local.set({ profiles });
  
  // If deleted profile was active, clear it
  if (result.activeProfile === profileId) {
    await browser.storage.local.set({ activeProfile: null });
    await browser.runtime.sendMessage({ action: 'clearProxy' });
  }
  
  loadProfiles();
  showMessage('Profile deleted!');
}

// Reset form
function resetForm() {
  editingProfileId = null;
  document.getElementById('profileForm').reset();
  document.getElementById('submitBtn').textContent = 'Add Profile';
  document.getElementById('cancelBtn').style.display = 'none';
}

// Cancel edit
document.getElementById('cancelBtn').addEventListener('click', resetForm);

// Show temporary message
function showMessage(text) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.textContent = text;
  document.body.appendChild(messageEl);
  
  setTimeout(() => {
    messageEl.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    messageEl.classList.remove('show');
    setTimeout(() => messageEl.remove(), 300);
  }, 2000);
}

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show/hide DNS proxy option based on proxy type
document.getElementById('proxyType').addEventListener('change', (e) => {
  const dnsGroup = document.getElementById('dnsProxyGroup');
  if (e.target.value === 'socks5') {
    dnsGroup.style.display = 'block';
  } else {
    dnsGroup.style.display = 'none';
    document.getElementById('proxyDNS').checked = false;
  }
});

// Load profiles on page load
loadProfiles();
