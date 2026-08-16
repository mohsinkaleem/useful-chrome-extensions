/* ===========================================================================
 * TubeFilter — popup script
 *
 * Reads/writes the filter UI, communicates with the active tab's content
 * script, and provides quick-presets and per-page state.
 * ========================================================================= */

/** Set once we know whether the active tab can actually be filtered. */
let tabIsFilterable = false;

/** localStorage keys — popup-local UI preferences, no `storage` permission. */
const LS_SECTIONS = 'tubefilter.collapsedSections';
const LS_BANNER = 'tubefilter.showBanner';

document.addEventListener('DOMContentLoaded', () => {
  setupCollapsibleSections();
  setupRadioButtonListeners();
  setupRegexGuide();
  setupKeywordListeners();
  setupQuickToggles();
  setupPresets();
  setupBannerPreference();

  document.getElementById('applyFilters').addEventListener('click', () => applyFilters());
  document.getElementById('clearFilters').addEventListener('click', clearFilters);

  // Assume the tab isn't filterable until checkUrlAndLoadFilters says so.
  setActionsEnabled(false);
  checkUrlAndLoadFilters();

  // Live stats updates from the content script
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === 'statsUpdate') {
        const n = Number(msg.hiddenCount) || 0;
        renderStats({ active: n > 0 || tabIsFilterable, hiddenCount: n });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// UI setup
// ---------------------------------------------------------------------------
function setupCollapsibleSections() {
  const stored = readCollapsedState();

  document.querySelectorAll('.section').forEach((section) => {
    const name = section.dataset.section;
    const header = section.querySelector('.section-header');
    if (!header) return;

    if (name && Object.prototype.hasOwnProperty.call(stored, name)) {
      section.classList.toggle('collapsed', !!stored[name]);
    }
    syncSectionAria(section);

    header.addEventListener('click', () => toggleSection(section));
    // The header is a div with role="button"; it has to handle the keys a
    // real button would.
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        toggleSection(section);
      }
    });
  });
}

function toggleSection(section) {
  section.classList.toggle('collapsed');
  syncSectionAria(section);
  writeCollapsedState();
}

function syncSectionAria(section) {
  const header = section.querySelector('.section-header');
  if (header) {
    header.setAttribute('aria-expanded', String(!section.classList.contains('collapsed')));
  }
}

function readCollapsedState() {
  try {
    return JSON.parse(localStorage.getItem(LS_SECTIONS) || '{}') || {};
  } catch {
    return {};
  }
}

function writeCollapsedState() {
  const state = {};
  document.querySelectorAll('.section').forEach((section) => {
    if (section.dataset.section) {
      state[section.dataset.section] = section.classList.contains('collapsed');
    }
  });
  try {
    localStorage.setItem(LS_SECTIONS, JSON.stringify(state));
  } catch {}
}

function setupRegexGuide() {
  const btn = document.getElementById('regexHelpBtn');
  if (!btn) return;
  // The guide lives on the options page now — it was a big contributor to
  // the popup overflowing Chrome's ~600px cap.
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (chrome?.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
  });
}

function setupBannerPreference() {
  const cb = document.getElementById('showBanner');
  if (!cb) return;
  cb.checked = localStorage.getItem(LS_BANNER) !== 'false';
  cb.addEventListener('change', () => {
    try {
      localStorage.setItem(LS_BANNER, String(cb.checked));
    } catch {}
    // Push the change straight through so the banner appears/disappears
    // without the user having to hit Apply.
    if (tabIsFilterable) applyFilters({ silent: true });
  });
}

function setupKeywordListeners() {
  const ta = document.getElementById('titleKeywords');
  const useRegex = document.getElementById('useRegex');
  const logicGroup = document.getElementById('keywordLogicGroup');

  ta.addEventListener('input', () => {
    if (!useRegex.checked) {
      const kws = parseKeywords(ta.value);
      kws.length > 1 ? showKeywordPreview(kws) : hideKeywordPreview();
    }
    updateSectionIndicators();
  });

  document
    .querySelectorAll('input[name="keywordLogic"], input[name="keywordMode"]')
    .forEach((r) =>
      r.addEventListener('change', () => {
        const kws = parseKeywords(ta.value);
        if (kws.length > 1 && !useRegex.checked) showKeywordPreview(kws);
        updateSectionIndicators();
      })
    );

  useRegex.addEventListener('change', () => {
    if (useRegex.checked) {
      logicGroup.style.display = 'none';
      ta.placeholder = 'Regex pattern (e.g., ^How|tutorial)';
      hideKeywordPreview();
    } else {
      logicGroup.style.display = 'flex';
      ta.placeholder =
        'music, +tutorial, -shorts  (use + to include, - to exclude)';
      ta.dispatchEvent(new Event('input'));
    }
  });
}

