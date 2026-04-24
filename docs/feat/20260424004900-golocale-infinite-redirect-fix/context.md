---
title: "GoLocale infinite redirect fix"
status: done
repos: [userscripts]
tags: [performance]
created: 2026-04-24
---

# GoLocale infinite redirect fix

## TASK

### What

Fix the GoLocale userscript so it stops re-triggering redirects when the current page URL already points at a preferred locale variant.

### Why

[`tryRedirect()`](../../../golocale.user.js:396) previously depended on back-navigation markers and HTML language detection. If a site exposed a target-language URL but did not reliably expose target-language HTML metadata soon enough, the script could keep generating more locale candidates and loop.

### Impact

The fix reduces redirect churn in [`golocale.user.js`](../../../golocale.user.js:396), keeps candidate probing bounded, and adds regression coverage in [`golocale.test.js`](../../../golocale.test.js:175).

## SPEC

[spec.md](./spec.md) — Add a URL-level guard to prevent repeated locale redirects when the page already encodes the preferred language.

## FILES

- golocale.user.js
- golocale.test.js

## PLAN

**Plan:** [plan.md](./plan.md)

**Cursor:** Complete

**Status:** done

## LOG

### 2026-04-24 00:49 — Implemented URL-level redirect loop guard

- Why: Back-navigation detection alone did not prevent repeated redirects when the active URL already encoded a preferred locale.
- How: Added [`getTargetLanguageHints()`](../../../golocale.user.js:83), [`matchesTargetLanguageHint()`](../../../golocale.user.js:89), and [`urlHasTargetLanguageHint()`](../../../golocale.user.js:98); then short-circuited [`tryRedirect()`](../../../golocale.user.js:428) before candidate probing and deduplicated candidate URLs in [`golocale.user.js`](../../../golocale.user.js:441).
- Decision: Used URL structure as the primary loop-prevention signal because it is available synchronously and does not depend on fetched HTML accuracy.

### 2026-04-24 00:49 — Added regression tests and verified the fix

- Why: The redirect-loop bug needed repeatable coverage to prevent regressions.
- How: Added redirect-loop guard tests in [`golocale.test.js`](../../../golocale.test.js:175) and ran `npx vitest run golocale.test.js`, which passed with 28/28 tests.
