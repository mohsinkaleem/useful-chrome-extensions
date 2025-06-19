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
    echo ""
    echo "📋 Next steps:"
    echo "1. Open Chrome and go to chrome://extensions/"
    echo "2. Enable 'Developer mode' in the top right"
    echo "3. Click 'Load unpacked'"
    echo "4. Select this folder: $(pwd)"
    echo ""
    echo "🚀 Your extension is ready to test!"
else
    echo "❌ Build failed. Please check the errors above."
    exit 1
fi
