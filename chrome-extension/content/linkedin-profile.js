/**
 * Content script for LinkedIn profile pages (/in/*).
 * Passively captures profile data when the user browses profiles.
 */
(function () {
  'use strict';

  const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes per profile
  const recentCaptures = new Map(); // profile_id -> timestamp

  function getProfileId() {
    const path = window.location.pathname;
    const match = path.match(/^\/in\/([^/]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Extract from LinkedIn's 2026 SDUI topcard layout.
   * Structure: h2=name, then p tags: [degree, headline, company, location, ...]
   */
  function extractFromTopcard(profileId) {
    const topcard = document.querySelector('[componentkey*="Topcard"]');
    if (!topcard) return null;

    const h2 = topcard.querySelector('h2');
    if (!h2) return null;
    const name = h2.textContent.trim();
    if (!name) return null;

    // Direct child paragraphs of the topcard region around the name
    const paragraphs = Array.from(topcard.querySelectorAll('p'))
      .map(p => p.textContent.trim())
      .filter(t => t && t !== '·');

    // paragraphs[0] is typically "· 3rd" (degree) — skip entries starting with "·"
    // headline is the first long paragraph (not degree, not follower count)
    let headline = null;
    let company = null;
    let location = null;

    // Filter out noise paragraphs
    const meaningful = paragraphs.filter(text => {
      if (/^·/.test(text) || /followers?$/i.test(text) || text === 'Contact info') return false;
      if (/Profile enhanced/i.test(text)) return false;
      return true;
    });

    // Pass 1: identify location (City, State, Country pattern — at least 2 commas, short)
    for (const text of meaningful) {
      if (/,.*,/.test(text) && text.length < 80 && !/[@|]/.test(text)) {
        location = text;
        break;
      }
    }

    // Helper: extract company from "Title @ Company | Other" or "Title at Company"
    function extractCompany(text) {
      const atMatch = text.match(/(?:\s@\s|\sat\s)(.+)/i);
      if (!atMatch) return null;
      // Take first segment before | or · separators
      return atMatch[1].split(/\s*[|·]\s*/)[0].trim() || null;
    }

    // Pass 2: assign headline and company from remaining texts
    for (const text of meaningful) {
      if (text === location) continue;
      if (!headline && text.length > 5) {
        headline = text;
      } else if (!company && text.length > 2 && text !== headline) {
        const extracted = extractCompany(text);
        // Split on · or | separators (LinkedIn combines company + education)
        company = (extracted || text.split(/\s*[|·]\s*/)[0]).trim();
      }
    }

    // If headline contains "@ Company" or "at Company", extract company from it
    if (headline && !company) {
      const extracted = extractCompany(headline);
      if (extracted) company = extracted.split(/\s*[|·]\s*/)[0].trim();
    }

    // Avatar: find profile photo (not company logo or cover)
    const imgs = Array.from(topcard.querySelectorAll('img'));
    let avatarImg = null;
    for (const img of imgs) {
      const src = img.src || '';
      // Skip cover photos, company logos, and tiny icons
      if (src.includes('company-logo') || src.includes('background-cover') || src.includes('/li-default-avatar')) continue;
      // Profile photos contain "profile-displayphoto" or are in a photo container
      if (src.includes('profile-displayphoto') || src.includes('/dms/image/') && !src.includes('company-logo')) {
        avatarImg = img;
        break;
      }
    }
    // Fallback: use first non-cover img if no profile photo found
    if (!avatarImg && imgs.length > 1) {
      const fallback = imgs[1];
      const fbSrc = fallback?.src || '';
      if (!fbSrc.includes('company-logo') && !fbSrc.includes('background-cover')) {
        avatarImg = fallback;
      }
    }

    // About section
    const aboutEl = querySelector('about');

    let avatarUrl = avatarImg ? avatarImg.src : null;
    if (avatarUrl) {
      avatarUrl = avatarUrl.replace(/_100_100/, '_400_400').replace(/_200_200/, '_400_400');
    }

    return {
      profile_id: profileId,
      profile_url: `https://www.linkedin.com/in/${profileId}`,
      full_name: name,
      headline: headline || null,
      company: company || null,
      location: location || null,
      about: aboutEl ? aboutEl.textContent.trim() : null,
      avatar_url: avatarUrl,
    };
  }

  /**
   * Legacy extraction using CSS selectors (pre-2026 LinkedIn DOM).
   */
  function extractFromLegacy(profileId) {
    const nameEl = querySelector('profileName');
    if (!nameEl) return null;
    const name = nameEl.textContent.trim();
    if (!name) return null;

    const headlineEl = querySelector('headline');
    const companyEl = querySelector('company');
    const locationEl = querySelector('location');
    const aboutEl = querySelector('about');
    const avatarEl = querySelector('avatarUrl');

    let avatarUrl = avatarEl ? avatarEl.src : null;
    if (avatarUrl) {
      avatarUrl = avatarUrl.replace(/_100_100/, '_400_400').replace(/_200_200/, '_400_400');
    }

    return {
      profile_id: profileId,
      profile_url: `https://www.linkedin.com/in/${profileId}`,
      full_name: name,
      headline: headlineEl ? headlineEl.textContent.trim() : null,
      company: companyEl ? companyEl.textContent.trim() : null,
      location: locationEl ? locationEl.textContent.trim() : null,
      about: aboutEl ? aboutEl.textContent.trim() : null,
      avatar_url: avatarUrl,
    };
  }

  function extractProfile() {
    const profileId = getProfileId();
    if (!profileId) return null;
    // Try new SDUI layout first, fall back to legacy selectors
    return extractFromTopcard(profileId) || extractFromLegacy(profileId);
  }

  function shouldCapture(profileId) {
    const lastCapture = recentCaptures.get(profileId);
    if (lastCapture && Date.now() - lastCapture < DEBOUNCE_MS) {
      return false;
    }
    return true;
  }

  /**
   * Download an image URL as a base64 data URI.
   * Uses the page's fetch (which has LinkedIn cookies) so CDN requests succeed.
   */
  async function fetchAvatarAsBase64(url) {
    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.debug('[PingCRM] Avatar fetch failed:', e.message);
      return null;
    }
  }

  async function captureAndSend() {
    try {
      const profile = extractProfile();
      if (!profile) {
        console.debug('[PingCRM] Could not extract profile data');
        return;
      }
      if (!shouldCapture(profile.profile_id)) {
        console.debug('[PingCRM] Skipping (recently captured):', profile.profile_id);
        return;
      }

      // Download avatar as base64 (browser has LinkedIn cookies, server doesn't)
      if (profile.avatar_url && !profile.avatar_url.startsWith('data:')) {
        const base64 = await fetchAvatarAsBase64(profile.avatar_url);
        if (base64) {
          profile.avatar_data = base64;  // data:image/jpeg;base64,...
        }
      }

      console.log('[PingCRM] Captured profile:', profile.full_name, profile.profile_id);
      recentCaptures.set(profile.profile_id, Date.now());
      chrome.runtime.sendMessage({
        type: 'PROFILE_CAPTURED',
        data: profile,
      });
    } catch (e) {
      console.debug('[PingCRM] Profile capture error:', e.message);
    }
  }

  // Wait for profile content to load, then capture
  function waitForProfile() {
    // Check both new SDUI layout and legacy selectors
    const topcard = document.querySelector('[componentkey*="Topcard"] h2');
    const nameEl = topcard || querySelector('profileName');
    if (nameEl) {
      captureAndSend();
      return;
    }

    const observer = new MutationObserver((_mutations, obs) => {
      const tc = document.querySelector('[componentkey*="Topcard"] h2');
      const el = tc || querySelector('profileName');
      if (el) {
        obs.disconnect();
        // Small delay to let other fields render
        setTimeout(captureAndSend, 500);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout after 10 seconds
    setTimeout(() => observer.disconnect(), 10000);
  }

  // Detect SPA navigation (LinkedIn is a SPA)
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (window.location.pathname.startsWith('/in/')) {
        setTimeout(waitForProfile, 1000);
      }
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Initial capture (only on profile pages)
  if (window.location.pathname.startsWith('/in/')) {
    waitForProfile();
  }
})();
