---
title: "Profile Unhider userscript"
status: done
repos: [userscripts]
tags: [reddit, safari-ios, userscript]
created: 2026-04-10
---
# Profile Unhider userscript

## TASK

Create a simplified userscript version of Profile Unhider for Safari iOS, based on the published Chrome extension, and store the task context in the userscripts repository.

## GENERAL CONTEXT

Use relative paths from the repository root. These context files may be shared via git.

### REPO

.

### RELEVANT FILES

* [`profileunhider.user.js`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js) - standalone userscript with inline styles and Reddit fetch/render logic
* [`AGENTS.md`](../../Documents/User%20Scripts%20Safari%20iOS/AGENTS.md) - local repository workflow and conventions
* [`README-ProfileUnhider.md`](../../Documents/User%20Scripts%20Safari%20iOS/README-ProfileUnhider.md) - end-user guide for installation and usage
* [`README.md`](../../Documents/User%20Scripts%20Safari%20iOS/README.md) - repository index updated to list ProfileUnhider

## PLAN

✅ Review existing userscript conventions in the repository.
✅ Extract the published Chrome extension and identify the minimal logic needed.
✅ Create a simplified single-file userscript for Safari iOS.
✅ Move durable task memory into the userscripts repository.
✅ Add user-facing README documentation following repository patterns.

## EVENT LOG

* **2026-04-10 21:50 - Retrieved the published Chrome extension package for source inspection**
  * Why: The starting point was only a Chrome Web Store listing, so the package itself was the most reliable source for behavior and UI logic.
  * How: Downloaded the CRX, extracted its ZIP payload, and reviewed the extension's `manifest.json`, `content.js`, `styles.css`, and `README.md`.
  * Key info: The source package is a content-script-focused Reddit profile enhancer that reveals indexed posts and comments for hidden profiles.

* **2026-04-10 22:10 - Reviewed userscript conventions in the Safari iOS userscripts repository**
  * Why: The new script needed to follow the same metadata-header and single-file patterns used by the existing scripts in this repository.
  * How: Inspected [`futureddit.user.js`](../../Documents/User%20Scripts%20Safari%20iOS/futureddit.user.js) and [`paywallbreaker.user.js`](../../Documents/User%20Scripts%20Safari%20iOS/paywallbreaker.user.js), plus repository guidance in [`AGENTS.md`](../../Documents/User%20Scripts%20Safari%20iOS/AGENTS.md).
  * Key info: Existing scripts use standard `// ==UserScript==` headers, `@updateURL`/`@downloadURL`, and favor self-contained single-file implementations.

* **2026-04-10 22:11 - Built a simplified standalone userscript focused on the core reveal flow**
  * Why: The user wanted “just the meat” instead of extension packaging, privacy-policy links, or other nonessential UI.
  * How: Created [`profileunhider.user.js`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js) with inline CSS injection, hidden-profile detection, Reddit search fetching, comment hydration, posts/comments tabs, and load-more pagination.
  * Key info: The userscript uses `@grant none`, targets Reddit profile URLs directly, and has no dependency on extension files like `manifest.json` or `styles.css`.

* **2026-04-10 22:15 - Validated the userscript as a standalone file**
  * Why: The handoff needed a sanity check to ensure the generated userscript is syntactically valid and self-contained.
  * How: Ran `node --check` on [`profileunhider.user.js`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js) and checked for a valid userscript header, `@grant none`, and absence of extension-manifest dependencies.
  * Key info: Validation passed; the file is standalone and ready for use in the userscripts repository.

* **2026-04-10 22:21 - Added README documentation for the userscript and repository index**
  * Why: The userscript repository keeps one dedicated `README-*.md` per script plus a short entry in the root [`README.md`](../../Documents/User%20Scripts%20Safari%20iOS/README.md).
  * How: Created [`README-ProfileUnhider.md`](../../Documents/User%20Scripts%20Safari%20iOS/README-ProfileUnhider.md) with overview, installation, behavior, and notes; updated the root [`README.md`](../../Documents/User%20Scripts%20Safari%20iOS/README.md) to list ProfileUnhider among the available scripts.
  * Key info: Documentation matches the concise style used by [`README-FutuReddit.md`](../../Documents/User%20Scripts%20Safari%20iOS/README-FutuReddit.md) and [`README-RedditSlopSleuth.md`](../../Documents/User%20Scripts%20Safari%20iOS/README-RedditSlopSleuth.md).

* **2026-04-10 22:27 - Flushed final userscript state before publish workflow**
  * Why: The user requested that the task memory be finalized before commit/push and install-link generation.
  * How: Confirmed the userscript, repository README entry, dedicated README, and repo-local context are all present in [`../../Documents/User Scripts Safari iOS`](../../Documents/User%20Scripts%20Safari%20iOS).
  * Key info: Publish-ready files are [`profileunhider.user.js`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js), [`README-ProfileUnhider.md`](../../Documents/User%20Scripts%20Safari%20iOS/README-ProfileUnhider.md), [`README.md`](../../Documents/User%20Scripts%20Safari%20iOS/README.md), and [`docs/feat/20260410215236-profile-unhider-firefox-port/context.md`](../../Documents/User%20Scripts%20Safari%20iOS/docs/feat/20260410215236-profile-unhider-firefox-port/context.md).

## Next Steps

COMPLETED
