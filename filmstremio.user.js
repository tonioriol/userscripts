// ==UserScript==
// @name         FilmStremio
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.0.1
// @description  Adds Stremio link next to movie titles on FilmAffinity
// @author       Toni Oriol
// @icon         https://www.google.com/s2/favicons?sz=64&domain=stremio.com
// @match        https://www.filmaffinity.com/*/film*.html
// @grant        none
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/filmstremio.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/filmstremio.user.js
// ==/UserScript==

(() => {
  'use strict';

  const STREMIO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="#8E44AD" style="vertical-align: middle; margin-left: 8px; cursor: pointer;">
    <path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
  </svg>`;

  /**
   * Extract original title from the movie info section
   */
  const getOriginalTitle = () => {
    const leftColumn = document.getElementById('left-column');
    if (!leftColumn) return null;

    const movieInfo = leftColumn.querySelector('dl.movie-info');
    if (!movieInfo) return null;

    // Find the "Título original" dt element
    const dtElements = movieInfo.querySelectorAll('dt');
    for (const dt of dtElements) {
      if (dt.textContent.trim() === 'Título original') {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          return dd.textContent.trim();
        }
      }
    }

    return null;
  };

  /**
   * Get the displayed title from the main title element
   */
  const getDisplayedTitle = () => {
    const titleElement = document.querySelector('#main-title span[itemprop="name"]');
    return titleElement ? titleElement.textContent.trim() : null;
  };

  /**
   * Create Stremio deep link
   */
  const createStremioLink = (title) => {
    // Stremio search URL format
    const encodedTitle = encodeURIComponent(title);
    return `stremio:///search?search=${encodedTitle}`;
  };

  /**
   * Add Stremio icon next to the title
   */
  const addStremioIcon = () => {
    const mainTitle = document.getElementById('main-title');
    if (!mainTitle) {
      console.log('[FilmStremio] Main title element not found');
      return;
    }

    // Check if icon already exists
    if (mainTitle.querySelector('.filmstremio-link')) {
      return;
    }

    // Try to get original title first, fallback to displayed title
    const originalTitle = getOriginalTitle();
    const displayedTitle = getDisplayedTitle();
    const title = originalTitle || displayedTitle;

    if (!title) {
      console.log('[FilmStremio] No title found');
      return;
    }

    console.log(`[FilmStremio] Using title: ${title}`);

    // Create link element
    const link = document.createElement('a');
    link.className = 'filmstremio-link';
    link.href = createStremioLink(title);
    link.title = `Open "${title}" in Stremio`;
    link.innerHTML = STREMIO_ICON;
    link.style.textDecoration = 'none';

    // Add click event to prevent default if needed
    link.addEventListener('click', (e) => {
      // Let the browser handle the custom protocol
      console.log('[FilmStremio] Opening in Stremio:', title);
    });

    // Append icon to the title
    mainTitle.appendChild(link);
    console.log('[FilmStremio] Stremio icon added');
  };

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addStremioIcon);
  } else {
    addStremioIcon();
  }

  // Watch for dynamic changes (in case the page uses AJAX)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const mainTitle = document.getElementById('main-title');
        if (mainTitle && !mainTitle.querySelector('.filmstremio-link')) {
          addStremioIcon();
          break;
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('[FilmStremio] Script initialized');
})();
