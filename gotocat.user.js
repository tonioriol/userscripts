// ==UserScript==
// @name         GotoCat
// @namespace    https://github.com/tonioriol
// @version      0.1.0
// @description  Automatically redirects Spanish URLs to their Catalan equivalents
// @author       Toni Oriol
// @match        *://*/*
// @grant        GM.getValue
// @grant        GM.setValue
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/gotocat.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/gotocat.user.js
// ==/UserScript==

const notify = () => {
  const div = document.createElement('div')
  div.innerHTML = `<div style="position: fixed; top: 20px; right: 20px; z-index: 999999; padding: 10px 20px; color: white; background-color: black; font-size: 16px; border-radius: 4px; cursor: pointer" onclick="this.remove()">Redirigit a la versió en català ✖</div>`
  document.body.appendChild(div)
  setTimeout(() => div.remove(), 3000)
}

const isLikelyCatalan = async (url) => {
  try {
    const response = await fetch(url)
    if (!response.ok) return false
    
    const text = await response.text()
    const langMatch = text.match(/<html[^>]*lang=["']([^"']*)/i)
    
    if (langMatch) {
      const lang = langMatch[1].toLowerCase()
      if (lang.includes('ca') || lang.includes('va')) return true
      if (lang.includes('en') || lang.includes('fr')) return false
    }
    
    const lower = text.toLowerCase()
    if (lower.includes('canada') || lower.includes('canadian')) return false
    if (lower.includes('català') || lower.includes('catalan')) return true
    
    return true
  } catch {
    return false
  }
}

const tryUrl = async (url) => {
  if (url === location.href) return false
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok && await isLikelyCatalan(url)
  } catch {
    return false
  }
}

(async () => {
  window.addEventListener('load', async () => {
    if (await GM.getValue('notify', false)) {
      await GM.setValue('notify', false)
      notify()
    }
  })

  const url = location.href
  const candidates = [
    // 1. Replace /es paths with /ca
    url.replace(/\/es(\/|$|\?|#)/, '/ca$1'),
    // 2. Replace es. subdomain with ca.
    url.replace(/^(https?:\/\/)es\./, '$1ca.'),
    // 3. Append /ca to path end
    url.replace(/^([^?#]*?)(\/?)([\?#].*)?$/, '$1/ca$2$3'),
    // 4. Insert /ca after domain
    url.replace(/^(https?:\/\/[^\/]+)(.*)$/, '$1/ca$2'),
    // 5. Add ca. subdomain
    url.replace(/^(https?:\/\/)/, '$1ca.'),
    // 6. Replace lang params
    ...['lang', 'ln', 'hl', 'language', 'locale'].map(param => 
      url.replace(new RegExp(`([?&])${param}=(es|esp|spanish)(&|$)`, 'i'), '$1' + param + '=ca$3')
    )
  ].filter((candidate, i, arr) => candidate !== url && arr.indexOf(candidate) === i)

  for (const candidate of candidates) {
    if (await tryUrl(candidate)) {
      await GM.setValue('notify', true)
      location.href = candidate
      break
    }
  }
})()
