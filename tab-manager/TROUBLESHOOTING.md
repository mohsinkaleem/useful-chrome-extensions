# Resource Monitor Guide

## 📊 How It Works

The Resource Monitor uses **intelligent estimation** to predict memory usage for each tab based on:

### Estimation Factors:
1. **Tab State**
   - Discarded/hibernated tabs: ~5 MB
   - Chrome internal pages: ~20 MB
   - Active regular tabs: ~60 MB base

2. **Media & Interaction**
   - Audible tabs: +40 MB
   - Pinned tabs: +10 MB

3. **Website-Specific Heuristics**
   - YouTube (playing): +100 MB
   - YouTube (idle): +60 MB
   - Gmail: +80 MB
   - Google Docs: +70 MB
   - Google Sheets: +90 MB
   - Google Meet/Zoom: +150 MB
   - Figma: +120 MB
   - Slack: +90 MB
   - GitHub: +50 MB
   - Social media (Twitter, Facebook, Reddit): +65-85 MB

4. **Tab Age**
   - Tabs open > 1 hour: +15 MB (memory accumulation)

### Why Estimation?

Chrome removed the `chrome.processes` API that provided real memory data. This intelligent estimation provides useful insights for:
- Identifying likely heavy tabs
- Comparing relative memory usage
- Making decisions about which tabs to hibernate

## 🎯 Accuracy

The estimates are based on:
- Real-world Chrome memory usage patterns
- Community data on typical website consumption
- Conservative estimates with ±10% variance for realism

While not exact, they're reliable enough to identify memory-hungry tabs and optimize your browsing.

## ✅ What You'll See

- **Total Memory**: Sum of all tab estimates
- **Top Consumers**: 5 tabs with highest estimated usage
- **Memory Bars**: Visual color-coded indicators
  - 🟢 Green: < 100 MB (low)
  - 🟠 Orange: 100-300 MB (medium)
  - 🔴 Red: 300-500 MB (high)
  - 🔴 Dark Red: > 500 MB (critical)
- **Badge**: Shows "Est." to indicate estimation mode

## 💡 Tips for Best Results

1. **Hibernate tabs you're not using** - Reduces actual memory consumption
2. **Close duplicate tabs** - Each duplicate adds to total memory
3. **Watch for media tabs** - Playing media uses significantly more memory
4. **Check "Top Consumers"** - Focus on hibernating the heaviest tabs first
5. **Monitor over time** - Tab memory grows with use; consider refreshing long-running tabs

## 🔧 Customization

Want to adjust the estimation algorithm?
- Edit [src/popup/components/ResourceMonitor.ts](src/popup/components/ResourceMonitor.ts)
- Find the `estimateTabMemory()` function
- Adjust the base values or add new URL patterns
