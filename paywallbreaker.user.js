// ==UserScript==
// @name         PaywallBreaker
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.0.2
// @description  Context menu shortcuts to bypass article paywalls using 12ft.io
// @author       Toni Oriol
// @license      AGPL-3.0-or-later
// @icon         🔓
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
