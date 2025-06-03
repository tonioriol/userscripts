// ==UserScript==
// @name         GoToCat
// @namespace    https://github.com/tonioriol
// @version      0.3.0
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
  document.body.insertAdjacentHTML('beforeend',
    `<div style="position: fixed; top: 20px; right: 20px; z-index: 999999; padding: 10px 20px; color: white; background-color: black; font-size: 16px; border-radius: 4px; cursor: pointer" onclick="this.remove(); setTimeout(() => this.remove?.(), 3000)">
      GoToCat Redirected ✖
    </div>`
  )
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
      if (targetLangConfig.variants.some(v => lang.includes(v))) return true
      if (targetLangConfig.langRejections.some(r => lang.includes(r))) return false
    }
    
    // Check content keywords/rejections
    return !targetLangConfig.rejections.some(r => lowerText.includes(r)) &&
           (targetLangConfig.keywords.some(k => lowerText.includes(k)) || true)
  } catch {
    return false
  }
}

const targetLangConfig = {
  code: 'ca',
  variants: ['ca', 'va'], // Catalan, Valencian
  keywords: ['català', 'catalan', 'generalitat', 'ajuntament'],
  rejections: ['canada', 'canadian', 'canadien'], // Content-based rejections
  langRejections: ['en', 'fr'] // HTML lang attribute rejections (Canada/France conflicts)
}

