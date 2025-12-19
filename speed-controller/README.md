# Video Speed Controller

A Chrome browser extension that allows you to control video playback speed using keyboard shortcuts on YouTube and Netflix.

## Features

- 🎯 **Keyboard Shortcuts**: Control video speed without reaching for the mouse
- 🎬 **Multi-Platform**: Works on YouTube and Netflix
- ⚡ **Fast & Responsive**: Instant speed changes with visual feedback
- 🔧 **Customizable**: Adjust speed steps, limits, and notifications
- 💾 **Persistent Settings**: Your preferences are saved across sessions

## Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Increase Speed | `⌘ + Shift + .` | `Ctrl + Shift + .` |
| Decrease Speed | `⌘ + Shift + ,` | `Ctrl + Shift + ,` |
| Toggle Speed | `Alt + T` | `Alt + T` |

## Installation

### Option 1: Developer Mode (Recommended)

1. **Download or Clone** this repository to your computer
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** by toggling the switch in the top-right corner
4. **Click "Load unpacked"** and select the `speed-controller` folder
5. **Pin the extension** to your toolbar for easy access

### Option 2: Create Icons (Optional)

The extension includes an SVG icon that can be converted to PNG format:

```bash
# If you have imagemagick installed
convert -background transparent icons/icon.svg -resize 16x16 icons/icon16.png
convert -background transparent icons/icon.svg -resize 48x48 icons/icon48.png
convert -background transparent icons/icon.svg -resize 128x128 icons/icon128.png
```

Or use any online SVG to PNG converter to create the icon files.

## Usage

1. **Navigate** to YouTube or Netflix
2. **Start playing** a video
3. **Use keyboard shortcuts** to control playback speed:
   - Press `⌘/Ctrl + Shift + .` to increase speed
   - Press `⌘/Ctrl + Shift + ,` to decrease speed
   - Press `Alt + T` to toggle between 1x and your last used speed

## Settings

Click the extension icon in your toolbar to access settings:

- **Speed Step**: How much to increase/decrease speed (0.1x, 0.25x, or 0.5x)
- **Maximum Speed**: Upper limit for speed control (2x to 5x)
- **Minimum Speed**: Lower limit for speed control (0.1x to 0.5x)
- **Show Notifications**: Toggle speed change notifications on/off

## Supported Websites

- ✅ **YouTube** (youtube.com)
- ✅ **Netflix** (netflix.com)

*More platforms can be added by modifying the `manifest.json` file.*

## Technical Details

### File Structure

```
speed-controller/
├── manifest.json       # Extension configuration
├── background.js       # Service worker for commands
├── content.js          # Main logic for video control
├── popup.html          # Settings popup interface
├── popup.js            # Settings popup functionality
├── icons/              # Extension icons
│   ├── icon.svg        # Source SVG icon
│   ├── icon16.png      # 16x16 icon (toolbar)
│   ├── icon48.png      # 48x48 icon (extensions page)
│   └── icon128.png     # 128x128 icon (Chrome Web Store)
└── README.md           # This file
```

### How It Works

1. **Content Script**: Injected into YouTube and Netflix pages to detect and control video elements
2. **Background Script**: Handles keyboard command events and communicates with content scripts
3. **Popup Interface**: Provides settings management and status information
4. **Chrome Storage API**: Persists user settings across browser sessions

### Browser Compatibility

- **Chrome**: Full support (Manifest V3)
- **Edge**: Compatible with Chromium-based versions
- **Other Browsers**: May require manifest modifications

## Troubleshooting

### Extension Not Working
- Ensure you're on a supported website (YouTube or Netflix)
- Refresh the page after installing the extension
- Check that the extension is enabled in `chrome://extensions/`

### Keyboard Shortcuts Not Responding
- Make sure the video is loaded and visible
- Try clicking on the video first to ensure it's focused
- Check for conflicts with other extensions or browser shortcuts

### Settings Not Saving
- Ensure the extension has proper permissions
- Try reloading the extension in `chrome://extensions/`

## Development

### Adding New Websites

To add support for additional video platforms:

1. Add the website URL pattern to `manifest.json`:
```json
"matches": [
  "*://*.youtube.com/*",
  "*://*.netflix.com/*",
  "*://*.newsite.com/*"
]
```

2. Test the extension on the new platform
3. Update this README with the new supported site

### Customizing Keyboard Shortcuts

Modify the `commands` section in `manifest.json`:

```json
"commands": {
  "your_custom_command": {
    "suggested_key": {
      "default": "Ctrl+Shift+X",
      "mac": "Cmd+Shift+X"
    },
    "description": "Your custom action"
  }
}
```

Then handle the command in `background.js` and `content.js`.

## Contributing

1. Fork this repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on multiple platforms
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Privacy

This extension:
- ✅ Only operates on YouTube and Netflix
- ✅ Stores settings locally in your browser
- ✅ Does not collect or transmit any personal data
- ✅ Does not modify video content, only playback speed
- ✅ Does not access browsing history or other tabs

## Support

If you encounter any issues or have feature requests, please create an issue in this repository.
