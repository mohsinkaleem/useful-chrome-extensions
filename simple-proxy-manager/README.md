# Simple Proxy Manager

A lightweight Firefox extension for quickly switching and managing proxy profiles.

## Features

✨ **Simple & Effective**
- Quick proxy profile switching with one click
- Support for HTTP, SOCKS4, and SOCKS5 proxies
- Optional username/password authentication
- Visual status indicator showing active proxy
- Direct connection mode

🎯 **User-Friendly**
- Clean, modern interface
- Easy profile management (add, edit, delete)
- Popup for quick switching
- Dedicated options page for managing profiles
- Persistent storage of profiles and active state

## Installation

### Load in Firefox (Development Mode)

1. Open Firefox and navigate to `about:debugging`
2. Click on "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on..."
4. Navigate to the extension folder and select the `manifest.json` file
5. The extension icon should appear in your toolbar

### Permanent Installation

To create a permanent installation:

1. Package the extension:
   ```bash
   cd simple-proxy-manager
   zip -r ../simple-proxy-manager.xpi *
   ```

2. Sign the extension at [addons.mozilla.org](https://addons.mozilla.org/developers/)
3. Install the signed `.xpi` file in Firefox

## Usage

### Quick Start

1. **Add a Proxy Profile**
   - Click the extension icon in the toolbar
   - Click the ⚙️ settings button
   - Fill in the proxy details (name, host, port, type)
   - Click "Add Profile"

2. **Switch Proxy**
   - Click the extension icon
   - Select a profile from the list
   - The proxy is activated immediately

3. **Disable Proxy**
   - Click the extension icon
   - Click "Direct Connection"

### Proxy Types Supported

- **HTTP**: Standard HTTP proxy
- **SOCKS4**: SOCKS version 4 proxy
- **SOCKS5**: SOCKS version 5 proxy (supports authentication)

### Authentication

If your proxy requires authentication:
1. Add a profile as normal
2. Fill in the "Username" and "Password" fields
3. These credentials are stored locally in Firefox

## File Structure

```
simple-proxy-manager/
├── manifest.json          # Extension manifest (Manifest V2)
├── background.js          # Background script (proxy.onRequest listener)
├── popup.html            # Quick switcher popup UI
├── popup.js              # Popup logic
├── popup.css             # Popup styles
├── options.html          # Profile management page
├── options.js            # Options page logic
├── options.css           # Options page styles
├── icons/                # Extension icons
│   ├── icon-48.png
│   └── icon-96.png
└── README.md             # This file
```

## How It Works

This extension uses the **`browser.proxy.onRequest`** API to intercept each network request and route it through the selected proxy profile. This is the Mozilla-recommended approach for Firefox extensions because:

- **Independent of Firefox settings** — Switching profiles in the extension does not modify Firefox's built-in `Settings → Network Settings → Connection Settings` page, and changes made there won't override the extension
- **No private browsing permission required** — Unlike `browser.proxy.settings.set()`, the `onRequest` approach works without needing access to private browsing windows
- **Per-request control** — The extension evaluates each request against the active profile and bypass list, giving fine-grained routing control

When "System Proxy" is selected, the extension returns `null` from the listener, which tells Firefox to fall back to its own native proxy settings. When "No Proxy (Direct)" is selected, it returns `{ type: 'direct' }` to bypass all proxies.

Proxy authentication is handled via `browser.webRequest.onAuthRequired`, which only responds to proxy auth challenges (`isProxy: true`), not website authentication prompts.

## Why Manifest V2?

This extension uses Manifest V2 because:
- Firefox still fully supports Manifest V2
- Firefox's Manifest V2 proxy API (`browser.proxy.onRequest`) provides per-request proxy control
- Direct, fine-grained control over proxy routing
- Better suited for proxy management than Manifest V3's declarativeNetRequest

## Privacy

- All proxy profiles are stored locally in Firefox's storage
- No data is sent to external servers
- Credentials are stored securely in Firefox's local storage
- The extension does **not** modify Firefox's global proxy settings page
- The extension only requests necessary permissions:
  - `proxy`: To intercept requests via `proxy.onRequest`
  - `webRequest` / `webRequestBlocking`: To handle proxy authentication
  - `storage`: To save proxy profiles
  - `<all_urls>`: Required by Firefox's proxy and webRequest APIs

## Development

To modify the extension:

1. Edit the files in the extension directory
2. Reload the extension in `about:debugging`
3. Test your changes

## Troubleshooting

**Extension not working?**
- Make sure you're using Firefox (not Chrome/Edge)
- Check that the proxy settings are correct
- Verify the proxy server is accessible
- Check Firefox's Browser Console (Ctrl+Shift+J) for errors
- Look for `Proxy error:` messages in the console — these come from `proxy.onError`

**Proxy not changing when I switch profiles?**
- Reload the extension in `about:debugging` and try again
- Ensure the background script is running (check `about:debugging` → Inspect)
- Note: This extension does **not** change Firefox's `Settings → Network Settings` page — it works independently via request interception

**Can't connect to internet?**
- Click "Direct Connection" or "System Proxy" to disable the extension's proxy
- Verify proxy credentials if authentication is required
- Check if the proxy server is online

## License

MIT License - Feel free to use and modify as needed.

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.
