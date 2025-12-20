# CrossLemmy

Subscribe to Lemmy communities from any instance using your home instance.

## Features

- Adds floating subscribe button on community pages from external instances
- Opens community on your home instance for easy subscription
- Works across all Lemmy instances in the fediverse
- Auto-detects single-page app navigation

## How It Works

Detects Lemmy community pages and adds a button to open them on your home instance:

```
Visiting: lemmy.world/c/technology
Button opens: lemmy.ml/c/technology@lemmy.world
```

## Configuration

Edit `HOME_INSTANCE` to match your home Lemmy instance:

```javascript
const HOME_INSTANCE = 'lemmy.ml'; // Change to your instance
```

## Installation

1. Install a userscript manager (Tampermonkey, Greasemonkey, etc.)
2. Install CrossLemmy
3. Configure your home instance
4. Browse Lemmy communities

## License

AGPL-3.0-or-later
