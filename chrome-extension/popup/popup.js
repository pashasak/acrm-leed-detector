document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const actionBtn = document.getElementById('actionBtn');

  // Load saved state from storage
  chrome.storage.local.get(['isEnabled'], (result) => {
    const isEnabled = result.isEnabled ?? true;
    updateStatus(isEnabled);
  });

  // Handle button click
  actionBtn.addEventListener('click', async () => {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send a message to the content script
    chrome.tabs.sendMessage(tab.id, { action: 'performAction' }, (response) => {
      if (response?.success) {
        statusEl.textContent = 'Action completed!';
      }
    });

    // Or send a message to the background script
    chrome.runtime.sendMessage({ action: 'backgroundAction' }, (response) => {
      console.log('Background response:', response);
    });
  });

  function updateStatus(isEnabled) {
    statusEl.textContent = isEnabled ? 'Extension is active' : 'Extension is disabled';
  }
});
