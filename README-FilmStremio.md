# FilmStremio

Adds a Stremio play icon next to movie titles on FilmAffinity for quick streaming access.

## Features

- Adds a clickable Stremio icon next to movie titles
- Automatically extracts the original movie title
- Opens Stremio search with the movie title
- Works on all FilmAffinity language versions
- Handles dynamically loaded content

## How It Works

The script:
1. Detects FilmAffinity movie pages (pattern: `https://www.filmaffinity.com/*/film*.html`)
2. Extracts the "Título original" (original title) from the movie info section
3. Falls back to the displayed title if no original title is available
4. Adds a purple play icon next to the movie title
5. Clicking the icon opens Stremio with a search for that movie

## Installation

1. Install a userscript manager (Tampermonkey, Userscripts for Safari iOS, etc.)
2. Install FilmStremio
3. Visit any FilmAffinity movie page
4. Click the play icon to open in Stremio

## Requirements

- Stremio app installed on your device
- Browser support for custom protocol handlers (`stremio://`)

## License

AGPL-3.0-or-later License
