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
// ==/UserScript==

(function () {
  "use strict";

  // Enable native controls for a specific video
  function enableVideoControls(video) {
    video.setAttribute("controls", "");
    // set z-index to ensure it appears above other elements if position not relative
    // video.style.position = "absolute";
    // video.style.zIndex = "9999999999";
  }

  // Simple PoC: Detect elements positioned on top of video
  function detectVideoOverlays(video) {
    const videoRect = video.getBoundingClientRect();
    const videoStyle = window.getComputedStyle(video);
    const videoZIndex = parseInt(videoStyle.zIndex) || 0;

    const overlays = [];
    const allElements = document.querySelectorAll("*");

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

        element.style.display = "none";
      }
    });

    return overlays;
  }

  // Process all videos on the page
  function processVideos() {
    document.querySelectorAll("video").forEach((video) => {
      enableVideoControls(video);
      detectVideoOverlays(video);
    });
  }

  // Initialize when DOM is ready
  function init() {
    processVideos();

    // Watch for new video elements being added
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;

      mutations.forEach((mutation) => {
        // Check if any new nodes include video elements
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            // Element node
            if (node.tagName === "VIDEO" || node.querySelector("video")) {
              shouldProcess = true;
            }
          }
        });

        // Check for attribute changes on video elements
        if (
          mutation.type === "attributes" &&
          mutation.target.tagName === "VIDEO"
        ) {
          // Re-enable controls if they were removed
          if (
            mutation.attributeName === "controls" &&
            !mutation.target.hasAttribute("controls")
          ) {
            shouldProcess = true;
          }
        }
      });

      if (shouldProcess) {
        processVideos();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Also process videos when they start loading or playing
    document.addEventListener(
      "loadstart",
      (e) => {
        if (e.target.tagName === "VIDEO") {
          enableVideoControls(e.target);
        }
      },
      true
    );

    document.addEventListener(
      "loadedmetadata",
      (e) => {
        if (e.target.tagName === "VIDEO") {
          enableVideoControls(e.target);
        }
      },
      true
    );
  }

  // iOS Safari specific handling (THIS IS WHAT ENABLES PIP ON YOUTUBE SPECIALLY)
  document.addEventListener(
    "touchstart",
    function initOnTouch() {
      let v = document.querySelector("video");
      if (v) {
        v.addEventListener(
          "webkitpresentationmodechanged",
          (e) => e.stopPropagation(),
          true
        );
        // Remove the touchstart listener after we've initialized
        document.removeEventListener("touchstart", initOnTouch);
      }
    },
    true
  );

  // Initialize when page loads
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Also initialize after delays to catch dynamically loaded videos
  setTimeout(init, 1000);
  setTimeout(processVideos, 3000);
})();
