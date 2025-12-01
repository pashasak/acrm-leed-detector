// Content Script - Runs in the context of web pages

(function() {
  'use strict';

  console.log('Content script loaded');

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);

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

  // Example function to perform an action on the page
  async function performAction() {
    // Implement your DOM manipulation or page interaction here
    console.log('Performing action on page:', window.location.href);
    
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
    chrome.storage.local.get(['isEnabled'], (result) => {
      if (result.isEnabled) {
        console.log('Extension is enabled on this page');
        // Add any initialization logic here
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
