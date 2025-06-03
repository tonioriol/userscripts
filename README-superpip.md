# SuperPiP

Enables native video controls with Picture-in-Picture functionality on websites.

## Features

- Enables native HTML5 video controls on all videos
- Removes overlay elements that block video interaction
- Supports Picture-in-Picture mode (optimized for iOS Safari)
- Works on websites with video content
- Automatically detects dynamically loaded videos

## Installation

### From Greasyfork
Install from [Greasyfork](https://greasyfork.org/en/scripts/538178-superpip)

### Manual Installation
1. Install a userscript manager (Tampermonkey, Violentmonkey, etc.)
2. Install the script from `superpip.user.js`
3. Script works automatically on all websites

## How it works

1. Scans all video elements on the page
2. Enables native browser controls for each video
3. Detects and hides overlay elements positioned on top of videos
4. Monitors for new videos added to the page dynamically
5. Special handling for iOS Safari to enable Picture-in-Picture functionality

## Compatibility

- Works on websites with HTML5 video content
- Optimized for mobile Safari on iOS
- Compatible with YouTube, Vimeo, Facebook, Instagram, TikTok, Twitch, and more

## Examples

The `superpip-examples/` directory contains HTML files demonstrating SuperPiP with various video platforms:

- YouTube
- Vimeo
- Facebook
- Instagram
- TikTok
- Twitch

## License

AGPL-3.0-or-later