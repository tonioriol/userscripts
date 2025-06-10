// ==UserScript==
// @name         SuperPiP
// @namespace    https://github.com/tonioriol
// @version      0.0.1
// @description  Enable native video controls with Picture-in-Picture functionality on any website
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

  const SCRIPT_NAME = 'SuperPiP';
  const DEBUG_MODE = true; // Set to false to disable detailed logs

  function log(message, ...args) {
    if (DEBUG_MODE) {
      const siteName = window.location.hostname.includes('youtube') ? 'YouTube' : window.location.hostname.split('.')[0];
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      console.log(`[${SCRIPT_NAME} ${siteName} ${timestamp}] ${message}`, ...args);
    }
  }

  log('Script starting...');

  let attributeMonitorAttached = new WeakSet();
  let downloadButtonInstance = null;

  function detectVideoOverlays(video) {
    if (!video || typeof video.getBoundingClientRect !== 'function') {
      log('detectVideoOverlays: Invalid video element.');
      return [];
    }
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width === 0 && videoRect.height === 0) {
        // log('detectVideoOverlays: Video has no dimensions, skipping overlay detection.');
        return [];
    }
    const videoStyle = window.getComputedStyle(video);
    const videoZIndex = parseInt(videoStyle.zIndex, 10) || 0;
    const overlays = [];

    // Consider only elements that could visually cover the video
    const potentialOverlays = Array.from(document.querySelectorAll('div, span, button, section, aside, header, footer, main, article, nav, form, img, svg, canvas, iframe, .ytp-chrome-top, .ytp-chrome-bottom, .ytp-gradient-top, .ytp-gradient-bottom, .ytp-player-content, .ytp-endscreen-content, .ytp-pause-overlay, [class*="overlay"], [class*="popup"], [class*="modal"]'));


    potentialOverlays.forEach((element) => {
      if (element === video || element.contains(video) || typeof element.getBoundingClientRect !== 'function') return;
      
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return;

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // Skip elements with no dimensions

      const zIndex = parseInt(style.zIndex, 10) || 0;
      
      // Check for overlap
      const isOverlapping = !(
        rect.right < videoRect.left ||
        rect.left > videoRect.right ||
        rect.bottom < videoRect.top ||
        rect.top > videoRect.bottom
      );

      // An element is considered an overlay if it's positioned and on top, or simply overlapping with a higher z-index
      const isPositioned = style.position !== 'static';
      const isOverlayCandidate = (isPositioned && zIndex >= videoZIndex && isOverlapping) || (zIndex > videoZIndex && isOverlapping);


      if (isOverlayCandidate) {
        // Further check: ensure it's not a tiny, insignificant element or a scrollbar
        const areaOverlap = Math.max(0, Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left)) *
                            Math.max(0, Math.min(rect.bottom, videoRect.bottom) - Math.max(rect.top, videoRect.top));
        const videoArea = videoRect.width * videoRect.height;
        
        // Only consider it an overlay if it covers a significant portion or is clearly a control element
        if (areaOverlap > 0 && (areaOverlap / videoArea > 0.01 || element.matches('[class*="control"], [class*="button"], [class*="bar"]'))) {
            // Avoid hiding the download button itself or its container
            if (element === downloadButtonInstance || (downloadButtonInstance && element.contains(downloadButtonInstance))) {
                return;
            }
            // Avoid hiding common video controls if they are part of the native player (though we add our own)
            if (element.closest('video[controls]') && element.matches('input[type="range"], button')) {
                 // This might be too broad, but helps avoid hiding native slider if somehow present
                return;
            }

            overlays.push({ element, tagName: element.tagName, classes: Array.from(element.classList).join('.'), zIndex });
            log('Hiding overlay:', element);
            element.style.setProperty('display', 'none', 'important');
        }
      }
    });
    return overlays;
  }

  function findRealVideoURL() {
    log('Attempting to find real video URL...');
    try {
      // Method 1: ytInitialPlayerResponse (modern YouTube)
      if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.streamingData) {
        const streamingData = window.ytInitialPlayerResponse.streamingData;
        const formats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];
        // Prefer non-adaptive, then adaptive with video and audio, then video-only
        const sortedFormats = formats.sort((a, b) => {
            const aIsVideo = a.mimeType && a.mimeType.includes('video/');
            const bIsVideo = b.mimeType && b.mimeType.includes('video/');
            const aHasAudio = a.audioQuality;
            const bHasAudio = b.audioQuality;

            if (aIsVideo && aHasAudio && !(bIsVideo && bHasAudio)) return -1;
            if (!(aIsVideo && aHasAudio) && (bIsVideo && bHasAudio)) return 1;
            if (aIsVideo && !aHasAudio && bIsVideo && bHasAudio) return 1; // prefer with audio
            if (aIsVideo && bIsVideo && !bHasAudio && aHasAudio) return -1;
            return (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0); // Higher quality first
        });

        for (const format of sortedFormats) {
          if (format.url && format.mimeType && format.mimeType.includes('video/')) {
            log('Found video URL in ytInitialPlayerResponse:', format.url.substring(0,100) + '...');
            return format.url;
          }
        }
      }

      // Method 2: ytplayer.config (older YouTube or embedded)
      if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args) {
        const args = window.ytplayer.config.args;
        if (args.url_encoded_fmt_stream_map) {
          const streams = args.url_encoded_fmt_stream_map.split(',');
          for (const stream of streams) {
            const params = new URLSearchParams(stream);
            const url = params.get('url');
            if (url) {
              log('Found video URL in ytplayer.config:', decodeURIComponent(url).substring(0,100) + '...');
              return decodeURIComponent(url);
            }
          }
        }
      }
      
      // Method 3: Scan performance entries (less reliable for dynamic content)
      // This is often too late or might pick up ads.
      // const performanceEntries = performance.getEntriesByType('resource');
      // for (let i = performanceEntries.length - 1; i >= 0; i--) {
      //   const entry = performanceEntries[i];
      //   if (entry.name.includes('videoplayback') && entry.name.includes('googlevideo.com') && entry.initiatorType === 'fetch') {
      //     log('Found video URL in performance entries (fetch):', entry.name.substring(0,100) + '...');
      //     return entry.name;
      //   }
      // }

      log('No real video URL found through common YouTube objects.');
      return null;
    } catch (e) {
      log('Error finding real video URL:', e);
      return null;
    }
  }

  function setupVideoAttributeMonitoring(video) {
    if (attributeMonitorAttached.has(video)) {
      log('Attribute monitor ALREADY attached to this video.');
      return;
    }
    let isRestoringByScript = false;

    const observer = new MutationObserver((mutations) => {
      if (isRestoringByScript) return;

      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          const attrName = mutation.attributeName;
          const target = mutation.target;

          log(`Attribute "${attrName}" changed on video. Old: "${mutation.oldValue}", New: "${target.getAttribute(attrName)}"`);
          isRestoringByScript = true;

          if (attrName === 'controls' && !target.hasAttribute('controls')) {
            log('🛡️ Native controls removed, restoring...');
            target.setAttribute('controls', '');
          }
          if (attrName === 'controlslist' && target.getAttribute('controlslist')?.includes('nodownload')) {
            log('🛡️ "nodownload" restriction added, removing controlslist...');
            target.removeAttribute('controlslist');
          }
          if (attrName === 'disableremoteplayback' && target.hasAttribute('disableremoteplayback')) {
            log('🛡️ "disableremoteplayback" added, removing...');
            target.removeAttribute('disableremoteplayback');
          }
          // Add a microtask delay to reset the flag, allowing other mutations to process before re-enabling observation.
          Promise.resolve().then(() => { isRestoringByScript = false; });
        }
      });
    });

    observer.observe(video, {
      attributes: true,
      attributeOldValue: true, // Important for logging
      attributeFilter: ['controls', 'controlslist', 'disableremoteplayback']
    });
    attributeMonitorAttached.add(video);
    log('👁️ Attribute monitoring setup for video.');
  }
  
  function createAndShowDownloadButton(videoElement) {
    if (downloadButtonInstance && downloadButtonInstance.isConnected) {
      log('Download button instance already exists and is connected.');
      return;
    }

    log('Creating download button...');
    const btn = document.createElement('button');
    btn.className = 'superpip-download-btn';
    btn.innerHTML = '⬇️ Download Video';
    btn.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647; /* Max z-index */
      background: rgba(220, 50, 50, 0.9);
      color: white;
      padding: 10px 15px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      transition: background-color 0.2s;
    `;
    btn.onmouseover = () => btn.style.backgroundColor = 'rgba(200, 40, 40, 1)';
    btn.onmouseout = () => btn.style.backgroundColor = 'rgba(220, 50, 50, 0.9)';

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      log('Download button clicked!');
      
      const originalButtonText = btn.innerHTML;
      btn.innerHTML = '⏳ Finding URL...';
      btn.disabled = true;

      const realUrl = findRealVideoURL();

      if (realUrl) {
        log('Found real video URL for download:', realUrl.substring(0, 100) + '...');
        
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = realUrl;
        tempTextArea.style.position = 'absolute';
        tempTextArea.style.left = '-9999px';
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        let copied = false;
        try {
          copied = document.execCommand('copy');
        } catch (err) {
          log('execCommand copy failed:', err);
        }
        document.body.removeChild(tempTextArea);

        if (copied) {
          btn.innerHTML = '✅ URL Copied!';
          alert(`Video URL copied to clipboard!\n\n${realUrl.substring(0,120)}...\n\nPaste it into a new tab or a download manager (like JDownloader, youtube-dl, or your browser's download manager if it supports the link).\n\nAlternatively, try right-clicking the video for "Save Video As..." if native controls show it.`);
        } else {
          btn.innerHTML = '🔗 URL Found';
          prompt("Could not copy to clipboard. Please copy this URL manually:", realUrl);
           alert("If the prompt was blocked or you couldn't copy, check the browser console (Ctrl+Shift+J or Cmd+Opt+J) for the logged URL. You can also try right-clicking the video for 'Save Video As...'.");
        }
      } else {
        log('Could not find real video URL for download button.');
        btn.innerHTML = '❌ No URL';
        alert("Could not find a direct video URL.\n\nThis can happen if the video is heavily protected or uses a format not easily extractable by this script.\n\nTry right-clicking the video for 'Save Video As...' (if native controls make it available), or use a dedicated browser extension or desktop application (like JDownloader, youtube-dl/yt-dlp) with the main YouTube page URL.");
      }
      
      setTimeout(() => {
        btn.innerHTML = originalButtonText;
        btn.disabled = false;
      }, 3500);
    };
    
    document.body.appendChild(btn);
    downloadButtonInstance = btn; // Store the instance
    log('Download button added to page.');
  }

  function processSingleVideo(video) {
    if (!video || typeof video.getAttribute !== 'function') {
        log('processSingleVideo: received invalid video object');
        return;
    }
    log(`Processing video: ${video.id || video.className || 'video element'} (src: ${video.src?.substring(0, 70)}...)`);

    // 1. Enable Native Controls & Remove Restrictions
    video.setAttribute('controls', '');
    video.removeAttribute('disableremoteplayback');
    video.removeAttribute('controlslist'); // Crucial for download option
    log('Native controls enabled, restrictions removed.');

    // 2. Detect and Remove Overlays
    // Run overlay detection after a short delay to ensure player UI might have loaded
    setTimeout(() => {
        const overlays = detectVideoOverlays(video);
        if (overlays.length > 0) {
          log(`🚫 Removed ${overlays.length} overlay(s).`);
        }
    }, 100); // Small delay for player UI

    // 3. Create and Show Download Button
    // This button will use findRealVideoURL to get the link
    createAndShowDownloadButton(video);

    // 4. Setup Attribute Monitoring
    setupVideoAttributeMonitoring(video);
  }
  
  let processedVideos = new WeakSet();

  function scanAndProcessVideos() {
    log('Scanning for videos...');
    const videoSelectors = [
        'video', // General
        'video.html5-main-video', // YouTube specific
        '.html5-video-player video', // YouTube container
        'ytd-player video', // YouTube custom element
        'div[id^="player"] video', // Common player wrapper
        'div[class*="video-player"] video'
    ];
    
    let videosFound = new Set();
    videoSelectors.forEach(selector => {
        try {
            document.querySelectorAll(selector).forEach(v => videosFound.add(v));
        } catch (e) {
            log(`Error with selector "${selector}":`, e);
        }
    });

    const videosArray = Array.from(videosFound);
    log(`Found ${videosArray.length} potential video element(s).`);

    videosArray.forEach((video) => {
      if (!video.isConnected) {
        log('Skipping disconnected video element:', video);
        return;
      }
      if (processedVideos.has(video)) {
        // log('Video already processed, ensuring controls are still set.', video);
        // Re-assert controls just in case, but don't re-add button or full setup
        if (!video.hasAttribute('controls')) video.setAttribute('controls', '');
        if (video.hasAttribute('controlslist')) video.removeAttribute('controlslist');
        return;
      }
      
      processSingleVideo(video);
      processedVideos.add(video);
    });
  }

  // Initial and delayed runs
  scanAndProcessVideos(); // Run once at document-idle
  [1000, 3000, 5000, 10000].forEach(delay => {
    setTimeout(scanAndProcessVideos, delay);
  });
  
  // MutationObserver for dynamically added videos
  const bodyObserverConfig = { childList: true, subtree: true };
  const bodyObserver = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        let newVideoFound = false;
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'VIDEO' && !processedVideos.has(node) && node.isConnected) {
              log('Dynamically added VIDEO tag detected:', node);
              processSingleVideo(node);
              processedVideos.add(node);
              newVideoFound = true;
            } else if (typeof node.querySelectorAll === 'function') {
              node.querySelectorAll('video').forEach(videoNode => {
                if (!processedVideos.has(videoNode) && videoNode.isConnected) {
                  log('Dynamically added video in container detected:', videoNode);
                  processSingleVideo(videoNode);
                  processedVideos.add(videoNode);
                  newVideoFound = true;
                }
              });
            }
          }
        });
        // if (newVideoFound) log('Processed dynamically added videos.');
      }
    }
  });

  // Start observing the body once it's available
  if (document.body) {
    bodyObserver.observe(document.body, bodyObserverConfig);
    log('MutationObserver started on document.body.');
  } else {
    // Fallback if script runs too early for document.body
    new MutationObserver((_, obs) => {
      if (document.body) {
        bodyObserver.observe(document.body, bodyObserverConfig);
        log('MutationObserver started on document.body (delayed).');
        obs.disconnect();
      }
    }).observe(document.documentElement, { childList: true });
  }

  log('Script initialization complete.');
})();
