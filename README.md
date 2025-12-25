# Browser Extensions Collection

A collection of Chrome browser extensions built for personal use, heavily assisted by LLM. Each extension is designed to enhance productivity and improve the browsing experience.

## 📁 Extensions Overview

### 🔖 [Bookmark Insights](./bookmark-insights/README.md)

A powerful bookmark manager with smart search, insights, and maintenance tools.

**Features:**

- Smart bookmark search with advanced filters
- Visual analytics and insights (domain analysis, temporal patterns)
- Health monitoring (duplicate detection, orphan finder)
- Rich bookmark cards with favicons and metadata
- Full dashboard with comprehensive bookmark management

**Status:** ✅ Complete (Phases 1-3 implemented)

---

### 🔗 [Quick Links Manager](./quick-links/README.md)

A beautiful and modern extension for storing and accessing your favorite links with ease.

**Features:**

- Compact, efficient interface
- Category organization (Work, Personal, Tools, Social)
- Smart search functionality
- Auto-fill current tab information
- Context menu integration
- Local storage for privacy

**Status:** ✅ Complete (v1.0.0)

---

### 🎬 [TubeFilter](./tubefilter/README.md)

A simple and fast YouTube video filter extension to filter videos by various criteria.

**Features:**

- View count filtering (greater than, less than, range)
- Duration filtering (short, medium, long, custom)
- Title keyword filtering
- Dynamic filtering with infinite scroll support
- Non-intrusive, clean interface

**Status:** ✅ Complete

---

### ⚡ [Video Speed Controller](./speed-controller/README.md)

A Chrome extension that allows you to control video playback speed using keyboard shortcuts on YouTube and Netflix.

**Features:**

- Keyboard shortcuts for speed control
- Multi-platform support (YouTube, Netflix)
- Fast & responsive with visual feedback
- Customizable speed steps and limits
- Persistent settings across sessions

**Status:** ✅ Complete

---

### 📑 [Advanced Tab Manager](./tab-manager/README.md)

A powerful, lightweight Chrome extension for managing tabs, windows, and browser sessions.

**Features:**

- Real-time search and filter tabs
- Multiple view modes (List, Compact, Grid)
- Quick actions (close, bookmark, group tabs)
- Automatic duplicate detection
- Session management and recovery
- Resource monitoring

**Status:** ✅ Complete

---

### 🤖 [Google AI Studio Enhancer](./google-aistudio/README.md)

Enhances the Google AI Studio interface with additional features and improvements.

**Features:**

- Interface enhancements for Google AI Studio
- Custom styling and layout improvements

**Status:** 🔄 In Development

---

## 🛠️ Development

### Common Technologies Used

- **Manifest Version:** 3 (latest Chrome extension standard)
- **Storage:** Chrome Storage API / Local Storage
- **UI Frameworks:** Vanilla JavaScript, Svelte (bookmark-insights)
- **Build Tools:** Rollup (where applicable)
- **Styling:** Tailwind CSS, custom CSS

### Installation for Development

Each extension can be loaded individually:

1. Clone this repository
2. Navigate to the specific extension folder
3. Follow the individual README instructions for setup
4. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension folder

### Project Structure

```text
extensions/
├── README.md                    # This file
├── bookmark-insights/           # Bookmark manager with insights
├── quick-links/                 # Quick links manager
├── tubefilter/                  # YouTube video filter
├── speed-controller/            # Video speed controller
├── tab-manager/                 # Advanced tab manager
└── google-aistudio/             # Google AI Studio enhancer
```

## 🔒 Privacy & Security

All extensions in this collection:

- ✅ Work locally with minimal permissions
- ✅ Store data locally or in Chrome sync storage
- ✅ Do not send data to external servers
- ✅ Respect user privacy and security
- ✅ Are open source and transparent

## 📊 Extension Status

| Extension | Status | Version | Last Updated |
|-----------|--------|---------|--------------|
| Bookmark Insights | ✅ Complete | 1.0.0 | 2025 |
| Quick Links Manager | ✅ Complete | 1.0.0 | 2025 |
| TubeFilter | ✅ Complete | 1.0.0 | 2025 |
| Video Speed Controller | ✅ Complete | 1.0.0 | 2025 |
| Advanced Tab Manager | ✅ Complete | 1.0.0 | 2025 |
| Google AI Studio | 🔄 Development | 0.1.0 | 2025 |

## 🚀 Future Plans

- Package extensions for Chrome Web Store distribution
- Add more productivity-focused extensions
- Implement cross-extension data sharing where beneficial
- Add automated testing and CI/CD pipeline

## 🤝 Contributing

These extensions are built for personal use but contributions are welcome:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see individual extension folders for specific details.

## 🐛 Support

For issues with specific extensions, please refer to their individual README files for troubleshooting guides and support information.

---

Built with ❤️ and AI assistance for enhanced productivity