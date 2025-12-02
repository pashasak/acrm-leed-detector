// Content Script - Runs in the context of web pages

(function() {
  'use strict';

  console.log('[AmoCRM Auto-Accept] Content script loaded');

  // Store detected leads to avoid duplicates
  const detectedLeads = new Set();

  /**
   * Check if extension context is still valid
   * Context becomes invalid when extension is reloaded/updated
   */
  function isExtensionContextValid() {
    try {
      // Accessing chrome.runtime.id will throw if context is invalidated
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  /**
   * Safe wrapper for chrome.storage.local.get
   */
  function safeStorageGet(keys, callback) {
    if (!isExtensionContextValid()) {
      console.warn('[AmoCRM Auto-Accept] Extension context invalidated. Please refresh the page.');
      return;
    }
    try {
      chrome.storage.local.get(keys, callback);
    } catch (e) {
      console.warn('[AmoCRM Auto-Accept] Storage access failed:', e.message);
    }
  }

  /**
   * Safe wrapper for chrome.storage.local.set
   */
  function safeStorageSet(data, callback) {
    if (!isExtensionContextValid()) {
      console.warn('[AmoCRM Auto-Accept] Extension context invalidated. Please refresh the page.');
      return;
    }
    try {
      chrome.storage.local.set(data, callback);
    } catch (e) {
      console.warn('[AmoCRM Auto-Accept] Storage write failed:', e.message);
    }
  }

  // Listen for messages from popup or background
  if (isExtensionContextValid()) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!isExtensionContextValid()) {
        return false;
      }
      
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
  }

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
    safeStorageGet(['autoAccept'], (result) => {
      if (!result) return; // Context was invalidated
      
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
          
          // First: delay for "noticing" the notification
          const noticeDelay = calculateNoticeDelay();
          // Then: reaction time to click
          const reactionDelay = calculateRandomDelay(minDelay, maxDelay);
          const totalDelay = noticeDelay + reactionDelay;
          
          console.log('[AmoCRM Auto-Accept] Human timing simulation:', {
            noticeDelay: Math.round(noticeDelay) + 'ms',
            reactionDelay: Math.round(reactionDelay) + 'ms',
            totalDelay: Math.round(totalDelay) + 'ms'
          });
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
          }, totalDelay);
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
    safeStorageSet({ autoAccept: updatedSettings }, () => {
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

  // Track session activity for fatigue simulation
  let sessionStartTime = Date.now();
  let clicksInSession = 0;

  /**
   * Generate a random number with Gaussian (normal) distribution
   * More realistic than uniform distribution - humans tend toward average reaction times
   */
  function gaussianRandom(mean, stdDev) {
    // Box-Muller transform for Gaussian distribution
    // Ensure u1 is never 0 to avoid Math.log(0) = -Infinity
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 === 0) u1 = Math.random(); // Avoid log(0)
    
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /**
   * Calculate random delay with natural human-like timing
   * Uses Gaussian distribution centered around the middle of min-max range
   */
  function calculateRandomDelay(minMs, maxMs) {
    const mean = (minMs + maxMs) / 2;
    const stdDev = (maxMs - minMs) / 4; // 95% of values within min-max
    
    // Base delay with Gaussian distribution
    let delay = gaussianRandom(mean, stdDev);
    
    // Clamp to min-max range
    delay = Math.max(minMs, Math.min(maxMs, delay));
    
    // Add micro-jitter (±50ms) for natural timing variations
    delay += (Math.random() - 0.5) * 100;
    
    // Occasional "distraction" delays (5% chance of being 2-5x slower)
    // Simulates when human is busy doing something else
    if (Math.random() < 0.05) {
      const distractionMultiplier = 2 + Math.random() * 3;
      delay *= distractionMultiplier;
      console.log('[AmoCRM Auto-Accept] Human distraction simulation - extended delay');
    }
    
    // Fatigue factor - slightly slower after many clicks or long session
    const sessionMinutes = (Date.now() - sessionStartTime) / 60000;
    const fatigueFactor = 1 + (clicksInSession * 0.01) + (sessionMinutes * 0.005);
    delay *= Math.min(fatigueFactor, 1.5); // Cap at 50% slower
    
    // Time-of-day factor (slower during typical break times)
    const hour = new Date().getHours();
    if ((hour >= 12 && hour <= 13) || (hour >= 18 && hour <= 19)) {
      // Lunch or end of day - 10-30% slower
      delay *= 1.1 + Math.random() * 0.2;
    }
    
    return Math.max(minMs, Math.round(delay));
  }

  /**
   * Add random pre-click delay to simulate human noticing the notification
   * Sometimes humans don't immediately see notifications
   */
  function calculateNoticeDelay() {
    // 70% chance: notice quickly (0-500ms)
    // 20% chance: slight delay (500-2000ms)  
    // 10% chance: longer delay (2000-5000ms) - was looking elsewhere
    const roll = Math.random();
    if (roll < 0.7) {
      return Math.random() * 500;
    } else if (roll < 0.9) {
      return 500 + Math.random() * 1500;
    } else {
      return 2000 + Math.random() * 3000;
    }
  }

  /**
   * Click a button in a human-like manner
   * 1. Check if button is visible and clickable
   * 2. Simulate mouse movement towards the button
   * 3. Move to random position within button (not dead center)
   * 4. Dispatch realistic event sequence with variable timing
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

    // Increment click counter for fatigue simulation
    clicksInSession++;

    // Get element bounds
    const rect = element.getBoundingClientRect();

    // Calculate random position within element, avoiding the edges
    // Use slightly varied ranges to avoid patterns
    const xRange = 0.25 + Math.random() * 0.1; // 25-35% from left edge
    const yRange = 0.25 + Math.random() * 0.1;
    const randomX = xRange + Math.random() * (1 - 2 * xRange);
    const randomY = yRange + Math.random() * (1 - 2 * yRange);
    
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
      },
      sessionClicks: clicksInSession
    });

    // Simulate mouse movement path before clicking
    simulateMouseApproach(element, clickX, clickY);

    // Create realistic event sequence with variable delays (not fixed!)
    // Humans have inconsistent timing between events
    const eventSequence = [
      { type: 'mouseenter', delay: 0 },
      { type: 'mouseover', delay: 30 + Math.random() * 40 },      // 30-70ms
      { type: 'mousemove', delay: 20 + Math.random() * 30 },      // Small movement
      { type: 'mousedown', delay: 80 + Math.random() * 60 },      // 80-140ms (finger pressing)
      { type: 'mouseup', delay: 50 + Math.random() * 100 },       // 50-150ms (variable click duration)
      { type: 'click', delay: 5 + Math.random() * 15 }            // 5-20ms
    ];

    let accumulatedDelay = 0;

    for (const eventObj of eventSequence) {
      accumulatedDelay += eventObj.delay;
      
      const currentDelay = accumulatedDelay;
      setTimeout(() => {
        // Add tiny position variations during the click sequence (hand shake)
        const shakeX = clickX + (Math.random() - 0.5) * 2;
        const shakeY = clickY + (Math.random() - 0.5) * 2;
        
        const event = new MouseEvent(eventObj.type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: shakeX,
          clientY: shakeY,
          screenX: shakeX,
          screenY: shakeY,
          buttons: eventObj.type === 'mousedown' ? 1 : 0
        });

        element.dispatchEvent(event);
        console.log('[AmoCRM Auto-Accept] Dispatched event:', eventObj.type);
      }, currentDelay);
    }

    return true;
  }

  /**
   * Simulate mouse movement approaching the button
   * Creates a few mousemove events along a curved path
   */
  function simulateMouseApproach(element, targetX, targetY) {
    // Simulate starting from a random position on screen
    const startX = Math.random() * window.innerWidth;
    const startY = Math.random() * window.innerHeight;
    
    // Generate 3-5 intermediate points along a slightly curved path
    const numPoints = 3 + Math.floor(Math.random() * 3);
    
    for (let i = 1; i <= numPoints; i++) {
      const progress = i / (numPoints + 1);
      
      // Add slight curve to the path (not a straight line)
      const curve = Math.sin(progress * Math.PI) * (50 + Math.random() * 50);
      const perpX = -(targetY - startY);
      const perpY = targetX - startX;
      const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
      
      const pointX = startX + (targetX - startX) * progress + (perpX / perpLen) * curve;
      const pointY = startY + (targetY - startY) * progress + (perpY / perpLen) * curve;
      
      // Variable delay between movement points
      const delay = i * (20 + Math.random() * 30);
      
      setTimeout(() => {
        const moveEvent = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: pointX,
          clientY: pointY
        });
        document.dispatchEvent(moveEvent);
      }, delay);
    }
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
    safeStorageGet(['isEnabled', 'autoAccept'], (result) => {
      if (!result) return; // Context was invalidated
      
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
