// ==UserScript==
// @name         Redirect es to ca
// @namespace    https://github.com/tonioriol
// @version      0.0.3
// @description  Tries to redirect any url with /es or es. to /ca ca.
// @author       Toni Oriol
// @match        *://*/*
// @grant        GM.getValue
// @grant        GM.setValue
// @license      MIT
// @updateURL    https://github.com/tonioriol/user-scripts-safari-ios/raw/refs/heads/main/Redirect%20es%20to%20ca.user.js
// @downloadURL  https://github.com/tonioriol/user-scripts-safari-ios/raw/refs/heads/main/Redirect%20es%20to%20ca.user.js
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
  const fixedHref = location.href.replace(/(\/es\/)/, '/ca/')

  if (location.href !== fixedHref) {
    const response = await fetch(fixedHref)
    if (response.ok) {
      location.href = fixedHref
      await GM.setValue('notify', true)
    }
  }
})()


