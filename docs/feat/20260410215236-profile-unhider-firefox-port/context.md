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
✅ Rewrite the userscript as a clean-room standalone implementation.

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

* **2026-04-10 22:34 - Patched hidden-comments detection after field failure**
  * Why: A real Reddit profile page showed the text "likes to keep their comments hidden", which the earlier userscript did not recognize because it only checked for the posts-hidden wording.
  * How: Expanded the hidden-state detection to cover comments/content/activity variants before proceeding with the broader rewrite.
  * Key info: The failure was in hidden-state detection, not fetch/render logic.

* **2026-04-10 22:40 - Rewrote the userscript as a clean-room standalone implementation**
  * Why: The first userscript version still felt visually broken and too derivative, so it was replaced with a clearer, copyright-free standalone design.
  * How: Replaced [`profileunhider.user.js`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js) with a new implementation based on explicit state buckets, helper functions, regex-based hidden-profile detection, a redesigned panel UI, and a simpler render pipeline for posts and comments.
  * Key info: The rewritten userscript is version `0.1.0`, preserves the reveal behavior, and passes syntax validation with `node --check`.

* **2026-04-10 22:40 - Updated documentation to reflect the rewrite**
  * Why: The dedicated README needed to describe the clean-room standalone UI and architecture rather than the earlier quick port.
  * How: Revised [`README-ProfileUnhider.md`](../../Documents/User%20Scripts%20Safari%20iOS/README-ProfileUnhider.md) to describe the custom panel UI and rewritten implementation.
  * Key info: The root [`README.md`](../../Documents/User%20Scripts%20Safari%20iOS/README.md) description remained accurate and did not need wording changes.

* **2026-04-10 22:51 - Fixed full-width takeover and changed the summary UI**
  * Why: The rewritten panel was still stretching across the full content width and visually felt too close to the previous layout.
  * How: Updated [`profileunhider.user.js`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js) so [`#pu-root`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js:125) centers a bounded card, limits [`pu-shell`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js:132) to `min(720px, 100%)`, and replaces the old heading treatment with a smaller badge-row driven summary block.
  * Key info: The userscript still passes syntax validation with `node --check` after the layout change.

* **2026-04-10 22:58 - Stopped hiding Reddit's original hidden-profile section**
  * Why: The injected UI was making the page appear empty because [`mountApp()`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js:619) hid the original anchor container after insertion.
  * How: Removed the `anchor.style.display = "none";` line from [`mountApp()`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js:619) so the script augments the page instead of blanking the native hidden-profile content.
  * Key info: Syntax validation still passes with `node --check` after the visibility fix.

* **2026-04-11 11:59 - Switched from banner injection to native-feed insertion based on saved Reddit HTML fixtures**
  * Why: The user wanted the recovered content to appear where native Reddit posts/comments normally render, not in a custom banner panel above the profile.
  * How: Inspected [`user-hidden.html`](../../Documents/User%20Scripts%20Safari%20iOS/user-hidden.html) and [`user-normal.html`](../../Documents/User%20Scripts%20Safari%20iOS/user-normal.html) to identify [`shreddit-feed`](../../Documents/User%20Scripts%20Safari%20iOS/user-hidden.html:343), the hidden placeholder [`#empty-feed-content`](../../Documents/User%20Scripts%20Safari%20iOS/user-hidden.html:344), native comment containers like [`shreddit-profile-comment`](../../Documents/User%20Scripts%20Safari%20iOS/user-normal.html:347), and native post containers like [`shreddit-post`](../../Documents/User%20Scripts%20Safari%20iOS/user-normal.html:1260). Replaced the standalone panel architecture in [`profileunhider.user.js`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js) with an inline root, recovered-item renderers, and [`syncFeed()`](../../Documents/User%20Scripts%20Safari%20iOS/profileunhider.user.js:507) that injects recovered posts/comments directly into the profile feed.
  * Key info: The integrated-feed rewrite is version `0.2.0`, uses a lightweight reveal control, keeps native page content visible, and marks inserted items with a recovered badge.

## Next Steps

COMPLETED
