# SuperPiP

Enable native video controls with Picture-in-Picture functionality on any website.

## 🎯 Features

- ✅ Enables native HTML5 video controls on all videos
- ✅ Removes overlay elements that block video interaction
- ✅ Supports Picture-in-Picture mode (especially optimized for iOS Safari)
- ✅ Works on any website with video content
- ✅ Automatically detects dynamically loaded videos
- ✅ Lightweight and non-intrusive

## 🚀 Installation

### From Greasyfork
Install directly from [Greasyfork](https://greasyfork.org/en/scripts/538178-superpip)

### Manual Installation
1. Install a userscript manager like [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. Click [here](https://github.com/tonioriol/superpip/raw/main/superpip.user.js) to install the script
3. The script will automatically work on all websites

## 🔧 How it works

1. **Scans all video elements** on the page
2. **Enables native browser controls** for each video
3. **Detects and hides overlay elements** positioned on top of videos
4. **Monitors for new videos** added to the page dynamically
5. **Special handling for iOS Safari** to enable Picture-in-Picture functionality

## 🌐 Compatibility

- Works on all websites with HTML5 video content
- Optimized for mobile Safari on iOS
- Compatible with YouTube, Vimeo, Facebook, Instagram, TikTok, Twitch, and more

## 📋 Examples

The `examples/` directory contains HTML files demonstrating how SuperPiP works with various video platforms:

- YouTube
- Vimeo
- Facebook
- Instagram
- TikTok
- Twitch

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/tonioriol/superpip.git
cd superpip

# The main userscript is in superpip.user.js
# Test examples are in the examples/ directory
```

## 📄 License

This project is licensed under the AGPL-3.0-or-later - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## ⭐ Support

If you find SuperPiP useful, please consider giving it a star on GitHub!