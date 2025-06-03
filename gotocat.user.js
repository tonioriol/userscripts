// ==UserScript==
// @name         GotoCat
// @namespace    https://github.com/tonioriol
// @version      0.0.4
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
  
  // Domains where /ca/ typically means Canada, not Catalan
  const canadaDomains = [
    'filmaffinity.com',
    'imdb.com',
    'amazon.com',
    'booking.com',
    'tripadvisor.com'
  ]
  
  // Domain-specific Catalan patterns
  const domainPatterns = {
    'wikipedia.org': {
      from: '/wiki/',
      to: '/wiki/',
      langParam: '?lang=ca'
    },
    'gov.cat': {
      preferSubdomain: true
    }
  }
  
  // Check if current domain might confuse /ca/ with Canada
  const isCanadaDomain = canadaDomains.some(domain => location.hostname.includes(domain))
  
  // Try multiple Catalan URL patterns
  const urlsToTry = []
  
  // 1. Replace /es/ with /ca/ if it exists (always safe)
  const esPathReplaced = location.href.replace(/(\/es\/)/, '/ca/')
  if (esPathReplaced !== location.href) {
    urlsToTry.push(esPathReplaced)
  }
  
  // 2. Replace es. subdomain with ca. if it exists (always safe)
  const esSubdomainReplaced = location.href.replace(/^(https?:\/\/)es\./, '$1ca.')
  if (esSubdomainReplaced !== location.href) {
    urlsToTry.push(esSubdomainReplaced)
  }
  
  // 3. Try adding /ca/ path only if not a Canada-prone domain
  if (!location.pathname.includes('/ca/') && !isCanadaDomain) {
    const caPathAdded = location.origin + '/ca' + location.pathname + location.search + location.hash
    urlsToTry.push(caPathAdded)
  }
  
  // 4. Always try ca. subdomain if not already present
  if (!location.hostname.startsWith('ca.')) {
    const caSubdomainAdded = location.href.replace(/^(https?:\/\/)/, '$1ca.')
    urlsToTry.push(caSubdomainAdded)
  }
  
  // Simple function to check if a page is likely in Catalan
  const isLikelyCatalan = async (url) => {
    try {
      const response = await fetch(url)
      if (!response.ok) return false
      
      const text = await response.text()
      
      // 1. First check HTML lang attribute (most reliable)
      const langMatch = text.match(/<html[^>]*lang=["']([^"']*)/i)
      if (langMatch) {
        const lang = langMatch[1].toLowerCase()
        // Accept if lang contains "ca" or "va" (Catalan or Valencian)
        if (lang.includes('ca') || lang.includes('va')) return true
        // For Canada-prone domains, reject if contains en OR fr
        if (isCanadaDomain && (lang.includes('en') || lang.includes('fr'))) return false
      }
      
      // 2. If no lang attribute, do simple keyword check
      const lowerText = text.toLowerCase()
      
      // Check for Canada keywords (reject if found)
      if (lowerText.includes('canada') || lowerText.includes('canadian') || lowerText.includes('canadien')) {
        return false
      }
      
      // Check for Catalan keywords (accept if found)
      if (lowerText.includes('cat') || lowerText.includes('català') || lowerText.includes('catalan')) {
        return true
      }
      
      // If no clear indicators, assume it's worth trying
      return true
      
    } catch (error) {
      return false
    }
  }
  
  // Try each URL until we find one that works and is actually Catalan
  for (const url of urlsToTry) {
    if (url !== location.href) {
      try {
        const response = await fetch(url, { method: 'HEAD' }) // Use HEAD for faster check
        if (response.ok) {
          // If it's a potentially problematic domain, verify it's actually Catalan
          if (isCanadaDomain && url.includes('/ca/')) {
            const isCatalan = await isLikelyCatalan(url)
            if (!isCatalan) {
              continue // Skip this URL, try the next one
            }
          }
          
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


