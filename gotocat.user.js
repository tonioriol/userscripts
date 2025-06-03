// ==UserScript==
// @name         GotoCat
// @namespace    https://github.com/tonioriol
// @version      0.2.0
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
  const langCodes = ['aa','ab','ae','af','ak','am','an','ar','as','av','ay','az','ba','be','bg','bh','bi','bm','bn','bo','br','bs','ca','ce','ch','co','cr','cs','cu','cv','cy','da','de','dv','dz','ee','el','en','eo','es','et','eu','fa','ff','fi','fj','fo','fr','fy','ga','gd','gl','gn','gu','gv','ha','he','hi','ho','hr','ht','hu','hy','hz','ia','id','ie','ig','ii','ik','io','is','it','iu','ja','jv','ka','kg','ki','kj','kk','kl','km','kn','ko','kr','ks','ku','kv','kw','ky','la','lb','lg','li','ln','lo','lt','lu','lv','mg','mh','mi','mk','ml','mn','mr','ms','mt','my','na','nb','nd','ne','ng','nl','nn','no','nr','nv','ny','oc','oj','om','or','os','pa','pi','pl','ps','pt','qu','rm','rn','ro','ru','rw','sa','sc','sd','se','sg','si','sk','sl','sm','sn','so','sq','sr','ss','st','su','sv','sw','ta','te','tg','th','ti','tk','tl','tn','to','tr','ts','tt','tw','ty','ug','uk','ur','uz','ve','vi','vo','wa','wo','xh','yi','yo','za','zh','zu']
  const langPattern = `(${langCodes.join('|')})`
  
  const candidates = []
  
  // 1. Replace any detected language code with 'ca'
  const replacements = [
    [new RegExp(`/${langPattern}(/|$|\\?|#)`, 'g'), '/ca$2'],    // paths: /es/ → /ca/
    [new RegExp(`^(https?://)${langPattern}\\.`, 'g'), '$1ca.'], // subdomains: es. → ca.
    [new RegExp(`([?&])(lang|ln|hl|language|locale)=${langPattern}(&|$)`, 'gi'), '$1$2=ca$4'] // params: lang=es → lang=ca
  ]
  
  for (const [search, replace] of replacements) {
    const candidate = url.replace(search, replace)
    if (candidate !== url) candidates.push(candidate)
  }
  
  // 2. If no language codes found, try injection methods
  if (candidates.length === 0) {
    const urlObj = new URL(url)
    candidates.push(
      // Inject /ca after domain
      `${urlObj.origin}/ca${urlObj.pathname}${urlObj.search}${urlObj.hash}`,
      // Inject /ca at end of path
      `${urlObj.origin}${urlObj.pathname.replace(/\/$/, '')}/ca${urlObj.search}${urlObj.hash}`,
      // Inject ca. subdomain
      url.replace(/^(https?:\/\/)/, '$1ca.'),
      // Inject lang params
      ...['lang', 'ln', 'hl'].map(param => {
        const newUrl = new URL(url)
        newUrl.searchParams.set(param, 'ca')
        return newUrl.toString()
      })
    )
  }
  
  // Remove duplicates and self
  const uniqueCandidates = [...new Set(candidates)].filter(c => c !== url)

  for (const candidate of uniqueCandidates) {
    if (await tryUrl(candidate)) {
      await GM.setValue('notify', true)
      location.href = candidate
      break
    }
  }
})()

