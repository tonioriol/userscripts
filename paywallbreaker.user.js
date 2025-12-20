// ==UserScript==
// @name         PaywallBreaker
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.0.2
// @description  Context menu shortcuts to bypass article paywalls using 12ft.io
// @author       Toni Oriol
// @license      AGPL-3.0-or-later
// @icon         data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%2366BB6A%22%3E%3Cpath d=%22M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z%22/%3E%3C/svg%3E
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/paywallbreaker.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/paywallbreaker.user.js
// ==/UserScript==

(() => {
  'use strict';
  
  const BYPASS_SERVICE = 'https://12ft.io/proxy?q=';
  
  const bypassInCurrentTab = () => {
    window.location.href = BYPASS_SERVICE + encodeURIComponent(window.location.href);
  };
  
  const bypassInNewTab = () => {
    const bypassUrl = BYPASS_SERVICE + encodeURIComponent(window.location.href);
    GM_openInTab(bypassUrl, { active: true });
  };
  
  GM_registerMenuCommand('Bypass in Current Tab', bypassInCurrentTab, 'u');
  GM_registerMenuCommand('Bypass in New Tab', bypassInNewTab);
})();