function setupQuickToggles() {
  document.querySelectorAll('.quick-toggles input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      updateSectionIndicators();
      // Auto-apply on quick toggle for instant feedback.
      applyFilters({ silent: true });
    });
  });
}

function setupPresets() {
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      togglePreset(btn.dataset.preset);
    });
  });
}

// ---------------------------------------------------------------------------
// Presets
//
// Presets are toggles that stack: each one owns a distinct slice of the form
// and reports whether that slice currently matches, so the active state is
// always derived from the real form values rather than from click history.
// ---------------------------------------------------------------------------
const PRESETS = {
  focus: {
    keywords: ['-clickbait', '-reaction'],
    isActive() {
      return (
        document.getElementById('hideShorts').checked &&
        document.getElementById('hideWatched').checked &&
        keywordsPresent(this.keywords)
      );
    },
    enable() {
      document.getElementById('hideShorts').checked = true;
      document.getElementById('hideWatched').checked = true;
      document.querySelector('input[name="keywordMode"][value="include"]').checked = true;
      setKeywordValue(addKeywords(getKeywordValue(), this.keywords));
    },
    disable() {
      document.getElementById('hideShorts').checked = false;
      document.getElementById('hideWatched').checked = false;
      setKeywordValue(removeKeywords(getKeywordValue(), this.keywords));
    },
  },
  fresh: {
    isActive: () =>
      selectedValue('timeFilter') === 'less' &&
      document.getElementById('timeLess').value === '7' &&
      document.getElementById('timeLessUnit').value === 'days',
    enable() {
      document.querySelector('input[name="timeFilter"][value="less"]').checked = true;
      document.getElementById('timeLess').value = '7';
      document.getElementById('timeLessUnit').value = 'days';
      updateInputs('timeFilter', 'less');
    },
    disable: () => selectFilterType('timeFilter', 'none'),
  },
  long: {
    isActive: () =>
      selectedValue('durationFilter') === 'greater' &&
      parseTimeToSeconds(
        parseDurationInput(document.getElementById('durationGreater').value)
      ) === 600,
    enable() {
      document.querySelector('input[name="durationFilter"][value="greater"]').checked = true;
      document.getElementById('durationGreater').value = '10:00';
      updateInputs('durationFilter', 'greater');
    },
    disable: () => selectFilterType('durationFilter', 'none'),
  },
  popular: {
    isActive: () =>
      selectedValue('viewFilter') === 'greater' &&
      parseViewInput(document.getElementById('viewMin').value) === 100000,
    enable() {
      document.querySelector('input[name="viewFilter"][value="greater"]').checked = true;
      document.getElementById('viewMin').value = '100k';
      updateInputs('viewFilter', 'greater');
    },
    disable: () => selectFilterType('viewFilter', 'none'),
  },
};

function togglePreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;

  if (preset.isActive()) preset.disable();
  else preset.enable();

  // applyPreset used to assign .value directly, which never fires the input
  // listener — so the keyword preview stayed hidden.
  document.getElementById('titleKeywords').dispatchEvent(new Event('input'));
  updateSectionIndicators();
  applyFilters();
}

function selectedValue(groupName) {
  const checked = document.querySelector(`input[name="${groupName}"]:checked`);
  return checked ? checked.value : 'none';
}

function selectFilterType(groupName, value) {
  document.querySelector(`input[name="${groupName}"][value="${value}"]`).checked = true;
  updateInputs(groupName, value);
}

function getKeywordValue() {
  return document.getElementById('titleKeywords').value;
}

function setKeywordValue(v) {
  document.getElementById('titleKeywords').value = v;
}

