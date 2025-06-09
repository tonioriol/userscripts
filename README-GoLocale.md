# GoLocale

Automatically redirects URLs to their preferred language equivalents.

## Function

- Detects URLs in source languages and redirects to target language versions when available
- Configurable for any language pair through the `LANGUAGE_CONFIG` object
- Verifies the target language version exists before redirecting
- Shows notification when redirects happen

## How It Works

1. Detects URLs with language codes in various formats (paths, subdomains, parameters)
2. Generates candidate URLs using multiple strategies:
   - Replace existing language codes in paths (e.g., `/es/` → `/ca/`)
   - Replace subdomain language codes (e.g., `es.site.com` → `ca.site.com`)
   - Inject language codes into paths (e.g., `/page` → `/ca/page`)
   - Inject language subdomains (e.g., `site.com` → `ca.site.com`)
   - Add language parameters (e.g., `?lang=ca`, `?hl=ca`)
3. Tests each candidate URL to verify it exists and is in the target language
4. Redirects to the first working candidate
5. Shows notification with option to disable redirects for the domain

## Configuration

Edit the `LANGUAGE_CONFIG` object to set your preferred languages:

```javascript
const LANGUAGE_CONFIG = {
  targetLang: "ca",  // Primary target language (ISO code)
  altLang: "va"      // Alternative target language (optional)
};
```

## Examples

With default Catalan configuration:
```
Original: https://example.com/es/products
Redirected to: https://example.com/ca/products

Original: https://en.wikipedia.org/wiki/Barcelona
Redirected to: https://ca.wikipedia.org/wiki/Barcelona
```

For other languages, just change the configuration:
```javascript
// French configuration
const LANGUAGE_CONFIG = {
  targetLang: "fr",
  altLang: null
};
```

## Installation

1. Install a userscript manager (Tampermonkey, Greasemonkey, etc.)
2. Install GoLocale
3. Configure your preferred target language(s) if different from the default
4. Browse websites with multiple language versions

## Features

- **Smart detection**: Uses both HTML lang attributes and content analysis
- **Multiple strategies**: Tries various URL patterns to find language versions
- **User control**: Easy enable/disable per domain
- **Non-intrusive**: Only redirects when target language content is confirmed
- **Configurable**: Works with any language pair

## License

AGPL-3.0-or-later License