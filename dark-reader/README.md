# DarkShift

A lightweight Chrome extension that applies dark mode on a per-site basis with full customization controls.

## Features

- 🌐 **Per-Site Settings** - Enable dark mode only on sites you choose
- 🌙 **Dual Modes** - Choose between Dark Mode (with inversion) or Filter Mode (filters only)
- 🎨 **Full Control** - Adjust brightness, contrast, saturation, and hue rotation per site
- 🚀 **Performance Optimized** - Only active tabs for the current domain respond to changes
- 💾 **Synced Settings** - Settings saved per domain and synced across devices
- 🔄 **Per-Site Clear** - Remove settings for individual sites

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the extension folder
6. The extension icon will appear in your toolbar

## Usage

1. Navigate to any website
2. Click the extension icon - you'll see the current domain displayed
3. Choose your mode (mutually exclusive):
   - **Dark Mode**: Inverts colors + applies all filters (full dark mode effect)
   - **Filter Mode**: Applies filters only without color inversion
4. Adjust sliders to customize (enabled when either mode is on):
   - **Brightness**: 50-150%
   - **Contrast**: 50-150%
   - **Saturation**: 0-200%
   - **Hue Rotation**: 0-360°
5. Click "Reset Sliders" to restore default slider values
6. Click "Clear This Site" to remove settings for the current domain

## How It Works

### Per-Domain Storage
Settings are stored per domain:
```javascript
{
  "site:youtube.com": { enabled: true, brightness: 90, ... },
  "site:github.com": { enabled: true, brightness: 100, ... },
  "site:google.com": { enabled: false, ... }
}
```

### Two Modes

### Two Modes

**Dark Mode (Color Inversion)**
- Inverts all page colors for a true dark mode experience
- Counter-inverts images, videos, and media to preserve original appearance
- Perfect for making bright websites dark

**Filter Mode (No Inversion)**
- Applies only brightness, contrast, saturation, and hue adjustments
- No color inversion - preserves original colors
- Great for reducing brightness or adjusting color temperature

### Performance Optimizations

- **Per-domain storage listeners** - Only tabs matching the changed domain react
- **Settings hash cache** - Skips DOM updates when nothing actually changed
- **500ms debounce** - Prevents Chrome storage quota errors on rapid slider changes
- **Minimal storage reads** - Quick exit path when no settings exist for a domain
- **No background scripts** - Purely content script based for minimal overhead

With 500+ tabs open, only tabs on the specific domain you're configuring will respond to changes.

### CSS Filters
Uses CSS `filter` property for performance:
```css
/* Dark Mode */
filter: invert(1) hue-rotate(180deg) brightness() contrast() saturate();

/* Filter Mode */
filter: brightness() contrast() saturate() hue-rotate();
```

Images and videos are counter-inverted in Dark Mode to preserve original appearance.

## Technical Stack

- **Manifest V3** - Latest Chrome extension format
- **Chrome Storage Sync API** - Per-site settings synced across devices
- **Content Scripts** - Dynamic CSS injection per domain
- **Vanilla JavaScript** - No dependencies, pure JS implementation

## File Structure

```
├── manifest.json       # Extension configuration
├── popup.html          # UI interface with domain display
├── popup.css           # Popup styling
├── popup.js            # Per-site settings management
├── content.js          # Per-domain CSS filter injection
└── icons/              # Extension icons
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

**Note**: Settings are per-site. Enable dark mode on each site individually. Settings sync across your Chrome profile.
