# InfuseIO

Redirects Stremio Web video streams to Infuse app on iOS Safari.

## Features

- Automatically intercepts Stremio player links
- Opens video streams directly in Infuse app
- Preserves DMM (Debrid Media Manager) links functionality
- Works seamlessly in iOS Safari

## How It Works

Detects Stremio player links and redirects them to Infuse:

```
Stremio player link → infuse://x-callback-url/play?url=...
```

DMM links continue to open normally in the browser.

## Installation

1. Install a userscript manager for iOS Safari (Userscripts, etc.)
2. Install InfuseIO
3. Visit Stremio Web and click on video streams

## License

AGPL-3.0-or-later License
