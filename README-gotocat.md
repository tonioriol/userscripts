# GoToCat

Redirects Spanish URLs to their Catalan equivalents.

## Function

- Detects URLs with `/es/` and redirects to `/ca/` when available
- Verifies the Catalan version exists before redirecting
- Shows notification when redirects happen

## How It Works

1. Detects Spanish URLs with `/es/` patterns
2. Replaces `/es/` with `/ca/`
3. Checks if Catalan URL exists
4. Redirects if available
5. Shows "Redirigit a la versió en català" notification

## Example

```
Original: https://example.com/es/products
Redirected to: https://example.com/ca/products
```

## Installation

1. Install a userscript manager (Tampermonkey, Greasemonkey, etc.)
2. Install GoToCat
3. Browse websites with Spanish/Catalan versions

## License

AGPL-3.0-or-later License