function keywordTokens(value) {
  return String(value)
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

function keywordsPresent(keywords) {
  const have = keywordTokens(getKeywordValue()).map((k) => k.toLowerCase());
  return keywords.every((k) => have.includes(k.toLowerCase()));
}

function addKeywords(value, keywords) {
  const tokens = keywordTokens(value);
  const lower = tokens.map((k) => k.toLowerCase());
  keywords.forEach((k) => {
    if (!lower.includes(k.toLowerCase())) tokens.push(k);
  });
  return tokens.join(', ');
}

function removeKeywords(value, keywords) {
  const drop = keywords.map((k) => k.toLowerCase());
  return keywordTokens(value)
    .filter((k) => !drop.includes(k.toLowerCase()))
    .join(', ');
}

function updatePresetStates() {
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    const preset = PRESETS[btn.dataset.preset];
    const active = !!preset && preset.isActive();
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function setupRadioButtonListeners() {
  ['viewFilter', 'durationFilter', 'timeFilter'].forEach((groupName) => {
    document.querySelectorAll(`input[name="${groupName}"]`).forEach((radio) => {
      radio.addEventListener('change', () => {
        updateInputs(groupName, radio.value);
        updateSectionIndicators();
      });
    });
  });

  document
    .querySelectorAll('input[type="number"], input[type="text"], select')
    .forEach((input) => {
      input.addEventListener('input', updateSectionIndicators);
      input.addEventListener('change', updateSectionIndicators);
    });
}

function updateSectionIndicators() {
  document.querySelector('[data-section="views"]').classList.toggle(
    'has-filter',
    selectedValue('viewFilter') !== 'none'
  );
  document.querySelector('[data-section="duration"]').classList.toggle(
    'has-filter',
    selectedValue('durationFilter') !== 'none'
  );
  document.querySelector('[data-section="time"]').classList.toggle(
    'has-filter',
    selectedValue('timeFilter') !== 'none'
  );
  document.querySelector('[data-section="keywords"]').classList.toggle(
    'has-filter',
    document.getElementById('titleKeywords').value.trim().length > 0
  );

  // quick-toggle visual state
  document.querySelectorAll('.toggle-card').forEach((card) => {
    const input = card.querySelector('input');
    card.classList.toggle('active', input.checked);
  });

  updatePresetStates();
}

function updateInputs(groupName, selectedValue) {
  const config = {
    viewFilter: {
      all: ['viewMin', 'viewMax', 'viewBetweenMin', 'viewBetweenMax'],
      greater: ['viewMin'],
      less: ['viewMax'],
      between: ['viewBetweenMin', 'viewBetweenMax'],
    },
    durationFilter: {
      all: ['durationLess', 'durationGreater', 'durationMin', 'durationMax'],
      less: ['durationLess'],
      greater: ['durationGreater'],
      custom: ['durationMin', 'durationMax'],
    },
    timeFilter: {
      all: [
        'timeLess', 'timeLessUnit',
        'timeGreater', 'timeGreaterUnit',
        'timeBetweenMin', 'timeBetweenMinUnit',
        'timeBetweenMax', 'timeBetweenMaxUnit',
      ],
      less: ['timeLess', 'timeLessUnit'],
      greater: ['timeGreater', 'timeGreaterUnit'],
      between: [
        'timeBetweenMin', 'timeBetweenMinUnit',
        'timeBetweenMax', 'timeBetweenMaxUnit',
      ],
    },
  };

  const g = config[groupName];
  if (!g) return;
  g.all.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
  (g[selectedValue] || []).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

// ---------------------------------------------------------------------------
// Tab interaction
// ---------------------------------------------------------------------------
function setActionsEnabled(enabled) {
  tabIsFilterable = enabled;
  const apply = document.getElementById('applyFilters');
  const clear = document.getElementById('clearFilters');
  [apply, clear].forEach((btn) => {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.title = enabled ? '' : 'Open a YouTube tab to use TubeFilter';
  });
}

function checkUrlAndLoadFilters() {
  if (!chrome?.tabs?.query) {
    // Running in the test harness — nothing to talk to, but keep the UI live.
    setActionsEnabled(true);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const url = tabs[0].url || '';
    document.getElementById('urlIndicator').textContent = labelForUrl(url);

    if (!/youtube\.com/.test(url)) {
      setActionsEnabled(false);
      renderStats({ active: false, hiddenCount: 0, notYouTube: true });
      return;
    }

    setActionsEnabled(true);

    sendToContentScript({ action: 'getFilters' })
      .then((response) => {
        if (response && response.filters) {
          loadFiltersFromData(response.filters);
        }
        return sendToContentScript({ action: 'getStatus' });
      })
      .then((s) => renderStats(s || { active: false, hiddenCount: 0 }))
      .catch(() => renderStats({ active: false, hiddenCount: 0 }));
  });
}

function labelForUrl(url) {
  if (url.includes('youtube.com/watch')) {
    const m = url.match(/[?&]v=([^&]+)/);
    return m ? `Video: ${m[1].slice(0, 8)}…` : 'Video';
  }
  if (url.includes('youtube.com/results')) return 'Search';
  if (url.includes('youtube.com/@')) return 'Channel';
  if (url.includes('youtube.com/feed/subscriptions')) return 'Subscriptions';
  if (url.includes('youtube.com')) return 'YouTube';
  return 'Not YouTube';
}

/**
 * Wrapper around chrome.tabs.sendMessage that:
 *   • returns a Promise
 *   • injects the content script on demand if it isn't loaded yet
 *     (covers the common "extension was just installed, tab not reloaded" case)
 *
 * content.js guards itself against running twice, so the injection below is
 * a no-op when the manifest-registered copy is already live.
 */
function sendToContentScript(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return reject(new Error('No active tab'));
      const tabId = tabs[0].id;
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          // Try to inject the content script and retry once.
          if (!chrome.scripting?.executeScript) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          chrome.scripting.executeScript(
            { target: { tabId }, files: ['content.js'] },
            () => {
              if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              chrome.tabs.sendMessage(tabId, message, (r2) => {
                if (chrome.runtime.lastError) {
                  return reject(new Error(chrome.runtime.lastError.message));
                }
                resolve(r2);
              });
            }
          );
        } else {
          resolve(response);
        }
      });
    });
  });
}

