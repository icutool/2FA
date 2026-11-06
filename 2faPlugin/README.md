# 2FA Quick Code browser extension

An independent Manifest V3 extension for current Google Chrome and Chromium-based browsers. It imports the JSON account backup produced by this repository's web app, lets you bind accounts to URL prefixes, and displays the TOTP code in a small page overlay when a prefix matches. It also places a **填充验证码** button beside the page's verification-code input. Clicking that button fills the current code without changing your clipboard.

## Install for development

1. Open `chrome://extensions` in Chrome (or the equivalent extensions page in another Chromium browser).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `2faPlugin` folder.
4. Open the extension popup, choose **Import JSON**, and select the web app's **Download grouped backup .json** file.
5. Add a URL prefix and select the account to bind. The two example prefixes can be entered directly:
   - `http://10.0.0.39/core/auth/login/mfa/`
   - `https://cloud.tencent.com/login/verify`

The extension checks full page URLs using a literal `startsWith` comparison. If more than one prefix matches, the longest prefix wins. Reload an already-open page after installing or reloading the extension. Binding changes and same-origin SPA navigation are picked up on the next one-second refresh.

## Fill a verification code

- The extension looks for visible, editable inputs using `autocomplete="one-time-code"`, labels, placeholders, names, and IDs that indicate a verification code, OTP, or MFA field. It supports both a single field and a group of one-character fields.
- For fields without explicit hints, a unique likely code field is selected using its digit pattern, maximum length, or numeric input mode. A lone ordinary text input is also supported; equally plausible fields are left alone.
- Dynamically inserted or replaced inputs are detected on the next one-second refresh. Buttons follow their inputs when the page scrolls or resizes.
- Nothing is filled automatically. Click **填充验证码** to fetch a fresh code and fill the field, with `input` and `change` events for framework forms. The extension does not click the page's submit button. A page may submit itself in response to its own input handlers.
- The existing floating card remains available for viewing and manual copying. Closing it dismisses both the card and fill buttons until the page is reloaded.
- Inputs inside iframes or page Shadow DOM are not detected. If no field can be identified, the floating card still provides the code.

## Import and export

Import accepts the app's `{ format, version, groups, accounts }` grouped backup JSON and account JSON with an `accounts` array. Export produces the same account backup format plus a `urlRules` array containing each URL prefix and its account association. That exported backup can be imported on another browser to restore accounts and URL bindings.

The `urlRules` field is an extension addition; importing the file into the web app still imports its account data, while the web app itself does not manage extension URL rules.

## Privacy and permissions

- Secrets and URL rules are stored in `chrome.storage.local` on this browser profile.
- The extension does not send secrets or codes over the network. It has no remote scripts or dependencies.
- Host access is requested for all sites because bindings may target arbitrary pages. The content script remains idle unless a configured prefix matches.
- Codes are calculated locally with Web Crypto. They are shown in the extension's overlay and written to page inputs only when you click a fill button.
- The fill button leaves the clipboard untouched. Clicking the displayed code in the floating card still copies it to the clipboard.
- Treat exported backups as sensitive files: they contain all TOTP secrets.
