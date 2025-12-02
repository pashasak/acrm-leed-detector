// Content Script - Runs in the context of web pages

(function() {
  'use strict';

  console.log('[AmoCRM Auto-Accept] Content script loaded');

  // Store detected leads to avoid duplicates
  const detectedLeads = new Set();

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[AmoCRM Auto-Accept] Content script received message:', message);

    switch (message.action) {
      case 'settingsUpdated':
        console.log('[AmoCRM Auto-Accept] Settings updated:', message.settings);
        sendResponse({ success: true });
        break;
      case 'getStatus':
        sendResponse({ success: true, status: 'active' });
        break;
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return true;
  });

  /**
   * PHASE 1: DETECTION SYSTEM
   * Detects when AmoCRM lead notifications appear
   */

  // Set up MutationObserver to detect new lead cards
  function initLeadDetection() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check added nodes
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node itself is a notification container
            if (isLeadNotificationContainer(node)) {
              const card = node.querySelector('[class*="gnzs_catch_lead--card"]');
              if (card) {
                handleNewLeadDetected(card);
              }
            }
            // Check if any descendants are notification containers
            const containers = node.querySelectorAll?.('[data-entity="gnzs-catch-lead-notif-container"]');
            if (containers) {
              containers.forEach(container => {
                const card = container.querySelector('[class*="gnzs_catch_lead--card"]');
                if (card) {
                  handleNewLeadDetected(card);
                }
              });
            }
          }
        }
      }
    });

    // Start observing the document body for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[AmoCRM Auto-Accept] Lead detection initialized');
    
    // Also check for existing notifications on page load
    setTimeout(() => {
      const existingContainers = document.querySelectorAll('[data-entity="gnzs-catch-lead-notif-container"]');
      existingContainers.forEach(container => {
        const card = container.querySelector('[class*="gnzs_catch_lead--card"]');
        if (card) {
          handleNewLeadDetected(card);
        }
      });
    }, 1000);
  }

  /**
   * Check if element is a lead notification container
   */
  function isLeadNotificationContainer(element) {
    return element.matches?.('[data-entity="gnzs-catch-lead-notif-container"]') === true;
  }

  /**
   * Validate that the card is actually a new lead notification
   */
  function validateLeadCard(card) {
    // Check for title "Новая заявка"
    const titleElement = card.querySelector('[class*="gnzs_catch_lead--title"]');
    if (!titleElement) {
      console.log('[AmoCRM Auto-Accept] Title element not found');
      return false;
    }

    const titleText = titleElement.textContent?.trim();
    console.log('[AmoCRM Auto-Accept] Title text:', titleText);
    if (titleText !== 'Новая заявка') {
      return false;
    }

    // Check for accept button - use multiple selectors for better compatibility
    const acceptButton = card.querySelector('[class*="gnzs_catch_lead--acceptbutton"]') || 
                         card.querySelector('[data-content="Принять"]') ||
                         card.querySelector('[data-action="accept"]');
    if (!acceptButton) {
      console.log('[AmoCRM Auto-Accept] Accept button not found');
      return false;
    }

    console.log('[AmoCRM Auto-Accept] Lead card validated successfully');
    return true;
  }

  /**
   * Generate unique ID for a lead card to prevent duplicates
   */
  function getLeadCardId(card) {
    return card.className + '_' + card.innerHTML.substring(0, 50);
  }

  /**
   * Handle when a new lead is detected
   */
  function handleNewLeadDetected(card) {
    const leadId = getLeadCardId(card);

    // Avoid processing the same lead twice
    if (detectedLeads.has(leadId)) {
      return;
    }

    // Validate it's a real lead card
    if (!validateLeadCard(card)) {
      return;
    }

    // Mark as detected
    detectedLeads.add(leadId);

    console.log('[AmoCRM Auto-Accept] ✓ New lead detected!', {
      title: card.querySelector('[class*="gnzs_catch_lead--title"]')?.textContent?.trim(),
      description: card.querySelector('[class*="gnzs_catch_lead--description"]')?.textContent?.trim(),
      timestamp: new Date().toISOString()
    });

    // Get settings and decide what to do
    chrome.storage.local.get(['autoAccept'], (result) => {
      const settings = result.autoAccept || {};
      
      if (settings.enabled === true) {
        console.log('[AmoCRM Auto-Accept] Auto-accept is enabled, will accept this lead');
        
        // PHASE 2: Click the accept button with human-like behavior
        const acceptButton = card.querySelector('[class*="gnzs_catch_lead--acceptbutton"]') ||
                             card.querySelector('[data-content="Принять"]') ||
                             card.querySelector('[data-action="accept"]');
        
        if (acceptButton) {
          const minDelay = settings.minDelay || 1000;
          const maxDelay = settings.maxDelay || 3000;
          const delay = calculateRandomDelay(minDelay, maxDelay);
          
          console.log('[AmoCRM Auto-Accept] Will click accept button in', delay, 'ms');
          console.log('[AmoCRM Auto-Accept] Accept button element:', acceptButton);
          
          setTimeout(() => {
            if (humanLikeClick(acceptButton)) {
              console.log('[AmoCRM Auto-Accept] ✓ Lead accepted successfully!');
              // Update statistics
              updateStatistics(settings);
              
              // Play sound if enabled
              if (settings.playSound) {
                playNotificationSound();
              }
            }
          }, delay);
        } else {
          console.warn('[AmoCRM Auto-Accept] Accept button not found in card');
        }
      } else {
        console.log('[AmoCRM Auto-Accept] Auto-accept is disabled');
      }
    });
  }

  /**
   * Update statistics when a lead is accepted
   */
  function updateStatistics(settings) {
    const stats = settings.stats || { totalAccepted: 0, lastAccepted: null };
    stats.totalAccepted = (stats.totalAccepted || 0) + 1;
    stats.lastAccepted = new Date().toISOString();

    const updatedSettings = { ...settings, stats };
    chrome.storage.local.set({ autoAccept: updatedSettings }, () => {
      console.log('[AmoCRM Auto-Accept] Statistics updated:', stats);
    });
  }

  /**
   * Play a notification sound when a lead is accepted
   */
  function playNotificationSound() {
    // Create a simple beep using Web Audio API
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.frequency.value = 800; // 800 Hz
      oscillator.type = 'sine';

      gain.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);

      console.log('[AmoCRM Auto-Accept] Notification sound played');
    } catch (error) {
      console.warn('[AmoCRM Auto-Accept] Could not play notification sound:', error);
    }
  }

  /**
   * PHASE 2: HUMAN-LIKE CLICK SIMULATION
   * Simulates realistic human behavior when clicking
   */

  /**
   * Calculate random delay with natural jitter
   * Simulates human reaction time (1-3 seconds by default)
   */
  function calculateRandomDelay(minMs, maxMs) {
    const baseDelay = minMs + Math.random() * (maxMs - minMs);
    // Add small random variations (±100ms) for more natural timing
    const jitter = (Math.random() - 0.5) * 200;
    return Math.max(minMs, Math.min(maxMs, baseDelay + jitter));
  }

  /**
   * Click a button in a human-like manner
   * 1. Check if button is visible and clickable
   * 2. Move to random position within button (not dead center)
   * 3. Dispatch realistic event sequence: mouseenter → mouseover → mousedown → mouseup → click
   */
  function humanLikeClick(element) {
    // Verify the element exists and is visible
    if (!element) {
      console.error('[AmoCRM Auto-Accept] Element is null');
      return false;
    }

    // Check if element is visible
    if (!isElementVisible(element)) {
      console.warn('[AmoCRM Auto-Accept] Element is not visible');
      return false;
    }

    // Get element bounds
    const rect = element.getBoundingClientRect();

    // Calculate random position within element, avoiding the edges
    // Use 30-70% range to avoid clicking near borders
    const randomX = 0.3 + Math.random() * 0.4;
    const randomY = 0.3 + Math.random() * 0.4;
    
    const clickX = rect.left + rect.width * randomX;
    const clickY = rect.top + rect.height * randomY;

    console.log('[AmoCRM Auto-Accept] Clicking at position:', {
      x: Math.round(clickX),
      y: Math.round(clickY),
      buttonBounds: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    });

    // Create realistic event sequence with small delays between events
    const eventSequence = [
      { type: 'mouseenter', delay: 0 },
      { type: 'mouseover', delay: 50 },
      { type: 'mousedown', delay: 100 },
      { type: 'mouseup', delay: 50 },
      { type: 'click', delay: 10 }
    ];

    let accumulatedDelay = 0;

    for (const eventObj of eventSequence) {
      accumulatedDelay += eventObj.delay;
      
      setTimeout(() => {
        const event = new MouseEvent(eventObj.type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: clickX,
          clientY: clickY,
          screenX: clickX,
          screenY: clickY,
          buttons: eventObj.type === 'mousedown' ? 1 : 0
        });

        element.dispatchEvent(event);
        console.log('[AmoCRM Auto-Accept] Dispatched event:', eventObj.type);
      }, accumulatedDelay);
    }

    return true;
  }

  /**
   * Check if an element is visible in the viewport
   */
  function isElementVisible(element) {
    if (!element) return false;

    // Check if element has zero dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    // Check if element is hidden by CSS
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    // Check if element is within viewport
    if (rect.bottom < 0 || rect.right < 0 || 
        rect.top > window.innerHeight || rect.left > window.innerWidth) {
      return false;
    }

    return true;
  }

  // Initialize content script
  function init() {
    // Check if extension is enabled
    chrome.storage.local.get(['isEnabled', 'autoAccept'], (result) => {
      if (result.isEnabled !== false) {
        console.log('[AmoCRM Auto-Accept] Extension is enabled');
        
        // Initialize lead detection (Phase 1)
        initLeadDetection();
      } else {
        console.log('[AmoCRM Auto-Accept] Extension is disabled');
      }
    });
  }

  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
