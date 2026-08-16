# 🎬 TubeFilter - YouTube Video Filter Extension

A fast Chrome extension to filter YouTube videos by view count, duration, upload time, and title keywords — plus one-click toggles to hide Shorts, live streams, and already-watched videos.

## 🚀 Features

- **Quick toggles**: Hide all **Shorts**, all **Live** streams, or anything you've already **Watched** with a single click
- **Presets**: 🎯 Focus · 🆕 Fresh · 🎞 Long · 🔥 Popular — pre-configured filter combos
- **View Count Filter**: Greater than, less than, or between two view counts (e.g. `10k`, `1.2m`)
- **Duration Filter**: Less than / greater than / custom range (`5m`, `1h30m`, or `5:30`)
- **Upload Time Filter**: Newer than, older than, or between two time periods (hrs · days · wks · mos · yrs)
- **Title Keyword Filter** with `+` (include) / `-` (exclude) prefixes, ALL/ANY logic, and full regex support
- **In-page banner** — "TubeFilter is hiding 14 videos — show anyway" lets you peek at what's filtered without clearing anything (opt-out in the popup)
- **Keyboard shortcut** — <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> toggles filtering on the current tab without losing your filter settings
- **Regex guide & live tester** on the extension's options page
- **Live hidden count** in the popup and on the toolbar badge
- **Dark mode** that follows your system setting
- **Works with the new YouTube layout** (`yt-lockup-view-model`, Shorts shelves, lockup metadata) and the classic one (`ytd-rich-item-renderer`, sidebar, search results, channel grids)

## 📦 Installation

### Option 1: Load as Unpacked Extension (Development)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `tubefilter` folder
6. The extension icon should appear in your toolbar

### Option 2: Create Icons (Required)

The extension includes placeholder PNG files. For better appearance:

1. Use the included `icons/icon.svg` as reference
2. Convert to PNG at these sizes:
   - `icon16.png` (16x16 pixels)
   - `icon32.png` (32x32 pixels)
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)
3. Replace the placeholder files in the `icons/` folder

**Recommended online converters:**

