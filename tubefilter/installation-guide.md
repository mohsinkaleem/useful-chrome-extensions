# 🎬 TubeFilter Chrome Extension

Installation and Testing Guide

## Step 1: Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right corner)
3. Click "Load unpacked"
4. Select the **tubefilter** folder
5. The TubeFilter icon should appear in your toolbar

## Step 2: Create Proper Icons (Recommended)

> **Warning:** The extension currently uses placeholder icons. For better appearance:

1. Open `icons/icon.svg` in any SVG editor or viewer
2. Convert to PNG at these exact sizes:
    - 16×16 pixels → `icon16.png`
    - 32×32 pixels → `icon32.png`
    - 48×48 pixels → `icon48.png`
    - 128×128 pixels → `icon128.png`
3. Replace the placeholder files in the `icons/` folder
4. Reload the extension in Chrome

## Step 3: Test the Extension

1. Navigate to [YouTube.com](https://www.youtube.com)
2. Click the TubeFilter extension icon in your toolbar
3. Try different filter settings:
    - Set view count filters (e.g., "Greater than 1000")
    - Try duration filters (e.g., "Short videos")
    - Enter a keyword filter (e.g., "music")
4. Click "Apply Filters" and observe videos being hidden/shown
5. Use "Clear All" to reset filters

## ✅ Extension Features

- **View Count Filtering:** Greater than, Less than, Between ranges
- **Duration Filtering:** Short/Medium/Long presets + Custom ranges
- **Keyword Filtering:** Search for specific words in video titles
- **Dynamic Updates:** Works with YouTube's infinite scroll
- **Persistent Settings:** Filters are saved between sessions

## 🐛 Troubleshooting

- **Extension not appearing:** Make sure Developer mode is enabled
- **Filters not working:** Ensure you're on YouTube and clicked "Apply Filters"
- **Console errors:** Check browser DevTools Console for error messages
- **Page refresh needed:** Try refreshing YouTube after loading the extension

## 📝 Quick Test Checklist

