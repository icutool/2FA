# 2FA Quick Code browser extension

An independent Manifest V3 extension for current Google Chrome and Chromium-based browsers. It imports the JSON account backup produced by this repository's web app, lets you bind accounts to URL prefixes, and displays the TOTP code in a small page overlay when a prefix matches.

## Install for development

1. Open `chrome://extensions` in Chrome (or the equivalent extensions page in another Chromium browser).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `2faPlugin` folder.
4. Open the extension popup, choose **Import JSON**, and select the web app's **Download grouped backup .json** file.
5. Add a URL prefix and select the account to bind. The two example prefixes can be entered directly:
   - `http://10.0.0.39/core/auth/login/mfa/`
   - `https://cloud.tencent.com/login/verify`

The extension checks full page URLs using a literal `startsWith` comparison. If more than one prefix matches, the longest prefix wins. Reload an already-open page after installing or changing a binding.

## Import and export

Import accepts the app's `{ format, version, groups, accounts }` grouped backup JSON and account JSON with an `accounts` array. Export produces the same account backup format plus a `urlRules` array containing each URL prefix and its account association. That exported backup can be imported on another browser to restore accounts and URL bindings.

The `urlRules` field is an extension addition; importing the file into the web app still imports its account data, while the web app itself does not manage extension URL rules.

## Privacy and permissions

- Secrets and URL rules are stored in `chrome.storage.local` on this browser profile.
- The extension does not send secrets or codes over the network. It has no remote scripts or dependencies.
- Host access is requested for all sites because bindings may target arbitrary pages. The content script remains idle unless a configured prefix matches.
- Codes are calculated locally with Web Crypto and are displayed only in the extension's page overlay.
- Click the displayed code to copy it to the clipboard.
- Treat exported backups as sensitive files: they contain all TOTP secrets.
