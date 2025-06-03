// ==UserScript==
// @name         FutuReddit
// @namespace    https://github.com/tonioriol
// @version      0.0.1
// @description  Automatically redirects old Reddit to modern Reddit interface
// @author       Toni Oriol
// @match        *://old.reddit.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @grant        none
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/futureddit.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/futureddit.user.js
// ==/UserScript==

(function() {
    'use strict';
    window.location.href = window.location.href.replace("old.reddit.com", "www.reddit.com")
})();