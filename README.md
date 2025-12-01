# AmoCRM Bid Processor

A Chrome extension that automatically detects and accepts new lead notifications in AmoCRM with human-like behavior.

## Features

- **Automatic Lead Detection**: Monitors AmoCRM for new lead notifications in real-time using MutationObserver
- **Human-like Click Simulation**: Simulates natural human behavior when accepting leads:
  - Randomized delays (configurable 1-3 seconds)
  - Random click positions within buttons
  - Realistic event sequences (mouseenter → mouseover → mousedown → mouseup → click)
- **Configurable Delays**: Choose from preset speeds or set custom min/max delays
  - Fast: 0.5-1 seconds
  - Normal: 1-3 seconds
  - Slow: 2-5 seconds
- **Statistics Tracking**: Track total accepted leads and last acceptance time
- **Sound Notifications**: Optional audio feedback when leads are accepted
- **Easy Toggle**: Enable/disable auto-accept with one click

## Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── background/
│   └── background.js      # Service worker (initializes default settings)
├── content/
│   ├── content.js         # Content script (detects leads and auto-accepts)
│   └── content.css        # Styles injected into web pages
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic and settings management
└── icons/
    ├── icon16.png         # 16x16 icon
    ├── icon32.png         # 32x32 icon
    ├── icon48.png         # 48x48 icon
    └── icon128.png        # 128x128 icon
```

## Installation

1. **Clone or download** this repository

2. **Add icons** (if not already present): Create PNG icons in the `icons/` folder (16x16, 32x32, 48x48, 128x128)

3. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

4. **Configure settings**: Click the extension icon to open the popup and configure auto-accept settings

## Usage

1. **Enable Auto-Accept**: Open the extension popup and toggle "Auto-Accept" on
2. **Configure Delays**: Choose a preset (Fast, Normal, Slow) or set custom min/max delays
3. **Optional Sound**: Toggle sound notifications on/off
4. **Monitor Statistics**: View total accepted leads and last acceptance time in the popup

The extension will automatically detect and accept new lead notifications on AmoCRM pages.

## How It Works

### Phase 1: Detection System
- Uses MutationObserver to detect DOM changes
- Identifies lead cards by class attributes (`gnzs_catch_lead--card`)
- Validates lead cards by checking for "Новая заявка" title
- Prevents duplicate processing using lead ID tracking

### Phase 2: Human-like Acceptance
- Calculates random delay within configured range
- Simulates natural click behavior:
  - Random position within button (30-70% range)
  - Realistic mouse event sequence with micro-delays
  - Validates element visibility before clicking
- Updates statistics and plays sound (if enabled)

## Settings

All settings are stored locally using Chrome Storage API:

- **enabled**: Auto-accept on/off toggle
- **minDelay**: Minimum delay before accepting (milliseconds)
- **maxDelay**: Maximum delay before accepting (milliseconds)
- **playSound**: Enable/disable sound notifications
- **stats**: Statistics tracking (totalAccepted, lastAccepted)

## Development

### Debugging
- Content script logs: Open DevTools console on AmoCRM pages
- Background script logs: Go to `chrome://extensions/` → Click "service worker"
- Use `[AmoCRM Auto-Accept]` prefix to filter logs

### Testing
1. Load the extension in Chrome (see Installation)
2. Navigate to AmoCRM
3. Enable auto-accept in the popup
4. Trigger a test lead notification
5. Check console logs for detection and acceptance events

### Customization

To modify lead detection selectors, edit `content.js`:

```javascript
// Modify these selectors based on AmoCRM's HTML structure
const leadCards = node.querySelectorAll?.('[class*="gnzs_catch_lead--card"]');
const acceptButton = card.querySelector('[data-content="Принять"]');
```

## Permissions

- `storage`: Save settings and statistics
- `activeTab`: Access to current tab for content script injection

## Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [MutationObserver API](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
