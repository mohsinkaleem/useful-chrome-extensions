# 🎬 TubeFilter Chrome Extension

Installation and Testing Guide

## Step 1: Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right corner)
3. Click "Load unpacked"
4. Select the **tubefilter** folder
5. The TubeFilter icon should appear in your toolbar
6. **Pin the extension** for quick access (click the puzzle-piece icon, then the pin next to TubeFilter)

## Step 2: Update Icons (Optional)

The repo ships with PNG icons. To regenerate them:

1. Open `icons/icon.svg` in any SVG editor or viewer
2. Convert to PNG at these exact sizes and overwrite the existing files:
    - 16×16 → `icon16.png`
    - 32×32 → `icon32.png`
    - 48×48 → `icon48.png`
    - 128×128 → `icon128.png`
3. Reload the extension from `chrome://extensions/`

## Step 3: Test the Extension

1. Navigate to [YouTube.com](https://www.youtube.com)
2. Click the TubeFilter icon in your toolbar
3. Try the quick toggles or a preset:
    - ⚡ Shorts to hide all Shorts
    - 🔴 Live to hide live streams
    - ✓ Watched to hide videos you've already started
    - 🎯 Focus / 🆕 Fresh / 🎞 Long / 🔥 Popular presets
4. Or set per-filter values:
    - Views: `>` `100k`
    - Duration: `<` `10m`
    - Date: `Newer than` `7 days`
    - Keywords: `tutorial, +python, -clickbait`
5. Click **Apply**; the toolbar badge will show how many videos are hidden on the page,
   and an in-page banner will report the count with a **show anyway** peek.
6. Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> to toggle filtering off and back on
   without losing your settings.
7. Click **Clear** to reset.
8. Click the **?** next to the Regex toggle to open the options page — a regex
   reference plus a live pattern tester.

## ✅ Extension Features

- **Quick toggles**: Hide Shorts, live streams, or already-watched videos with one click
- **Presets**: Focus / Fresh / Long / Popular
- **View, duration, and upload-date filters** with flexible inputs (`10k`, `1h30m`, `7 days`, …)
- **Keyword filters** with `+`/`-` prefixes, ALL/ANY logic, and regex
- **Dynamic updates**: Works with YouTube's infinite scroll, SPA navigation, and the new lockup layout
- **Hidden count badge** on the toolbar icon, in the popup status bar, and as an
  optional in-page banner with a "show anyway" peek
- **Keyboard shortcut** (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>) to toggle
  filtering without opening the popup; rebind at `chrome://extensions/shortcuts`
- **Options page** with a regex guide and a live pattern tester
- **Dark mode** that follows your system preference

> **Language note:** the view, duration and upload-date filters read YouTube's
> English metadata text. On a non-English YouTube UI they are skipped rather
> than guessed — nothing is wrongly hidden, but those three filters have no
> effect. Keyword, regex and the Shorts/Live/Watched toggles work everywhere.

## 🐛 Troubleshooting

- **No videos being hidden after Apply** → reload the YouTube tab once after installing/updating, then click Apply again. (The popup will auto-inject `content.js` if needed, but a fresh page load is the most reliable.)
- **Filters not visible in the toolbar** → click the puzzle-piece icon and pin TubeFilter.
- **Console errors** → open DevTools (⌘⌥I / Ctrl+Shift+I) and check the Console; report any errors that mention `[TubeFilter]`.
- **Quick toggles do nothing** → make sure you're on a YouTube page that shows video cards (home, search, channel, watch page sidebar). Some pages have no cards to filter.
- **Apply and Clear are greyed out** → the active tab isn't a YouTube page. Switch to one and reopen the popup.
- **A regex hides nothing** → a pattern that doesn't compile is ignored on purpose (so a typo can't blank your feed). The popup rejects it with the compiler's message; use the tester on the options page to check it.

## 📝 Developer Quick Test

Run the automated harness from the repo root:

```bash
./tests/run.sh
```

This boots a local server, drives the harness with `playwright-cli`, and prints a
PASS/FAIL summary for 37 scenarios: the 10 core filter combinations (shorts, live,
watched, views, duration, time, keywords, regex, combined), 11 content-script
regression tests, and 16 popup tests covering validation, layout, presets and
accessibility.
