# Netflix Speed Controller

A Chrome browser extension that allows you to control Netflix video playback speed using keyboard shortcuts.

## Features

- 🎯 **Keyboard Shortcuts**: Control video speed without reaching for the mouse
- 🎬 **Netflix Optimized**: Built specifically for Netflix's video player
- ⚡ **Fast & Responsive**: Instant speed changes with Netflix-styled visual feedback
- 🔧 **Customizable**: Adjust speed steps, limits, and notifications
- 💾 **Persistent Settings**: Your preferences are saved across sessions
- 🔄 **Smart Speed Memory**: Toggle feature remembers your preferred speed

## Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Increase Speed | `⌘ + Shift + .` | `Ctrl + Shift + .` |
| Decrease Speed | `⌘ + Shift + ,` | `Ctrl + Shift + ,` |
| Toggle Speed | `Alt + T` | `Alt + T` |

> **Tip**: The toggle shortcut switches between 1x and your last used speed, perfect for quickly checking something at normal speed.

## Installation

### Developer Mode Installation

1. **Download or Clone** this repository to your computer
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** by toggling the switch in the top-right corner
4. **Click "Load unpacked"** and select the `speed-controller` folder
5. **Pin the extension** to your toolbar for easy access

### Verify Installation

1. Navigate to [Netflix](https://www.netflix.com)
2. Start playing any video
3. Press `⌘/Ctrl + Shift + .` to increase speed
4. You should see a speed notification overlay

## Usage

1. **Navigate** to Netflix and start playing a video
2. **Use keyboard shortcuts** to control playback speed:
   - Press `⌘/Ctrl + Shift + .` to increase speed (e.g., 1.0x → 1.25x → 1.5x)
   - Press `⌘/Ctrl + Shift + ,` to decrease speed (e.g., 1.5x → 1.25x → 1.0x)
   - Press `Alt + T` to toggle between 1x and your last used speed

## Settings

Click the extension icon in your toolbar to access settings:

| Setting | Description | Options |
|---------|-------------|---------|
| **Speed Step** | How much to change speed per keystroke | 0.1x, 0.25x, 0.5x |
| **Maximum Speed** | Upper limit for speed control | 2x, 3x, 4x, 5x |
| **Minimum Speed** | Lower limit for speed control | 0.1x, 0.25x, 0.5x |
| **Show Notifications** | Toggle speed change overlay on/off | On/Off |

## Technical Details

### File Structure

```
speed-controller/
├── manifest.json       # Extension configuration (Manifest V3)
├── background.js       # Service worker for keyboard commands
├── content.js          # Netflix-specific video control logic
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

1. **Content Script**: Injected into Netflix pages to detect and control video elements
2. **Background Script**: Handles keyboard command events and badge updates
3. **Popup Interface**: Provides settings management and status information
4. **Chrome Storage API**: Persists user settings and last used speed

### Netflix-Specific Features

- Handles Netflix's dynamic video player loading
- Prevents Netflix from resetting playback speed
- Works with episode auto-play transitions
- Applies speed to all video elements on the page

### Browser Compatibility

- **Chrome 88+**: Full support (Manifest V3)
- **Edge 88+**: Compatible with Chromium-based versions
- **Brave**: Compatible

## Troubleshooting

### Extension Not Working

1. Ensure you're on **netflix.com** (not a VPN-blocked region)
2. **Refresh the page** after installing the extension
3. Check that the extension is **enabled** in `chrome://extensions/`
4. Try **reloading the extension** (click the refresh icon)

### Keyboard Shortcuts Not Responding

1. Make sure a **video is playing or loaded**
2. Try **clicking on the video** first to ensure focus
3. Check for **conflicts** with other extensions:
   - Go to `chrome://extensions/shortcuts`
   - Look for conflicting key bindings
4. Try using the extension popup to verify the extension is working

### Speed Resets When Changing Episodes

This is expected behavior as Netflix loads a new video element. Simply use the toggle shortcut (`Alt + T`) to quickly restore your preferred speed.

### Settings Not Saving

1. Ensure the extension has proper **permissions**
2. Try **reloading the extension** in `chrome://extensions/`
3. Check browser storage is not full or restricted

## Privacy

This extension:
- ✅ Only operates on netflix.com
- ✅ Stores settings locally in your browser
- ✅ Does not collect or transmit any personal data
- ✅ Does not modify video content, only playback speed
- ✅ Does not access browsing history or other tabs
- ✅ Has no external network requests

## Changelog

### v2.0.0 (Current)
- 🎯 Focused exclusively on Netflix support
- 🔧 Improved Netflix video player handling
- 🎨 Netflix-styled speed notifications
- 💾 Remember last used speed for toggle feature
- 🐛 Fixed speed reset issues on episode changes
- ⚡ Better performance with smarter video detection

### v1.0.0
- Initial release with YouTube and Netflix support

## License

This project is open source and available under the MIT License.

## Support

If you encounter any issues or have feature requests, please create an issue in this repository.
