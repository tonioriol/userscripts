# GoLocale infinite redirect fix

## Summary

Prevent GoLocale from redirecting again when the current URL already expresses a preferred target language.

## Problem

[`tryRedirect()`](../../../golocale.user.js:396) could continue evaluating redirect candidates even when the current URL already contained a target-language hint in its subdomain, path, or query parameters. That made repeated locale rewrites possible on pages whose HTML language detection was unreliable or delayed.

## Approach

1. Add a small URL-hint detector that recognizes configured target languages in:
   - subdomains
   - path segments
   - configured language query params
2. Exit early from [`tryRedirect()`](../../../golocale.user.js:396) when the current URL already targets the preferred language.
3. Deduplicate generated candidate URLs before probing them.
4. Add regression tests covering both the URL-hint helper and the early-exit behavior.

## Constraints

- Keep the fix local to GoLocale redirect guards.
- Do not change the existing language-detection strategy beyond loop prevention.
- Preserve current behavior for source-language URLs that do not already encode a target language.
