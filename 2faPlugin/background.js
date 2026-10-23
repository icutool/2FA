const DEFAULTS = { accounts: [], rules: [] };

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(DEFAULTS);
  await chrome.storage.local.set({ accounts: data.accounts || [], rules: data.rules || [] });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== '2fa:get-code') return;
  getCodeForUrl(sender.tab?.url || '').then(sendResponse).catch(() => sendResponse(null));
  return true;
});

async function getCodeForUrl(url) {
  const { accounts = [], rules = [] } = await chrome.storage.local.get(DEFAULTS);
  const rule = rules
    .filter((item) => item.enabled !== false && item.prefix && url.startsWith(item.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!rule) return null;
  const account = accounts.find((item) => item.id === rule.accountId);
  if (!account) return null;
  const period = Number(account.period) || 30;
  const remaining = period - Math.floor(Date.now() / 1000) % period;
  try {
    return {
      label: [account.issuer, account.label].filter(Boolean).join(' · ') || '2FA',
      code: await totp(account),
      remaining,
      period
    };
  } catch {
    return null;
  }
}

async function totp(account) {
  const secret = String(account.secret || '').replace(/\s|=+$/g, '').toUpperCase();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of secret) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  if (!bytes.length) throw new Error('Empty secret');
  const period = Number(account.period) || 30;
  const digits = Number(account.digits) || 6;
  const counter = Math.floor(Date.now() / 1000 / period);
  const data = new ArrayBuffer(8);
  const view = new DataView(data);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  const algorithm = String(account.algorithm || 'SHA-1').toUpperCase().replace('-', '-');
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), {
    name: 'HMAC', hash: ['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithm) ? algorithm : 'SHA-1'
  }, false, ['sign']);
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  const offset = hmac[hmac.length - 1] & 15;
  const binary = ((hmac[offset] & 127) << 24) | ((hmac[offset + 1] & 255) << 16) |
    ((hmac[offset + 2] & 255) << 8) | (hmac[offset + 3] & 255);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}
