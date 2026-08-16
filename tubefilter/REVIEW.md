# TubeFilter — Code Review

**Version reviewed:** 1.1.1 (`manifest.json`)
**Date:** 2026-08-16
**Scope:** `content.js`, `popup.js`, `popup.html`, `popup.css`, `background.js`, `manifest.json`

## Test status

The existing suite passes cleanly:

```bash
./tests/run.sh
```

```
✔ no filter ⇒ everything visible
✔ hide Shorts only
✔ hide Live + Watched
✔ views > 100K (excluding shorts/live)
✔ duration > 10 minutes
✔ less than 7 days old
✔ keywords: include "tutorial"
✔ keywords: exclude "clickbait,reaction"
✔ regex: ^(?!.*shorts).* anywhere
✔ combined: hide Shorts + views < 100K + exclude clickbait

✅ 10/10 tests passed
```

Everything below comes from edge cases the suite does not cover. Each item marked
**Verified** was reproduced in an isolated harness running the real `content.js` /
`popup.js` against a synthetic YouTube grid.

---

## Bugs

| # | Severity | Summary | File |
| --- | --- | --- | --- |
| 1 | High | Cards with a late-rendering title are permanently hidden by keyword filters | `content.js` |
| 2 | High | An invalid regex silently hides every video | `content.js`, `popup.js` |
| 3 | Medium | Toolbar badge goes stale after Clear | `content.js` |
| 4 | Medium | Badge-clearing listener in the service worker can never fire | `background.js`, `manifest.json` |
| 5 | Medium | Content script can be injected twice | `popup.js`, `content.js` |
| 6 | Low–Med | `detectWatched` ignores progress width when a wrapper matches first | `content.js` |
| 7 | Low | Duration `0` passes validation and hides everything | `popup.js` |
| 8 | Low | Dead attribute branch in the MutationObserver | `content.js` |
| 9 | Low | `parseViewInput('1e6')` returns `1` | `popup.js` |
| 10 | Low | `storage` permission declared but never used | `manifest.json` |
| 11 | Low | `.tubefilter-debug-outline` CSS is injected but never applied | `content.js` |

---

### 1. Cards whose title hasn't rendered yet are permanently hidden by keyword filters

**Severity:** High · **Verified**

`extractVideoData` returns a record as long as *any* of title / duration / viewCount /
isShort is present:

```js
// content.js:288
if (!title && !duration && !viewCount && !isShort) return null;
```

On a lazily-rendering feed, a card frequently paints its duration badge before its
title, so `extractVideoData` succeeds with `title: ''`. `shouldHideVideo` then computes
`match = false` and hides the card in include-mode:

```js
// content.js:496
if (mode === 'include' && !match) return true;
```

The card is then stamped with the current filter version:

```js
// content.js:226
el.dataset.tubefilterV = String(filterVersion);
```

so when the title finally arrives, `applyFilters` skips the card via the cache check at
`content.js:213-217` and never re-evaluates it. The video stays hidden for the rest of
the page's life.

**Repro result** (single clean content-script instance, include filter `python`):

```json
{
  "hiddenBeforeTitleLoaded": true,
  "titleNow": "Advanced Python Deep Dive",
  "hiddenAfterTitleLoaded": true
}
```

The card matches the filter and is still hidden.

**Fix:** don't stamp `data-tubefilter-v` when the card is missing fields the active
filters depend on, so it gets re-evaluated on the next observer tick. Alternatively (or
additionally), skip the keyword include check when `title === ''`.

---

### 2. An invalid regex silently hides every video

**Severity:** High · **Verified**

`testRegex` swallows the compile error and reports "no match":

```js
// content.js:565-568
} catch (e) {
  console.warn('[TubeFilter] invalid regex', e);
  return false;
}
```

In include-mode, "no match" means *hide*, so a malformed pattern blanks the entire page.
The popup never compiles the pattern, so nothing catches it first — `validateFilters`
returned `true` for the input `(unclosed`.

**Repro result:** applying `useRegex: true` with pattern `(unclosed` left **zero** cards
visible, with no error surfaced to the user.

This is easy to hit in practice: the user types a pattern, pauses mid-parenthesis, and
hits Apply.

**Fix:**
- In `validateFilters` (`popup.js:480`), compile the pattern with `new RegExp()` inside a
  `try`/`catch` and fail with a clear message.
