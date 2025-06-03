// ==UserScript==
// @name         LinGoogle
// @namespace    https://github.com/tonioriol
// @version      3.0.1
// @description  Add language filter buttons to Google search for quick language switching
// @author       Toni Oriol
// @include      /^http(s)?:\/\/(www)?\.google\.\w*\/search.*$/
// @grant        none
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/lingoogle.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/lingoogle.user.js
// ==/UserScript==

(function () {
  const langList = ['ca', 'es', 'en', 'sv']
  const url = new URL(location.href)
 
  const menu = document.createElement('div')
  menu.style.position = 'absolute'
  menu.style.top = '0'
  menu.style.left = '0'
  menu.style.right = '0'
  menu.style.zIndex = '9999999999'
  menu.style.display = 'flex'
  menu.style.flexDirection = 'row'
  menu.style.gap = '1rem'
  menu.style.justifyContent = 'center'
 
  langList.forEach(l => {
    const item = document.createElement('div')
    url.searchParams.set('lr', `lang_${l}`)
    item.innerHTML = `<a href="${url}">${l}</a>`
    menu.appendChild(item)
  })
 
  document.querySelector('body').appendChild(menu)
})()