const langs = [
  { "code": "aa", "name": "Afar" },
  { "code": "ab", "name": "Abkhazian" },
  { "code": "ae", "name": "Avestan" },
  { "code": "af", "name": "Afrikaans" },
  { "code": "ak", "name": "Akan" },
  { "code": "am", "name": "Amharic" },
  { "code": "an", "name": "Aragonese" },
  { "code": "ar", "name": "Arabic" },
  { "code": "as", "name": "Assamese" },
  { "code": "av", "name": "Avaric" },
  { "code": "ay", "name": "Aymara" },
  { "code": "az", "name": "Azerbaijani" },
  { "code": "ba", "name": "Bashkir" },
  { "code": "be", "name": "Belarusian" },
  { "code": "bg", "name": "Bulgarian" },
  { "code": "bh", "name": "Bihari languages" },
  { "code": "bi", "name": "Bislama" },
  { "code": "bm", "name": "Bambara" },
  { "code": "bn", "name": "Bengali" },
  { "code": "bo", "name": "Tibetan" },
  { "code": "br", "name": "Breton" },
  { "code": "bs", "name": "Bosnian" },
  { "code": "ca", "name": "Catalan; Valencian" },
  { "code": "ce", "name": "Chechen" },
  { "code": "ch", "name": "Chamorro" },
  { "code": "co", "name": "Corsican" },
  { "code": "cr", "name": "Cree" },
  { "code": "cs", "name": "Czech" },
  {
    "code": "cu",
    "name": "Church Slavic; Old Slavonic; Church Slavonic; Old Bulgarian; Old Church Slavonic"
  },
  { "code": "cv", "name": "Chuvash" },
  { "code": "cy", "name": "Welsh" },
  { "code": "da", "name": "Danish" },
  { "code": "de", "name": "German" },
  { "code": "dv", "name": "Divehi; Dhivehi; Maldivian" },
  { "code": "dz", "name": "Dzongkha" },
  { "code": "ee", "name": "Ewe" },
  { "code": "el", "name": "Greek, Modern (1453-)" },
  { "code": "en", "name": "English" },
  { "code": "eo", "name": "Esperanto" },
  { "code": "es", "name": "Spanish; Castilian" },
  { "code": "et", "name": "Estonian" },
  { "code": "eu", "name": "Basque" },
  { "code": "fa", "name": "Persian" },
  { "code": "ff", "name": "Fulah" },
  { "code": "fi", "name": "Finnish" },
  { "code": "fj", "name": "Fijian" },
  { "code": "fo", "name": "Faroese" },
  { "code": "fr", "name": "French" },
  { "code": "fy", "name": "Western Frisian" },
  { "code": "ga", "name": "Irish" },
  { "code": "gd", "name": "Gaelic; Scomttish Gaelic" },
  { "code": "gl", "name": "Galician" },
  { "code": "gn", "name": "Guarani" },
  { "code": "gu", "name": "Gujarati" },
  { "code": "gv", "name": "Manx" },
  { "code": "ha", "name": "Hausa" },
  { "code": "he", "name": "Hebrew" },
  { "code": "hi", "name": "Hindi" },
  { "code": "ho", "name": "Hiri Motu" },
  { "code": "hr", "name": "Croatian" },
  { "code": "ht", "name": "Haitian; Haitian Creole" },
  { "code": "hu", "name": "Hungarian" },
  { "code": "hy", "name": "Armenian" },
  { "code": "hz", "name": "Herero" },
  {
    "code": "ia",
    "name": "Interlingua (International Auxiliary Language Association)"
  },
  { "code": "id", "name": "Indonesian" },
  { "code": "ie", "name": "Interlingue; Occidental" },
  { "code": "ig", "name": "Igbo" },
  { "code": "ii", "name": "Sichuan Yi; Nuosu" },
  { "code": "ik", "name": "Inupiaq" },
  { "code": "io", "name": "Ido" },
  { "code": "is", "name": "Icelandic" },
  { "code": "it", "name": "Italian" },
  { "code": "iu", "name": "Inuktitut" },
  { "code": "ja", "name": "Japanese" },
  { "code": "jv", "name": "Javanese" },
  { "code": "ka", "name": "Georgian" },
  { "code": "kg", "name": "Kongo" },
  { "code": "ki", "name": "Kikuyu; Gikuyu" },
  { "code": "kj", "name": "Kuanyama; Kwanyama" },
  { "code": "kk", "name": "Kazakh" },
  { "code": "kl", "name": "Kalaallisut; Greenlandic" },
  { "code": "km", "name": "Central Khmer" },
  { "code": "kn", "name": "Kannada" },
  { "code": "ko", "name": "Korean" },
  { "code": "kr", "name": "Kanuri" },
  { "code": "ks", "name": "Kashmiri" },
  { "code": "ku", "name": "Kurdish" },
  { "code": "kv", "name": "Komi" },
  { "code": "kw", "name": "Cornish" },
  { "code": "ky", "name": "Kirghiz; Kyrgyz" },
  { "code": "la", "name": "Latin" },
  { "code": "lb", "name": "Luxembourgish; Letzeburgesch" },
  { "code": "lg", "name": "Ganda" },
  { "code": "li", "name": "Limburgan; Limburger; Limburgish" },
  { "code": "ln", "name": "Lingala" },
  { "code": "lo", "name": "Lao" },
  { "code": "lt", "name": "Lithuanian" },
  { "code": "lu", "name": "Luba-Katanga" },
  { "code": "lv", "name": "Latvian" },
  { "code": "mg", "name": "Malagasy" },
  { "code": "mh", "name": "Marshallese" },
  { "code": "mi", "name": "Maori" },
  { "code": "mk", "name": "Macedonian" },
  { "code": "ml", "name": "Malayalam" },
  { "code": "mn", "name": "Mongolian" },
  { "code": "mr", "name": "Marathi" },
  { "code": "ms", "name": "Malay" },
  { "code": "mt", "name": "Maltese" },
  { "code": "my", "name": "Burmese" },
  { "code": "na", "name": "Nauru" },
  {
    "code": "nb",
    "name": "Bokmål, Norwegian; Norwegian Bokmål"
  },
  { "code": "nd", "name": "Ndebele, North; North Ndebele" },
  { "code": "ne", "name": "Nepali" },
  { "code": "ng", "name": "Ndonga" },
  { "code": "nl", "name": "Dutch; Flemish" },
  { "code": "nn", "name": "Norwegian Nynorsk; Nynorsk, Norwegian" },
  { "code": "no", "name": "Norwegian" },
  { "code": "nr", "name": "Ndebele, South; South Ndebele" },
  { "code": "nv", "name": "Navajo; Navaho" },
  { "code": "ny", "name": "Chichewa; Chewa; Nyanja" },
  { "code": "oc", "name": "Occitan (post 1500)" },
  { "code": "oj", "name": "Ojibwa" },
  { "code": "om", "name": "Oromo" },
  { "code": "or", "name": "Oriya" },
  { "code": "os", "name": "Ossetian; Ossetic" },
  { "code": "pa", "name": "Panjabi; Punjabi" },
  { "code": "pi", "name": "Pali" },
  { "code": "pl", "name": "Polish" },
  { "code": "ps", "name": "Pushto; Pashto" },
  { "code": "pt", "name": "Portuguese" },
  { "code": "qu", "name": "Quechua" },
  { "code": "rm", "name": "Romansh" },
  { "code": "rn", "name": "Rundi" },
  { "code": "ro", "name": "Romanian; Moldavian; Moldovan" },
  { "code": "ru", "name": "Russian" },
  { "code": "rw", "name": "Kinyarwanda" },
  { "code": "sa", "name": "Sanskrit" },
  { "code": "sc", "name": "Sardinian" },
  { "code": "sd", "name": "Sindhi" },
  { "code": "se", "name": "Northern Sami" },
  { "code": "sg", "name": "Sango" },
  { "code": "si", "name": "Sinhala; Sinhalese" },
  { "code": "sk", "name": "Slovak" },
  { "code": "sl", "name": "Slovenian" },
  { "code": "sm", "name": "Samoan" },
  { "code": "sn", "name": "Shona" },
  { "code": "so", "name": "Somali" },
  { "code": "sq", "name": "Albanian" },
  { "code": "sr", "name": "Serbian" },
  { "code": "ss", "name": "Swati" },
  { "code": "st", "name": "Sotho, Southern" },
  { "code": "su", "name": "Sundanese" },
  { "code": "sv", "name": "Swedish" },
  { "code": "sw", "name": "Swahili" },
  { "code": "ta", "name": "Tamil" },
  { "code": "te", "name": "Telugu" },
  { "code": "tg", "name": "Tajik" },
  { "code": "th", "name": "Thai" },
  { "code": "ti", "name": "Tigrinya" },
  { "code": "tk", "name": "Turkmen" },
  { "code": "tl", "name": "Tagalog" },
  { "code": "tn", "name": "Tswana" },
  { "code": "to", "name": "Tonga (Tonga Islands)" },
  { "code": "tr", "name": "Turkish" },
  { "code": "ts", "name": "Tsonga" },
  { "code": "tt", "name": "Tatar" },
  { "code": "tw", "name": "Twi" },
  { "code": "ty", "name": "Tahitian" },
  { "code": "ug", "name": "Uighur; Uyghur" },
  { "code": "uk", "name": "Ukrainian" },
  { "code": "ur", "name": "Urdu" },
  { "code": "uz", "name": "Uzbek" },
  { "code": "ve", "name": "Venda" },
  { "code": "vi", "name": "Vietnamese" },
  { "code": "vo", "name": "Volapük" },
  { "code": "wa", "name": "Walloon" },
  { "code": "wo", "name": "Wolof" },
  { "code": "xh", "name": "Xhosa" },
  { "code": "yi", "name": "Yiddish" },
  { "code": "yo", "name": "Yoruba" },
  { "code": "za", "name": "Zhuang; Chuang" },
  { "code": "zh", "name": "Chinese" },
  { "code": "zu", "name": "Zulu" }
]