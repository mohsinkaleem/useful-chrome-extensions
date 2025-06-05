<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Quick Links Manager Chrome Extension

This is a Chrome extension project for storing and accessing quick links with a modern, user-friendly interface.

## Project Structure
- `manifest.json` - Chrome extension manifest (Manifest V3)
- `popup.html` - Main popup interface
- `popup.js` - Main popup logic and link management
- `styles.css` - Modern CSS styling with gradients and animations
- `background.js` - Service worker for extension functionality
- `icons/` - Extension icons in multiple sizes

## Key Features
- Modern, responsive popup interface with gradient design
- Local storage for persisting quick links
- Category-based organization (Work, Personal, Tools, Social)
- Search functionality for quick access
- Add, edit, and delete links with modal interface
- Auto-fill current tab information when adding links
- Favicon display for visual link identification
- Context menu integration for easy link addition

## Development Guidelines
- Use Manifest V3 for Chrome extension development
- Follow modern JavaScript practices (ES6+, async/await)
- Maintain clean, semantic HTML structure
- Use CSS Grid/Flexbox for layouts
- Implement proper error handling for chrome APIs
- Ensure responsive design for various popup sizes
- Use proper event delegation and cleanup

## Chrome APIs Used
- `chrome.storage.local` - For storing quick links data
- `chrome.tabs` - For current tab information and opening links
- `chrome.contextMenus` - For right-click context menu
- `chrome.action` - For popup interface

## Styling
- Uses a purple gradient theme (#667eea to #764ba2)
- Modern glassmorphism and smooth transitions
- Icon-based UI with SVG icons
- Category-specific color coding
- Responsive design with mobile-friendly interactions