function renderStats(status) {
  const dot = document.getElementById('statsDot');
  const text = document.getElementById('statsText');
  if (!dot || !text) return;

  if (status.notYouTube) {
    dot.className = 'stats-dot idle';
    text.textContent = 'Open YouTube to filter';
    return;
  }
  if (!status.active) {
    dot.className = 'stats-dot idle';
    text.textContent = 'Filters off';
    return;
  }
  dot.className = 'stats-dot active';
  const n = status.hiddenCount || 0;
  text.textContent = n === 0 ? 'Filters active' : `Hiding ${n} video${n === 1 ? '' : 's'}`;
}

function applyFilters(opts) {
  const opts_ = opts || {};
  const filters = collectFilters();

  if (!validateFilters(filters)) return;

  if (!tabIsFilterable) {
    if (!opts_.silent) showStatus('Open a YouTube tab first', 'error');
    return;
  }

  sendToContentScript({ action: 'applyFilters', filters: sanitizeFilters(filters) })
    .then((res) => {
      updateSectionIndicators();
      if (!opts_.silent) showStatus('Filters applied!', 'success');
      if (res && typeof res.hiddenCount === 'number') {
        renderStats({ active: true, hiddenCount: res.hiddenCount });
      } else {
        renderStats({ active: true, hiddenCount: 0 });
      }
    })
    .catch((err) => {
      showStatus(
        /no active tab/i.test(err.message)
          ? 'Open a YouTube tab first'
          : 'Could not reach YouTube tab — try refreshing it',
        'error'
      );
    });
}

