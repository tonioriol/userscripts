// ==UserScript==
// @name         SuperPiP
// @namespace    https://github.com/user/superpip
// @version      5.0.0
// @description  Enable native video controls with Picture-in-Picture functionality on any website
// @author       SuperPiP
// @match        https://*/*
// @match        http://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Enable native controls for a specific video
    function enableVideoControls(video) {
        // Skip if controls are already enabled
        if (video.hasAttribute('controls') || video._superpipProcessed) {
            return;
        }

        // Mark as processed to avoid duplicate processing
        video._superpipProcessed = true;

        // Enable native controls
        video.setAttribute('controls', '');
        
        // Remove disablepictureinpicture attribute if present
        if (video.hasAttribute('disablepictureinpicture')) {
            video.removeAttribute('disablepictureinpicture');
        }
        
        // Ensure PiP is not disabled via property
        video.disablePictureInPicture = false;

        console.log('SuperPiP: Enabled native controls for video');
    }

    // Simple PoC: Detect elements positioned on top of video
    function detectVideoOverlays(video) {
        const videoRect = video.getBoundingClientRect();
        const videoStyle = window.getComputedStyle(video);
        const videoZIndex = parseInt(videoStyle.zIndex) || 0;
        
        const overlays = [];
        const allElements = document.querySelectorAll('*');
        
        allElements.forEach(element => {
            // Skip the video itself and its containers
            if (element === video || element.contains(video)) return;
            
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            const zIndex = parseInt(style.zIndex) || 0;
            
            // Much stricter - element must be within video bounds AND positioned
            const isPositioned = ['absolute', 'fixed'].includes(style.position);
            const isOnTop = (isPositioned && zIndex >= videoZIndex);
            const isWithinBounds = rect.left >= videoRect.left &&
                                   rect.right <= videoRect.right &&
                                   rect.top >= videoRect.top &&
                                   rect.bottom <= videoRect.bottom;
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            
            if (isOnTop && isWithinBounds && isVisible) {
                overlays.push({
                    element: element,
                    tagName: element.tagName,
                    classes: Array.from(element.classList),
                    zIndex: zIndex
                });
                
                // Hide the overlay element
                console.log(`🚫 SuperPiP: Hiding overlay: ${element.tagName}`);
                element.style.display = 'none';
            }
        });
        
        if (overlays.length > 0) {
            console.log('SuperPiP: Found', overlays.length, 'overlays on video:', overlays);
        }
        
        return overlays;
    }

    // Process all videos on the page
    function processVideos() {
        const videos = document.querySelectorAll('video');
        
        // Filter for videos that are visible and have meaningful dimensions
        const visibleVideos = Array.from(videos).filter(v => 
            v.offsetWidth > 50 && 
            v.offsetHeight > 50
        );
        
        visibleVideos.forEach(video => {
            enableVideoControls(video);
            // Detect overlays for debugging
            detectVideoOverlays(video);
        });
        
        if (visibleVideos.length > 0) {
            console.log('SuperPiP: Processed', visibleVideos.length, 'videos');
        }
    }

    // Initialize when DOM is ready
    function init() {
        processVideos();
        
        // Watch for new video elements being added
        const observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            
            mutations.forEach(mutation => {
                // Check if any new nodes include video elements
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'VIDEO' || node.querySelector('video')) {
                            shouldProcess = true;
                        }
                    }
                });
                
                // Check for attribute changes on video elements
                if (mutation.type === 'attributes' && mutation.target.tagName === 'VIDEO') {
                    // Re-enable controls if they were removed
                    if (mutation.attributeName === 'controls' && !mutation.target.hasAttribute('controls')) {
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
            attributeFilter: ['controls', 'disablepictureinpicture', 'src']
        });
        
        // Also process videos when they start loading or playing
        document.addEventListener('loadstart', (e) => {
            if (e.target.tagName === 'VIDEO') {
                enableVideoControls(e.target);
            }
        }, true);
        
        document.addEventListener('loadedmetadata', (e) => {
            if (e.target.tagName === 'VIDEO') {
                enableVideoControls(e.target);
            }
        }, true);
    }

    // iOS Safari specific handling
    document.addEventListener('touchstart', function initOnTouch() {
        let v = document.querySelector('video');
        if (v) {
            v.addEventListener('webkitpresentationmodechanged', (e) => e.stopPropagation(), true);
            // Remove the touchstart listener after we've initialized
            document.removeEventListener('touchstart', initOnTouch);
        }
    }, true);

    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Also initialize after delays to catch dynamically loaded videos
    setTimeout(init, 1000);
    setTimeout(processVideos, 3000);
})();