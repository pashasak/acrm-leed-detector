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
          // Update activity settings
          if (message.settings) {
            if (message.settings.simulateMouseMovement !== undefined) {
              activitySettings.simulateMouseMovement = message.settings.simulateMouseMovement;
              console.log('[AmoCRM Auto-Accept] Mouse movement simulation:', activitySettings.simulateMouseMovement ? 'enabled' : 'disabled');
            }
            if (message.settings.simulateScroll !== undefined) {
              activitySettings.simulateScroll = message.settings.simulateScroll;
              console.log('[AmoCRM Auto-Accept] Scroll simulation:', activitySettings.simulateScroll ? 'enabled' : 'disabled');
            }
            // Handle overall background movement toggle
            if (message.settings.simulateMouseMovement === false && message.settings.simulateScroll === false) {
              stopBackgroundMouseMovement();
            } else if (message.settings.enabled && !backgroundMovementActive) {
              startBackgroundMouseMovement();
            }
          }
          sendResponse({ success: true });
          break;
        case 'getStatus':
          sendResponse({ 
            success: true, 
            status: 'active',
            backgroundMovementActive: backgroundMovementActive,
            activitySettings: activitySettings
          });
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

  // Background mouse movement simulation state
  let backgroundMovementActive = false;
  let backgroundMovementIntervalId = null;
  let lastMousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let isInActivityBurst = false; // Whether currently in an active period
  let debugCursorElement = null; // Visual debug indicator for simulated mouse

  /**
   * Create or get the debug cursor indicator element
   */
  function getDebugCursor() {
    if (!debugCursorElement) {
      debugCursorElement = document.createElement('div');
      debugCursorElement.id = 'amocrm-debug-cursor';
      debugCursorElement.style.cssText = `
        position: fixed;
        width: 12px;
        height: 12px;
        background: rgba(255, 0, 0, 0.7);
        border: 2px solid white;
        border-radius: 50%;
        pointer-events: none;
        z-index: 999999;
        transform: translate(-50%, -50%);
        transition: left 0.05s linear, top 0.05s linear;
        box-shadow: 0 0 4px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(debugCursorElement);
    }
    return debugCursorElement;
  }

  /**
   * Update debug cursor position
   */
  function updateDebugCursor(x, y) {
    const cursor = getDebugCursor();
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
    cursor.style.display = 'block';
  }

  /**
   * Hide debug cursor
   */
  function hideDebugCursor() {
    if (debugCursorElement) {
      debugCursorElement.style.display = 'none';
    }
  }

  /**
   * BACKGROUND HUMAN ACTIVITY SIMULATION
   * Simulates natural mouse movements and scrolling while waiting for notifications
   * Runs intermittently (not always) to appear more realistic
   */

  /**
   * Generate smooth, natural mouse movement path using Bezier curves
   */
  function generateNaturalPath(startX, startY, endX, endY, steps) {
    const points = [];
    
    // Generate random control points for cubic Bezier curve
    const ctrl1X = startX + (endX - startX) * 0.3 + (Math.random() - 0.5) * 100;
    const ctrl1Y = startY + (endY - startY) * 0.1 + (Math.random() - 0.5) * 100;
    const ctrl2X = startX + (endX - startX) * 0.7 + (Math.random() - 0.5) * 100;
    const ctrl2Y = startY + (endY - startY) * 0.9 + (Math.random() - 0.5) * 100;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      
      // Cubic Bezier formula
      const x = mt3 * startX + 3 * mt2 * t * ctrl1X + 3 * mt * t2 * ctrl2X + t3 * endX;
      const y = mt3 * startY + 3 * mt2 * t * ctrl1Y + 3 * mt * t2 * ctrl2Y + t3 * endY;
      
      // Add micro-jitter to simulate hand tremor
      const jitterX = (Math.random() - 0.5) * 2;
      const jitterY = (Math.random() - 0.5) * 2;
      
      points.push({ x: x + jitterX, y: y + jitterY });
    }
    
    return points;
  }

  /**
   * Get a random target position that looks like natural browsing behavior
   */
  function getRandomBrowsingTarget() {
    const behaviors = [
      // Look at main content area (most common)
      () => ({
        x: window.innerWidth * (0.2 + Math.random() * 0.6),
        y: window.innerHeight * (0.2 + Math.random() * 0.5)
      }),
      // Check sidebar
      () => ({
        x: window.innerWidth * (0.05 + Math.random() * 0.15),
        y: window.innerHeight * (0.1 + Math.random() * 0.7)
      }),
      // Look at top navigation
      () => ({
        x: window.innerWidth * (0.1 + Math.random() * 0.8),
        y: window.innerHeight * (0.02 + Math.random() * 0.1)
      }),
      // Scroll area / right side
      () => ({
        x: window.innerWidth * (0.85 + Math.random() * 0.1),
        y: window.innerHeight * (0.2 + Math.random() * 0.6)
      }),
      // Random spot (occasional exploration)
      () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight
      })
    ];
    
    // Weight towards main content area
    const weights = [0.4, 0.2, 0.15, 0.1, 0.15];
    const roll = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (roll < cumulative) {
        return behaviors[i]();
      }
    }
    
    return behaviors[0]();
  }

  /**
   * Perform a natural scroll action
   */
  function performNaturalScroll() {
    if (!backgroundMovementActive) return;
    
    const scrollBehaviors = [
      // Small scroll down (reading)
      () => ({ deltaY: 50 + Math.random() * 150, duration: 300 + Math.random() * 400 }),
      // Small scroll up (re-reading)
      () => ({ deltaY: -(30 + Math.random() * 100), duration: 200 + Math.random() * 300 }),
      // Medium scroll down
      () => ({ deltaY: 150 + Math.random() * 300, duration: 400 + Math.random() * 500 }),
      // Large scroll down (skimming)
      () => ({ deltaY: 300 + Math.random() * 500, duration: 500 + Math.random() * 600 }),
      // Scroll back to top (occasionally)
      () => ({ deltaY: -window.scrollY * (0.3 + Math.random() * 0.4), duration: 600 + Math.random() * 800 })
    ];
    
    // Weight towards small/medium scrolls
    const weights = [0.35, 0.15, 0.30, 0.15, 0.05];
    const roll = Math.random();
    let cumulative = 0;
    let behavior;
    
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (roll < cumulative) {
        behavior = scrollBehaviors[i]();
        break;
      }
    }
    
    if (!behavior) behavior = scrollBehaviors[0]();
    
    // Don't scroll up if already at top
    if (window.scrollY <= 0 && behavior.deltaY < 0) {
      behavior.deltaY = Math.abs(behavior.deltaY);
    }
    
    // Don't scroll down if at bottom
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY >= maxScroll && behavior.deltaY > 0) {
      behavior.deltaY = -Math.abs(behavior.deltaY) * 0.5;
    }
    
    // Perform smooth scroll in steps
    const steps = 8 + Math.floor(Math.random() * 8); // 8-16 steps
    const stepDelay = behavior.duration / steps;
    const stepAmount = behavior.deltaY / steps;
    
    console.log('[AmoCRM Auto-Accept] Simulating scroll:', {
      deltaY: Math.round(behavior.deltaY),
      duration: Math.round(behavior.duration) + 'ms',
      currentScrollY: Math.round(window.scrollY)
    });
    
    for (let i = 0; i < steps; i++) {
      setTimeout(() => {
        if (!backgroundMovementActive) return;
        
        // Add slight variation to each step (not perfectly smooth)
        const variation = 1 + (Math.random() - 0.5) * 0.3;
        const actualStep = stepAmount * variation;
        
        window.scrollBy({
          top: actualStep,
          behavior: 'auto' // We're doing our own smoothing
        });
        
        // Also dispatch wheel event for sites that listen to it
        const wheelEvent = new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: actualStep,
          deltaMode: 0 // Pixels
        });
        document.dispatchEvent(wheelEvent);
      }, i * stepDelay);
    }
  }

  /**
   * Simulate a single background mouse movement sequence
   */
  function performBackgroundMouseMovement() {
    if (!backgroundMovementActive) return;
    
    const target = getRandomBrowsingTarget();
    const steps = 5 + Math.floor(Math.random() * 10); // 5-15 steps
    const path = generateNaturalPath(lastMousePosition.x, lastMousePosition.y, target.x, target.y, steps);
    
    // Calculate total duration for this movement (varies with distance)
    const distance = Math.sqrt(
      Math.pow(target.x - lastMousePosition.x, 2) + 
      Math.pow(target.y - lastMousePosition.y, 2)
    );
    const baseDuration = 200 + distance * 0.5; // Faster for short distances
    const stepDelay = baseDuration / steps;
    
    path.forEach((point, index) => {
      setTimeout(() => {
        // Don't continue if movement was stopped
        if (!backgroundMovementActive) return;
        
        const moveEvent = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: point.x,
          clientY: point.y,
          screenX: point.x,
          screenY: point.y
        });
        
        document.dispatchEvent(moveEvent);
        
        // Update debug cursor visual
        updateDebugCursor(point.x, point.y);
        
        // Update last position
        if (index === path.length - 1) {
          lastMousePosition = { x: point.x, y: point.y };
        }
      }, index * stepDelay);
    });
    
    // Occasionally simulate a hover pause over an element
    if (Math.random() < 0.2) {
      const elementAtTarget = document.elementFromPoint(target.x, target.y);
      if (elementAtTarget) {
        setTimeout(() => {
          if (!backgroundMovementActive) return;
          
          // Dispatch mouseenter/mouseover on the element
          elementAtTarget.dispatchEvent(new MouseEvent('mouseenter', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: target.x,
            clientY: target.y
          }));
          
          // After a short pause, dispatch mouseleave
          setTimeout(() => {
            if (!backgroundMovementActive) return;
            elementAtTarget.dispatchEvent(new MouseEvent('mouseleave', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: target.x,
              clientY: target.y
            }));
          }, 100 + Math.random() * 300);
        }, baseDuration + 50);
      }
    }
  }

  /**
   * Get current activity settings from storage
   */
  let activitySettings = {
    simulateMouseMovement: true,
    simulateScroll: true
  };

  /**
   * Perform a random background activity (mouse move or scroll)
   */
  function performRandomActivity() {
    if (!backgroundMovementActive) return;
    
    // Determine what activities are enabled
    const canMove = activitySettings.simulateMouseMovement;
    const canScroll = activitySettings.simulateScroll;
    
    // If both disabled, do nothing
    if (!canMove && !canScroll) {
      return;
    }
    
    // If only one is enabled, do that one
    if (!canMove && canScroll) {
      performNaturalScroll();
      return;
    }
    
    if (canMove && !canScroll) {
      performBackgroundMouseMovement();
      return;
    }
    
    // Both enabled: 60% mouse movement, 40% scroll
    if (Math.random() < 0.6) {
      performBackgroundMouseMovement();
    } else {
      performNaturalScroll();
    }
  }

  /**
   * Schedule the next activity burst
   * Activity happens in bursts with idle periods in between
   */
  function scheduleActivityBurst() {
    if (!backgroundMovementActive) return;
    
    // Idle period: 10-45 seconds of no activity
    const idleDuration = 10000 + Math.random() * 35000;
    
    console.log('[AmoCRM Auto-Accept] Idle period:', Math.round(idleDuration / 1000) + 's');
    
    backgroundMovementIntervalId = setTimeout(() => {
      if (!backgroundMovementActive) return;
      
      // Start an activity burst
      startActivityBurst();
    }, idleDuration);
  }

  /**
   * Start a burst of activity (several movements/scrolls in sequence)
   */
  function startActivityBurst() {
    if (!backgroundMovementActive) return;
    
    isInActivityBurst = true;
    
    // Activity burst: 3-8 actions over 8-25 seconds
    const numActions = 3 + Math.floor(Math.random() * 6);
    const burstDuration = 8000 + Math.random() * 17000;
    const avgInterval = burstDuration / numActions;
    
    console.log('[AmoCRM Auto-Accept] Starting activity burst:', {
      actions: numActions,
      duration: Math.round(burstDuration / 1000) + 's'
    });
    
    let actionIndex = 0;
    
    function performNextAction() {
      if (!backgroundMovementActive || actionIndex >= numActions) {
        isInActivityBurst = false;
        // Schedule next idle + burst cycle
        scheduleActivityBurst();
        return;
      }
      
      // Random chance to skip an action (simulates inconsistent activity)
      if (Math.random() > 0.15) {
        performRandomActivity();
      }
      
      actionIndex++;
      
      // Variable delay to next action
      const nextDelay = avgInterval * (0.5 + Math.random());
      setTimeout(performNextAction, nextDelay);
    }
    
    // Start the burst
    performNextAction();
  }

  /**
   * Start background activity simulation
   */
  function startBackgroundMouseMovement() {
    if (backgroundMovementActive) {
      console.log('[AmoCRM Auto-Accept] Background activity already active');
      return;
    }
    
    backgroundMovementActive = true;
    console.log('[AmoCRM Auto-Accept] Starting background activity simulation (mouse + scroll)');
    
    // Start with an initial delay before first activity
    const initialDelay = 3000 + Math.random() * 7000; // 3-10 seconds
    
    setTimeout(() => {
      if (backgroundMovementActive) {
        startActivityBurst();
      }
    }, initialDelay);
  }

  /**
   * Stop background activity simulation
   */
  function stopBackgroundMouseMovement() {
    backgroundMovementActive = false;
    isInActivityBurst = false;
    if (backgroundMovementIntervalId) {
      clearTimeout(backgroundMovementIntervalId);
      backgroundMovementIntervalId = null;
    }
    hideDebugCursor();
    console.log('[AmoCRM Auto-Accept] Stopped background activity simulation');
  }

  /**
   * Temporarily pause background movement (e.g., when clicking a button)
   */
  function pauseBackgroundMovement(duration) {
    const wasActive = backgroundMovementActive;
    if (wasActive) {
      stopBackgroundMouseMovement();
      setTimeout(() => {
        if (wasActive) {
          startBackgroundMouseMovement();
        }
      }, duration);
    }
  }

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

    // Pause background movement during the click action
    pauseBackgroundMovement(2000);

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
        
        // Load activity settings
        const settings = result.autoAccept || {};
        if (settings.simulateMouseMovement !== undefined) {
          activitySettings.simulateMouseMovement = settings.simulateMouseMovement;
        }
        if (settings.simulateScroll !== undefined) {
          activitySettings.simulateScroll = settings.simulateScroll;
        }
        
        // Start background activity simulation if enabled
        if (settings.simulateMouseMovement !== false || settings.simulateScroll !== false) {
          startBackgroundMouseMovement();
        }
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