function clearFilters() {
  // Reset all form elements
  selectFilterType('viewFilter', 'none');
  selectFilterType('durationFilter', 'none');
  selectFilterType('timeFilter', 'none');

  // The value inputs are disabled, not empty — leaving them populated means
  // re-selecting a filter type silently resurrects the old numbers.
  [
    'viewMin', 'viewMax', 'viewBetweenMin', 'viewBetweenMax',
    'durationLess', 'durationGreater', 'durationMin', 'durationMax',
    'timeLess', 'timeGreater', 'timeBetweenMin', 'timeBetweenMax',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  [
    'timeLessUnit', 'timeGreaterUnit', 'timeBetweenMinUnit', 'timeBetweenMaxUnit',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = 'days';
  });

  document.getElementById('titleKeywords').value = '';
  document.querySelector('input[name="keywordLogic"][value="AND"]').checked = true;
  document.querySelector('input[name="keywordMode"][value="include"]').checked = true;
  document.getElementById('hideShorts').checked = false;
  document.getElementById('hideLive').checked = false;
  document.getElementById('hideWatched').checked = false;

  const useRegex = document.getElementById('useRegex');
  useRegex.checked = false;
  useRegex.dispatchEvent(new Event('change'));

  hideKeywordPreview();
  updateSectionIndicators();

  sendToContentScript({ action: 'clearFilters' })
    .then(() => {
      renderStats({ active: false, hiddenCount: 0 });
      showStatus('Filters cleared', 'success');
    })
    .catch(() => showStatus('Filters cleared (local only)', 'success'));
}

// ---------------------------------------------------------------------------
// Parsing helpers (input → filter struct)
// ---------------------------------------------------------------------------
/**
 * Returns the numeric view threshold, or NaN when the text isn't a view
 * count we understand. Coercing junk to a number silently (parseInt('1e6')
 * → 1) hands the user a threshold they never asked for.
 */
function parseViewInput(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const s = String(value).toLowerCase().replace(/,/g, '').trim();
  const m = s.match(/^([\d.]+)\s*([kmb])?$/);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return NaN;
  switch (m[2]) {
    case 'k': return Math.floor(n * 1e3);
    case 'm': return Math.floor(n * 1e6);
    case 'b': return Math.floor(n * 1e9);
    default: return Math.floor(n);
  }
}