- In `content.js`, treat an uncompilable pattern as *no keyword filter* rather than
  *matches nothing*, so the failure mode is "shows everything" instead of "hides
  everything".

---

### 3. Toolbar badge goes stale after Clear

**Severity:** Medium · **Verified**

`clearAll` resets the counter but sends no message:

```js
// content.js:251-260
function clearAll() {
  ...
  hiddenCount = 0;
}
```

`background.js:16` only repaints the badge on a `statsUpdate`, so after the user clicks
**Clear** the badge keeps displaying the old hidden count indefinitely.

**Repro result:** messages sent during `clearFilters` → `[]` (expected a `statsUpdate`
carrying `0`).

**Fix:** send `chrome.runtime.sendMessage({ action: 'statsUpdate', hiddenCount: 0 })`
from the `clearFilters` branch of `handleMessage`.

---

### 4. Badge-clearing listener in the service worker can never fire

**Severity:** Medium

```js
// background.js:47-48
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && !/^https:\/\/(www\.)?youtube\.com\//.test(changeInfo.url)) {
```

Chrome only populates `changeInfo.url` when the extension holds the `tabs` permission or
a host permission matching the tab's URL. The manifest declares neither `tabs` nor a
broad host permission — only `youtube.com` and `m.youtube.com`. So when a tab navigates
from YouTube to any other site, `changeInfo.url` is stripped and the listener body never
runs. Combined with bug 3, the badge is effectively sticky.

Secondary defect in the same line: the regex `^https:\/\/(www\.)?youtube\.com\/` does not
match `m.youtube.com`, which *is* in `host_permissions` — so mobile YouTube would be
treated as "navigated away".

**Fix:** add `"tabs"` to `permissions`, or drive the badge from `chrome.tabs.onActivated`
plus the existing `statsUpdate` flow. Include `m.` in the host pattern either way.

---

### 5. Content script can be injected twice

**Severity:** Medium · **Verified**

`sendToContentScript` falls back to programmatic injection whenever the first
`sendMessage` fails:

```js
// popup.js:270-288
if (chrome.runtime.lastError) {
  ...
  chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, ...)
}
```

But `content.js` is *already* registered in the manifest at `document_idle`. Opening the
popup before the page reaches idle produces two live copies.

**Repro result:** listener count went `1 → 2` after a second injection.

The consequences go beyond duplicate message listeners:

- Each instance keeps its own `filterVersion` counter but both write the same
  `data-tubefilter-v` DOM attribute, so they invalidate each other's cache and **every
  card is re-evaluated on every mutation tick**.
- Two `MutationObserver`s on `document.body` with `subtree: true`.
- Two 1500 ms `setInterval` backstops (`content.js:88`) that are never cleared.
- `restoreSession` runs twice.

**Fix:** guard the IIFE:

```js
if (window.__tubefilterLoaded) return;
window.__tubefilterLoaded = true;
```

---

### 6. `detectWatched` ignores the progress width when a wrapper matches first

**Severity:** Low–Medium · **Verified**

```js
// content.js:451
const progress = el.querySelector(
  '#progress, .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment, .ytd-thumbnail-overlay-resume-playback-renderer, .ytThumbnailOverlayProgressBarHost'
);
```

`querySelector` returns whichever element matches first in *document order*, not in
selector order. When a wrapper element carries
`.ytd-thumbnail-overlay-resume-playback-renderer`, the width check is skipped entirely
and the function falls through to:

```js
// content.js:460
return true;
```

**Repro result:** a card whose progress bar was `style="width: 0%"` was hidden by
`hideWatched`.

**Fix:** query all candidates, prefer the first one that exposes a parseable
`width: N%`, and only fall back to presence-implies-watched when none does.

---

### 7. Duration `0` passes validation and hides everything

**Severity:** Low · **Verified**

`parseDurationInput('0')` → `'0:00'`, which is truthy, and `parseTimeToSeconds('0:00')`
→ `0`, which is not `-1`. So the guards in `validateFilters` both pass:

```js
// popup.js:494-498
if (df.type === 'less') {
  if (!df.lessValue) return fail('Please enter a maximum duration');
  if (parseTimeToSeconds(df.lessValue) === -1) return fail('Use format mm:ss or 5m / 1h30m');
}
```