- [CloudConvert](https://cloudconvert.com/svg-to-png)
- [Convertio](https://convertio.co/svg-png/)
- [Zamzar](https://www.zamzar.com/convert/svg-to-png/)

## 🎯 Usage

1. **Navigate to YouTube** in your Chrome browser
2. **Click the TubeFilter extension icon** in the toolbar
3. **Set your filters:**
   - Choose view count range options
   - Select duration preferences
   - Set upload time filters (e.g., show only videos from the last 7 days)
   - Enter multiple keywords separated by commas (e.g., "tutorial, beginner, coding")
   - Choose AND/OR logic for keyword matching
   - Choose whether to include or exclude videos with those keywords
4. **Click "Apply"** to activate filtering
5. **Use "Clear"** to remove all filters and show all videos
6. Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> to toggle filtering on and
   off without losing your settings (rebind it at
   `chrome://extensions/shortcuts`)
7. While filters are active, an in-page banner shows how many videos are
   hidden and offers **"show anyway"** to peek at them — untick *Show "N
   hidden" banner on the page* in the popup to turn it off
Filter Examples

**Upload Time Filter Examples:**

- **Less than 24 hours ago** → Show only videos posted today
- **Greater than 30 days ago** → Show only older videos
- **Between 7 days and 30 days ago** → Show videos from the last week to month

**Multiple Keywords Examples:**

**AND Logic Examples:**

- `"music, tutorial"` → Shows only videos containing BOTH "music" AND "tutorial"
- `"gaming, beginner, guide"` → Shows only videos containing ALL three keywords

**OR Logic Examples:**

- `"comedy, funny, humor"` → Shows videos containing ANY of these keywords  
- `"review, unboxing"` → Shows videos that are either reviews OR unboxings

**Include vs Exclude:**

- **Include + AND**: `"python, programming"` → Show only Python programming videos
- **Exclude + OR**: `"clickbait, reaction"` → Hide videos that are clickbait OR reactions

**Regex Filter Examples:**

Enable the "Use Regular Expression (Regex)" checkbox to use these patterns:

- **Case-insensitive search**: `python` or `/python/i`
  - Matches "Python", "PYTHON", "python"
- **Starts with**: `^\[Official\]`
  - Matches titles starting with "[Official]"
- **Ends with**: `tutorial$`
  - Matches titles ending with "tutorial"
- **Wildcards**: `react.*hook`
  - Matches "React Hooks", "React custom hooks", etc.
- **Alternatives**: `(react|vue|angular)`
  - Matches any title containing "react", "vue", or "angular"
- **Exact Match**: `^My Exact Title$`
  - Matches only the exact title "My Exact Title"

**Combined Filters:**

- **Duration < 10 minutes + Less than 7 days ago** → Show recent short videos
- **Views > 100K + Keywords: "tutorial"** → Show popular tutorial video
- **Exclude + OR**: `"clickbait, reaction"` → Hide videos that are clickbait OR reactions

## 🛠️ How It Works

- The extension monitors YouTube's video grid for new content
- When filters are applied, it scans each video's metadata:
  - Extracts view count from the video info
  - Parses duration from the video overlay
  - Checks title text for keyword matches using AND/OR logic with multiple keywords
- Videos that don't match the criteria are hidden using CSS
- The extension adapts to YouTube's dynamic content loading

## 🌍 Language support

The **keyword**, **regex**, and **Shorts / Live / Watched** filters read
structural signals and work on any YouTube UI language.

The **view count**, **duration**, and **upload date** filters parse YouTube's
own metadata text (`"1.2M views"`, `"3 weeks ago"`) and currently understand
the **English** UI only. On a non-English YouTube the parsers return
"unknown" and those three filters are **skipped** rather than guessed — so
nothing is ever hidden by mistake, but they will silently have no effect.

| Input | Parsed as |
| --- | --- |
| `1.2M views` | `1200000` |
| `1,234 views` | `1234` |
| `No views` | `0` |
| `1,2 Mio. Aufrufe` | unknown → filter skipped |
| `vor 2 Tagen` | unknown → filter skipped |

## 📁 File Structure

```text
tubefilter/
├── manifest.json          # Extension configuration (MV3)
├── popup.html             # Filter interface HTML
├── popup.css              # Interface styling (with dark-mode support)
├── popup.js               # Popup logic, validation, and tab messaging
├── content.js             # Content script — DOM filtering on YouTube
├── background.js          # Service worker — toolbar badge + keyboard command
├── options.html           # Options page — regex guide and live pattern tester
├── options.css            # Options page styling
├── options.js             # Options page logic
├── icons/                 # Extension icons
│   ├── icon.svg          # SVG template
│   ├── icon16.png        # 16x16 icon
│   ├── icon32.png        # 32x32 icon
│   ├── icon48.png        # 48x48 icon
│   └── icon128.png       # 128x128 icon
├── tests/                 # Automated test harness
│   ├── harness.html      # In-browser harness that loads content.js
│   ├── popup-harness.html # Boots popup.js against a chrome.* stub
│   ├── fixtures/         # Static YouTube DOM fixtures
│   └── run.sh            # One-shot test runner (playwright-cli)
├── create_icons.sh        # Icon creation helper
└── README.md             # This file
```

## 🧪 Testing

The extension ships with an in-browser test suite. It exercises the real
`content.js` against a static fixture mimicking YouTube cards (both the
classic `ytd-rich-item-renderer` shape and the new `yt-lockup-view-model`
shape, plus Shorts, live streams, and watched videos), and the real
`popup.js` against a `chrome.*` stub in a 320x600 iframe — so popup layout,
validation and accessibility are covered too.

Run all tests:

```bash
./tests/run.sh
```

The runner uses [`playwright-cli`](https://www.npmjs.com/package/playwright-cli):

```text
▶ starting static server on :8765
▶ opening harness in playwright
▶ running assertions
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
  ✔ bug 1: a title that renders late is re-evaluated, not frozen
  ✔ bug 2: an invalid regex shows everything instead of hiding everything
  ✔ bug 3: Clear pushes a zeroed statsUpdate for the badge
  ✔ bug 5: re-injecting content.js does not create a second instance
  ✔ bug 6: a 0%-width progress bar behind a wrapper is not "watched"
  ✔ bug 6: a partially watched card is still detected
  ✔ bug 8: attribute mutations do not retrigger the filter pass
  ✔ bug 11: no dead debug-outline rule is injected
  ✔ F1: banner reports the hidden count and reveals on demand
  ✔ F1: the banner can be opted out of
  ✔ F2: toggleFilters flips filtering without discarding the filters
  ✔ bug 9: view input "1e6" is rejected, not coerced to 1
  ✔ bug 7: duration "0" fails validation
  ✔ bug 2: unclosed regex fails validation with a message
  ✔ bug 2: a valid regex still passes validation
  ✔ U1: popup fits inside Chrome's ~600px popup cap
  ✔ U2: presets show an active state and toggle back off
  ✔ U2: stacked presets each report their own state
  ✔ U3: presets refresh the keyword preview
  ✔ U4: Clear resets the text and number inputs
  ✔ U5: section headers are keyboard operable and expose state
  ✔ U5: inputs carry accessible names
  ✔ U6: collapse state survives a reopen
  ✔ U7: Apply/Clear are disabled on a non-YouTube tab
  ✔ F1: banner preference travels with the filters
  ✔ F3: the ? button opens the options page
  ✔ F3: the regex guide no longer ships inside the popup

✅ 37/37 tests passed
```

You can also open `tests/harness.html` manually in any browser and click
"Run all tests" — no extension reload required.

## 🔧 Technical Details

- **Manifest Version**: 3 (Chrome Extensions Manifest V3)
- **Permissions**: `activeTab`, `scripting`
- **Host Permissions**: `https://www.youtube.com/*`, `https://m.youtube.com/*`
- **Architecture**: Content script + popup + background service worker
- **Compatibility**: Modern Chromium browsers (Chrome, Edge, Brave, Arc, Opera)
- **Resilience**: Multi-selector cascade with fallbacks; survives YouTube DOM changes
- **Performance**: Batched DOM writes via `requestAnimationFrame`; per-filter version cache; debounced mutation observer

## 🐛 Troubleshooting

**Extension not working?**

- Make sure you're on YouTube (`youtube.com`)
- Check that the extension is enabled in `chrome://extensions/`
- Try refreshing the YouTube page

**Filters not applying?**

- Verify filter values are valid (positive numbers, proper time format)
- Check browser console for error messages
- Ensure you clicked "Apply Filters"

**Videos not being filtered correctly?**

- YouTube's layout may change over time
- The extension extracts data from current YouTube structure
- Some videos may have non-standard metadata

## 🚀 Future Enhancements

- Like/dislike ratio filtering (if available)
- Export/import filter presets
- Localised metadata parsing for non-English YouTube UIs
- Statistics dashboard
- Keyword highlighting in video titles
- Filter history

## 📝 License

This project is open source. Feel free to modify and distribute.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

---

**Note**: This extension is not affiliated with YouTube or Google. It's a third-party tool designed to enhance the YouTube browsing experience.
