# ProfileUnhider

Reveal publicly indexed posts and comments for hidden Reddit profiles.

Clean-room standalone userscript with a custom UI designed for Safari iOS and other userscript managers.

## What it does

- Detects when a Reddit user profile is hidden
- Injects a custom **Reveal activity** panel directly on the profile page
- Shows two tabs:
  - **Posts** from Reddit search results
  - **Comments** hydrated from Reddit threads so the actual comment text is shown
- Supports pagination with **Load more**
- Uses a clean-room implementation with no dependency on the original extension package structure

## How it works

[`profileunhider.user.js`](profileunhider.user.js:1) runs on Reddit user profile pages and:

1. Checks whether the profile page contains one of Reddit's hidden-profile messages
2. Queries Reddit's public search endpoints for the username
3. Renders matching posts inline
4. For comments, fetches the related thread JSON and finds the matching comment body by author

Everything is done client-side on the page with ordinary Reddit requests.

## Installation

1. Install a userscript manager such as Userscripts for Safari iOS, Tampermonkey, or similar
2. Add [`profileunhider.user.js`](profileunhider.user.js:1)
3. Open a hidden Reddit profile such as `https://www.reddit.com/user/<username>`
4. Tap **Reveal activity**

## Notes

- Works on Reddit profile URLs matched by [`profileunhider.user.js`](profileunhider.user.js:8)
- Uses Reddit's public search index, so very recent activity may not appear yet
- Comment hydration is slower than posts because it fetches each thread to recover the real comment text
- No extension manifest or separate stylesheet is required; everything is bundled into one file
- The UI and code are a rewritten standalone version rather than a packaged extension port

## License

AGPL-3.0-or-later License
