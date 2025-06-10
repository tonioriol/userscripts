// ==UserScript==
// @name         SuperPiP
// @namespace    https://github.com/tonioriol
// @version      0.0.1
// @description  Enable native video controls with Picture-in-Picture functionality on any website
// @author       SuperPiP
// @match        https://*/*
// @match        http://*/*
// @grant        none
// @run-at       document-start
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/superpip.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/superpip.user.js
// ==/UserScript==

(function () {
  "use strict";

  console.log("[SuperPiP] Script started at", new Date().toISOString());
  console.log("[SuperPiP] Document readyState:", document.readyState);
  console.log("[SuperPiP] User agent:", navigator.userAgent);

  // Check if video is in viewport
  function isVideoInViewport(video) {
    const rect = video.getBoundingClientRect();
    const viewHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewWidth = window.innerWidth || document.documentElement.clientWidth;
    
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= viewHeight &&
      rect.right <= viewWidth &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  // Enhanced video setup for better UX
  function enableVideoControls(video) {
    // Always set controls, but only log if it's actually changing
    if (!video.hasAttribute("controls")) {
      console.log("[SuperPiP] Enabling controls for video:", video);
    }
    try {
      video.setAttribute("controls", "");
      
      // Hide controls by default - will show on click
      video.style.setProperty('--webkit-media-controls-panel', 'none', 'important');
      video.style.setProperty('--webkit-media-controls', 'none', 'important');
      video.controlsList = "nodownload nofullscreen noremoteplayback";
      
      // Set up enhanced functionality only once per video
      if (!video.hasAttribute('data-superpip-setup')) {
        video.setAttribute('data-superpip-setup', 'true');
        
        let controlsVisible = false;
        video.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          controlsVisible = !controlsVisible;
          if (controlsVisible) {
            video.style.removeProperty('--webkit-media-controls-panel');
            video.style.removeProperty('--webkit-media-controls');
            console.log("[SuperPiP] Controls shown");
          } else {
            video.style.setProperty('--webkit-media-controls-panel', 'none', 'important');
            video.style.setProperty('--webkit-media-controls', 'none', 'important');
            console.log("[SuperPiP] Controls hidden");
          }
        }, { capture: true });
        
        // Auto-unmute when playing (counter Instagram's nasty muting)
        // This only triggers when video actually starts playing, not on setup
        video.addEventListener('play', () => {
          if (video.muted) {
            video.muted = false;
            console.log("[SuperPiP] Auto-unmuted video on play");
          }
        });
        
        // Smart autoplay: only autoplay if video is in viewport
        if (isVideoInViewport(video) && video.paused && video.readyState >= 2) {
          console.log("[SuperPiP] Autoplaying video in viewport");
          video.play().catch(() => {}); // Ignore autoplay policy errors
        }
        
        console.log("[SuperPiP] Enhanced video setup complete");
      }
      
      if (!video.hasAttribute("controls")) {
        console.log("[SuperPiP] Controls enabled successfully for video");
      }
    } catch (error) {
      console.error("[SuperPiP] Error enabling controls:", error);
    }
    // set z-index to ensure it appears above other elements if position not relative
    // video.style.position = "absolute";
    // video.style.zIndex = "9999999999";
  }

  // Simple PoC: Detect elements positioned on top of video
  function detectVideoOverlays(video) {
    try {
      const videoRect = video.getBoundingClientRect();
      
      // Skip processing if video has no dimensions (not rendered yet) but don't log
      if (videoRect.width === 0 || videoRect.height === 0) {
        return [];
      }

      console.log("[SuperPiP] Detecting overlays for video:", video);
      const videoStyle = window.getComputedStyle(video);
      const videoZIndex = parseInt(videoStyle.zIndex) || 0;

      console.log("[SuperPiP] Video rect:", videoRect);
      console.log("[SuperPiP] Video zIndex:", videoZIndex);

      const overlays = [];
      const allElements = document.querySelectorAll("*");

      console.log("[SuperPiP] Checking", allElements.length, "elements for overlays");

      allElements.forEach((element) => {
        // Skip the video itself and its containers
        if (element === video || element.contains(video)) return;

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const zIndex = parseInt(style.zIndex) || 0;

        // element must be within video bounds AND positioned
        const isPositioned = !["relative"].includes(style.position);
        const isOnTop = isPositioned && zIndex >= videoZIndex;
        const isWithinBounds =
          rect.left >= videoRect.left &&
          rect.right <= videoRect.right &&
          rect.top >= videoRect.top &&
          rect.bottom <= videoRect.bottom;
        const isVisible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0";

        if (isOnTop && isWithinBounds && isVisible) {
          overlays.push({
            element: element,
            tagName: element.tagName,
            classes: Array.from(element.classList),
            zIndex: zIndex,
          });

          console.log("[SuperPiP] Hiding overlay element:", element.tagName, element.className);
          element.style.display = "none";
        }
      });

      console.log("[SuperPiP] Found", overlays.length, "overlays");
      return overlays;
    } catch (error) {
      console.error("[SuperPiP] Error detecting overlays:", error);
      return [];
    }
  }

  // Process all videos on the page
  function processVideos() {
    console.log("[SuperPiP] Processing videos...");
    const videos = document.querySelectorAll("video");
    console.log("[SuperPiP] Found", videos.length, "video elements");
    
    videos.forEach((video, index) => {
      console.log("[SuperPiP] Processing video", index + 1, "of", videos.length);
      enableVideoControls(video);
      detectVideoOverlays(video);
    });
  }

  // Initialize and set up observers
  function init() {
    console.log("[SuperPiP] Initializing...");
    
    try {
      // Process any existing videos
      processVideos();

      // Set up mutation observer to watch for video elements and their changes
      console.log("[SuperPiP] Setting up mutation observer...");
      const observer = new MutationObserver((mutations) => {
        // Pre-filter: only process mutations that might involve videos
        let hasVideoChanges = false;
        let newVideoCount = 0;

        mutations.forEach((mutation) => {
          // Handle new nodes being added
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1) { // Element node
                if (node.tagName === "VIDEO") {
                  // Direct video element added
                  enableVideoControls(node);
                  detectVideoOverlays(node);
                  newVideoCount++;
                  hasVideoChanges = true;
                } else if (node.querySelector) {
                  // Check if added node contains video elements
                  const videos = node.querySelectorAll("video");
                  if (videos.length > 0) {
                    videos.forEach((video) => {
                      enableVideoControls(video);
                      detectVideoOverlays(video);
                    });
                    newVideoCount += videos.length;
                    hasVideoChanges = true;
                  }
                }
              }
            });
          }
          
          // Handle attribute changes on video elements
          if (mutation.type === "attributes" && mutation.target.tagName === "VIDEO") {
            const video = mutation.target;
            
            // Re-enable controls if they were removed
            if (mutation.attributeName === "controls" && !video.hasAttribute("controls")) {
              console.log("[SuperPiP] Re-enabling removed controls");
              enableVideoControls(video);
              hasVideoChanges = true;
            }
            
            // Re-process overlays for any video attribute change that might affect layout
            if (["src", "style", "class", "width", "height"].includes(mutation.attributeName)) {
              detectVideoOverlays(video);
              hasVideoChanges = true;
            }
          }
        });

        // Only log when we actually processed videos
        if (newVideoCount > 0) {
          console.log("[SuperPiP] Processed", newVideoCount, "new videos");
        }
      });

      // Start observing - use document.documentElement if body doesn't exist yet
      const target = document.body || document.documentElement;
      console.log("[SuperPiP] Observing target:", target.tagName);
      
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true
        // No attributeFilter - listen to all attributes but filter by video tagName in callback
      });

      console.log("[SuperPiP] Mutation observer set up successfully");

      // Handle video events for when videos start loading or playing
      console.log("[SuperPiP] Setting up video event listeners...");
      
      document.addEventListener("loadstart", (e) => {
        if (e.target.tagName === "VIDEO") {
          console.log("[SuperPiP] Video loadstart event:", e.target);
          enableVideoControls(e.target);
          detectVideoOverlays(e.target);
        }
      }, true);

      document.addEventListener("loadedmetadata", (e) => {
        if (e.target.tagName === "VIDEO") {
          console.log("[SuperPiP] Video loadedmetadata event:", e.target);
          enableVideoControls(e.target);
          detectVideoOverlays(e.target);
        }
      }, true);

      console.log("[SuperPiP] Event listeners set up successfully");
    } catch (error) {
      console.error("[SuperPiP] Error during initialization:", error);
    }
  }

  // iOS Safari specific handling (THIS IS WHAT ENABLES PIP ON YOUTUBE SPECIALLY)
  console.log("[SuperPiP] Setting up iOS Safari specific handling...");
  
  document.addEventListener(
    "touchstart",
    function initOnTouch() {
      console.log("[SuperPiP] Touch event detected, setting up iOS PiP handling");
      let v = document.querySelector("video");
      if (v) {
        console.log("[SuperPiP] Found video for iOS PiP setup:", v);
        v.addEventListener(
          "webkitpresentationmodechanged",
          (e) => {
            console.log("[SuperPiP] webkitpresentationmodechanged event:", e);
            e.stopPropagation();
          },
          true
        );
        // Remove the touchstart listener after we've initialized
        document.removeEventListener("touchstart", initOnTouch);
        console.log("[SuperPiP] iOS PiP handling set up successfully");
      } else {
        console.log("[SuperPiP] No video found for iOS PiP setup");
      }
    },
    true
  );

  // Start immediately since we're running at document-start
  console.log("[SuperPiP] Starting initialization...");
  init();
  console.log("[SuperPiP] Script initialization complete");
})();

