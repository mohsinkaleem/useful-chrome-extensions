#!/bin/bash

# Build script for Bookmark Insight Chrome Extension

echo "🔨 Building Bookmark Insight Chrome Extension..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the project
echo "🏗️  Building project..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
    
    # Clean up old sourcemaps if they exist
    rm -f public/*.map background.js.map 2>/dev/null
    
    # Calculate production size (excluding node_modules, .git, etc.)
    PROD_SIZE=$(du -sh . --exclude=node_modules --exclude=.git --exclude=src 2>/dev/null || du -sh . 2>/dev/null | head -1)
    echo ""
    echo "📊 Production size estimation:"
    echo "   Public folder: $(du -sh public 2>/dev/null | cut -f1)"
    echo "   Background.js: $(du -sh background.js 2>/dev/null | cut -f1)"
    echo ""
    echo "📋 Next steps:"
    echo "1. Open Chrome and go to chrome://extensions/"
    echo "2. Enable 'Developer mode' in the top right"
    echo "3. Click 'Load unpacked'"
    echo "4. Select this folder: $(pwd)"
    echo ""
    echo "⚠️  Note: Chrome loads the ENTIRE folder including node_modules."
    echo "   For production, create a dist folder or zip only required files."
    echo ""
    echo "🚀 Your extension is ready to test!"
else
    echo "❌ Build failed. Please check the errors above."
    exit 1
fi
