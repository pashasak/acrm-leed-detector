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
    }
  });

  console.log('[AmoCRM Auto-Accept] Default settings initialized');
});


