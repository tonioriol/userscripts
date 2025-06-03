// ==UserScript==
// @name         GoToCat
// @namespace    https://github.com/tonioriol
// @version      0.3.1
// @description  Automatically redirects Spanish URLs to their Catalan equivalents
// @author       Toni Oriol
// @match        *://*/*
// @grant        GM.getValue
// @grant        GM.setValue
// @require      https://github.com/tonioriol/userscripts/raw/refs/heads/main/lang-codes.js
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/gotocat.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/gotocat.user.js
// ==/UserScript==

const CONFIG = {
  targetLang: 'ca',
  variants: ['ca', 'va'], // Catalan, Valencian
  keywords: ['català', 'catalan', 'generalitat', 'ajuntament'],
  rejections: ['canada', 'canadian', 'canadien'],
  langRejections: ['en', 'fr'], // HTML lang conflicts (Canada/France)
  urlParams: ['lang', 'ln', 'hl'],
  notificationTimeout: 3000
}

const createNotification = () => {
  const notification = document.createElement('div')
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '999999',
    padding: '10px 20px',
    color: 'white',
    backgroundColor: 'black',
    fontSize: '16px',
    borderRadius: '4px',
    cursor: 'pointer'
  })
  
  notification.textContent = 'GoToCat Redirected ✖'
  notification.onclick = () => notification.remove()
  
  document.body.appendChild(notification)
  setTimeout(() => notification.remove?.(), CONFIG.notificationTimeout)
}

const isTargetLanguage = async (url) => {
  try {
    const response = await fetch(url)
    if (!response.ok) return false
    
    const text = await response.text()
    const lowerText = text.toLowerCase()
    const langMatch = text.match(/<html[^>]*lang=["']([^"']*)/i)
    
    // Check HTML lang attribute first
    if (langMatch) {
      const lang = langMatch[1].toLowerCase()
      const hasTargetVariant = CONFIG.variants.some(variant => lang.includes(variant))
      const hasRejectedLang = CONFIG.langRejections.some(rejected => lang.includes(rejected))
      
      if (hasTargetVariant) return true
      if (hasRejectedLang) return false
    }
    
    // Check content for rejections and keywords
    const hasRejections = CONFIG.rejections.some(rejection => lowerText.includes(rejection))
    const hasKeywords = CONFIG.keywords.some(keyword => lowerText.includes(keyword))
    
    return !hasRejections && hasKeywords
  } catch {
    return false
  }
}

const generateUrlCandidates = (url) => {
  const candidates = []
  const urlObj = new URL(url)
  
  // Extract all language codes from imported lang-codes.js
  const allLanguageCodes = langCodes
    .flatMap(lang => [lang.alpha2, lang.alpha3_b, lang.alpha3_t])
    .filter(Boolean)
  
  // Try replacing existing language codes first
  const langPattern = new RegExp(`(?<!\\.)\\b(${allLanguageCodes.join('|')})\\b`, 'gi')
  const replacedUrl = url.replace(langPattern, CONFIG.targetLang)
  
  if (replacedUrl !== url) {
    candidates.push(replacedUrl)
    return candidates
  }
  
  // Skip injection if target language already present
  const hasTargetLang = url.includes(`/${CONFIG.targetLang}/`) || url.includes(`=${CONFIG.targetLang}`)
  if (hasTargetLang) return candidates
  
  // Path injection methods
  candidates.push(
    `${urlObj.origin}/${CONFIG.targetLang}${urlObj.pathname}${urlObj.search}${urlObj.hash}`,
    `${urlObj.origin}${urlObj.pathname.replace(/\/$/, '')}/${CONFIG.targetLang}${urlObj.search}${urlObj.hash}`
  )
  
  // Subdomain injection
  candidates.push(url.replace(/^(https?:\/\/)/, `$1${CONFIG.targetLang}.`))
  
  // URL parameter injection
  CONFIG.urlParams.forEach(param => {
    const paramUrl = new URL(url)
    paramUrl.searchParams.set(param, CONFIG.targetLang)
    candidates.push(paramUrl.toString())
  })
  
  return candidates
}

const handleNotification = async () => {
  if (await GM.getValue('notify', false)) {
    await GM.setValue('notify', false)
    createNotification()
  }
}

const tryRedirect = async () => {
  const url = location.href
  const domain = location.hostname
  const redirectKey = `gotocat_redirected_${domain}`
  
  // Check if already redirected for this domain
  if (await GM.getValue(redirectKey, false)) return
  
  const candidates = generateUrlCandidates(url)
  
  // Test each candidate URL
  for (const candidate of candidates.filter(c => c !== url)) {
    if (await isTargetLanguage(candidate)) {
      await Promise.all([
        GM.setValue('notify', true),
        GM.setValue(redirectKey, true)
      ])
      location.href = candidate
      return
    }
  }
}

// Main execution
(async () => {
  // Only run in top-level window, not iframes
  if (window !== window.top) return

  window.addEventListener('load', handleNotification)
  await tryRedirect()
})()
