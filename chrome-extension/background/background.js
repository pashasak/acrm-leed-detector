// Background Service Worker

// Called when the extension is installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[AmoCRM Auto-Accept] Extension installed:', details.reason);
  
  // Initialize default settings
  chrome.storage.local.set({
    isEnabled: true,
    autoAccept: {
      enabled: false,          // Disabled by default for safety
      minDelay: 1000,          // 1 second minimum
      maxDelay: 3000,          // 3 seconds maximum
      playSound: false,
      stats: {
        totalAccepted: 0,
        lastAccepted: null
      }
    },
    settings: {
      option1: true,
      option2: false
    }
  });

  console.log('[AmoCRM Auto-Accept] Default settings initialized');
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message, 'from:', sender);

  switch (message.action) {
    case 'backgroundAction':
      // Perform background task
      handleBackgroundAction()
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // Keep the message channel open for async response

    case 'getData':
      chrome.storage.local.get(['settings'], (result) => {
        sendResponse({ success: true, data: result.settings });
      });
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log('Tab updated:', tab.url);
  }
});

async function handleBackgroundAction() {
  // Implement your background logic here
  return { message: 'Background action completed' };
}
