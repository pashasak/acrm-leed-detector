// Background Service Worker

// Called when the extension is installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[AmoCRM Auto-Accept] Extension installed:', details.reason);
  
  // Initialize default settings
  chrome.storage.local.set({
    isEnabled: true,
    autoAccept: {
      enabled: true,           // Enabled by default
      minDelay: 1000,          // 1 second minimum
      maxDelay: 3000,          // 3 seconds maximum
      playSound: false,
      stats: {
        totalAccepted: 0,
        lastAccepted: null
      }
    }
  });

  console.log('[AmoCRM Auto-Accept] Default settings initialized');
});

// Listen for messages from popup to relay to content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    // Broadcast settings update to all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'settingsUpdated', 
            settings: message.settings 
          }).catch(() => {
            // Ignore errors for tabs where content script isn't loaded
          });
        }
      });
    });
    sendResponse({ success: true });
  }
  return true;
});


