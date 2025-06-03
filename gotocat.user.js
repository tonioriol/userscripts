// ==UserScript==
// @name         GotoCat
// @namespace    https://github.com/tonioriol
// @version      0.0.3
// @description  Automatically redirects Spanish URLs to their Catalan equivalents
// @author       Toni Oriol
// @match        *://*/*
// @grant        GM.getValue
// @grant        GM.setValue
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/gotocat.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/gotocat.user.js
// ==/UserScript==


const popover = `
  <div style="position: absolute; top: 50px; left: 50px; z-index: 999999; padding: 10px 20px; color: white; background-color: black; font-size: 32px; display: flex; align-items: center; gap: 16px" onclick="this.hidden=true">
    Redirigit a la versió en català. <span style="font-size: 1.5em">✖</span>
  </div>
`


const notify = () => {
  const div = document.createElement('div')
  div.innerHTML = popover
  document.body.appendChild(div)
  setTimeout(() => {
    div.hidden = true
  }, 3000)
}

(async () => {
  window.addEventListener('load', async () => {
    const notf = await GM.getValue('notify', false)

    if (notf) {
      await GM.setValue('notify', false)
      notify()
    }
  })

  const oldHref = location.href
  
  // Try multiple Catalan URL patterns
  const urlsToTry = []
  
  // 1. Replace /es/ with /ca/ if it exists
  const esPathReplaced = location.href.replace(/(\/es\/)/, '/ca/')
  if (esPathReplaced !== location.href) {
    urlsToTry.push(esPathReplaced)
  }
  
  // 2. Replace es. subdomain with ca. if it exists
  const esSubdomainReplaced = location.href.replace(/^(https?:\/\/)es\./, '$1ca.')
  if (esSubdomainReplaced !== location.href) {
    urlsToTry.push(esSubdomainReplaced)
  }
  
  // 3. Always try adding /ca/ path if not already present
  if (!location.pathname.includes('/ca/')) {
    const caPathAdded = location.origin + '/ca' + location.pathname + location.search + location.hash
    urlsToTry.push(caPathAdded)
  }
  
  // 4. Always try ca. subdomain if not already present
  if (!location.hostname.startsWith('ca.')) {
    const caSubdomainAdded = location.href.replace(/^(https?:\/\/)/, '$1ca.')
    urlsToTry.push(caSubdomainAdded)
  }
  
  // Try each URL until we find one that works
  for (const url of urlsToTry) {
    if (url !== location.href) {
      try {
        const response = await fetch(url)
        if (response.ok) {
          location.href = url
          await GM.setValue('notify', true)
          break
        }
      } catch (error) {
        // Continue to next URL if this one fails
        continue
      }
    }
  }
})()