"Duration < 0:00" is then applied and hides every card with a parseable duration.

**Repro result:** `{ valid: true, value: "0:00" }`.

**Fix:** require a value strictly greater than zero.

---

### 8. Dead attribute branch in the MutationObserver

**Severity:** Low

The callback tests for attribute mutations:

```js
// content.js:158
if (m.addedNodes.length > 0 || m.type === 'attributes') {
```

but `observe()` never requests them:

```js
// content.js:164-167
observer.observe(document.body, { childList: true, subtree: true });
```

Harmless today, but worth flagging explicitly: "fixing" it by adding `attributes: true`
would create a feedback loop, because `hideEl` / `showEl` (`content.js:262-270`) write
both a class and a `data-tubefilter-hidden` attribute on every pass.

**Fix:** delete the `m.type === 'attributes'` check, and leave a comment explaining why
attribute observation is deliberately off.

---

### 9. `parseViewInput('1e6')` returns `1`

**Severity:** Low · **Verified**

```js
// popup.js:380-381
const m = s.match(/^([\d.]+)\s*([kmb])?$/);
if (!m) return parseInt(s, 10) || 0;
```

`1e6` fails the regex, then `parseInt('1e6', 10)` stops at the `e` and returns `1`. The
user gets a threshold of one view with no warning.

**Fix:** reject unparseable input in `validateFilters` instead of silently coercing it.

---

### 10. `storage` permission declared but never used

**Severity:** Low · **Verified**

`grep -rn "chrome\.storage" content.js popup.js background.js` returns nothing. The
permission is listed in `manifest.json:8` but no code path touches it. It's an
unnecessary permission on the store listing.

Note this is also a symptom: filters are persisted in `sessionStorage`
(`content.js:112`), which is per-tab and dies with the tab, so a second YouTube tab
starts unfiltered.

---

### 11. `.tubefilter-debug-outline` CSS is injected but never applied

**Severity:** Low · **Verified**

```js
// content.js:39
.tubefilter-debug-outline { outline: 2px solid #ff0000 !important; outline-offset: -2px; }
```

Nothing anywhere adds this class. Either dead code to remove, or an unfinished debug
mode.

---

## Locale limitation

Not a crash, but the metadata parsers are English-only:

| Input | Result |
| --- | --- |
| `parseViewCount('1.2M views')` | `1200000` |
| `parseViewCount('1,234 views')` | `1234` |
| `parseViewCount('No views')` | `0` |
| `parseViewCount('1,2 Mio. Aufrufe')` | `-1` |
| `parseUploadTimeToHours('vor 2 Tagen')` | `-1` |

`-1` means "unknown", and `shouldHideVideo` skips the filter in that case — so the
failure mode is safe (nothing is wrongly hidden). But the view, duration, and upload-date
filters **silently do nothing** on any non-English YouTube UI. This should at minimum be
documented in the README.

---

## UI issues

### U1. The popup is taller than Chrome allows — the primary action is below the fold

**Verified.** Rendered `document.body.scrollHeight` at the 320px popup width is **802px**;
Chrome caps extension popups at roughly **600px**. At the real popup size, the entire
Keywords section *and both the Apply and Clear buttons* sit below the fold. The user must
scroll before they can apply anything.

**Fix options (combinable):**
- Make `.controls` a sticky bottom bar so Apply/Clear are always reachable.
- Ship Views / Duration / Upload Date collapsed by default (see also U6).
- Move the regex guide out of the popup (see Feature 3).

### U2. Presets stack silently with no active state

**Verified.** Clicking Focus → Popular → Fresh accumulates all three; the result was
`{ view: "greater", time: "less", keywords: "-clickbait, -reaction" }`. `applyPreset`
(`popup.js:107`) never resets the other groups and never marks the clicked button, so
`.preset-btn` has no active styling at any point. There is no way to tell which presets
are in effect.

**Fix:** give `.preset-btn` an `active` class reflecting current form state, and decide
deliberately whether presets replace or accumulate — then make that visible.

### U3. Presets don't refresh the keyword preview

**Verified.** Focus injects `-clickbait, -reaction` into the textarea but the preview
stays `display: none`, because `applyPreset` assigns `.value` directly without dispatching
an `input` event — the listener at `popup.js:58` never runs.

