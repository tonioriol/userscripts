// ==UserScript==
// @name         VsixDL
// @namespace    https://github.com/tonioriol/userscripts
// @version      0.0.2
// @description  Adds download button for VSCode extensions
// @author       Toni Oriol
// @icon         https://www.google.com/s2/favicons?sz=64&domain=visualstudio.com
// @match        https://marketplace.visualstudio.com/items?itemName=*
// @grant        none
// @license      AGPL-3.0-or-later
// @updateURL    https://github.com/tonioriol/userscripts/raw/refs/heads/main/vsixdl.user.js
// @downloadURL  https://github.com/tonioriol/userscripts/raw/refs/heads/main/vsixdl.user.js
// ==/UserScript==

(function () {
  "use strict";

  window.addEventListener("load", () => {
    setTimeout(() => {
      if (document.getElementById("vsix-dl-btn")) return;

      let version, id;
      document.querySelectorAll(".ux-table-metadata tr").forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 2) {
          const label = cells[0].innerText.trim();
          if (label === "Version") version = cells[1].innerText.trim();
          if (label === "Unique Identifier") id = cells[1].innerText.trim();
        }
      });

      if (!version || !id) return;

      const [publisher, extension] = id.split(".");
      const url = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extension}/${version}/vspackage`;

      const btn = document.createElement("button");
      btn.id = "vsix-dl-btn";
      btn.type = "button";
      btn.className = "ms-Button ux-button install ms-Button--default root-39";
      btn.setAttribute("data-is-focusable", "true");
      btn.style.marginLeft = "10px";
      btn.innerHTML =
        '<div class="ms-Button-flexContainer flexContainer-40"><div class="ms-Button-textContainer textContainer-41"><div class="ms-Button-label label-43">Download VSIX</div></div></div>';

      btn.onclick = (e) => {
        e.preventDefault();
        const a = document.createElement("a");
        a.href = url;
        a.download = `${publisher}.${extension}-${version}.vsix`;
        a.click();
        const label = btn.querySelector(".ms-Button-label");
        label.textContent = "✓ Downloading...";
        setTimeout(() => (label.textContent = "Download VSIX"), 2000);
      };

      const container = document.querySelector(
        ".ux-oneclick-install-button-container"
      );
      if (container?.parentNode) {
        container.parentNode.insertBefore(btn, container.nextSibling);
      }
    }, 2000);
  });
})();
