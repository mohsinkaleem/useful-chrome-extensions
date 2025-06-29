# 🎬 TubeFilter - YouTube Video Filter Extension

A simple and fast Chrome extension to filter YouTube videos by view count, duration, and title keywords.

## 🚀 Features

- **View Count Filter**: Filter videos by view count ranges
  - Greater than X views
  - Less than X views  
  - Between X and Y views
- **Duration Filter**: Filter by video length
  - Short videos (< 4 minutes)
  - Medium videos (4-20 minutes)
  - Long videos (> 20 minutes)
  - Custom duration range
- **Title Keyword Filter**: Show only videos containing specific keywords OR exclude videos containing specific keywords
  - **Multiple Keywords**: Enter multiple keywords separated by commas
  - **AND/OR Logic**: Choose whether videos must contain ALL keywords (AND) or ANY keywords (OR)
  - Include mode: Show only videos matching the keyword criteria
  - Exclude mode: Hide videos matching the keyword criteria
  - **Smart Preview**: See a preview of your keyword logic before applying
- **Dynamic Filtering**: Works with YouTube's infinite scroll
- **Non-intrusive**: Clean, simple interface
- **Fast Performance**: Vanilla JavaScript, no dependencies

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
   - Enter multiple keywords separated by commas (e.g., "tutorial, beginner, coding")
   - Choose AND/OR logic for keyword matching
   - Choose whether to include or exclude videos with those keywords
4. **Click "Apply Filters"** to activate filtering
5. **Use "Clear All"** to remove all filters and show all videos

### 🎯 Multiple Keywords Examples

**AND Logic Examples:**

- `"music, tutorial"` → Shows only videos containing BOTH "music" AND "tutorial"
- `"gaming, beginner, guide"` → Shows only videos containing ALL three keywords

**OR Logic Examples:**

- `"comedy, funny, humor"` → Shows videos containing ANY of these keywords  
- `"review, unboxing"` → Shows videos that are either reviews OR unboxings

**Include vs Exclude:**

- **Include + AND**: `"python, programming"` → Show only Python programming videos
- **Exclude + OR**: `"clickbait, reaction"` → Hide videos that are clickbait OR reactions

## 🛠️ How It Works

- The extension monitors YouTube's video grid for new content
- When filters are applied, it scans each video's metadata:
  - Extracts view count from the video info
  - Parses duration from the video overlay
  - Checks title text for keyword matches using AND/OR logic with multiple keywords
- Videos that don't match the criteria are hidden using CSS
- The extension adapts to YouTube's dynamic content loading

## 📁 File Structure

```text
tubefilter/
├── manifest.json          # Extension configuration
├── popup.html             # Filter interface HTML
├── popup.css              # Interface styling
├── popup.js               # Popup logic and validation
├── content.js             # Main filtering logic
├── icons/                 # Extension icons
│   ├── icon.svg          # SVG template
│   ├── icon16.png        # 16x16 icon
│   ├── icon32.png        # 32x32 icon
│   ├── icon48.png        # 48x48 icon
│   └── icon128.png       # 128x128 icon
├── create_icons.sh        # Icon creation helper
└── README.md             # This file
```

## 🔧 Technical Details

- **Manifest Version**: 3 (Chrome Extensions Manifest V3)
- **Permissions**: `activeTab`, `storage`
- **Host Permissions**: `https://www.youtube.com/*`
- **Architecture**: Content script + popup interface
- **Storage**: Chrome sync storage for filter persistence
- **Compatibility**: Modern Chrome browsers

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

- Channel name filtering
- Upload date filtering  
- Like/dislike ratio filtering (if available)
- Export/import filter presets
- Keyboard shortcuts
- Statistics dashboard
- Regex support for advanced keyword matching
- Keyword highlighting in video titles

## 📝 License

This project is open source. Feel free to modify and distribute.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

---

**Note**: This extension is not affiliated with YouTube or Google. It's a third-party tool designed to enhance the YouTube browsing experience.
