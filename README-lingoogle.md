# LinGoogle

Adds language filter buttons to Google search for quick language switching.

## Features

- Adds clickable language buttons at the top of Google search results
- Click any language button to filter search results to that language
- Customizable languages via the `langList` array

## Default Languages

- `ca` - Catalan
- `es` - Spanish
- `en` - English
- `sv` - Swedish

## Customization

To change the languages, edit the `langList` array in the script:

```javascript
const langList = ['ca', 'es', 'en', 'sv'] // Add your preferred language codes
```

Use ISO 639-1 language codes (e.g., 'fr' for French, 'de' for German, 'it' for Italian).

## How It Works

1. Detects when you're on a Google search results page
2. Creates a language filter menu at the top of the page
3. For each language in your list, creates a clickable button
4. When clicked, adds the `lr=lang_XX` parameter to filter results to that language

## Installation

1. Install a userscript manager (Tampermonkey, Greasemonkey, etc.)
2. Install LinGoogle
3. Visit any Google search page to see the language filters

## License

AGPL-3.0-or-later License