/**
 * Content script for LinkedIn messaging.
 * Supports both full-page (/messaging/*) and the on-page overlay messenger
 * (shadow DOM inside #interop-outlet on any LinkedIn page).
 */
(function () {
  'use strict';

  // Track captured message hashes per conversation to allow re-capture with new messages
  const capturedHashes = new Map(); // conversationId -> Set of content_hashes

  /** Simple string hash for content-based dedup keys. */
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash.toString(36);
  }

  /**
   * Get the messaging root — either the overlay conversation bubble (shadow DOM)
   * or the full-page messaging container.
   */
  function getMsgRoot() {
    // Check overlay first (shadow DOM)
    const host = document.querySelector('#interop-outlet');
    if (host && host.shadowRoot) {
      // Look for the open conversation bubble
      const bubble = host.shadowRoot.querySelector('.msg-overlay-conversation-bubble');
      if (bubble) return bubble;
      // Also check for newer overlay patterns
      const overlay = host.shadowRoot.querySelector('[class*="msg-overlay"], [class*="conversation"]');
      if (overlay) return overlay;
    }
    return document;
  }

  /**
   * Get a unique conversation identifier.
   */
  function getConversationId() {
    // Full-page messaging: ID is in the URL
    const urlMatch = window.location.pathname.match(/\/messaging\/thread\/([^/]+)/);
    if (urlMatch) return urlMatch[1];

    // Overlay messenger: derive from the conversation header
    const root = getMsgRoot();
    if (root === document) return null; // Not in overlay

    // Find profile link in the overlay header
    const links = root.querySelectorAll('a[href*="/in/"]');
    for (const link of links) {
      const href = link.getAttribute('href') || link.href || '';
      const match = href.match(/\/in\/([^/?]+)/);
      if (match) return 'overlay-' + match[1].toLowerCase();
    }

    // Fallback: use the partner name as ID
    const nameEl = root.querySelector(
      '.msg-overlay-bubble-header__title, h2.msg-entity-lockup__entity-title, [class*="conversation-title"]'
    );
    if (nameEl) {
      const name = nameEl.textContent.trim().replace(/\s+/g, '-').toLowerCase();
      if (name) return 'overlay-name-' + name;
    }

    return null;
  }

  /**
   * Clean a LinkedIn name — strip status indicators, availability text, etc.
   */
  function cleanName(raw) {
    let name = raw.replace(/\s*Status is\s.*/i, '');
    name = name.replace(/\s*(Mobile|Desktop|Web)\s*[•·].*$/i, '');
    name = name.replace(/\s*Active\s+(now|\d+[hmd]\s+ago).*$/i, '');
    return name.trim();
  }

  /**
   * Find message elements in either full-page or overlay context.
   * Tries multiple selector patterns for compatibility.
   */
  function findMessageElements(root) {
    // Full-page messaging selectors
    const fullPage = root.querySelectorAll('.msg-s-event-listitem');
    if (fullPage.length > 0) return Array.from(fullPage);

    // Overlay messaging selectors (may differ from full-page)
    const overlay = root.querySelectorAll(
      '.msg-s-event-listitem, [class*="msg-s-event"], [class*="message-list-item"], li[class*="msg"]'
    );
    if (overlay.length > 0) return Array.from(overlay);

    // Shadow DOM may have different class naming
    const shadowMsgs = root.querySelectorAll('li[data-control-name], li[class*="event"]');
    if (shadowMsgs.length > 0) return Array.from(shadowMsgs);

    return [];
  }

  /**
   * Find the partner name from the conversation header.
   */
  function findPartnerName(root) {
    const selectors = [
      'h2.msg-entity-lockup__entity-title',
      '.msg-overlay-bubble-header__title',
      '[class*="conversation-title"]',
      '[class*="msg-overlay"] h2',
    ];
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return cleanName(el.textContent.trim());
    }
    return null;
  }

  /**
   * Find the partner's profile ID from a link.
   */
  function findPartnerProfileId(root) {
    const links = root.querySelectorAll('a[href*="/in/"]');
    for (const link of links) {
      const href = link.getAttribute('href') || link.href || '';
      const match = href.match(/\/in\/([^/?]+)/);
      if (match) return match[1].toLowerCase();
    }
    return null;
  }

  function extractMessages() {
    if (document.visibilityState !== 'visible') return null;

    const conversationId = getConversationId();
    if (!conversationId) return null;

    const root = getMsgRoot();
    const partnerName = findPartnerName(root);
    if (!partnerName) {
      console.debug('[PingCRM] Messages: no partner name found');
      return null;
    }

    const profileId = findPartnerProfileId(root);
    if (!profileId) {
      console.debug('[PingCRM] Messages: no profile ID found');
      return null;
    }

    // Find message elements
    const messageEls = findMessageElements(root);
    if (messageEls.length === 0) {
      console.debug('[PingCRM] Messages: no message elements found in', root === document ? 'document' : 'overlay');
      return null;
    }

    const existingHashes = capturedHashes.get(conversationId) || new Set();
    const messages = [];
    let currentSender = null;

    for (const msgEl of messageEls) {
      // Find sender
      const senderEl = msgEl.querySelector(
        '.msg-s-message-group__name, .msg-s-event-listitem__link span.visually-hidden, [class*="sender"], [class*="author"]'
      );
      if (senderEl) {
        currentSender = senderEl.textContent.trim();
      }

      // Find message body
      const bodyEl = msgEl.querySelector(
        '.msg-s-event-listitem__body, .msg-s-event__content p, [class*="message-body"], [class*="msg-body"], p'
      );

      if (bodyEl) {
        const content = bodyEl.textContent.trim();
        if (!content) continue;

        const contentHash = simpleHash(content.substring(0, 200));

        // Skip messages already captured in this conversation
        if (existingHashes.has(contentHash)) continue;

        let direction = 'inbound';
        if (currentSender && currentSender !== partnerName) {
          direction = 'outbound';
        }

        messages.push({
          profile_id: profileId,
          profile_name: partnerName,
          direction,
          content_preview: content.substring(0, 500),
          timestamp: new Date().toISOString(),
          conversation_id: conversationId,
          content_hash: contentHash,
        });
      }
    }

    if (messages.length === 0) return null;

    // Track captured hashes (allows re-capture when new messages arrive)
    const newHashes = new Set(existingHashes);
    for (const msg of messages) newHashes.add(msg.content_hash);
    capturedHashes.set(conversationId, newHashes);

    return messages;
  }

  function captureAndSend() {
    try {
      const messages = extractMessages();
      if (!messages) return;

      console.log('[PingCRM] Captured', messages.length, 'messages with', messages[0].profile_name);
      chrome.runtime.sendMessage({
        type: 'MESSAGES_CAPTURED',
        data: messages,
      });
    } catch (e) {
      console.debug('[PingCRM] Message capture error:', e.message);
    }
  }

  function hasVisibleMessages() {
    const root = getMsgRoot();
    return findMessageElements(root).length > 0;
  }

  // ── Trigger capture on conversation changes ──

  function waitForMessages() {
    const conversationId = getConversationId();
    if (!conversationId) return;

    if (hasVisibleMessages()) {
      setTimeout(captureAndSend, 1000);
      return;
    }

    const observer = new MutationObserver((_mutations, obs) => {
      if (hasVisibleMessages()) {
        obs.disconnect();
        setTimeout(captureAndSend, 1000);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }

  // SPA navigation detection
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(waitForMessages, 1000);
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // ── Overlay messenger detection ──

  function watchOverlay() {
    const host = document.querySelector('#interop-outlet');
    if (!host || !host.shadowRoot) return;

    checkOverlay();

    const overlayObserver = new MutationObserver(() => {
      checkOverlay();
    });

    overlayObserver.observe(host.shadowRoot, { childList: true, subtree: true });
  }

  function checkOverlay() {
    const convId = getConversationId();
    if (!convId) return;
    if (hasVisibleMessages()) {
      setTimeout(captureAndSend, 1500);
    }
  }

  // Poll for overlay changes — shadow DOM mutations don't always bubble reliably
  let pollInterval = null;
  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
      const host = document.querySelector('#interop-outlet');
      if (host && host.shadowRoot) {
        checkOverlay();
      }
    }, 5000); // Check every 5 seconds
  }

  // ── Initialize ──

  // Full-page messaging
  if (window.location.pathname.startsWith('/messaging')) {
    waitForMessages();
  }

  // Start overlay watcher with retry (shadow DOM may not be ready immediately)
  function initOverlayWatcher() {
    const host = document.querySelector('#interop-outlet');
    if (host && host.shadowRoot) {
      watchOverlay();
      startPolling();
    } else {
      // Retry in 2 seconds — shadow DOM may load later
      setTimeout(initOverlayWatcher, 2000);
    }
  }

  // Start after a short delay to let the page render
  setTimeout(initOverlayWatcher, 1500);

  // Also trigger on full-page messaging navigation
  if (window.location.pathname.startsWith('/messaging')) {
    waitForMessages();
  }
})();