function parseDurationInput(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d+:\d+(:\d+)?$/.test(s)) return s;

  const m = s.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/i);
  if (!m || (!m[1] && !m[2] && !m[3])) {
    const n = parseInt(s, 10);
    if (!Number.isNaN(n)) return `${n}:00`;
    return s;
  }
  const h = parseInt(m[1], 10) || 0;
  const mm = parseInt(m[2], 10) || 0;
  const ss = parseInt(m[3], 10) || 0;
  if (h > 0) {
    return `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function parseKeywordsWithPrefixes(input) {
  if (!input || !input.trim()) return { include: [], exclude: [] };
  const include = [];
  const exclude = [];
  input.split(',').forEach((kw) => {
    let k = kw.trim();
    if (!k) return;
    if (k.startsWith('-')) {
      const t = k.slice(1).trim().toLowerCase();
      if (t) exclude.push(t);
    } else if (k.startsWith('+')) {
      const t = k.slice(1).trim().toLowerCase();
      if (t) include.push(t);
    } else {
      include.push(k.toLowerCase());
    }
  });
  return { include, exclude };
}

function collectFilters() {
  const raw = document.getElementById('titleKeywords').value;
  const useRegex = document.getElementById('useRegex').checked;
  const parsed = useRegex
    ? { include: raw.trim() ? [raw] : [], exclude: [] }
    : parseKeywordsWithPrefixes(raw);
  const bannerCb = document.getElementById('showBanner');

  return {
    viewFilter: {
      type: selectedValue('viewFilter'),
      min: parseViewInput(document.getElementById('viewMin').value),
      max: parseViewInput(document.getElementById('viewMax').value),
      betweenMin: parseViewInput(document.getElementById('viewBetweenMin').value),
      betweenMax: parseViewInput(document.getElementById('viewBetweenMax').value),
    },
    durationFilter: {
      type: selectedValue('durationFilter'),
      lessValue: parseDurationInput(document.getElementById('durationLess').value || ''),
      greaterValue: parseDurationInput(document.getElementById('durationGreater').value || ''),
      customMin: parseDurationInput(document.getElementById('durationMin').value || ''),
      customMax: parseDurationInput(document.getElementById('durationMax').value || ''),
    },
    timeFilter: {
      type: selectedValue('timeFilter'),
      lessValue: parseInt(document.getElementById('timeLess').value, 10) || 0,
      lessUnit: document.getElementById('timeLessUnit').value || 'days',
      greaterValue: parseInt(document.getElementById('timeGreater').value, 10) || 0,
      greaterUnit: document.getElementById('timeGreaterUnit').value || 'days',
      betweenMin: parseInt(document.getElementById('timeBetweenMin').value, 10) || 0,
      betweenMinUnit: document.getElementById('timeBetweenMinUnit').value || 'days',
      betweenMax: parseInt(document.getElementById('timeBetweenMax').value, 10) || 0,
      betweenMaxUnit: document.getElementById('timeBetweenMaxUnit').value || 'days',
    },
    titleKeywords: parsed.include,
    excludeKeywords: parsed.exclude,
    useRegex,
    keywordLogic: document.querySelector('input[name="keywordLogic"]:checked').value,
    keywordMode: document.querySelector('input[name="keywordMode"]:checked').value,
    hideShorts: document.getElementById('hideShorts').checked,
    hideLive: document.getElementById('hideLive').checked,
    hideWatched: document.getElementById('hideWatched').checked,
    showBanner: bannerCb ? bannerCb.checked : true,
    // legacy single-keyword for backward compatibility
    titleKeyword: parsed.include.join(', '),
  };
}

/**
 * NaN survives validation only for filter types that aren't selected (the
 * inputs are still read). JSON.stringify would turn those into null, so
 * flatten them to 0 before they cross into the content script.
 */
function sanitizeFilters(filters) {
  const vf = filters.viewFilter;
  ['min', 'max', 'betweenMin', 'betweenMax'].forEach((k) => {
    if (!Number.isFinite(vf[k])) vf[k] = 0;
  });
  return filters;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateFilters(filters) {
  const vf = filters.viewFilter;
  const badViews = 'Use a number like 1500, 10k, 1.2m';
  if (vf.type === 'greater') {
    if (Number.isNaN(vf.min)) return fail(badViews);
    if (vf.min <= 0) return fail('Please enter a valid minimum view count');
  }
  if (vf.type === 'less') {
    if (Number.isNaN(vf.max)) return fail(badViews);
    if (vf.max <= 0) return fail('Please enter a valid maximum view count');
  }
  if (vf.type === 'between') {
    if (Number.isNaN(vf.betweenMin) || Number.isNaN(vf.betweenMax))
      return fail(badViews);
    if (vf.betweenMin <= 0 || vf.betweenMax <= 0)
      return fail('Please enter valid view count range');
    if (vf.betweenMin >= vf.betweenMax)
      return fail('Minimum view count must be less than maximum');
  }

  const df = filters.durationFilter;
  const badDuration = 'Use format mm:ss or 5m / 1h30m';
  if (df.type === 'less') {
    if (!df.lessValue) return fail('Please enter a maximum duration');
    const secs = parseTimeToSeconds(df.lessValue);
    if (secs === -1) return fail(badDuration);
    // "< 0:00" parses fine and then hides every video with a duration.
    if (secs === 0) return fail('Maximum duration must be greater than 0');
  }
  if (df.type === 'greater') {
    if (!df.greaterValue) return fail('Please enter a minimum duration');
    const secs = parseTimeToSeconds(df.greaterValue);
    if (secs === -1) return fail(badDuration);
    if (secs === 0) return fail('Minimum duration must be greater than 0');
  }
  if (df.type === 'custom') {
    if (!df.customMin || !df.customMax)
      return fail('Please enter both minimum and maximum duration');
    const min = parseTimeToSeconds(df.customMin);
    const max = parseTimeToSeconds(df.customMax);
    if (min === -1 || max === -1) return fail(badDuration);
    if (max === 0) return fail('Maximum duration must be greater than 0');
    if (min >= max) return fail('Minimum duration must be less than maximum');
  }

  const tf = filters.timeFilter;
  if (tf.type === 'less' && tf.lessValue <= 0)
    return fail('Please enter a valid time value');
  if (tf.type === 'greater' && tf.greaterValue <= 0)
    return fail('Please enter a valid time value');
  if (tf.type === 'between') {
    if (tf.betweenMin <= 0 || tf.betweenMax <= 0)
      return fail('Please enter valid time values');
    if (convertToHours(tf.betweenMin, tf.betweenMinUnit) >=
        convertToHours(tf.betweenMax, tf.betweenMaxUnit))
      return fail('Minimum time must be less than maximum time');
  }

  // A pattern that doesn't compile means "matches nothing" to a naive
  // implementation, which blanks the whole page in include mode. Catch it
  // here, where we can actually tell the user what's wrong.
  if (filters.useRegex) {
    const pattern = (filters.titleKeywords && filters.titleKeywords[0]) || '';
    if (pattern.trim()) {
      try {
        compileRegexPattern(pattern);
      } catch (e) {
        return fail(`Invalid regex: ${e.message}`);
      }
    }
  }

  return true;
}

/** Mirrors compileRegex() in content.js. Throws on a malformed pattern. */
function compileRegexPattern(source) {
  const m = String(source).match(/^\/(.+)\/([gimsuy]*)$/);
  return m ? new RegExp(m[1], m[2]) : new RegExp(String(source), 'i');
}

function fail(message) {
  showStatus(message, 'error');
  return false;
}

function convertToHours(value, unit) {
  switch (unit) {
    case 'hours':  return value;
    case 'days':   return value * 24;
    case 'weeks':  return value * 24 * 7;
    case 'months': return value * 24 * 30;
    case 'years':  return value * 24 * 365;
    default:       return value;
  }
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return -1;
  const parts = String(timeStr).split(':');
  let s = 0;
  if (parts.length === 2) {
    s = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  } else if (parts.length === 3) {
    s =
      parseInt(parts[0], 10) * 3600 +
      parseInt(parts[1], 10) * 60 +
      parseInt(parts[2], 10);
  } else {
    return -1;
  }
  return Number.isNaN(s) || s < 0 ? -1 : s;
}

// ---------------------------------------------------------------------------
// Restoring saved state
// ---------------------------------------------------------------------------
function loadFiltersFromData(filters) {
  if (!filters) return;

  document.querySelector(`input[name="viewFilter"][value="${filters.viewFilter.type}"]`).checked = true;
  document.getElementById('viewMin').value = filters.viewFilter.min || '';
  document.getElementById('viewMax').value = filters.viewFilter.max || '';
  document.getElementById('viewBetweenMin').value = filters.viewFilter.betweenMin || '';
  document.getElementById('viewBetweenMax').value = filters.viewFilter.betweenMax || '';

  document.querySelector(`input[name="durationFilter"][value="${filters.durationFilter.type}"]`).checked = true;
  document.getElementById('durationLess').value = filters.durationFilter.lessValue || '';
  document.getElementById('durationGreater').value = filters.durationFilter.greaterValue || '';
  document.getElementById('durationMin').value = filters.durationFilter.customMin || '';
  document.getElementById('durationMax').value = filters.durationFilter.customMax || '';

  if (filters.timeFilter) {
    document.querySelector(`input[name="timeFilter"][value="${filters.timeFilter.type}"]`).checked = true;
    document.getElementById('timeLess').value = filters.timeFilter.lessValue || '';
    document.getElementById('timeLessUnit').value = filters.timeFilter.lessUnit || 'days';
    document.getElementById('timeGreater').value = filters.timeFilter.greaterValue || '';
    document.getElementById('timeGreaterUnit').value = filters.timeFilter.greaterUnit || 'days';
    document.getElementById('timeBetweenMin').value = filters.timeFilter.betweenMin || '';
    document.getElementById('timeBetweenMinUnit').value = filters.timeFilter.betweenMinUnit || 'days';
    document.getElementById('timeBetweenMax').value = filters.timeFilter.betweenMax || '';
    document.getElementById('timeBetweenMaxUnit').value = filters.timeFilter.betweenMaxUnit || 'days';
  }

  // Keywords
  if (filters.titleKeywords && Array.isArray(filters.titleKeywords)) {
    if (filters.useRegex) {
      document.getElementById('titleKeywords').value = filters.titleKeywords[0] || '';
    } else {
      const parts = [];
      filters.titleKeywords.forEach((k) => parts.push(k));
      if (Array.isArray(filters.excludeKeywords)) {
        filters.excludeKeywords.forEach((k) => parts.push('-' + k));
      }
      document.getElementById('titleKeywords').value = parts.join(', ');
    }
  } else if (filters.titleKeyword) {
    document.getElementById('titleKeywords').value = filters.titleKeyword;
  }

  if (filters.useRegex) {
    const cb = document.getElementById('useRegex');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
  }

  document.querySelector(`input[name="keywordLogic"][value="${filters.keywordLogic || 'AND'}"]`).checked = true;
  document.querySelector(`input[name="keywordMode"][value="${filters.keywordMode || 'include'}"]`).checked = true;

  document.getElementById('hideShorts').checked = !!filters.hideShorts;
  document.getElementById('hideLive').checked = !!filters.hideLive;
  document.getElementById('hideWatched').checked = !!filters.hideWatched;

  const bannerCb = document.getElementById('showBanner');
  if (bannerCb && typeof filters.showBanner === 'boolean') {
    bannerCb.checked = filters.showBanner;
  }

  updateInputs('viewFilter', filters.viewFilter.type);
  updateInputs('durationFilter', filters.durationFilter.type);
  if (filters.timeFilter) updateInputs('timeFilter', filters.timeFilter.type);

  if (!filters.useRegex) {
    const kws = parseKeywords(document.getElementById('titleKeywords').value);
    if (kws.length > 1) showKeywordPreview(kws);
  }
  updateSectionIndicators();
}

// ---------------------------------------------------------------------------
// Misc UI helpers
// ---------------------------------------------------------------------------
function showStatus(message, type) {
  const el = document.getElementById('status');
  el.textContent = message;
  el.className = `status ${type}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'status';
  }, 3000);
}

