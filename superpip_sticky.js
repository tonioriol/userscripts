// ==UserScript==
// @name         SuperPiP
// @namespace    https://github.com/user/superpip
// @version      4.1.0
// @description  Restore native Picture-in-Picture functionality on any website with button overlay
// @author       SuperPiP
// @match        https://*/*
// @match        http://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // CSS for the PiP button - positioned as sibling overlay
    const buttonStyles = `
        .superpip-container {
            position: relative !important;
            pointer-events: none !important;
        }
        
        .superpip-button {
            position: absolute !important;
            bottom: 14px !important;
            left: 14px !important;
            width: 48px !important;
            height: 36px !important;
            background: rgba(0, 0, 0, 0.9) !important;
            border: 2px solid rgba(255, 255, 255, 0.9) !important;
            border-radius: 8px !important;
            cursor: pointer !important;
            z-index: 999999999 !important;
            opacity: 1 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            color: white !important;
            font-family: Arial, sans-serif !important;
            font-weight: bold !important;
            user-select: none !important;
            pointer-events: auto !important;
            box-sizing: border-box !important;
        }
        
        .superpip-button::before {
            content: "PiP" !important;
            font-size: 11px !important;
            font-weight: bold !important;
        }
    `;

    // Add styles to the page
    function addStyles() {
        if (document.getElementById('superpip-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'superpip-styles';
        style.textContent = buttonStyles;
        (document.head || document.documentElement).appendChild(style);
    }

    // Create PiP button for a specific video
    function createPipButtonForVideo(video) {
        // Don't add button if video already has one
        if (video.nextElementSibling && video.nextElementSibling.classList.contains('superpip-container')) {
            return;
        }

        // Create container div
        const container = document.createElement('div');
        container.className = 'superpip-container';
        
        // Create button
        const button = document.createElement('div');
        button.className = 'superpip-button';
        button.title = 'Picture in Picture';
        
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
                    if (document.pictureInPictureElement) {
                        await document.exitPictureInPicture();
                    } else {
                        await video.requestPictureInPicture();
                    }
                } else if (video.webkitSupportsPresentationMode && video.webkitSupportsPresentationMode('picture-in-picture')) {
                    // Safari/iOS fallback
                    video.webkitSetPresentationMode('picture-in-picture');
                }
            } catch (error) {
                console.log('PiP not available:', error);
            }
        });

        container.appendChild(button);
        
        // Insert container as sibling after the video
        video.parentNode.insertBefore(container, video.nextSibling);
        console.log('SuperPiP: Added button for video');
    }

    // Check if videos exist and add/remove buttons as needed
    function checkVideos() {
        const videos = document.querySelectorAll('video');
        
        // Remove buttons for videos that no longer exist or are not active
        const existingContainers = document.querySelectorAll('.superpip-container');
        existingContainers.forEach(container => {
            const video = container.previousElementSibling;
            if (!video || video.tagName !== 'VIDEO' ||
                video.offsetWidth < 100 || video.offsetHeight < 100 ||
                (video.readyState < 2 && video.currentTime === 0 && video.paused)) {
                container.remove();
                console.log('SuperPiP: Removed button for inactive video');
            }
        });
        
        // Add buttons for active videos that don't have them
        const activeVideos = Array.from(videos).filter(v =>
            v.offsetWidth > 100 &&
            v.offsetHeight > 100 &&
            (v.readyState >= 2 || v.currentTime > 0 || !v.paused)
        );
        
        activeVideos.forEach(video => {
            createPipButtonForVideo(video);
        });
        
        if (activeVideos.length > 0) {
            console.log('SuperPiP: Processed', activeVideos.length, 'active videos');
        }
    }

    // Initialize when DOM is ready
    function init() {
        addStyles();
        checkVideos();
        
        // Watch for new elements being added (videos, play buttons clicked, etc.)
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            mutations.forEach(mutation => {
                // Check if any new nodes include video elements
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'VIDEO' || node.querySelector('video')) {
                            shouldCheck = true;
                        }
                    }
                });
                
                // Check if any removed nodes were videos
                mutation.removedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.tagName === 'VIDEO' || node.querySelector('video')) {
                            shouldCheck = true;
                        }
                    }
                });
                
                // Check for attribute changes on video elements (like play state)
                if (mutation.type === 'attributes' && mutation.target.tagName === 'VIDEO') {
                    shouldCheck = true;
                }
            });
            
            if (shouldCheck) {
                checkVideos();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'currentTime', 'paused', 'readyState']
        });
        
        // Also listen for video events that indicate playback
        document.addEventListener('play', checkVideos, true);
        document.addEventListener('loadeddata', checkVideos, true);
        document.addEventListener('canplay', checkVideos, true);
    }

    // iOS Safari needs a user interaction first before we can modify video elements
    document.addEventListener('touchstart', function initOnTouch() {
        let v = document.querySelector('video');
        if (v) {
            v.addEventListener('webkitpresentationmodechanged', (e)=>e.stopPropagation(), true);
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
    setTimeout(checkVideos, 3000);
})();