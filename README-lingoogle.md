# LinGoogle

Add language filter buttons to Google search for quick language switching - because searching in the right lingo shouldn't be complicated!

## Features

- **🌍 Language Filter Buttons**: Adds clickable language buttons at the top of Google search results
- **⚡ Instant Switching**: Click any language button to filter search results to that language
- **🎛️ Customizable Languages**: Configure which languages to show via the `langList` array
- **🎨 Clean UI**: Non-intrusive overlay that doesn't interfere with search functionality

## Default Languages

LinGoogle comes pre-configured with these languages:
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

LinGoogle:
1. Detects when you're on a Google search results page
2. Creates a language filter menu at the top of the page
3. For each language in your list, creates a clickable button
4. When clicked, adds the `lr=lang_XX` parameter to filter results to that language

## Installation

1. Install a userscript manager (Tampermonkey, Greasemonkey, etc.)
2. Install LinGoogle
3. Visit any Google search page to see the language filters appear at the top

## Why LinGoogle?

Because "lingo" + "Google" = LinGoogle! 🎯

Perfect for multilingual users who need to quickly switch between languages when searching.

## License

AGPL-3.0-or-later License