(async () => {
  window.addEventListener('load', async () => {
    if (await GM.getValue('notify', false)) {
      await GM.setValue('notify', false)
      notify()
    }
  })

  const url = location.href
  const domain = location.hostname
  
  // Check if we've already redirected for this domain in this session
  const redirectKey = `gotocat_redirected_${domain}`
  const alreadyRedirected = await GM.getValue(redirectKey, false)
  
  if (alreadyRedirected) return
  
  // Comprehensive language codes from ISO 639-1/639-2 (1251 codes)
  const langCodes = ['aa','aar','ab','abk','abkhazian','ace','ach','achinese','acoli','ada','adangme','ady','adygei','adyghe','ae','af','afa','afar','afh','afr','afrihili','afrikaans','afroasiatic','ain','ainu','ak','aka','akan','akk','akkadian','alb','albanian','ale','alemannic','aleut','alg','algonquian','alsatian','alt','altai','altaic','am','american','amh','amharic','an','ancient','and','ang','angika','anp','apa','apache','applicable','ar','ara','arabic','aragonese','aramaic','arapaho','arawak','arc','arg','arm','armenian','arn','aromanian','arp','art','artificial','arumanian','arw','as','asm','assamese','association','ast','asturian','asturleonese','ath','athapascan','aus','australian','austronesian','auxiliary','av','ava','avaric','ave','avestan','awa','awadhi','ay','aym','aymara','az','aze','azerbaijani','ba','bable','bad','bai','bak','bal','balinese','baltic','baluchi','bam','bambara','bamileke','ban','banda','bantu','baq','bas','basa','based','bashkir','basque','bat','batak','bc','bce','be','bedawiyet','bej','beja','bel','belarusian','bem','bemba','ben','bengali','ber','berber','bg','bhasa','bho','bhojpuri','bi','bih','bihari','bik','bikol','bilin','bin','bini','bis','bislama','bla','blin','bliss','blissymbolics','blissymbols','bm','bn','bnt','bo','bod','bokml','bos','bosnian','br','bra','braj','bre','breton','bs','btk','bua','bug','buginese','bul','bulgarian','bur','buriat','burmese','byn','ca','cad','caddo','cai','car','carib','castilian','cat','catalan','cau','caucasian','ce','ceb','cebuano','cel','celtic','central','ces','ch','cha','chagatai','chamic','chamorro','chb','che','chechen','cherokee','chewa','cheyenne','chg','chi','chibcha','chichewa','chinese','chinook','chipewyan','chk','chm','chn','cho','choctaw','chp','chr','chu','chuang','church','chuukese','chuvash','chv','chy','classical','cmc','cnr','co','content','cook','cop','coptic','cor','cornish','corsican','cos','cpe','cpf','cpp','cr','cre','cree','creek','creole','creoles','crh','crimean','croatian','crp','cs','csb','cu','cus','cushitic','cv','cy','cym','cze','czech','da','dak','dakota','dan','danish','dar','dargwa','day','dayak','de','del','delaware','den','dene','deu','dgr','dhivehi','dimili','dimli','din','dinka','div','divehi','dogri','dogrib','doi','dra','dravidian','dsb','dua','duala','dum','dut','dutch','dv','dyu','dyula','dz','dzo','dzongkha','eastern','edo','ee','efi','efik','egy','egyptian','eka','ekajuk','el','elamite','ell','elx','en','eng','english','enm','eo','epo','erzya','es','esperanto','est','estonian','et','eu','eus','ewe','ewo','ewondo','fa','fan','fang','fanti','fao','faroese','fas','fat','ff','fi','fij','fijian','fil','filipino','fin','finnish','finnougrian','fiu','fj','flemish','fo','fon','for','fr','fra','fre','french','frenchbased','frisian','friulian','frm','fro','frr','frs','fry','ful','fulah','fur','fy','ga','gaa','gaelic','galibi','galician','ganda','gay','gayo','gba','gbaya','gd','geez','gem','geo','georgian','ger','german','germanic','gez','gikuyu','gil','gilbertese','gl','gla','gle','glg','glv','gmh','gn','goh','gon','gondi','gor','gorontalo','got','gothic','grb','grc','gre','grebo','greek','greenlandic','grn','gsw','gu','guarani','guj','gujarati','gv','gwi','gwichin','ha','hai','haida','haitian','hat','hau','hausa','haw','hawaiian','he','heb','hebrew','her','herero','hi','high','hil','hiligaynon','him','himachali','hin','hindi','hiri','hit','hittite','hmn','hmo','hmong','ho','hr','hrv','hsb','ht','hu','hun','hungarian','hup','hupa','hy','hye','hz','ia','iba','iban','ibo','ice','icelandic','id','ido','ie','ig','igbo','ii','iii','ijo','ik','iku','ile','ilo','iloko','imperial','ina','inari','inc','ind','indian','indic','indoeuropean','indonesian','ine','ingush','inh','interlingua','interlingue','international','inuktitut','inupiaq','io','ipk','ira','iranian','irish','iro','iroquoian','is','isl','islands','it','ita','italian','iu','ja','japanese','jargon','jav','javanese','jbo','jingpho','jpn','jpr','jrb','judeoarabic','judeopersian','jv','ka','kaa','kab','kabardian','kabyle','kac','kachin','kal','kalaallisut','kalmyk','kam','kamba','kan','kannada','kanuri','kapampangan','kar','karachaybalkar','karakalpak','karelian','karen','kas','kashmiri','kashubian','kat','kau','kaw','kawi','kaz','kazakh','kbd','kenya','kg','kha','khasi','khi','khm','khmer','kho','khoisan','khotanese','ki','kik','kikuyu','kimbundu','kin','kinyarwanda','kir','kirdki','kirghiz','kirmanjki','kj','kk','kl','klingon','km','kmb','kn','ko','kok','kom','komi','kon','kongo','konkani','kor','korean','kos','kosraean','kpe','kpelle','kr','krc','krl','kro','kru','ks','ku','kua','kuanyama','kum','kumyk','kur','kurdish','kurukh','kut','kutenai','kv','kw','kwanyama','ky','kyrgyz','la','lad','ladino','lah','lahnda','lam','lamba','land','language','languages','lao','lat','latin','latvian','lav','lb','leonese','letzeburgesch','lez','lezghian','lg','li','lim','limburgan','limburger','limburgish','lin','lingala','linguistic','lit','lithuanian','ln','lo','local','lojban','lol','low','lower','loz','lozi','lt','ltz','lu','lua','lub','lubakatanga','lubalulua','lug','lui','luiseno','lule','lun','lunda','luo','lus','lushai','luxembourgish','lv','mac','macedonian','macedoromanian','mad','madurese','mag','magahi','mah','mai','maithili','mak','makasar','mal','malagasy','malay','malayalam','maldivian','maltese','man','manchu','mandar','mandingo','manipuri','manobo','manx','mao','maori','map','mapuche','mapudungun','mar','marathi','mari','marshallese','marwari','mas','masai','may','mayan','mdf','mdr','men','mende','mg','mga','mh','mi','mic','micmac','middle','mikmaq','min','minangkabau','mirandese','mis','mk','mkd','mkh','ml','mlg','mlt','mn','mnc','mni','mno','modern','moh','mohawk','moksha','moldavian','moldovan','mon','mong','mongo','mongolian','monkhmer','montenegrin','moroccan','mos','mossi','motu','mr','mri','ms','msa','mt','mul','multiple','mun','munda','mus','mwl','mwr','my','mya','myn','myv','na','nah','nahuatl','nai','nap','nau','nauru','nav','navaho','navajo','nb','nbl','nd','nde','ndebele','ndo','ndonga','nds','ne','neapolitan','nep','nepal','nepali','new','newari','ng','nia','nias','nic','nilosaharan','niu','niuean','nko','nl','nld','nn','nno','no','nob','nog','nogai','non','nor','norse','north','northern','norwegian','not','nqo','nr','nso','nub','nubian','nuosu','nv','nwc','ny','nya','nyamwezi','nyanja','nyankole','nyasa','nym','nyn','nynorsk','nyo','nyoro','nzi','nzima','oc','occidental','occitan','oci','official','oirat','oj','oji','ojibwa','old','om','or','ori','oriya','orm','oromo','os','osa','osage','oss','ossetian','ossetic','ota','oto','otomian','ottoman','pa','paa','pag','pahari','pahlavi','pal','palauan','pali','pam','pampanga','pan','pangasinan','panjabi','pap','papiamento','papuan','pashto','pau','pedi','peo','per','persian','phi','philippine','phn','phoenician','pi','pidgins','pilipino','pisin','pl','pli','pohnpeian','pol','polish','pon','por','portuguese','portuguesebased','post','pra','prakrit','pro','provenal','ps','pt','punjabi','pus','pushto','qaa-qtz','qu','que','quechua','raj','rajasthani','rap','rapanui','rar','rarotongan','reserved','rm','rn','ro','roa','roh','rom','romance','romanian','romansh','romany','ron','ru','rum','run','rundi','rup','rus','russian','rw','sa','sad','sag','sah','sai','sakan','sal','salishan','sam','samaritan','sami','samoan','san','sandawe','sango','sanskrit','santali','sardinian','sas','sasak','sat','saxon','sc','scn','sco','scots','scottish','sd','se','sel','selkup','sem','semitic','sepedi','serbian','serer','sg','sga','sgn','shan','shn','shona','si','sichuan','sicilian','sid','sidamo','sign','siksika','sin','sindhi','sinhala','sinhalese','sinotibetan','sio','siouan','sit','sk','skolt','sl','sla','slave','slavic','slavonic','slk','slo','slovak','slovenian','slv','sm','sma','sme','smi','smj','smn','smo','sms','sn','sna','snd','snk','so','sog','sogdian','som','somali','son','songhai','soninke','sorbian','sot','sotho','south','southern','spa','spanish','sq','sqi','sr','sranan','srd','srn','srp','srr','ss','ssa','ssw','st','standard','su','suk','sukuma','suline','sumerian','sun','sundanese','sus','susu','sux','sv','sw','swa','swahili','swati','swe','swedish','swiss','syc','syr','syriac','ta','tagalog','tah','tahitian','tai','tajik','tam','tamashek','tamazight','tamil','tanzania','tat','tatar','te','tel','telugu','tem','ter','tereno','tet','tetum','tg','tgk','tgl','th','tha','thai','ti','tib','tibetan','tig','tigre','tigrinya','timne','tir','tiv','tk','tkl','tl','tlh','tlhinganhol','tli','tlicho','tlingit','tmh','tn','to','tog','tok','tokelau','ton','tonga','tongo','tpi','tr','ts','tsi','tsimshian','tsn','tso','tsonga','tswana','tt','tuk','tum','tumbuka','tup','tupi','tur','turkish','turkmen','tut','tuvalu','tuvinian','tvl','tw','twi','ty','tyv','udm','udmurt','ug','uga','ugaritic','uig','uighur','uk','ukr','ukrainian','umb','umbundu','uncoded','und','undetermined','upper','ur','urd','urdu','use','uyghur','uz','uzb','uzbek','vai','valencian','ve','ven','venda','vi','vie','vietnamese','vo','vol','volapk','vot','votic','wa','wak','wakashan','wal','walloon','war','waray','was','washo','wel','welsh','wen','western','wln','wo','wol','wolaitta','wolaytta','wolof','xal','xh','xho','xhosa','yakut','yao','yap','yapese','yi','yid','yiddish','yo','yor','yoruba','ypk','yupik','za','zande','zap','zapotec','zaza','zazaki','zbl','zen','zenaga','zgh','zh','zha','zho','zhuang','znd','zu','zul','zulu','zun','zuni','zxx','zza']
  
  const candidates = []
  
  // Try replacing existing language codes first
  const langPattern = new RegExp(`\\b(${langCodes.join('|')})\\b`, 'gi')
  const replaced = url.replace(langPattern, targetLangConfig.code)
  if (replaced !== url) {
    candidates.push(replaced)
  }
  
  // If no language codes found, try injection methods
  if (candidates.length === 0) {
    const urlObj = new URL(url)
    
    candidates.push(
      // Add to path
      `${urlObj.origin}/${targetLangConfig.code}${urlObj.pathname}${urlObj.search}${urlObj.hash}`,
      `${urlObj.origin}${urlObj.pathname.replace(/\/$/, '')}/${targetLangConfig.code}${urlObj.search}${urlObj.hash}`,
      
      // Add to subdomain
      url.replace(/^(https?:\/\/)/, `$1${targetLangConfig.code}.`),
      
      // Add as URL parameters
      ...['lang', 'ln', 'hl'].map(param => {
        const newUrl = new URL(url)
        newUrl.searchParams.set(param, targetLangConfig.code)
        return newUrl.toString()
      })
    )
  }
  
  // Test each candidate URL (no duplicates possible due to logic)
  for (const candidate of candidates.filter(c => c !== url)) {
    if (await isTargetLanguage(candidate)) {
      await GM.setValue('notify', true)
      await GM.setValue(redirectKey, true)
      location.href = candidate
      break
    }
  }
})()
