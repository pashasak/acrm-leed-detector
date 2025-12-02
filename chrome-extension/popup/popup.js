document.addEventListener('DOMContentLoaded', () => {
  // Initialize popup UI elements
  const autoAcceptToggle = document.getElementById('autoAcceptToggle');
  const soundToggle = document.getElementById('soundToggle');
  const minDelayInput = document.getElementById('minDelayInput');
  const maxDelayInput = document.getElementById('maxDelayInput');
  const statusValue = document.getElementById('statusValue');
  const statusIndicator = document.getElementById('statusIndicator');
  const resetBtn = document.getElementById('resetBtn');
  const totalAcceptedEl = document.getElementById('totalAccepted');
  const lastAcceptedEl = document.getElementById('lastAccepted');

  // Load settings from Chrome storage
  loadSettings();

  // Event listeners
  autoAcceptToggle.addEventListener('change', () => saveSettings());
  soundToggle.addEventListener('change', () => saveSettings());
  minDelayInput.addEventListener('change', () => saveSettings());
  maxDelayInput.addEventListener('change', () => saveSettings());
  resetBtn.addEventListener('click', resetStatistics);

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  /**
   * Load settings from Chrome storage and update UI
   */
  function loadSettings() {
    chrome.storage.local.get(['autoAccept'], (result) => {
      const settings = result.autoAccept || getDefaultSettings();

      // Update toggles
      autoAcceptToggle.checked = settings.enabled ?? true;
      soundToggle.checked = settings.playSound ?? false;

      // Update delay inputs
      minDelayInput.value = settings.minDelay ?? 1000;
      maxDelayInput.value = settings.maxDelay ?? 3000;

      // Update status display
      updateStatusDisplay(settings.enabled ?? true);

      // Load statistics
      loadStatistics(settings);
    });
  }

  /**
   * Save settings to Chrome storage
   */
  function saveSettings() {
    const minDelay = parseInt(minDelayInput.value) || 1000;
    const maxDelay = parseInt(maxDelayInput.value) || 3000;

    // Ensure min <= max
    if (minDelay > maxDelay) {
      minDelayInput.value = maxDelay;
    }

    const settings = {
      enabled: autoAcceptToggle.checked,
      minDelay: minDelay,
      maxDelay: maxDelay,
      playSound: soundToggle.checked
    };

    chrome.storage.local.get(['autoAccept'], (result) => {
      const currentSettings = result.autoAccept || {};
      const updatedSettings = { ...currentSettings, ...settings };

      chrome.storage.local.set({ autoAccept: updatedSettings }, () => {
        console.log('[AmoCRM Auto-Accept Popup] Settings saved:', updatedSettings);
        updateStatusDisplay(settings.enabled);
        
        // Notify background script and content scripts about settings change
        chrome.runtime.sendMessage({
          action: 'settingsUpdated',
          settings: updatedSettings
        }).catch(() => {
          // Background script might not be ready, ignore
        });
      });
    });
  }

  /**
   * Apply preset delay configuration
   */
  function applyPreset(preset) {
    const presets = {
      fast: { min: 500, max: 1000 },
      normal: { min: 1000, max: 3000 },
      slow: { min: 2000, max: 5000 }
    };

    if (presets[preset]) {
      minDelayInput.value = presets[preset].min;
      maxDelayInput.value = presets[preset].max;
      saveSettings();
    }
  }

  /**
   * Update status display
   */
  function updateStatusDisplay(isEnabled) {
    if (isEnabled) {
      statusValue.textContent = 'Enabled';
      statusValue.style.color = '#4CAF50';
      statusIndicator.classList.add('active');
    } else {
      statusValue.textContent = 'Disabled';
      statusValue.style.color = '#f44336';
      statusIndicator.classList.remove('active');
    }
  }

  /**
   * Load statistics from settings
   */
  function loadStatistics(settings) {
    const stats = settings.stats || { totalAccepted: 0, lastAccepted: null };
    totalAcceptedEl.textContent = stats.totalAccepted || 0;

    if (stats.lastAccepted) {
      const date = new Date(stats.lastAccepted);
      const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      lastAcceptedEl.textContent = time;
    } else {
      lastAcceptedEl.textContent = '--:--';
    }
  }

  /**
   * Reset statistics
   */
  function resetStatistics() {
    chrome.storage.local.get(['autoAccept'], (result) => {
      const settings = result.autoAccept || getDefaultSettings();
      settings.stats = {
        totalAccepted: 0,
        lastAccepted: null
      };

      chrome.storage.local.set({ autoAccept: settings }, () => {
        console.log('[AmoCRM Auto-Accept Popup] Statistics reset');
        loadStatistics(settings);
      });
    });
  }

  /**
   * Get default settings
   */
  function getDefaultSettings() {
    return {
      enabled: true,
      minDelay: 1000,
      maxDelay: 3000,
      playSound: false,
      stats: {
        totalAccepted: 0,
        lastAccepted: null
      }
    };
  }
});
