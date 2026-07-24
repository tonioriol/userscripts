# ChatGPT URL Autosend

Prefills and optionally submits ChatGPT prompts from URL parameters.

## Features

- Reads prompts from `q` or `prompt` URL parameters
- Supports browser keyword shortcuts such as `https://chatgpt.com/?q=%s&autosend=1`
- Automatically submits when `autosend=1`, `autosend=true`, or `autosend=yes`
- Leaves prompts ready to edit when autosend is omitted or disabled
- Cleans consumed URL parameters after successful prefill or submit

## How It Works

Create a browser keyword bookmark or shortcut that opens ChatGPT with your prompt in the URL:

```text
https://chatgpt.com/?q=%s&autosend=1
```

Then type the keyword plus a prompt in the address bar, for example:

```text
c explain quantum tunnelling
```

ChatGPT opens, the userscript inserts the prompt, and `autosend=1` submits it.

A pure bookmarklet cannot do this from another website because its JavaScript is destroyed when the browser navigates to ChatGPT. This userscript runs on the ChatGPT page, so it can finish the handoff after navigation.

## Parameters

- `q`: primary prompt parameter
- `prompt`: fallback prompt parameter
- `autosend=1`, `autosend=true`, or `autosend=yes`: submit after inserting the prompt

If autosend is not enabled, the script only fills the composer so you can review or edit before sending.

## Installation

1. Install a userscript manager (Tampermonkey, Greasemonkey, Userscripts for Safari iOS, etc.)
2. Install `chatgpt-url-autosend.user.js`
3. Configure a browser keyword shortcut with `https://chatgpt.com/?q=%s&autosend=1`

## License

AGPL-3.0-or-later License
