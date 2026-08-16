/* ===========================================================================
 * TubeFilter — content script
 * Runs on every YouTube page and hides video cards that don't match the
 * user's filters.
 *
 * The script is resilient to YouTube's frequent DOM changes by using a
 * cascade of selectors and reading text via attributes whenever possible.
 * ========================================================================= */

(() => {
  'use strict';

  // The manifest registers this script at document_idle, and the popup also
  // injects it programmatically when a message can't be delivered. Both can
  // win that race on a slow page load, leaving two live copies that double
  // the observers, timers and session restores — and, because they keep
  // separate filterVersion counters while writing the same
  // data-tubefilter-v attribute, permanently invalidate each other's cache.
  if (window.__tubefilterLoaded) return;
  window.__tubefilterLoaded = true;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  /** @type {?Object} */
  let currentFilters = null;
  let isFilteringActive = false;
  /** @type {?MutationObserver} */
  let observer = null;
  let filterTimeout = 0;
  let lastUrl = location.href;
  let hiddenCount = 0;
  /**
   * Incremented every time filters change. Stored on each video element so
   * we can tell whether the element was already evaluated against the
   * *current* filter set (vs. an older one).
   */
  let filterVersion = 0;
  /** True while the user has clicked "show anyway" on the in-page banner. */
  let revealActive = false;

  /**
   * A card that is missing the fields the active filters need is left
   * unstamped so the next pass re-reads it. This caps how many times we do
   * that, so cards that will *never* carry the field (a live stream has no
   * upload date) stop being re-read on every mutation.
   */
  const MAX_PARTIAL_RETRIES = 4;

  // Inject CSS once for class-based hiding — robust against YouTube's
  // inline-style writebacks.
  const STYLE_ID = 'tubefilter-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .tubefilter-hidden:not(.tubefilter-revealed) { display: none !important; }
      .tubefilter-revealed {
        opacity: 0.45 !important;
        outline: 1px dashed rgba(255, 0, 0, 0.5) !important;
        outline-offset: -2px;
      }
      .tubefilter-banner {
        display: flex; align-items: center; gap: 10px;
        margin: 0 0 12px; padding: 8px 12px;
        border: 1px solid rgba(255, 0, 0, 0.25);
        border-radius: 8px;
        background: rgba(255, 0, 0, 0.06);
        color: inherit;
        font-family: "Roboto", "Arial", sans-serif;
        font-size: 13px;
        line-height: 1.4;
      }
      .tubefilter-banner[data-floating="true"] {
        position: fixed; z-index: 2147483000;
        right: 16px; bottom: 16px; margin: 0;
        background: #ffffff;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
      }
      @media (prefers-color-scheme: dark) {
        .tubefilter-banner[data-floating="true"] { background: #212121; }
      }
      .tubefilter-banner-text { flex: 1 1 auto; }
      .tubefilter-banner-btn {
        flex: 0 0 auto; cursor: pointer;
        padding: 4px 10px; border-radius: 14px;
        border: 1px solid currentColor;
        background: transparent; color: inherit;
        font: inherit; font-weight: 500;
      }
      .tubefilter-banner-btn:hover { background: rgba(255, 0, 0, 0.12); }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------
  init();

  function init() {
    chrome.runtime.onMessage.addListener(handleMessage);
    setupUrlChangeDetection();
    restoreSession();
    console.log('[TubeFilter] content script ready');
  }

  function restoreSession() {
    try {
      const saved = sessionStorage.getItem('tubeFilterSettings');
      if (saved) {
        currentFilters = JSON.parse(saved);
        isFilteringActive = true;
        filterVersion++;
        setupMutationObserver();
        scheduleFilter(0);
        console.log('[TubeFilter] restored filters from session');
      }
    } catch (e) {
      console.warn('[TubeFilter] could not restore session', e);
    }
  }

  // ---------------------------------------------------------------------------
  // URL change detection (YouTube is a SPA)
  // ---------------------------------------------------------------------------
  function setupUrlChangeDetection() {
    const wrap = (fn) =>
      function () {
        const ret = fn.apply(this, arguments);
        queueMicrotask(handleUrlChange);
        return ret;
      };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('yt-navigate-finish', handleUrlChange, true);

    // Backstop polling in case YouTube swaps the History API.
    setInterval(() => {
      if (location.href !== lastUrl) handleUrlChange();
    }, 1500);
  }

  function handleUrlChange() {
    if (location.href === lastUrl && !isFilteringActive) return;
    lastUrl = location.href;
    if (isFilteringActive && currentFilters) {
      filterVersion++; // re-evaluate all cards on the new page
      scheduleFilter(400);
    }
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------
  function handleMessage(request, _sender, sendResponse) {
    try {
      if (request.action === 'applyFilters') {
        currentFilters = request.filters;
        isFilteringActive = true;
        filterVersion++;
        try {
          sessionStorage.setItem(
            'tubeFilterSettings',
            JSON.stringify(currentFilters)
          );
        } catch {}
        setupMutationObserver();
        const count = applyFilters();
        sendResponse({ success: true, hiddenCount: count });
      } else if (request.action === 'clearFilters') {
        currentFilters = null;
        isFilteringActive = false;
        try {
          sessionStorage.removeItem('tubeFilterSettings');
        } catch {}
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        clearAll();
        // The badge is only repainted on statsUpdate, so without this the
        // toolbar keeps showing the last hidden count after a Clear.
        sendStats(0);
        sendResponse({ success: true });
      } else if (request.action === 'toggleFilters') {
        // Flips filtering on/off while *retaining* currentFilters, so the
        // keyboard shortcut doesn't destroy the user's settings the way
        // clearFilters does.
        if (!currentFilters) {
          sendResponse({ success: false, active: false, reason: 'no filters set' });
        } else if (isFilteringActive) {
          isFilteringActive = false;
          if (observer) {
            observer.disconnect();
            observer = null;
          }
          clearAll();
          sendStats(0);
          sendResponse({ success: true, active: false, hiddenCount: 0 });
        } else {
          isFilteringActive = true;
          filterVersion++;
          setupMutationObserver();
          const count = applyFilters();
          sendResponse({ success: true, active: true, hiddenCount: count });
        }
      } else if (request.action === 'getFilters') {
        sendResponse({ filters: currentFilters, hiddenCount });
      } else if (request.action === 'getStatus') {
        sendResponse({
          active: isFilteringActive,
          hiddenCount,
          url: location.href,
        });
      } else if (request.action === 'ping') {
        sendResponse({ ok: true });
      }
    } catch (e) {
      console.error('[TubeFilter] message handler error', e);
      sendResponse({ success: false, error: String(e) });
    }
    return true; // keep channel open for async response
  }

  // ---------------------------------------------------------------------------
  // Mutation observer
  // ---------------------------------------------------------------------------
  function setupMutationObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      if (!isFilteringActive || !currentFilters) return;
      for (const m of mutations) {
        if (m.addedNodes.length === 0) continue;
        // Our own banner lives inside the observed subtree, so its writes
        // have to be ignored — otherwise every pass would schedule the next.
        if (isOwnBannerMutation(m)) continue;
        scheduleFilter(250);
        return;
      }
    });
    // Attribute mutations are deliberately NOT observed: hideEl/showEl write
    // both a class and a data-tubefilter-hidden attribute on every pass, so
    // observing attributes would make the observer retrigger itself forever.
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function scheduleFilter(delay) {
    if (filterTimeout) clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      filterTimeout = 0;
      applyFilters();
    }, delay);
  }

  // ---------------------------------------------------------------------------
  // Core filtering
  // ---------------------------------------------------------------------------
  const VIDEO_SELECTORS = [
    // Home / subscriptions grid
    'ytd-rich-item-renderer',
    // Search results
    'ytd-video-renderer',
    // Watch page sidebar
    'ytd-compact-video-renderer',
    // Old channel/playlist grids
    'ytd-grid-video-renderer',
    // Playlist rows
    'ytd-playlist-video-renderer',
    // New lockup view model (rolled out 2024+)
    'yt-lockup-view-model',
    // Shorts shelf items
    'ytm-shorts-lockup-view-model',
    // Reel shelves
    'ytd-reel-item-renderer',
  ].join(',');

  function applyFilters() {
    if (!currentFilters || !isFilteringActive) return 0;

    const elements = document.querySelectorAll(VIDEO_SELECTORS);
    let visibleHidden = 0;
    let pendingCards = 0;
    const updates = [];

    elements.forEach((el) => {
      // Dedup: if this element is nested inside another matching card
      // (e.g. yt-lockup-view-model inside ytd-rich-item-renderer), skip it
      // and let the outer card be processed instead.
      if (el.parentElement && el.parentElement.closest(VIDEO_SELECTORS)) return;

      const cachedVersion = Number(el.dataset.tubefilterV || -1);
      if (cachedVersion === filterVersion) {
        if (el.classList.contains('tubefilter-hidden')) visibleHidden++;
        return;
      }

      const data = extractVideoData(el);
      // If extraction fails because the card hasn't loaded its content yet,
      // skip — the mutation observer will retry on the next batch.
      if (!data) return;

      const shouldHide = shouldHideVideo(data, currentFilters);
      updates.push({ el, shouldHide });
      if (shouldHide) visibleHidden++;

      // A lazily-rendering card often paints its duration badge before its
      // title, so extractVideoData succeeds with title: ''. Stamping the
      // filter version here would freeze that half-read verdict forever.
      // Leave such cards unstamped (up to a retry cap) so a later pass
      // re-reads them once the missing fields arrive.
      if (hasDataForFilters(data, currentFilters)) {
        el.dataset.tubefilterV = String(filterVersion);
        delete el.dataset.tubefilterRetry;
      } else if (bumpPartialRetry(el) >= MAX_PARTIAL_RETRIES) {
        el.dataset.tubefilterV = String(filterVersion);
        delete el.dataset.tubefilterRetry;
      } else {
        pendingCards++;
      }
    });

    if (updates.length > 0) {
      requestAnimationFrame(() => {
        for (const { el, shouldHide } of updates) {
          if (shouldHide) hideEl(el);
          else showEl(el);
        }
      });
    }

    hiddenCount = visibleHidden;
    sendStats(visibleHidden);
    renderBanner();

    // Cards whose fields hadn't rendered yet need another look. YouTube
    // often fills a title in via characterData rather than adding a node,
    // which the observer doesn't watch, so schedule the retry explicitly.
    if (pendingCards > 0) scheduleFilter(600);

    return visibleHidden;
  }

  /**
   * True when the card exposes every field the *active* filters actually
   * read. Used to decide whether a verdict is safe to cache.
   */
  function hasDataForFilters(data, filters) {
    const usesKeywords =
      (Array.isArray(filters.titleKeywords) && filters.titleKeywords.length > 0) ||
      (Array.isArray(filters.excludeKeywords) && filters.excludeKeywords.length > 0) ||
      (typeof filters.titleKeyword === 'string' && filters.titleKeyword !== '');
    if (usesKeywords && !data.title) return false;

    const vf = filters.viewFilter;
    if (vf && vf.type !== 'none' && !data.isShort && !data.isLive && !data.viewCount)
      return false;

    const df = filters.durationFilter;
    if (df && df.type !== 'none' && !data.isLive && !data.duration) return false;

    const tf = filters.timeFilter;
    if (tf && tf.type !== 'none' && !data.isShort && !data.isLive && !data.uploadTime)
      return false;

    return true;
  }

  /** Retry counter, scoped to the current filter version. */
  function bumpPartialRetry(el) {
    const [version, count] = String(el.dataset.tubefilterRetry || '').split(':');
    const tries = (Number(version) === filterVersion ? Number(count) || 0 : 0) + 1;
    el.dataset.tubefilterRetry = `${filterVersion}:${tries}`;
    return tries;
  }

  /** Best-effort stats push; the popup and the badge both listen for it. */
  function sendStats(count) {
    try {
      chrome.runtime
        .sendMessage({ action: 'statsUpdate', hiddenCount: count })
        .catch?.(() => {});
    } catch {}
  }

  function clearAll() {
    document.querySelectorAll('.tubefilter-hidden').forEach((el) => {
      el.classList.remove('tubefilter-hidden', 'tubefilter-revealed');
      el.removeAttribute('data-tubefilter-hidden');
    });
    document.querySelectorAll('[data-tubefilter-v]').forEach((el) => {
      delete el.dataset.tubefilterV;
      delete el.dataset.tubefilterRetry;
    });
    hiddenCount = 0;
    revealActive = false;
    removeBanner();
  }

  function hideEl(el) {
    el.classList.add('tubefilter-hidden');
    el.setAttribute('data-tubefilter-hidden', 'true');
    // Keep newly hidden cards visible while the user is peeking.
    el.classList.toggle('tubefilter-revealed', revealActive);
  }

  function showEl(el) {
    el.classList.remove('tubefilter-hidden', 'tubefilter-revealed');
    el.removeAttribute('data-tubefilter-hidden');
  }

  // ---------------------------------------------------------------------------
  // In-page "N videos hidden" banner
  //
  // Hidden cards are display:none, so without this the only feedback that a
  // feed has been trimmed lives in the popup and the toolbar badge. Opt-out
  // via the popup for users who want the filtering to stay invisible.
  // ---------------------------------------------------------------------------
  const BANNER_ID = 'tubefilter-banner';

  const RESULTS_CONTAINERS = [
    'ytd-rich-grid-renderer #contents',
    'ytd-section-list-renderer #contents',
    'ytd-item-section-renderer #contents',
    'ytd-watch-next-secondary-results-renderer #items',
    'ytd-browse #contents',
  ];

  function bannerEnabled() {
    return !!currentFilters && currentFilters.showBanner !== false;
  }

  function renderBanner() {
    if (!bannerEnabled() || !isFilteringActive || hiddenCount === 0) {
      removeBanner();
      return;
    }

    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = buildBanner();
      if (!banner) return;
    }

    const n = hiddenCount;
    // Only write when the text actually changes: assigning textContent
    // replaces the child text node, which is a childList mutation.
    setText(
      banner.querySelector('.tubefilter-banner-text'),
      `TubeFilter is hiding ${n} video${n === 1 ? '' : 's'}`
    );
    setText(
      banner.querySelector('.tubefilter-banner-btn'),
      revealActive ? 'Hide again' : 'Show anyway'
    );
  }

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  /** True when a mutation is the banner being added, or written to. */
  function isOwnBannerMutation(m) {
    const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
    if (target && target.closest && target.closest(`#${BANNER_ID}`)) return true;
    return Array.prototype.every.call(m.addedNodes, (n) => n.id === BANNER_ID);
  }

  function buildBanner() {
    if (!document.body) return null;

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'tubefilter-banner';
    banner.setAttribute('role', 'status');

    const text = document.createElement('span');
    text.className = 'tubefilter-banner-text';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tubefilter-banner-btn';
    btn.addEventListener('click', toggleReveal);

    banner.append(text, btn);

    // Prefer the top of the results list; fall back to a floating pill when
    // YouTube's container markup doesn't match (it changes often).
    const host = RESULTS_CONTAINERS.reduce(
      (found, sel) => found || document.querySelector(sel),
      null
    );
    if (host) {
      host.insertBefore(banner, host.firstChild);
    } else {
      banner.dataset.floating = 'true';
      document.body.appendChild(banner);
    }
    return banner;
  }

  function removeBanner() {
    document.getElementById(BANNER_ID)?.remove();
  }

  /**
   * Reveals hidden cards without touching the filter set — the
   * tubefilter-revealed class simply out-specifies the hiding rule.
   */
  function toggleReveal() {
    revealActive = !revealActive;
    document.querySelectorAll('.tubefilter-hidden').forEach((el) => {
      el.classList.toggle('tubefilter-revealed', revealActive);
    });
    renderBanner();
  }

  // ---------------------------------------------------------------------------
  // DOM data extraction
  // ---------------------------------------------------------------------------
  /**
   * Returns a structured snapshot of the card or null when the data isn't
   * available yet (e.g. lazy-loaded thumbnails).
   */
  function extractVideoData(el) {
    try {
      const title = readTitle(el);
      const duration = readDuration(el);
      const { viewCount, uploadTime } = readMetadata(el);
      const isLive = detectLive(el, duration);
      const isShort = detectShort(el);
      const isWatched = detectWatched(el);

      if (!title && !duration && !viewCount && !isShort) return null;

      return {
        title: title || '',
        duration: duration || '',
        viewCount: viewCount || '',
        uploadTime: uploadTime || '',
        isLive,
        isShort,
        isWatched,
        element: el,
      };
    } catch (e) {
      return null;
    }
  }

  function readTitle(el) {
    const candidates = [
      // Newest layout (2025+, 'Yt*' class names without the 'wiz' suffix)
      '.ytLockupMetadataViewModelTitle',
      'h3.ytLockupMetadataViewModelHeadingReset',
      'h3.ytLockupMetadataViewModelHeadingReset a',
      'h3[title]',
      // Slightly older lockup ('wiz' suffix) — still present in some shelves
      '.yt-lockup-metadata-view-model-wiz__title',
      '.yt-lockup-metadata-view-model-wiz__heading-reset',
      // Classic YouTube
      '#video-title',
      'a#video-title-link',
      // Shorts
      '.shortsLockupViewModelHostMetadataTitle',
      // Generic fallbacks
      'h3 .yt-core-attributed-string',
      'h3 .ytAttributedStringHost',
      'h3 a',
      '[role="heading"]',
    ];
    for (const sel of candidates) {
      const node = el.querySelector(sel);
      if (node) {
        const text = (node.getAttribute('title') || node.textContent || '')
          .trim();
        if (text) return text;
      }
    }
    return '';
  }

  function readDuration(el) {
    const candidates = [
      // Newest layout (2025+)
      '.ytBadgeShapeText',
      'badge-shape .ytBadgeShapeText',
      'yt-thumbnail-badge-view-model .ytBadgeShapeText',
      // Classic
      'ytd-thumbnail-overlay-time-status-renderer #text',
      'ytd-thumbnail-overlay-time-status-renderer',
      // 'wiz' variants — kept for older layouts
      '.ytThumbnailOverlayBadgeViewModelHost .badge-shape-wiz__text',
      '.badge-shape-wiz__text',
      '.yt-thumbnail-badge-view-model .badge-shape-wiz__text',
      '.thumbnail-overlay-badge-shape .badge-shape-wiz__text',
      '[class*="time-status"] span',
    ];
    for (const sel of candidates) {
      const node = el.querySelector(sel);
      if (node) {
        const txt = (node.textContent || '').trim();
        if (txt) return txt;
      }
    }
    return '';
  }

  function readMetadata(el) {
    const out = { viewCount: '', uploadTime: '' };
    const metaSelectors = [
      // Newest layout (2025+)
      '.ytContentMetadataViewModelMetadataText',
      'span.ytContentMetadataViewModelMetadataText',
      // 'wiz' variants — older lockup
      '.yt-content-metadata-view-model-wiz__metadata-text',
      '.yt-content-metadata-view-model__metadata-text',
      // Classic
      '.inline-metadata-item',
      '#metadata-line span',
      '.metadata-line span',
      // Shorts
      '.shortsLockupViewModelHostMetadataSubhead',
    ];

    const seen = new Set();
    for (const sel of metaSelectors) {
      el.querySelectorAll(sel).forEach((n) => {
        const t = (n.textContent || '').trim();
        if (!t || seen.has(t)) return;
        seen.add(t);
        if (!out.viewCount && /view|watching/i.test(t)) out.viewCount = t;
        else if (!out.uploadTime && /(ago|streamed|premiered)/i.test(t))
          out.uploadTime = t;
      });
      if (out.viewCount && out.uploadTime) break;
    }

    // Last-ditch fallback: read aria-label on the title link, which YouTube
    // populates with view count + relative time + duration for
    // accessibility, e.g. "Title, 1 hour, 34 minutes, 3.1K views, 15 hours ago".
    if (!out.viewCount || !out.uploadTime) {
      const aria =
        el.querySelector('.ytLockupMetadataViewModelTitle')?.getAttribute('aria-label') ||
        el.querySelector('a#video-title-link')?.getAttribute('aria-label') ||
        el.querySelector('h3 a')?.getAttribute('aria-label') ||
        '';
      if (aria) {
        if (!out.viewCount) {
          const m = aria.match(/[\d.,]+\s*[KMB]?\s*views?/i);
          if (m) out.viewCount = m[0];
        }
        if (!out.uploadTime) {
          const m = aria.match(/\d+\s*(?:second|minute|hour|day|week|month|year)s?\s*ago/i);
          if (m) out.uploadTime = m[0];
        }
      }
    }
    return out;
  }

  function detectLive(el, duration) {
    if (/^live$/i.test((duration || '').trim())) return true;
    if (el.querySelector('[overlay-style="LIVE"]')) return true;
    if (el.querySelector('.badge-shape-wiz--thumbnail-live')) return true;
    if (el.querySelector('.ytBadgeShapeThumbnailLive, .ytBadgeShapeLive')) return true;
    const badges = el.querySelectorAll(
      'ytd-badge-supported-renderer, .badge-shape-wiz__text, .ytBadgeShapeText, .yt-badge'
    );
    for (const b of badges) {
      if (/^\s*live\s*$/i.test(b.textContent || '')) return true;
    }
    // aria-label often contains the word "live" in localized titles too.
    const titleLink = el.querySelector(
      '.ytLockupMetadataViewModelTitle, a#video-title-link, h3 a'
    );
    if (titleLink) {
      const aria = titleLink.getAttribute('aria-label') || '';
      if (/\blive (now|stream)\b/i.test(aria)) return true;
    }
    return false;
  }

  function detectShort(el) {
    if (el.tagName.toLowerCase().includes('shorts')) return true;
    if (el.querySelector('a[href^="/shorts/"]')) return true;
    if (
      typeof el.closest === 'function' &&
      el.closest('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]')
    )
      return true;
    return false;
  }

  function detectWatched(el) {
    // querySelector returns the first match in *document order*, not in
    // selector order — a wrapper element frequently wins over the segment
    // that actually carries the width, which would make a 0%-progress card
    // look watched. Collect every candidate and prefer a parseable width.
    const candidates = el.querySelectorAll(
      '#progress, .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment, .ytd-thumbnail-overlay-resume-playback-renderer, .ytThumbnailOverlayProgressBarHost'
    );
    if (candidates.length === 0) return false;

    for (const node of candidates) {
      const widthMatch = (node.getAttribute('style') || '').match(
        /width:\s*([\d.]+)%/
      );
      if (widthMatch) return parseFloat(widthMatch[1]) > 0;
    }
    // Presence alone is a strong signal for the resume-playback renderer.
    return true;
  }

  // ---------------------------------------------------------------------------
  // Filter predicate
  // ---------------------------------------------------------------------------
  function shouldHideVideo(data, filters) {
    // ----- Quick toggles (always evaluated first, cheapest) ------------------
    if (filters.hideShorts && data.isShort) return true;
    if (filters.hideLive && data.isLive) return true;
    if (filters.hideWatched && data.isWatched) return true;

    // Live and shorts have no duration/view metadata; don't apply
    // view/duration/time filters to them.

    const title = data.title;
    const titleLower = title.toLowerCase();

    // ----- Keyword filters (include / exclude / regex) -----------------------
    const excludeKeywords = filters.excludeKeywords;
    if (Array.isArray(excludeKeywords) && excludeKeywords.length > 0) {
      if (excludeKeywords.some((k) => titleLower.includes(k.toLowerCase())))
        return true;
    }

    const titleKeywords = filters.titleKeywords;
    if (Array.isArray(titleKeywords) && titleKeywords.length > 0) {
      const mode = filters.keywordMode || 'include';
      let match = false;
      // An unusable keyword test must not be allowed to mean "matches
      // nothing": in include-mode that hides the entire page.
      let applicable = !!title;
      if (filters.useRegex) {
        const re = compileRegex(titleKeywords[0]);
        if (re) match = re.test(title);
        else applicable = false; // malformed pattern ⇒ no keyword filter
      } else {
        const logic = filters.keywordLogic || 'AND';
        const test = (k) => titleLower.includes(k.toLowerCase());
        match = logic === 'AND' ? titleKeywords.every(test) : titleKeywords.some(test);
      }
      if (applicable) {
        if (mode === 'include' && !match) return true;
        if (mode === 'exclude' && match) return true;
      }
    } else if (typeof filters.titleKeyword === 'string' && filters.titleKeyword && title) {
      // Legacy single-keyword shape kept for backward compatibility.
      const k = filters.titleKeyword.toLowerCase();
      const contains = titleLower.includes(k);
      const mode = filters.keywordMode || 'include';
      if (mode === 'include' && !contains) return true;
      if (mode === 'exclude' && contains) return true;
    }

    // ----- View count --------------------------------------------------------
    const vf = filters.viewFilter;
    if (vf && vf.type !== 'none' && !data.isShort && !data.isLive) {
      const v = parseViewCount(data.viewCount);
      if (v !== -1) {
        if (vf.type === 'greater' && v <= vf.min) return true;
        if (vf.type === 'less' && v >= vf.max) return true;
        if (vf.type === 'between' && (v < vf.betweenMin || v > vf.betweenMax))
          return true;
      }
    }

    // ----- Duration ----------------------------------------------------------
    const df = filters.durationFilter;
    if (df && df.type !== 'none' && !data.isLive) {
      const sec = parseDuration(data.duration);
      if (sec !== -1) {
        if (df.type === 'less') {
          const max = parseDuration(df.lessValue);
          if (max !== -1 && sec >= max) return true;
        } else if (df.type === 'greater') {
          const min = parseDuration(df.greaterValue);
          if (min !== -1 && sec <= min) return true;
        } else if (df.type === 'custom') {
          const min = parseDuration(df.customMin);
          const max = parseDuration(df.customMax);
          if (min !== -1 && max !== -1 && (sec < min || sec > max)) return true;
        }
      }
    }

    // ----- Upload time -------------------------------------------------------
    const tf = filters.timeFilter;
    if (tf && tf.type !== 'none') {
      const h = parseUploadTimeToHours(data.uploadTime);
      if (h !== -1) {
        if (tf.type === 'less') {
          const max = convertTimeToHours(tf.lessValue, tf.lessUnit);
          if (h >= max) return true;
        } else if (tf.type === 'greater') {
          const min = convertTimeToHours(tf.greaterValue, tf.greaterUnit);
          if (h <= min) return true;
        } else if (tf.type === 'between') {
          const min = convertTimeToHours(tf.betweenMin, tf.betweenMinUnit);
          const max = convertTimeToHours(tf.betweenMax, tf.betweenMaxUnit);
          if (h < min || h > max) return true;
        }
      }
    }

    return false;
  }

  /**
   * Compiles the user's pattern, memoised across cards. Returns null when
   * the pattern doesn't compile — callers must treat that as "no keyword
   * filter", never as "matched nothing".
   */
  let regexCache = { source: null, re: null };

  function compileRegex(pattern) {
    const source = String(pattern);
    if (regexCache.source === source) return regexCache.re;

    let re = null;
    try {
      const m = source.match(/^\/(.+)\/([gimsuy]*)$/);
      re = m ? new RegExp(m[1], m[2]) : new RegExp(source, 'i');
    } catch (e) {
      console.warn('[TubeFilter] invalid regex — keyword filter skipped', e);
    }
    regexCache = { source, re };
    return re;
  }

  // ---------------------------------------------------------------------------
  // Parsing helpers
  // ---------------------------------------------------------------------------
  function parseViewCount(text) {
    if (!text) return -1;
    const clean = String(text).toLowerCase().replace(/,/g, '');
    // Match number then optional K/M/B then optional "views" (or "view")
    const m = clean.match(/([\d.]+)\s*([kmb])?\s*(?:view|watching)/);
    if (!m) {
      // Some locales: "No views" / "First view" etc.
      if (/no\s+views?/.test(clean)) return 0;
      return -1;
    }
    let n = parseFloat(m[1]);
    if (Number.isNaN(n)) return -1;
    switch (m[2]) {
      case 'k': n *= 1e3; break;
      case 'm': n *= 1e6; break;
      case 'b': n *= 1e9; break;
    }
    return Math.floor(n);
  }

  function parseDuration(text) {
    if (!text) return -1;
    const clean = String(text).trim();
    if (!clean || /^live$/i.test(clean) || /upcoming/i.test(clean)) return -1;
    const parts = clean.split(':');
    let s = 0;
    try {
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
      return Number.isNaN(s) ? -1 : s;
    } catch {
      return -1;
    }
  }

  function parseUploadTimeToHours(text) {
    if (!text) return -1;
    const m = String(text)
      .toLowerCase()
      .match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/);
    if (!m) return -1;
    return convertTimeToHours(parseInt(m[1], 10), m[2] + 's');
  }

  function convertTimeToHours(value, unit) {
    const v = Number(value) || 0;
    switch (unit) {
      case 'seconds': return v / 3600;
      case 'minutes': return v / 60;
      case 'hours':   return v;
      case 'days':    return v * 24;
      case 'weeks':   return v * 24 * 7;
      case 'months':  return v * 24 * 30;
      case 'years':   return v * 24 * 365;
      default:        return v;
    }
  }

  // ---------------------------------------------------------------------------
  // Test hook (only used by the test harness; harmless in production)
  // ---------------------------------------------------------------------------
  if (typeof window !== 'undefined') {
    window.__tubefilter = {
      applyFilters,
      clearAll,
      extractVideoData,
      shouldHideVideo,
      hasDataForFilters,
      detectWatched,
      compileRegex,
      parseViewCount,
      parseDuration,
      parseUploadTimeToHours,
      convertTimeToHours,
      renderBanner,
      toggleReveal,
      setFilters(f) {
        currentFilters = f;
        isFilteringActive = !!f;
        filterVersion++;
      },
      get hiddenCount() { return hiddenCount; },
      get filterVersion() { return filterVersion; },
      get revealActive() { return revealActive; },
    };
  }
})();
