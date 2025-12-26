# DarkShift

A lightweight Chrome extension that intelligently applies dark mode to websites while respecting pages that are already dark.

## Features

- 🌙 **Dual Modes** - Choose between Dark Mode (with inversion) or Filter Mode (filters only)
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
2. Choose your mode (mutually exclusive):
   - **Dark Mode**: Inverts colors + applies all filters (full dark mode effect)
   - **Filter Mode**: Applies filters only without color inversion
3. Adjust sliders to customize (enabled when either mode is on):
   - **Brightness**: 50-150%
   - **Contrast**: 50-150%
   - **Saturation**: 0-200%
   - **Hue Rotation**: 0-360°
4. Click "Reset Defaults" to restore default slider values
5. Click "Clear Settings" to completely reset everything

**NoTwo Modes

**Dark Mode (Color Inversion)**
- Inverts all page colors for a true dark mode experience
- Applies additional filters for customization
- Counter-inverts images, videos, and media to preserve original appearance
- Perfect for making bright websites dark

**Filter Mode (No Inversion)**
- Applies only brightness, contrast, saturation, and hue adjustments
- No color inversion - preserves original colors
- Useful for fine-tuning page appearance without full dark mode
- Great for reducing brightness or adjusting color temperature

### CSS Filters
Uses CSS `filter` property for performance:
```css
/* Dark Mode */
filter: invert(1) hue-rotate(180deg) brightness() contrast() saturate();

/* Filter Mode */
filter: brightness() contrast() saturate() hue-rotate();
```

In Dark Mode, images and videos are counter-inverted
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
Both modes default to "Off" - choose the mode that works best for each page
- Chrome 88+
- Edge 88+
- Any Chromium-based browser supporting Manifest V3

## License

MIT

---

**Note**: Default state is "Off" - enable per page as needed. Settings are synced across your Chrome profile.
