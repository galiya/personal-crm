/* chrome-extension/content/linkedin-suggest.js */
(function () {
  "use strict";

  const PINGCRM_BTN_CLASS = "pingcrm-suggest-btn";

  // LinkedIn 2026 uses various class names for the compose toolbar.
  // We try multiple selectors and also use a dynamic finder.
  const TOOLBAR_SELECTORS = [
    ".msg-form__left-actions",
    ".msg-form__footer",
    ".msg-overlay-conversation-bubble .msg-form__left-actions",
    ".msg-overlay-conversation-bubble .msg-form__footer",
  ];
  const TEXTBOX_SELECTOR = 'div[contenteditable="true"][role="textbox"], div[contenteditable="true"].msg-form__contenteditable, div[contenteditable="true"]';

  // Selectors to find the conversation partner's name from the overlay header
  const OVERLAY_NAME_SELECTORS = [
    ".msg-overlay-bubble-header__title a",
    ".msg-overlay-conversation-bubble__header-title a",
    ".msg-thread__link-to-profile",
    "header a[href*='/in/']",
  ];

  // Selectors to find conversation partner's profile link (to extract slug)
  const PROFILE_LINK_SELECTORS = [
    ".msg-overlay-bubble-header a[href*='/in/']",
    ".msg-overlay-conversation-bubble a[href*='/in/']",
    ".msg-thread a[href*='/in/']",
    "header a[href*='/in/']",
  ];

  let _currentSuggestion = null; // { id, message, contact_name }
  let _currentSlug = null;
  let _partnerName = null; // fallback: name from overlay header
  let _injecting = false; // prevent concurrent injection
  const _injectedToolbars = new WeakSet(); // track already-injected toolbars

  // CSS to inject into shadow DOM (content_scripts CSS doesn't penetrate shadow roots)
  const BUTTON_CSS = `
    .pingcrm-suggest-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%;
      border: 1.5px solid #0d9488; background: white; color: #0d9488;
      font-size: 12px; font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      cursor: pointer; transition: background 0.15s, color 0.15s;
      margin: 0 2px; padding: 0; line-height: 1; flex-shrink: 0;
    }
    .pingcrm-suggest-btn:hover { background: #0d9488; color: white; }
    .pingcrm-suggest-btn--loading { opacity: 0.5; pointer-events: none; }
    .pingcrm-suggest-btn--error { border-color: #dc2626; color: #dc2626; }
    .pingcrm-suggest-btn--hidden { display: none; }
  `;
  let _cssInjectedInShadow = false;

  // ── Button creation ──

  function createButton(label, ariaLabel, onClick) {
    const btn = document.createElement("button");
    btn.className = PINGCRM_BTN_CLASS;
    btn.textContent = label;
    btn.setAttribute("aria-label", ariaLabel);
    btn.setAttribute("type", "button");
    btn.addEventListener("click", onClick);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
    });
    return btn;
  }

  // ── Text insertion via paste simulation ──

  function insertText(text, clear = false) {
    const el = querySelectorAllRoots(TEXTBOX_SELECTOR)[0];
    if (!el) return false;
    el.focus();

    // Clear existing content if requested
    if (clear) {
      el.innerHTML = "";
      el.textContent = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Try paste simulation first
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      el.dispatchEvent(pasteEvent);
      return true;
    } catch (e) {
      // Fallback: InputEvent
      try {
        const inputEvent = new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: text,
        });
        el.dispatchEvent(inputEvent);
        return true;
      } catch (e2) {
        // Last resort: direct assignment
        el.innerText = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
    }
  }

  // ── Button handlers ──

  function handlePull() {
    if (!_currentSuggestion?.message) return;
    insertText(_currentSuggestion.message, true);
  }

  async function handleRegenerate(rBtn) {
    if (!_currentSuggestion?.id) {
      showError(rBtn, "No suggestion for this contact");
      console.log("[PingCRM Suggest] R clicked but no suggestion. Slug:", _currentSlug);
      return;
    }
    rBtn.classList.add(PINGCRM_BTN_CLASS + "--loading");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "REGENERATE_SUGGESTION",
        suggestion_id: _currentSuggestion.id,
      });
      if (response?.suggestion?.message) {
        _currentSuggestion.message = response.suggestion.message;
        insertText(response.suggestion.message, true);
      } else {
        showError(rBtn, response?.error || "Failed");
      }
    } catch (e) {
      showError(rBtn, e.message);
    } finally {
      rBtn.classList.remove(PINGCRM_BTN_CLASS + "--loading");
    }
  }

  function showError(btn, msg) {
    btn.classList.add(PINGCRM_BTN_CLASS + "--error");
    btn.title = msg;
    setTimeout(() => {
      btn.classList.remove(PINGCRM_BTN_CLASS + "--error");
      btn.title = "";
    }, 2000);
  }

  // ── Injection logic ──

  function getThreadId() {
    const match = window.location.pathname.match(/\/messaging\/thread\/(.+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract the LinkedIn profile slug from the conversation UI.
   * Works for both full-page messaging and overlay conversations.
   * Looks for profile links (/in/slug) in the conversation header.
   */
  function getProfileSlugFromDOM() {
    // Try profile links in overlay header
    for (const sel of PROFILE_LINK_SELECTORS) {
      for (const link of querySelectorAllRoots(sel)) {
        const href = link.getAttribute("href") || "";
        const slugMatch = href.match(/\/in\/([^/?]+)/);
        if (slugMatch && !slugMatch[1].startsWith("ACo")) return slugMatch[1];
      }
    }

    // Broader search: any link with /in/ inside overlay containers
    const overlayLinks = querySelectorAllRoots('a[href*="/in/"]');
    for (const link of overlayLinks) {
      // Only consider links inside msg-overlay elements (not the profile page itself)
      const inOverlay = link.closest?.('[class*="msg-overlay"]') ||
                        link.closest?.('[class*="msg-convo"]') ||
                        link.closest?.('[class*="conversation"]');
      if (inOverlay) {
        const href = link.getAttribute("href") || "";
        const m = href.match(/\/in\/([^/?]+)/);
        if (m && !m[1].startsWith("ACo")) return m[1];
      }
    }

    // Last resort: get conversation partner name from overlay header
    // The overlay header typically shows the contact name as the first prominent text
    const headerEls = querySelectorAllRoots('.msg-overlay-bubble-header__title a, .msg-overlay-bubble-header h2 a, [class*="msg-overlay"] header a');
    for (const el of headerEls) {
      const name = el.textContent?.trim();
      // Filter out status text, empty strings, and very long text
      if (name && name.length > 2 && name.length < 40 && !name.toLowerCase().includes("status") && !name.toLowerCase().includes("online")) {
        console.log("[PingCRM Suggest] Extracted overlay partner name:", name);
        _partnerName = name;
        return null;
      }
    }

    return null;
  }

  /**
   * Get all search roots — the main document PLUS any shadow DOM roots.
   * LinkedIn's overlay messenger lives inside #interop-outlet's shadowRoot.
   */
  function getSearchRoots() {
    const roots = [document];
    const host = document.querySelector("#interop-outlet");
    if (host?.shadowRoot) {
      roots.push(host.shadowRoot);
    }
    return roots;
  }

  /**
   * Query selector across all roots (main document + shadow DOM).
   */
  function querySelectorAllRoots(selector) {
    const results = [];
    for (const root of getSearchRoots()) {
      root.querySelectorAll(selector).forEach(el => results.push(el));
    }
    return results;
  }

  /**
   * Find ALL toolbar areas (there may be multiple overlay conversations open).
   * Returns toolbars that don't already have our buttons injected.
   * Searches both main document and shadow DOM.
   */
  let _globalInjected = false; // simple global flag — one injection per page load

  function findUninjectdToolbars() {
    if (_globalInjected) return [];

    // Inject CSS into shadow root if not done yet
    if (!_cssInjectedInShadow) {
      const host = document.querySelector("#interop-outlet");
      if (host?.shadowRoot) {
        const style = document.createElement("style");
        style.textContent = BUTTON_CSS;
        host.shadowRoot.appendChild(style);
        _cssInjectedInShadow = true;
      }
    }

    // Find the FIRST Send button across all roots
    const allBtns = querySelectorAllRoots("button");
    for (const btn of allBtns) {
      if (btn.textContent?.trim() !== "Send") continue;
      const row = btn.parentElement;
      if (row && !row.dataset.pingcrmInjected) {
        return [row];
      }
    }

    return [];
  }

  async function injectButtons() {
    if (_injecting) return;
    _injecting = true;

    try {
      const toolbars = findUninjectdToolbars();
      if (toolbars.length === 0) return;

      // Get thread ID from URL (full-page) or profile slug from DOM (overlay)
      const threadId = getThreadId();
      const domSlug = getProfileSlugFromDOM();

      // Ask service worker for the suggestion
      let response;
      try {
        response = await chrome.runtime.sendMessage({
          type: "GET_SUGGESTION",
          threadId: threadId || null,
          profileSlug: domSlug || null,
          partnerName: _partnerName || null,
        });
      } catch (e) {
        return;
      }

      if (response?.error === "NOT_PAIRED") {
        // Mark all found toolbars as injected so we don't keep retrying
        for (const t of toolbars) _injectedToolbars.add(t);
        return;
      }

      _currentSuggestion = response?.suggestion ?? null;
      _currentSlug = response?.slug ?? domSlug ?? null;

      // Only inject into the first toolbar found (one per injection cycle)
      for (const toolbar of toolbars.slice(0, 1)) {
        // Mark as injected to prevent duplicates
        toolbar.dataset.pingcrmInjected = "true";
        _globalInjected = true;

        // Create buttons
        const pBtn = createButton("P", "Pull PingCRM suggestion", handlePull);
        const rBtn = createButton("R", "Regenerate PingCRM suggestion", () => handleRegenerate(rBtn));

        if (!_currentSuggestion) {
          pBtn.classList.add(PINGCRM_BTN_CLASS + "--hidden");
        }

        // Insert before the Send button (or append to toolbar)
        const sendBtn = toolbar.querySelector('button');
        if (sendBtn?.textContent?.trim() === "Send") {
          toolbar.insertBefore(pBtn, sendBtn);
          toolbar.insertBefore(rBtn, sendBtn);
        } else {
          toolbar.appendChild(pBtn);
          toolbar.appendChild(rBtn);
        }
        console.log("[PingCRM Suggest] Injected P+R into toolbar");
      }
    } finally {
      _injecting = false;
    }
  }

  // ── MutationObserver for SPA navigation ──

  let _lastUrl = window.location.href;

  function checkForChanges() {
    if (window.location.href !== _lastUrl) {
      _lastUrl = window.location.href;
      _currentSuggestion = null;
      _currentSlug = null;
      _partnerName = null;
      _globalInjected = false;
      // Small delay for DOM to update
      setTimeout(injectButtons, 500);
    }
  }

  const observer = new MutationObserver(() => {
    checkForChanges();
    // Check if a new compose area appeared (full-page or overlay on any page)
    const hasUninjected = findUninjectdToolbars().length > 0;
    if (hasUninjected) {
      injectButtons();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Also observe shadow DOM if present
  function watchShadowRoot() {
    const host = document.querySelector("#interop-outlet");
    if (host?.shadowRoot) {
      const shadowObserver = new MutationObserver(() => {
        const toolbars = findUninjectdToolbars();
        if (toolbars.length > 0) injectButtons();
      });
      shadowObserver.observe(host.shadowRoot, { childList: true, subtree: true });
      console.log("[PingCRM Suggest] Watching shadow DOM");
    } else {
      setTimeout(watchShadowRoot, 2000);
    }
  }
  watchShadowRoot();

  // Initial injection
  console.log("[PingCRM Suggest] Content script loaded on:", window.location.href);

  // LinkedIn overlay messenger can appear at any time. Poll every 3 seconds
  // in addition to MutationObserver to catch late-loading overlays.
  setInterval(() => {
    const toolbars = findUninjectdToolbars();
    if (toolbars.length > 0) {
      console.log("[PingCRM Suggest] Poll found", toolbars.length, "toolbar(s)");
      injectButtons();
    }
  }, 3000);

  // Also do an immediate + delayed diagnostic
  setTimeout(injectButtons, 1000);
  setTimeout(() => {
    // Deep diagnostic — search shadow DOM too
    const host = document.querySelector("#interop-outlet");
    const hasShadow = !!(host?.shadowRoot);
    const allBtns = querySelectorAllRoots("button");
    const sendLike = allBtns.filter(b => {
      const t = b.textContent?.trim().toLowerCase() || "";
      return t === "send" || t.includes("send");
    });
    const allCE = querySelectorAllRoots('[contenteditable="true"]');
    console.log("[PingCRM Suggest] Deep scan:", {
      hasShadowRoot: hasShadow,
      totalButtons: allBtns.length,
      sendButtons: sendLike.length,
      sendTexts: sendLike.map(b => b.textContent?.trim().substring(0, 20)),
      contentEditables: allCE.length,
      ceClasses: allCE.map(e => e.className?.substring(0, 40)),
    });
  }, 5000);
})();
