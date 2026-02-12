# fix-gometric-ranges

## TASK

Fix GoMetric pattern matching so it correctly converts:

* Fahrenheit ranges written with a degree symbol (e.g. `50-70°F`)
* Currency ranges and partially converted ranges (e.g. `Budget $4,000-7,000/person.` and `Budget $4,000 [€3.383,91]-7,000/person.`)

## GENERAL CONTEXT

Refer to `/Users/tr0n/Documents/User Scripts Safari iOS/AGENTS.md` for project workflow and conventions.

ALWAYS use absolute paths.

### REPO

`/Users/tr0n/Documents/User Scripts Safari iOS`

### RELEVANT FILES

* `/Users/tr0n/Documents/User Scripts Safari iOS/gometric.user.js`
* `/Users/tr0n/Documents/User Scripts Safari iOS/gometric.test.js`

## PLAN

1. ✅ Reproduce by adding regression tests for the reported strings.
2. ✅ Update temperature unit regex to accept `°F`.
3. ✅ Add explicit range handling for unit conversions (e.g. `50-70°F`).
4. ✅ Add explicit range handling for currency conversions (e.g. `$4,000-7,000`).
5. ✅ Prevent the “single amount” currency pass from double/incorrect conversions when inside a range.
6. ✅ Run full test suite and ensure all tests pass.

## EVENT LOG

* **2026-02-12 15:09 - Investigated failing conversions and added regression coverage**
  * Why: User reported two real-world strings not being converted: `50-70°F` and `$4,000-7,000/person` (plus partial range with first side already converted).
  * How: Located GoMetric transforms in `/Users/tr0n/Documents/User Scripts Safari iOS/gometric.user.js` and added regression cases in `/Users/tr0n/Documents/User Scripts Safari iOS/gometric.test.js`.
  * Key info: Tests executed with `npm test`.

* **2026-02-12 15:09 - Implemented unit range matching and °F support**
  * Why: Existing temperature pattern matched `F` but not `°F`, and unit conversion regexes didn’t support ranges like `50-70°F`.
  * How:
    * Updated the Fahrenheit rule pattern to accept an optional degree symbol before `F`.
    * Introduced a shared number source and added `rule.rangeRegex` for each unit rule.
    * Added range conversion logic that converts both endpoints and picks one shared metric prefix/unit.
  * Key info: Changes in `/Users/tr0n/Documents/User Scripts Safari iOS/gometric.user.js`.

* **2026-02-12 15:09 - Implemented currency range + partial-range handling and prevented double conversion**
  * Why: `$4,000-7,000` wasn’t handled as a range, and the existing “single match” pass could convert `$4,000` individually before the range logic ran, producing incorrect output.
  * How:
    * Added currency range regexes for indicator-first and amount-first forms.
    * Added a special case for partially converted ranges like `$4,000 [€...]-7,000` to convert the second side.
    * Added a guard to skip single-amount conversions when the matched amount is adjacent to a range separator.
  * Key info: Changes in `/Users/tr0n/Documents/User Scripts Safari iOS/gometric.user.js`.

* **2026-02-12 15:00 - Verified with full test run**
  * Why: Ensure the fix doesn’t break existing currency/unit behavior.
  * How: Ran `npm test` successfully after updates.
  * Key info: `npm test` (Vitest) finished with all tests passing.

## Next Steps

COMPLETED

