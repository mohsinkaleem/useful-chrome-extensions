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

### 🍪 [Cookie Manager](./cookie-reader/README.md)

A powerful yet simple Chrome extension to manage cookies, view global statistics, and export data.

**Features:**

- Manage current site data (cookies, storage)
- View global cookie usage statistics
- Export data to JSON
- Support for partitioned cookies (CHIPS)

**Status:** ✅ Complete

---

### 🌙 [DarkShift](./dark-reader/README.md)

A lightweight Chrome extension that applies dark mode on a per-site basis with full customization controls.

**Features:**

- Per-site dark mode settings
- Dual modes: Inversion or Filter only
- Customizable brightness, contrast, and saturation
- Smart image handling and performance optimization

**Status:** ✅ Complete

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

### 📑 [Advanced Tab Manager](./tab-manager/README.md)

A powerful, lightweight Chrome extension for managing tabs, windows, and browser sessions.

**Features:**

- Real-time search and filter tabs
- Multiple view modes (List, Compact, Grid)
- Quick actions (close, bookmark, group tabs)
- Automatic duplicate detection and grouping
- Session management and recovery
- Resource monitoring

**Status:** ✅ Complete

---

### 🎬 [TubeFilter](./tubefilter/README.md)

A simple and fast YouTube video filter extension to filter videos by various criteria.

**Features:**

- View count filtering (greater than, less than, range)
- Duration filtering (short, medium, long, custom)
- Upload time filtering (new!)
- Title keyword filtering with regex support
- Dynamic filtering with infinite scroll support
- Non-intrusive, clean interface

**Status:** ✅ Complete

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
├── cookie-reader/               # Cookie manager and analytics
├── dark-reader/                 # Per-site dark mode (DarkShift)
├── quick-links/                 # Quick links manager
├── tab-manager/                 # Advanced tab manager
└── tubefilter/                  # YouTube video filter (TubeFilter)
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
| Bookmark Insights | ✅ Complete | 1.0.0 | 2026 |
| Cookie Manager | ✅ Complete | 1.0.0 | 2026 |
| DarkShift | ✅ Complete | 1.0.0 | 2026 |
| Quick Links Manager | ✅ Complete | 1.0.0 | 2026 |
| TubeFilter | ✅ Complete | 1.0.0 | 2026 |
| Advanced Tab Manager | ✅ Complete | 1.0.0 | 2026 |

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