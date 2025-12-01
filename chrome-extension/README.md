# Chrome Extension Boilerplate

A modern Chrome extension boilerplate using Manifest V3.

## Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── background/
│   └── background.js      # Service worker (background script)
├── content/
│   ├── content.js         # Content script (runs on web pages)
│   └── content.css        # Styles injected into web pages
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
├── options/
│   ├── options.html       # Options page UI
│   ├── options.css        # Options page styles
│   └── options.js         # Options page logic
└── icons/
    ├── icon16.png         # 16x16 icon
    ├── icon32.png         # 32x32 icon
    ├── icon48.png         # 48x48 icon
    └── icon128.png        # 128x128 icon
```

## Installation

1. **Add icons**: Create PNG icons in the `icons/` folder (16x16, 32x32, 48x48, 128x128)

2. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

3. **Start developing**: Make changes and click the refresh button in `chrome://extensions/` to reload

## Features

- **Manifest V3**: Uses the latest Chrome extension manifest version
- **Background Service Worker**: Handles events and background tasks
- **Content Scripts**: Inject scripts and styles into web pages
- **Popup**: Quick access UI when clicking the extension icon
- **Options Page**: Configurable settings with storage
- **Chrome Storage API**: Persist data across sessions

## Customization

### Permissions

Edit `manifest.json` to add more permissions as needed:

```json
"permissions": [
  "storage",
  "activeTab",
  "tabs",
  "contextMenus",
  "notifications"
]
```

### Content Script Matching

Modify the `matches` pattern in `manifest.json`:

```json
"content_scripts": [
  {
    "matches": ["https://*.example.com/*"],
    "js": ["content/content.js"]
  }
]
```

## Development Tips

- Use `console.log()` for debugging (check DevTools console)
- Background script logs appear in the extension's service worker console
- Content script logs appear in the web page's console
- Use `chrome.storage.local` for persistent data
- Test thoroughly on different websites

## Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome APIs Reference](https://developer.chrome.com/docs/extensions/reference/)
