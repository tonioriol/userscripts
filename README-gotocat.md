# GoToCat

Automatically redirects Spanish URLs to their Catalan equivalents - because navigating in your preferred language should be seamless!

## Features

- **🔄 Automatic Redirection**: Detects URLs with `/es/` and redirects to `/ca/` when available
- **✅ Smart Checking**: Verifies the Catalan version exists before redirecting
- **🔔 User Notification**: Shows a friendly notification when redirects happen
- **⚡ Lightweight**: Minimal performance impact, runs only when needed

## How It Works

GoToCat monitors the current page URL and:

1. **Detects Spanish URLs**: Looks for `/es/` patterns in the URL
2. **Creates Catalan equivalent**: Replaces `/es/` with `/ca/`
3. **Checks availability**: Fetches the Catalan URL to ensure it exists
4. **Redirects seamlessly**: Takes you to the Catalan version if available
5. **Shows notification**: Displays "Redirigit a la versió en català" message

## Example

```
Original: https://example.com/es/products
Redirected to: https://example.com/ca/products
```

## Installation

1. Install a userscript manager (Tampermonkey, Greasemonkey, etc.)
2. Install GoToCat
3. Browse any website - automatic redirects will happen when Spanish→Catalan versions are available

## Perfect For

- **Catalan speakers** who prefer content in their language
- **Bilingual websites** that offer both Spanish and Catalan versions
- **Automatic language preference** without manual URL editing

## Why GoToCat?

Because "goto" + "Catalan" = GoToCat! 🐱

Perfect for seamlessly accessing Catalan content when browsing websites that default to Spanish.

## License

AGPL-3.0-or-later License