function parseKeywords(input) {
  if (!input || !input.trim()) return [];
  return input
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => k.toLowerCase());
}

function showKeywordPreview(keywords) {
  let el = document.getElementById('keyword-preview');
  if (!el) {
    el = document.createElement('div');
    el.id = 'keyword-preview';
    el.className = 'keyword-preview';
    document.querySelector('.keyword-input-wrapper').appendChild(el);
  }

  const logic = document.querySelector('input[name="keywordLogic"]:checked').value;
  const mode = document.querySelector('input[name="keywordMode"]:checked').value;
  const raw = document.getElementById('titleKeywords').value;
  const parsed = parseKeywordsWithPrefixes(raw);

  el.style.display = 'block';

  let html = '<small>';
  if (parsed.include.length > 0) {
    html += `<strong>✓</strong> Include (${logic}): `;
    html += parsed.include
      .slice(0, 3)
      .map((k) => `<span class="keyword-tag include-tag">+${k}</span>`)
      .join(' ');
    if (parsed.include.length > 3)
      html += ` <span class="keyword-tag">+${parsed.include.length - 3} more</span>`;
  }
  if (parsed.exclude.length > 0) {
    if (parsed.include.length > 0) html += ' ';
    html += '<strong>✕</strong> Exclude: ';
    html += parsed.exclude
      .slice(0, 3)
      .map((k) => `<span class="keyword-tag exclude-tag">-${k}</span>`)
      .join(' ');
    if (parsed.exclude.length > 3)
      html += ` <span class="keyword-tag">+${parsed.exclude.length - 3} more</span>`;
  }
  if (parsed.include.length === 0 && parsed.exclude.length === 0 && keywords.length > 0) {
    html += `<strong>${mode === 'include' ? '✓' : '✕'}</strong> ${mode === 'include' ? 'Show' : 'Hide'} videos with `;
    html += `<strong>${logic === 'AND' ? 'ALL' : 'ANY'}</strong> of: `;
    html += keywords
      .slice(0, 5)
      .map((k) => `<span class="keyword-tag">${k}</span>`)
      .join(logic === 'AND' ? ' + ' : ' | ');
    if (keywords.length > 5)
      html += ` <span class="keyword-tag">+${keywords.length - 5} more</span>`;
  }
  html += '</small>';
  el.innerHTML = html;
}

function hideKeywordPreview() {
  const el = document.getElementById('keyword-preview');
  if (el) el.style.display = 'none';
}

// Expose a few helpers for tests
if (typeof window !== 'undefined') {
  window.__tubefilterPopup = {
    parseViewInput,
    parseDurationInput,
    parseKeywordsWithPrefixes,
    parseTimeToSeconds,
    convertToHours,
    collectFilters,
    validateFilters,
    sanitizeFilters,
    compileRegexPattern,
    togglePreset,
    updatePresetStates,
    clearFilters,
    checkUrlAndLoadFilters,
    setActionsEnabled,
    addKeywords,
    removeKeywords,
    PRESETS,
  };
}
