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
      case 'performAction':
        performAction()
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response

      case 'getData':
        const data = collectPageData();
        sendResponse({ success: true, data });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
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
            // Check if the added node itself is a lead card
            if (isLeadCard(node)) {
              handleNewLeadDetected(node);
            }
            // Check if any descendants are lead cards
            const leadCards = node.querySelectorAll?.('[class*="gnzs_catch_lead--card"]');
            if (leadCards) {
              leadCards.forEach(card => handleNewLeadDetected(card));
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
  }

  /**
   * Check if element is a lead card
   */
  function isLeadCard(element) {
    return element.matches?.('[class*="gnzs_catch_lead--card"]') === true;
  }

  /**
   * Validate that the card is actually a new lead notification
   */
  function validateLeadCard(card) {
    // Check for title "Новая заявка"
    const titleElement = card.querySelector('[class*="gnzs_catch_lead--title"]');
    if (!titleElement) {
      return false;
    }

    const titleText = titleElement.textContent?.trim();
    if (titleText !== 'Новая заявка') {
      return false;
    }

    // Check for accept button
    const acceptButton = card.querySelector('[data-content="Принять"]') ||
                        card.querySelector('[class*="gnzs_catch_lead--acceptbutton"]');
    if (!acceptButton) {
      return false;
    }

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
        // Phase 2 will handle the actual clicking
        // For now, just log that we detected it
      } else {
        console.log('[AmoCRM Auto-Accept] Auto-accept is disabled');
      }
    });
  }

  // Example function to perform an action on the page
  async function performAction() {
    // Implement your DOM manipulation or page interaction here
    console.log('[AmoCRM Auto-Accept] Performing action on page:', window.location.href);
    
    // Example: Highlight all links
    const links = document.querySelectorAll('a');
    links.forEach((link) => {
      link.style.backgroundColor = 'yellow';
    });

    return true;
  }

  // Example function to collect data from the page
  function collectPageData() {
    return {
      title: document.title,
      url: window.location.href,
      links: document.querySelectorAll('a').length
    };
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
