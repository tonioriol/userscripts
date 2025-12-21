// ==UserScript==
// @name         CrossLemmy
// @namespace    https://github.com/tonioriol/userscripts
// @version      1.0.3
// @description  Subscribe to communities from any Lemmy instance using your home instance
// @author       Toni Oriol
// @match        https://*/*
// @icon         data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%2300D1B2%22%3E%3Cpath d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z%22/%3E%3C/svg%3E
// @grant        none
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/crosslemmy.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/crosslemmy.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ⚙️ CONFIGURATION - Change this to your home instance!
    const HOME_INSTANCE = 'lemmy.ml';

    // Detect if we're on a Lemmy instance (look for common Lemmy patterns)
    const isLemmyInstance = () => {
        // Check for Lemmy-specific elements or patterns
        return document.querySelector('meta[name="description"][content*="lemmy"]') ||
               document.querySelector('a[href*="/c/"]') ||
               window.location.pathname.startsWith('/c/');
    };

    // Extract community and instance info from current page
    const getCommunityInfo = () => {
        const currentInstance = window.location.hostname;

        // Match patterns like /c/technology or /c/technology@instance.com
        const pathMatch = window.location.pathname.match(/\/c\/([^@\/]+)(@([^\/]+))?/);

        if (pathMatch) {
            const communityName = pathMatch[1];
            const communityInstance = pathMatch[3] || currentInstance;
            return { communityName, communityInstance, currentInstance };
        }

        return null;
    };

    // Create and inject the subscribe button
    const addSubscribeButton = () => {
        const info = getCommunityInfo();
        if (!info) return;

        const { communityName, communityInstance, currentInstance } = info;

        // Don't add button if we're already on our home instance
        if (currentInstance === HOME_INSTANCE) return;

        // Check if button already exists
        if (document.getElementById('lemmy-cross-subscribe-btn')) return;

        // Create the button
        const button = document.createElement('button');
        button.id = 'lemmy-cross-subscribe-btn';
        button.innerHTML = `📌 Subscribe on ${HOME_INSTANCE}`;
        button.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            padding: 12px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        `;

        // Hover effect
        button.onmouseenter = () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 6px 8px rgba(0,0,0,0.4)';
        };
        button.onmouseleave = () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
        };

        // Click handler
        button.onclick = () => {
            const targetUrl = `https://${HOME_INSTANCE}/c/${communityName}@${communityInstance}`;
            window.open(targetUrl, '_blank');
        };

        document.body.appendChild(button);
    };

    // Also create a bookmarklet version (just log it to console)
    const createBookmarklet = () => {
        const bookmarkletCode = `javascript:(function(){const HOME='${HOME_INSTANCE}';const m=location.pathname.match(/\\/c\\/([^@\\/]+)(@([^\\/]+))?/);if(m){const c=m[1],i=m[3]||location.hostname;if(i!==HOME){window.open('https://'+HOME+'/c/'+c+'@'+i,'_blank');}else{alert('Already on home instance!');}}else{alert('Not on a community page!');}})();`;
        console.log('🔖 Bookmarklet version (drag this to your bookmarks bar):');
        console.log(bookmarkletCode);
    };

    // Initialize
    if (isLemmyInstance()) {
        // Run on page load
        addSubscribeButton();

        // Re-run when URL changes (for single-page app navigation)
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(addSubscribeButton, 500);
            }
        }).observe(document.body, { subtree: true, childList: true });

        // Log bookmarklet version once
        createBookmarklet();
    }
})();
