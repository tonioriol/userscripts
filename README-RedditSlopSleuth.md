# RedditSlopSleuth

Heuristic bot/AI “slop” indicator for Reddit.

## What it does

- Adds a small emoji badge next to usernames:
  - 🤖 likely bot
  - 🧠 likely AI-ish content
  - ✅ likely human
  - ❓ unknown
- Hover the badge to see a quick score summary.
- Click the badge to open a right-side panel with a “Why” breakdown (reasons + scores) and a “scroll to item” button.

## Signals used (high level)

- Username heuristics (patterns, digit ratio, etc.)
- Text heuristics (self-disclosure phrases, formulaic transitions, low contractions, uniform long sentences, repeated near-duplicate messages, suspicious links/TLDs)
- Profile fetch: `/user/<name>/about.json` (account age + karma) with caching and rate limiting

## Settings

No settings UI. It always runs in “best effort” mode and uses all available signals.

Scoring thresholds are intentionally hard-coded in [`redditslopsleuth.user.js`](redditslopsleuth.user.js:1).

## Installation

1. Install a userscript manager (Tampermonkey, Userscripts for Safari iOS, etc.)
2. Add [`redditslopsleuth.user.js`](redditslopsleuth.user.js:1)

## Notes

- Heuristic-based: expect false positives/negatives.
- It will make Reddit requests to `/user/<name>/about.json` (cached + rate-limited).
