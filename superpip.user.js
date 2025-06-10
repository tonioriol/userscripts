// ==UserScript==
// @name         SuperPiP (Minimal Controls Enabler)
// @namespace    https://github.com/tonioriol
// @version      0.0.3 // Incremented version for clarity
// @description  Enable native HTML5 video controls on websites, removing common restrictions.
// @author       SuperPiP
// @match        https://*/*
// @match        http://*/*
// @grant        none
// @run-at       document-idle
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/superpip.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/superpip.user.js
// ==/UserScript==

(function() {
  'use strict';
  
  console.log('[SuperPiP] Script starting...');
  
  function enableNativeControlsOnVideos() {
    console.log('[SuperPiP] Looking for videos to enable native controls...');
    
    const videos = document.querySelectorAll('video');
    console.log(`[SuperPiP] Found ${videos.length} video(s)`);
    
    videos.forEach((video, index) => {
      console.log(`[SuperPiP] Processing video ${index + 1}: ${video.src?.substring(0, 50)}...`);
      
      // Enable native controls
      video.setAttribute('controls', '');
      video.removeAttribute('disableremoteplayback');
      video.removeAttribute('controlslist'); // Remove restrictions like 'nodownload'
      console.log('[SuperPiP] Native controls enabled for video.');
    });
  }
  
  // Run immediately
  console.log('[SuperPiP] Running immediately...');
  enableNativeControlsOnVideos();
  
  // Run again after delays to catch videos loaded later,
  // as YouTube and other sites might load videos dynamically.
  setTimeout(() => {
    console.log('[SuperPiP] Running after 1 second...');
    enableNativeControlsOnVideos();
  }, 1000);
  
  setTimeout(() => {
    console.log('[SuperPiP] Running after 3 seconds...');
    enableNativeControlsOnVideos();
  }, 3000);
  
  setTimeout(() => {
    console.log('[SuperPiP] Running after 5 seconds...');
    enableNativeControlsOnVideos();
  }, 5000);
  
  console.log('[SuperPiP] Script initialization complete. Native controls should be active on videos.');
})();
