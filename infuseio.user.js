// ==UserScript==
// @name         InfuseIO
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.0.2
// @description  Redirects Stremio Web video streams to Infuse app on iOS Safari
// @author       Toni Oriol
// @icon         https://www.google.com/s2/favicons?sz=64&domain=strem.io
// @match        *://web.strem.io/*
// @grant        none
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/infuseio.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/infuseio.user.js
// ==/UserScript==

(() => {
  'use strict';

  const INFUSE_SCHEME = 'infuse://x-callback-url/play?url=';
  const STREAM_SELECTOR = 'a.stream-container-JPdah';
  const DMM_HOSTS = ['debridmediamanager.com', 'x.debridmediamanager.com'];

  const decodeBase64Url = (str) => {
    try {
      // Convert base64url to base64
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      
      // Add padding if needed
      while (base64.length % 4) {
        base64 += '=';
      }
      
      // Decode base64 to bytes
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      // Convert bytes to UTF-8 string
      return new TextDecoder('utf-8').decode(bytes);
    } catch (error) {
      console.error('[InfuseIO] Base64 decode error:', error);
      return null;
    }
  };

  const extractStreamUrl = (playerHash) => {
    try {
      // Remove #/player/ prefix and get first segment
      const encodedData = playerHash.replace(/^#\/player\//, '').split('/')[0];
      
      // Decode URL encoding and base64
      const decoded = decodeBase64Url(decodeURIComponent(encodedData));
      
      if (!decoded) {
        console.error('[InfuseIO] Failed to decode stream data');
        return null;
      }
      
      // Extract JSON object
      const jsonStart = decoded.indexOf('{');
      const jsonEnd = decoded.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1) {
        console.error('[InfuseIO] No JSON object found in decoded data');
        return null;
      }
      
      const jsonStr = decoded.substring(jsonStart, jsonEnd + 1);
      const streamData = JSON.parse(jsonStr);
      
      return streamData.url || null;
    } catch (error) {
      console.error('[InfuseIO] Error extracting stream URL:', error);
      return null;
    }
  };

  const redirectToInfuse = (streamUrl) => {
    const infuseUrl = INFUSE_SCHEME + encodeURIComponent(streamUrl);
    console.log('[InfuseIO] Redirecting to:', infuseUrl.substring(0, 150) + '...');
    window.location.href = infuseUrl;
  };

  const handleStreamClick = (event) => {
    const link = event.target.closest(STREAM_SELECTOR);
    
    if (!link) return;
    
    const href = link.getAttribute('href');
    
    if (!href) return;
    
    // Allow DMM links to open normally
    if (DMM_HOSTS.some(host => href.includes(host))) {
      console.log('[InfuseIO] DMM link detected, allowing default action');
      return;
    }
    
    // Handle Stremio player links
    if (href.startsWith('#/player/')) {
      console.log('[InfuseIO] Processing Stremio player link');
      event.preventDefault();
      event.stopPropagation();
      
      const streamUrl = extractStreamUrl(href);
      
      if (streamUrl) {
        redirectToInfuse(streamUrl);
      } else {
        console.error('[InfuseIO] Could not extract stream URL from:', href);
      }
    }
  };

  // Attach click listener in capture phase
  document.body.addEventListener('click', handleStreamClick, true);
  console.log('[InfuseIO] Bridge initialized');
})();
