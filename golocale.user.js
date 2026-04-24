// ==UserScript==
// @name         GoLocale
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.8.1
// @description  Automatically redirects URLs to their preferred language equivalents
// @author       Toni Oriol
// @match        *://*/*
// @icon         data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%234A90E2%22%3E%3Cpath d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z%22/%3E%3C/svg%3E
// @grant        GM.getValue
// @grant        GM.setValue
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/golocale.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/golocale.user.js
// ==/UserScript==

/**
 * TODO:
 * - [ ] make the ui so it doesnt collide NEVER with the page css
 * - [ ] make the button that shows up to stop the golocale to act to have a navigate to prev page button (and then also show it there to disable the redirects, so when we are back using that button it doesnt try again also!)
 */

// Configuration groups
const LANGUAGE_CONFIG = {
  targetLang: "ca",
  altLang: "va"
};

const DETECTION_CONFIG = {
  urlParams: ["lang", "ln", "hl"]
};


// Utility functions
const getBaseDomain = (hostname) => {
  const parts = hostname.split('.');
  if (parts.length >= 3 && parts[0].length >= 2 && parts[0].length <= 3) {
    const possibleLangCode = parts[0].toLowerCase();
    if (/^[a-z]{2,3}$/.test(possibleLangCode)) {
      return parts.slice(1).join('.');
    }
  }
  return hostname;
};

const getStorageKey = (domain, type) => `golocale_${type}_${getBaseDomain(domain)}`;

// Session-history helpers
const GOLOCALE_STORAGE_PREFIX = "__golocale_redirected_";

const getRedirectMarkerKey = (url) => {
  try {
    const normalized = new URL(url).href;
    return GOLOCALE_STORAGE_PREFIX + normalized;
  } catch {
    return GOLOCALE_STORAGE_PREFIX + url;
  }
};

const markUrlAsRedirected = (fromUrl, toUrl) => {
  try {
    if (typeof sessionStorage === "undefined") return;
    const key = getRedirectMarkerKey(fromUrl);
    sessionStorage.setItem(key, JSON.stringify({
      redirectedTo: toUrl,
      redirectedAt: Date.now()
    }));
  } catch (error) {
    console.warn("[GoLocale] Failed to mark URL as redirected:", error);
  }
};

