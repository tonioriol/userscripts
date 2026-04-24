# GoLocale infinite redirect fix plan

## Phase 1 — Diagnose and reproduce
- [x] Inspect the existing redirect and back-navigation guards in [`golocale.user.js`](../../../golocale.user.js:396)
- [x] Review current GoLocale tests in [`golocale.test.js`](../../../golocale.test.js:1)

## Phase 2 — Implement loop prevention
- [x] Add URL target-language hint detection to [`golocale.user.js`](../../../golocale.user.js:98)
- [x] Short-circuit redirect attempts when the current URL already targets the preferred language in [`golocale.user.js`](../../../golocale.user.js:428)
- [x] Deduplicate generated candidate URLs in [`golocale.user.js`](../../../golocale.user.js:441)

## Phase 3 — Verify
- [x] Add regression coverage in [`golocale.test.js`](../../../golocale.test.js:175)
- [x] Run `npx vitest run golocale.test.js`
