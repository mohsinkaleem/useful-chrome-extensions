#!/bin/bash

# Video Speed Controller Extension Setup Script

echo "🎬 Video Speed Controller Extension Setup"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "manifest.json" ]; then
    echo "❌ Error: Please run this script from the extension directory"
    echo "   Make sure you're in the 'speed-controller' folder"
    exit 1
fi

echo "✅ Found extension files"

# Check for Chrome/Chromium
CHROME_FOUND=false
if command -v google-chrome >/dev/null 2>&1; then
    CHROME_FOUND=true
    CHROME_CMD="google-chrome"
elif command -v chromium >/dev/null 2>&1; then
    CHROME_FOUND=true
    CHROME_CMD="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
    CHROME_FOUND=true
    CHROME_CMD="chromium-browser"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    if [ -d "/Applications/Google Chrome.app" ]; then
        CHROME_FOUND=true
        CHROME_CMD="open -a 'Google Chrome'"
    fi
fi

if [ "$CHROME_FOUND" = true ]; then
    echo "✅ Found Chrome/Chromium browser"
else
    echo "⚠️  Chrome/Chromium not found in PATH"
fi

# Create icons if imagemagick is available
echo ""
echo "📸 Checking for icon creation tools..."
if command -v convert >/dev/null 2>&1; then
    echo "✅ ImageMagick found - creating icons..."
    cd icons
    
    # Create a simple green circle with play button
    convert -size 128x128 xc:transparent \
        -fill "#4CAF50" -draw "circle 64,64 64,10" \
        -fill white -draw "polygon 45,35 45,93 85,64" \
        icon128.png
    
    convert icon128.png -resize 48x48 icon48.png
    convert icon128.png -resize 16x16 icon16.png
    
    cd ..
    echo "✅ Created PNG icons from SVG"
else
    echo "⚠️  ImageMagick not found - using placeholder icons"
    echo "   You can manually create PNG icons or install ImageMagick"
fi

echo ""
echo "🚀 Installation Instructions:"
echo "=============================="
echo "1. Open Chrome and go to: chrome://extensions/"
echo "2. Enable 'Developer mode' (toggle in top-right)"
echo "3. Click 'Load unpacked' button"
echo "4. Select this folder: $(pwd)"
echo "5. Pin the extension to your toolbar"
echo ""
echo "🎯 Usage:"
echo "========="
echo "• Go to YouTube or Netflix"
echo "• Use keyboard shortcuts to control video speed:"
echo "  - ⌘/Ctrl + Shift + Period: Increase speed"
echo "  - ⌘/Ctrl + Shift + Comma:  Decrease speed" 
echo "  - Alt + R:                  Reset to 1x"
echo "  - Alt + T:                  Toggle speed"
echo ""

if [ "$CHROME_FOUND" = true ]; then
    echo "🌐 Would you like to open Chrome extensions page now? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            open -a "Google Chrome" "chrome://extensions/"
        else
            $CHROME_CMD "chrome://extensions/" >/dev/null 2>&1 &
        fi
        echo "✅ Opened Chrome extensions page"
    fi
fi

echo ""
echo "🎉 Setup complete! Enjoy controlling video speeds with keyboard shortcuts!"
