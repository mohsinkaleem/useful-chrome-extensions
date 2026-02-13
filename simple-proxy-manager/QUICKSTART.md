# Quick Start Guide

## Install in Firefox (2 minutes)

1. **Open Firefox Developer Tools**
   - Type `about:debugging` in the address bar
   - Click "This Firefox" on the left

2. **Load the Extension**
   - Click "Load Temporary Add-on..."
   - Navigate to this folder
   - Select `manifest.json`
   - ✅ Extension loaded!

3. **Add Your First Proxy**
   - Click the extension icon in toolbar (purple network icon)
   - Click the ⚙️ gear icon
   - Fill in:
     * Profile Name: `My Proxy`
     * Type: `HTTP` (or SOCKS4/SOCKS5)
     * Host: `proxy.example.com`
     * Port: `8080`
   - Click "Add Profile"

4. **Start Using**
   - Click extension icon
   - Click on your profile to activate
   - Click "Direct Connection" to disable

## Example Configurations

### Corporate HTTP Proxy
```
Name: Office Network
Type: HTTP
Host: proxy.company.com
Port: 8080
Username: (if required)
Password: (if required)
```

### SOCKS5 Proxy
```
Name: SOCKS Proxy
Type: SOCKS5
Host: 127.0.0.1
Port: 1080
```

### SSH Tunnel (SOCKS)
```
# First, create SSH tunnel:
ssh -D 1080 user@server.com

# Then add profile:
Name: SSH Tunnel
Type: SOCKS5
Host: 127.0.0.1
Port: 1080
```

## Tips

- 🔵 Blue dot badge = Proxy active
- 🟢 No badge = Direct connection
- Switch profiles instantly with one click
- Edit profiles by clicking ✏️ in settings
- All settings stored locally
- The extension works **independently** of Firefox's built-in proxy settings page — switching profiles here won't change `Settings → Network Settings`, and vice versa

## Keyboard Shortcut (Optional)

Add a keyboard shortcut in Firefox:
1. Go to `about:addons`
2. Click ⚙️ → Manage Extension Shortcuts
3. Set shortcut for "Simple Proxy Manager"

---

**Need help?** Check the full [README.md](README.md)