const wasUrlRedirected = (url) => {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const key = getRedirectMarkerKey(url);
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const getTargetLanguageHints = () => {
  return [LANGUAGE_CONFIG.targetLang, LANGUAGE_CONFIG.altLang]
    .filter(Boolean)
    .map((lang) => String(lang).toLowerCase());
};

const matchesTargetLanguageHint = (value, targetLangs = getTargetLanguageHints()) => {
  if (!value) return false;

  const normalized = String(value).toLowerCase();
  const baseCode = normalized.split(/[-_]/)[0];

  return targetLangs.includes(normalized) || targetLangs.includes(baseCode);
};

const urlHasTargetLanguageHint = (url) => {
  try {
    const u = new URL(url);
    const targetLangs = getTargetLanguageHints();
    const subdomain = u.hostname.split(".")[0];
    const pathSegments = u.pathname.split("/").filter(Boolean);

    if (matchesTargetLanguageHint(subdomain, targetLangs)) {
      return true;
    }

    if (pathSegments.some((segment) => matchesTargetLanguageHint(segment, targetLangs))) {
      return true;
    }

    return DETECTION_CONFIG.urlParams.some((param) => {
      return matchesTargetLanguageHint(u.searchParams.get(param), targetLangs);
    });
  } catch {
    return false;
  }
};

const shouldSkipRedirect = (currentUrl, referrer = "") => {
  const marker = wasUrlRedirected(currentUrl);
  console.log("[GoLocale] Checking skip - marker:", marker, "referrer:", referrer);

  if (!marker) {
    console.log("[GoLocale] No redirect marker found");
    return false;
  }

  // Check Navigation Timing API for back_forward
  try {
    const navEntry = performance?.getEntriesByType?.("navigation")?.[0];
    if (navEntry?.type === "back_forward") {
      console.log("[GoLocale] Navigation Timing reports back_forward - skipping");
      return true;
    }
  } catch { /* ignore */ }

  try {
    if (performance?.navigation?.type === 2) {
      console.log("[GoLocale] Legacy nav API reports back_forward - skipping");
      return true;
    }
  } catch { /* ignore */ }

  // Fallback: referrer matches the URL we redirected to
  try {
    if (referrer && String(referrer) === String(marker.redirectedTo)) {
      console.log("[GoLocale] Referrer matches redirect target - skipping");
      return true;
    }
  } catch { /* ignore */ }

  console.log("[GoLocale] Not a back navigation - will redirect");
  return false;
};

// Redirect using pushState + document.write:
// 1. pushState(target) → changes URL to /ca/, creating entry with /es/ underneath
// 2. document.open/write/close(html) → replaces page content with fetched HTML
// NO navigation occurs at all, so history is never modified beyond the pushState.
// Back from /ca/ will land on /es/ because pushState preserved it.
const pushStateAndWrite = (targetUrl, html) => {
  // Use native pushState to bypass SPA framework patches
  const nativePush = typeof History !== "undefined"
    ? History.prototype.pushState
    : null;

  if (!nativePush) {
    console.log("[GoLocale] History API unavailable, falling back to location.href");
    location.href = targetUrl;
    return;
  }

  console.log("[GoLocale] pushState to:", targetUrl, "(history.length before:", history.length + ")");

  // pushState changes the URL without navigating. /es/ entry stays underneath.
  nativePush.call(history, null, "", targetUrl);

  console.log("[GoLocale] pushState done (history.length after:", history.length + ")");
  console.log("[GoLocale] Writing fetched HTML into document (", html.length, "bytes)");

  // document.open/write/close replaces the page content without any navigation.
  // This does NOT create or modify history entries.
  // The browser will parse the HTML, execute scripts, load resources, etc.
  document.open();
  document.write(html);
  document.close();
};

const notify = (message, buttonText, callback) => {
  document.getElementById('golocale-notify')?.remove();

  const notification = document.createElement('div');
  notification.id = 'golocale-notify';
  notification.innerHTML = `
    <div
      style="position: fixed; top: 10px; right: 10px; z-index: 999999; padding: 12px 12px 12px 32px; background: #333; color: white; border-radius: 4px; font: 14px sans-serif; ${!buttonText ? 'cursor: pointer;' : ''}"
      ${!buttonText ? 'onclick="this.parentElement.remove()"' : ''}>
      <button
        style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: #666; color: white; border: none; border-radius: 0; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;"
        onclick="this.parentElement.parentElement.remove()">
        ×
      </button>
      <span>${message}</span>
      ${buttonText ? `
        <button
          class="golocale-action-btn"
          style="margin-left: 8px; padding: 4px 8px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer;">
          ${buttonText}
        </button>
      ` : ''}
    </div>
  `;

  if (buttonText && callback) {
    const actionBtn = notification.querySelector('.golocale-action-btn');
    actionBtn.onclick = () => {
      notification.remove();
      callback();
    };
  }

  document.body.appendChild(notification);
  setTimeout(() => notification.remove?.(), 30000);
};

const isTargetLanguage = (html) => {
  const targetLangs = [LANGUAGE_CONFIG.targetLang, LANGUAGE_CONFIG.altLang].filter(Boolean);
  console.log("[GoLocale] Checking if page is in target languages:", targetLangs);

  const langAttr = html.match(/<html[^>]*lang=["']([^"']*)/i);
  const lang = langAttr?.[1]?.toLowerCase();
  console.log("[GoLocale] HTML lang attribute found:", lang);

  const langCode = lang?.split("-")[0];
  if (targetLangs.includes(lang) || targetLangs.includes(langCode)) {
    console.log("[GoLocale] Page is already in target language (HTML attribute)");
    return true;
  }

  if (lang && !targetLangs.includes(langCode)) {
    console.log("[GoLocale] HTML lang attribute indicates different language, not using franc detection");
    return false;
  }

  const detectedLang = francDetect(html);
  console.log("[GoLocale] Franc detected language code:", detectedLang);

  const mappedLang = iso6393To1[detectedLang];
  console.log("[GoLocale] Mapped to 2-letter code:", mappedLang);

  if (targetLangs.includes(mappedLang)) {
    console.log("[GoLocale] Page is in target language (detected by franc)");
    return true;
  }

  console.log("[GoLocale] Page is NOT in target language");
  return false;
};

// Returns { isTarget, html } so we can reuse the fetched HTML for document.write
const fetchAndCheckLanguage = async (url) => {
  console.log("[GoLocale] Testing URL candidate:", url);

  try {
    const response = await fetch(url);
    console.log("[GoLocale] Response status:", response.status);

    if (response.status >= 400) {
      console.log("[GoLocale] URL failed with status >= 400");
      return { isTarget: false, html: null };
    }

    const html = await response.text();
    console.log("[GoLocale] Fetched HTML length:", html.length);

    const result = isTargetLanguage(html);
    console.log("[GoLocale] URL candidate result:", result);
    return { isTarget: result, html: result ? html : null };
  } catch (error) {
    console.error("[GoLocale] Error fetching URL:", url, error);

    console.log("[GoLocale] Trying no-cors fallback");
    try {
      const noCorsResponse = await fetch(url, { mode: "no-cors" });
      console.log("[GoLocale] No-cors response type:", noCorsResponse.type);
      if (noCorsResponse.type === "opaque") {
        console.log("[GoLocale] No-cors succeeded, assuming URL is valid (no HTML available)");
        return { isTarget: true, html: null };
      }
    } catch (noCorsError) {
      console.error("[GoLocale] No-cors fallback also failed:", noCorsError);
    }

    return { isTarget: false, html: null };
  }
};

// URL generation strategies
const replaceLanguageCodes = (url, targetLang) => {
  const currentLangMap = typeof window !== 'undefined' ? window.langMap : global.langMap;
  const target = currentLangMap.get(targetLang);

  if (!target) {
    console.log("[GoLocale] Language not in ISO map, using pattern replacement for:", targetLang);
    return url.replace(/\/([a-z]{2,3})\//g, (match, langCode) => {
      return currentLangMap.has(langCode.toLowerCase()) ? `/${targetLang}/` : match;
    });
  }

  return url.replace(/(?<!\.)\b([a-z]{2,3})\b/gi, (match) => {
    const found = currentLangMap.get(match.toLowerCase());
    return found
      ? found.iso6391 === match.toLowerCase()
        ? target.iso6391 || match
        : found.iso6392B === match.toLowerCase()
        ? target.iso6392B || match
        : found.iso6392T === match.toLowerCase()
        ? target.iso6392T || match
        : match
      : match;
  });
};

const injectPath = (url, targetLang) => {
  const u = new URL(url);
  u.pathname = `/${targetLang}${u.pathname}`;
  return u.toString();
};

const replaceSubdomain = (url, targetLang) => {
  const u = new URL(url);
  const hostParts = u.hostname.split(".");
  const currentLangMap = typeof window !== 'undefined' ? window.langMap : global.langMap;

  if (hostParts.length >= 2 && currentLangMap.has(hostParts[0].toLowerCase())) {
    console.log("[GoLocale] Replacing subdomain language code:", hostParts[0], "with", targetLang);
    hostParts[0] = targetLang;
    u.hostname = hostParts.join(".");
    return u.toString();
  }

  return null;
};

const injectSubdomain = (url, targetLang) => {
  const u = new URL(url);
  u.hostname = `${targetLang}.${u.hostname}`;
  return u.toString();
};

const injectParams = (url, targetLang) => {
  return DETECTION_CONFIG.urlParams.map((param) => {
    const u = new URL(url);
    u.searchParams.set(param, targetLang);
    return u.toString();
  });
};

const generateUrlCandidates = (url) => {
  console.log("[GoLocale] Generating URL candidates for:", url);
  const candidates = [];
  const targetLangs = [LANGUAGE_CONFIG.targetLang, LANGUAGE_CONFIG.altLang].filter(Boolean);

  for (const targetLang of targetLangs) {
    console.log("[GoLocale] Generating candidates for language:", targetLang);

    candidates.push(replaceLanguageCodes(url, targetLang));

    const replacedSubdomainUrl = replaceSubdomain(url, targetLang);
    if (replacedSubdomainUrl) {
      candidates.push(replacedSubdomainUrl);
    }

    candidates.push(injectPath(url, targetLang));
    candidates.push(injectSubdomain(url, targetLang));
    candidates.push(...injectParams(url, targetLang));
  }

  console.log("[GoLocale] Total candidates generated:", candidates.length);
  return candidates;
};

const handleNotification = async () => {
  if (await GM.getValue("notify", false)) {
    await GM.setValue("notify", false);

    notify("GoLocale Redirected", "Stop", async () => {
      await GM.setValue(getStorageKey(location.hostname, 'user_disabled'), true);
      console.log("[GoLocale] User disabled redirects for domain:", getBaseDomain(location.hostname));
    });
  }
};

const tryRedirect = async () => {
  const url = location.href;
  console.log("[GoLocale] Starting redirect attempt for:", url);
  console.log("[GoLocale] document.referrer:", document.referrer);
  console.log("[GoLocale] history.length:", history.length);

  // Check if user has disabled redirects for this domain
  const userDisabledKey = getStorageKey(location.hostname, 'user_disabled');
  const userDisabled = await GM.getValue(userDisabledKey, false);

  if (userDisabled) {
    console.log("[GoLocale] Skipping - user disabled redirects for this domain");

    setTimeout(() => {
      if (!document.querySelector('[data-golocale]')) {
        notify("Redirects Disabled", "Enable", async () => {
          await GM.setValue(userDisabledKey, false);
          console.log("[GoLocale] Re-enabled redirects for domain:", getBaseDomain(location.hostname));
          notify("Redirects enabled!");
        });
      }
    }, 1000);

    return;
  }

  // Check if we should skip redirect (user navigated back from a GoLocale redirect)
  if (shouldSkipRedirect(url, document.referrer)) {
    console.log("[GoLocale] Skipping redirect - back navigation detected");
    return;
  }

  if (urlHasTargetLanguageHint(url)) {
    console.log("[GoLocale] URL already contains a target language hint, skipping to avoid redirect loops");
    return;
  }

  // Check if current page is already in target language
  console.log("[GoLocale] Checking current page language...");
  const currentPageHtml = document.documentElement.outerHTML;
  if (isTargetLanguage(currentPageHtml)) {
    console.log("[GoLocale] Current page is already in target language, no redirect needed");
    return;
  }

  const candidates = generateUrlCandidates(url);
  const filteredCandidates = [...new Set(candidates)].filter((c) => c !== url);
  console.log("[GoLocale] Filtered candidates (excluding original URL):", filteredCandidates);

  for (let i = 0; i < filteredCandidates.length; i++) {
    const candidate = filteredCandidates[i];
    console.log(`[GoLocale] Testing candidate ${i + 1}/${filteredCandidates.length}:`, candidate);

    const { isTarget, html } = await fetchAndCheckLanguage(candidate);
    if (isTarget) {
      console.log("[GoLocale] Found working candidate:", candidate);

      // Mark the current URL so we can detect back navigation later
      markUrlAsRedirected(url, candidate);

      await GM.setValue("notify", true);

      if (html) {
        // Best path: pushState changes URL + document.write replaces content.
        // Zero navigation = history is never modified beyond the pushState.
        pushStateAndWrite(candidate, html);
      } else {
        // Fallback: no HTML available (no-cors), use regular navigation
        console.log("[GoLocale] No HTML available, falling back to location.href");
        location.href = candidate;
      }
      return;
    }
  }

  console.log("[GoLocale] No suitable candidates found, staying on current page");
};

// Main execution
(async () => {
  console.log("[GoLocale] Script starting...");

  if (typeof window === "undefined" || window !== window.top) {
    console.log("[GoLocale] Skipping - not in top-level window");
    return;
  }

  // Dynamic imports
  console.log("[GoLocale] Loading language detection libraries...");
  const { franc: francDetect } = await import("https://cdn.jsdelivr.net/npm/franc@6.2.0/+esm");
  const { iso6393: iso6393Data, iso6393To1 } = await import("https://cdn.jsdelivr.net/npm/iso-639-3@3.0.1/+esm");
  console.log("[GoLocale] Libraries loaded successfully");

  // Create language map for O(1) lookups
  window.langMap = new Map(
    iso6393Data.flatMap((lang) =>
      [lang.iso6391, lang.iso6392B, lang.iso6392T]
        .filter(Boolean)
        .map((code) => [code.toLowerCase(), lang])
    )
  );

  const startRedirect = async () => {
    console.log("[GoLocale] Starting redirect process...");
    await tryRedirect();
    console.log("[GoLocale] Redirect process completed");
  };

  if (document.readyState === "loading") {
    console.log("[GoLocale] Waiting for DOMContentLoaded...");
    window.addEventListener("DOMContentLoaded", startRedirect);
  } else {
    console.log("[GoLocale] DOM already loaded, executing immediately");
    startRedirect();
  }

  window.addEventListener("load", async () => {
    await handleNotification();
  });
})();

// Export functions for testing using CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    replaceLanguageCodes,
    injectPath,
    injectSubdomain,
    injectParams,
    isTargetLanguage,
    tryRedirect,
    urlHasTargetLanguageHint
  };
}