**Fix:** dispatch `new Event('input')` after setting the value, as `clearFilters` already
does for the regex checkbox (`popup.js:357`).

### U4. Clear doesn't reset the text and number inputs

**Verified.** After clicking Clear, the values persist:

```json
{ "viewMin": "50k", "durationGreater": "20m", "timeLess": "3", "viewRadio": "none" }
```

`clearFilters` (`popup.js:343`) resets the radios, textarea and checkboxes but not the
value inputs. They're disabled so they look inert, but re-selecting a filter type
resurrects the old numbers.

### U5. Accessibility gaps

**Verified.**

- `.section-header` elements are plain `<div>`s with click handlers
  (`popup.js:35-39`). They have `tabindex: null` and `role: null`, so they cannot be
  operated by keyboard, and there is no `aria-expanded` to convey collapse state.
- Quick-toggle checkboxes are `opacity: 0` (`popup.css:686-690`) and `.toggle-card` has no
  `:focus-visible` styling. They remain in the tab order, so a keyboard user can focus a
  control with no visible indication of where they are.
- The numeric and text inputs (`viewMin`, `durationLess`, `timeLess`, …) have no `<label
  for>` or `aria-label`; a screen reader announces bare textboxes.

**Fix:** add `role="button"`, `tabindex="0"`, `aria-expanded` and Enter/Space handlers to
the section headers; add a `:focus-visible` outline on `.toggle-card`; label the inputs.

### U6. Section collapse state isn't persisted

Collapsing a section only mutates the DOM (`popup.js:37`). Reopening the popup re-expands
everything, so the layout work in U1 has to be redone by the user on every visit.

### U7. No clear affordance on a non-YouTube tab

On a non-YouTube tab the popup shows "Open YouTube to filter" (`popup.js:305`), but the
Apply button stays enabled and simply fails with an error toast when clicked.

**Fix:** disable Apply/Clear when the active tab isn't YouTube.

---

## Features to add

### F1. "N videos hidden — show anyway" row

Filtering is currently invisible: hidden cards are `display: none` and the only feedback
lives in the popup and the toolbar badge. A user who forgot filters were on has no
in-page signal that YouTube is showing them a reduced feed.

Add an optional in-page banner, injected at the top of the results container, reading
something like *"TubeFilter is hiding 14 videos — show anyway"*. Clicking it temporarily
reveals the hidden cards for the current page without clearing the filter set.

Implementation notes:
- The hidden count already exists as `hiddenCount` in `content.js` and is recomputed on
  every `applyFilters` pass, so the banner just needs to subscribe to it.
- Reveal can reuse the existing class mechanism: add a `tubefilter-revealed` class that
  overrides `.tubefilter-hidden { display: none !important }`, rather than removing the
  hidden class, so filter state stays intact.
- Make it opt-out — some users specifically want the filtering to be invisible.

### F2. Keyboard shortcut to toggle filtering

Add a `commands` block to `manifest.json` so filtering can be toggled without opening the
popup:

```json
"commands": {
  "toggle-filtering": {
    "suggested_key": { "default": "Alt+Shift+F" },
    "description": "Toggle TubeFilter on the current tab"
  }
}
```

Handle it in `background.js` via `chrome.commands.onCommand`, forwarding an action to the
active tab's content script. The content script already has the two message branches this
needs (`applyFilters` / `clearFilters`); a `toggleFilters` branch that flips
`isFilteringActive` while retaining `currentFilters` would preserve the user's settings
across toggles, which `clearFilters` does not.

### F3. Move the regex guide to an options page

The regex guide (`popup.html:217-257`) is roughly 40 lines of static reference content
plus its own stylesheet block (`popup.css:438-520`). It is a significant contributor to
the 802px popup height documented in U1, despite being collapsed by default.

Move it to a dedicated options page:
- Add `"options_page": "options.html"` (or `options_ui`) to `manifest.json`.
- Replace the in-popup guide with the existing `?` button, opening the options page via
  `chrome.runtime.openOptionsPage()`.
- Delete the `.regex-guide*` rules from `popup.css` and move them to an `options.css`.

This also buys room for a proper live regex tester — a pattern field plus a sample title
that shows match/no-match — which directly mitigates bug 2.
