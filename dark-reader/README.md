# DarkShift

A lightweight Chrome extension that intelligently applies dark mode to websites while respecting pages that are already dark.

## Features

- 🌙 **Smart Detection** - Automatically detects if a page is already dark (like YouTube dark mode) and doesn't invert it
- 🎨 **Full Control** - Adjust brightness, contrast, saturation, and hue rotation
- 🚀 **Lag-Free** - Efficient CSS filter injection with debounced updates for smooth performance
- 💾 **Persistent Settings** - All settings saved to Chrome storage and synced across devices
- 🔄 **Reset & Clear** - Quick reset to defaults or clear all settings

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the extension folder
6. The extension icon will appear in your toolbar

## Usage

1. Click the extension icon to open the popup
2. Toggle the switch to enable/disable dark mode
3. Adjust sliders to customize:
   - **Brightness**: 50-150%
   - **Contrast**: 50-150%
   - **Saturation**: 0-200%
   - **Hue Rotation**: 0-360°
4. Click "Reset Defaults" to restore default values
5. Click "Clear Settings" to completely reset everything

## How It Works

### Smart Detection
- Analyzes page background color using computed styles
- Calculates luminance (perceived brightness) using the formula: `0.299*R + 0.587*G + 0.114*B`
- If luminance < 0.4, treats page as already dark
  - **Dark pages**: Applies only brightness/contrast/saturation/hue adjustments
  - **Light pages**: Inverts colors and applies full dark mode filters

### CSS Filters
Uses CSS `filter` property for performance:
```css
/* Light pages */
filter: invert(1) hue-rotate(180deg) brightness() contrast() saturate();

/* Dark pages */
filter: brightness() contrast() saturate() hue-rotate();
```

Images and videos are counter-inverted on light pages to preserve original appearance.

### Performance
- **Debounced updates** - Slider changes wait 100ms before saving to prevent excessive storage writes
- **Content script** runs at `document_start` for instant application
- **CSS transitions** provide smooth filter changes

## Technical Stack

- **Manifest V3** - Latest Chrome extension format
- **Chrome Storage API** - Settings persistence with sync support
- **Content Scripts** - Dynamic CSS injection
- **Vanilla JavaScript** - No dependencies, pure JS implementation

## File Structure

```
├── manifest.json       # Extension configuration
├── popup.html         # UI interface
├── popup.css          # Popup styling
├── popup.js           # Settings management & event handling
├── content.js         # CSS filter injection & dark mode detection
└── icons/             # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Customizing the Icon

To replace the extension icon with your own:

1. Place your icon file (SVG or PNG) in the extension folder
2. Convert to required sizes (16x16, 48x48, 128x128):
   ```bash
   # For SVG files
   magick -background none your-icon.svg -resize 16x16 icons/icon16.png
   magick -background none your-icon.svg -resize 48x48 icons/icon48.png
   magick -background none your-icon.svg -resize 128x128 icons/icon128.png
   
   # For PNG files
   magick your-icon.png -resize 16x16 icons/icon16.png
   magick your-icon.png -resize 48x48 icons/icon48.png
   magick your-icon.png -resize 128x128 icons/icon128.png
   ```
3. Reload the extension in `chrome://extensions/`

**Note**: Requires ImageMagick installed (`brew install imagemagick` on macOS)

## Browser Support

- Chrome 88+
- Edge 88+
- Any Chromium-based browser supporting Manifest V3

## License

MIT

---

**Note**: Default state is "Off" - enable per page as needed. Settings are synced across your Chrome profile.
