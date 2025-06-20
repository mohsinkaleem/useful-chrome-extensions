#!/bin/bash

# TubeFilter Extension Validation Script
# This script checks if all required files are present and valid

echo "🎬 TubeFilter Extension Validation"
echo "=================================="
echo

# Check required files
REQUIRED_FILES=(
    "manifest.json"
    "popup.html"
    "popup.css"
    "popup.js"
    "content.js"
    "icons/icon16.png"
    "icons/icon32.png"
    "icons/icon48.png"
    "icons/icon128.png"
)

MISSING_FILES=()
PRESENT_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        PRESENT_FILES+=("$file")
        echo "✅ $file"
    else
        MISSING_FILES+=("$file")
        echo "❌ $file (MISSING)"
    fi
done

echo
echo "Summary:"
echo "--------"
echo "Present files: ${#PRESENT_FILES[@]}/${#REQUIRED_FILES[@]}"

if [ ${#MISSING_FILES[@]} -eq 0 ]; then
    echo "🎉 All required files are present!"
    echo
    echo "Next steps:"
    echo "1. Convert icons/icon.svg to proper PNG files (16x16, 32x32, 48x48, 128x128)"
    echo "2. Load the extension in Chrome (chrome://extensions/)"
    echo "3. Enable Developer mode and click 'Load unpacked'"
    echo "4. Select this folder"
    echo "5. Test on YouTube.com"
    echo
    echo "📖 Open installation-guide.html in your browser for detailed instructions"
else
    echo "⚠️  Missing files: ${MISSING_FILES[*]}"
    echo "Please ensure all required files are present before loading the extension."
fi

echo
echo "File sizes:"
echo "-----------"
for file in "${PRESENT_FILES[@]}"; do
    if [ -f "$file" ]; then
        size=$(wc -c < "$file" 2>/dev/null || echo "0")
        echo "$file: $size bytes"
    fi
done
