# Quick Links Manager - Chrome Extension

A beautiful and modern Chrome extension for storing and accessing your favorite links with ease. Organize your bookmarks with categories, search functionality, and a sleek interface.

## ✨ Features

- **Compact Interface**: Clean, minimal design optimized for efficiency
- **Quick Access**: Store and access your most-used links instantly
- **Category Organization**: Organize links into Work, Personal, Tools, and Social categories
- **Smart Search**: Find links quickly with real-time search
- **Fuzzy Search**: Matches close terms and common misspellings
- **Fast Keyboard Flow**: Press `Enter` in search to open the first match instantly
- **Auto-Fill**: Automatically fills current tab information when adding links
- **Favicon Display**: Visual link identification with website favicons
- **Context Menu**: Right-click a page or a link to add it to quick links
- **Local Storage**: All data stored locally for privacy and speed

## 🚀 Installation

### From Chrome Web Store (Coming Soon)
The extension will be available on the Chrome Web Store.

### Manual Installation (Developer Mode)
1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension folder
5. The Quick Links Manager icon will appear in your toolbar

## 🎯 Usage

### Adding Links
- Click the extension icon to open the popup
- Click the "+" button to add a new link
- Fill in the title, URL, category, and optional description
- The current tab's information will auto-fill when adding new links

### Managing Links
- **Edit**: Click the edit icon on any link to modify it
- **Delete**: Click the delete icon to remove a link
- **Open**: Click anywhere on a link to open it in a new tab

### Organization
- Use category tabs to filter links by type
- Search for links using the search bar at the top
- Press `Enter` in search to open the top filtered result
- Links are automatically sorted by most recently added

### Keyboard Shortcuts
- `Ctrl/Cmd + K`: Focus search bar
- `Ctrl/Cmd + Enter` (in Add/Edit form): Save and open immediately
- `Escape`: Close modal dialogs

## 🛠️ Technical Details

- **Manifest Version**: 3 (latest Chrome extension standard)
- **Permissions**: Storage, Active Tab
- **Storage**: Chrome local storage for fast access
- **Framework**: Vanilla JavaScript (no dependencies)
- **Styling**: Compact flat design optimized for efficiency

## 📁 Project Structure

```
├── manifest.json          # Extension manifest
├── popup.html             # Main popup interface
├── popup.js               # Main application logic
├── styles.css             # Styling and animations
├── background.js          # Service worker
├── icons/                 # Extension icons
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── README.md
```

## 🔧 Development

### Prerequisites
- Google Chrome browser
- Basic knowledge of HTML, CSS, and JavaScript

### Local Development
1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Quick Links Manager extension
4. Test your changes

### Building for Production
The extension is ready for production as-is. To package for Chrome Web Store:
1. Zip the entire directory (excluding .git and development files)
2. Upload to Chrome Web Store Developer Dashboard

## 🎨 Customization

### Themes
The extension uses CSS custom properties for easy theming. Main colors:

- Primary: `#6366f1` (indigo)
- Background: `#f5f5f5` (light gray)
- Borders: `#e5e5e5` (subtle gray)

Background gradients and hover states are derived from these

### Categories
To add new categories, update:
1. Category options in `popup.html`
2. Category filtering logic in `popup.js`
3. Category-specific styling in `styles.css`

## 🔒 Privacy

- All data is stored locally in Chrome's storage
- No external servers or analytics
- No data collection or tracking
- Complete privacy and security

## 📋 Changelog

### Version 1.0.0
- Initial release
- Basic link management functionality
- Category organization
- Search functionality
- Modern UI design

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - feel free to use and modify as needed.

## 🐛 Bug Reports

If you encounter any issues, please check the Chrome Developer Console for errors and report them with detailed steps to reproduce.

---

Made with ❤️ for productivity enthusiasts
