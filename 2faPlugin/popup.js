const $ = (selector) => document.querySelector(selector);
const state = { accounts: [], rules: [], groups: [] };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const saved = await chrome.storage.local.get({ accounts: [], rules: [], groups: [] });
  Object.assign(state, saved);
  render();
  $('#importFile').addEventListener('change', importFile);
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#ruleForm').addEventListener('submit', addRule);
  $('#accounts').addEventListener('click', deleteAccount);
  $('#rules').addEventListener('click', deleteRule);
}

function render() {
  const accounts = state.accounts;
  $('#accountCount').textContent = accounts.length;
  $('#ruleCount').textContent = state.rules.length;
  $('#accounts').innerHTML = accounts.length ? accounts.map((account) => `<div class="account" data-id="${escapeAttr(account.id)}"><div class="account-info"><div class="account-name">${escapeHtml([account.issuer, account.label].filter(Boolean).join(' · ') || '未命名账号')}</div><div class="account-meta">${escapeHtml(account.group || '未分组')} · ${account.digits} 位 · ${account.period}s</div></div><button class="delete" title="删除账号" aria-label="删除账号">×</button></div>`).join('') : '<div class="empty">还没有账号。先导入网页导出的 JSON 备份。</div>';
  $('#ruleAccount').innerHTML = accounts.map((account) => `<option value="${escapeAttr(account.id)}">${escapeHtml([account.issuer, account.label].filter(Boolean).join(' · ') || '未命名账号')}</option>`).join('');
  $('#ruleAccount').disabled = !accounts.length;
  $('#ruleForm button').disabled = !accounts.length;
  $('#rules').innerHTML = state.rules.length ? state.rules.map((rule) => {
    const account = accounts.find((item) => item.id === rule.accountId);
    return `<div class="rule" data-id="${escapeAttr(rule.id)}"><div class="rule-info"><div class="rule-prefix" title="${escapeAttr(rule.prefix)}">${escapeHtml(rule.prefix)}</div><div class="rule-account">${escapeHtml(account ? [account.issuer, account.label].filter(Boolean).join(' · ') : '账号不存在')}</div></div><button class="delete" title="删除绑定" aria-label="删除绑定">×</button></div>`;
  }).join('') : '<div class="empty">暂未绑定页面前缀。</div>';
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    importData(JSON.parse(await file.text()));
  } catch (error) {
    setStatus(error.message || 'JSON 文件无法解析。', true);
  } finally { event.target.value = ''; }
}

function importData(data) {
  const rows = Array.isArray(data) ? data : data?.accounts || data?.a || [];
  if (!Array.isArray(rows)) throw new Error('找不到 accounts 账号列表。');
  const groups = Array.isArray(data?.groups) ? data.groups : (Array.isArray(data?.g) ? data.g : []);
  const previous = new Map(state.accounts.map((account) => [identity(account), account.id]));
  const accounts = rows.map(normalizeAccount).filter(Boolean).map((account) => ({
    ...account, id: previous.get(identity(account)) || crypto.randomUUID()
  }));
  if (!accounts.length) throw new Error('JSON 中没有有效的 TOTP 密钥。');
  const importedRules = Array.isArray(data?.urlRules) ? data.urlRules : (Array.isArray(data?.rules) ? data.rules : null);
  let rules = state.rules;
  if (importedRules) {
    rules = importedRules.map((rule) => {
      const source = rows.find((row) => row.id === rule.accountId || identitySafe(row) === rule.accountKey);
      const imported = source ? accounts.find((item) => identity(item) === identitySafe(source)) : null;
      const accountId = imported?.id || accounts.find((item) => item.id === rule.accountId)?.id;
      return rule.prefix && accountId ? { id: rule.id || crypto.randomUUID(), prefix: String(rule.prefix), accountId, enabled: rule.enabled !== false } : null;
    }).filter(Boolean);
  } else {
    rules = rules.filter((rule) => accounts.some((account) => account.id === rule.accountId));
  }
  state.accounts = accounts;
  state.rules = rules;
  state.groups = [...new Set([...groups.map(String), ...accounts.map((a) => a.group).filter(Boolean)])];
  save();
  render();
  setStatus(`已导入 ${accounts.length} 个账号${importedRules ? `、${rules.length} 条页面绑定` : ''}。`, false);
}

function normalizeAccount(row) {
  if (!row || typeof row !== 'object') return null;
  const get = (...names) => {
    const key = Object.keys(row).find((name) => names.includes(name.toLowerCase()));
    return key == null || row[key] == null ? '' : String(row[key]).trim();
  };
  const secret = get('secret', 'secretkey', 'seed').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z2-7]+=*$/.test(secret) || !decodeBase32(secret)) return null;
  const algorithmValue = get('algorithm', 'algo', 'hash').toUpperCase().replace(/^SHA(\d)/, 'SHA-$1');
  const algorithm = ['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithmValue) ? algorithmValue : 'SHA-1';
  const digits = Number(get('digits')) || 6;
  const period = Number(get('period', 'timer', 'step', 'interval')) || 30;
  if (![6, 7, 8].includes(digits) || period < 1 || period > 300) return null;
  return { secret, label: get('label', 'name', 'account', 'accountname', 'username', 'user'), issuer: get('issuer', 'service', 'provider', 'site'), group: get('group', 'category', 'folder'), icon: get('icon', 'iconurl', 'iconbase64', 'x'), digits, period, algorithm };
}

function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, count = 0;
  for (const char of secret.replace(/=+$/, '')) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return false;
    value = (value << 5) | digit; bits += 5;
    if (bits >= 8) { count++; bits -= 8; }
  }
  return count > 0;
}

function identity(account) { return JSON.stringify([account.secret, account.label, account.issuer, account.digits, account.period, account.algorithm]); }
function identitySafe(row) { const normalized = normalizeAccount(row); return normalized ? identity(normalized) : ''; }

function addRule(event) {
  event.preventDefault();
  const prefix = $('#prefix').value.trim();
  try {
    const parsed = new URL(prefix);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch { setStatus('请输入以 http:// 或 https:// 开头的完整 URL 前缀。', true); return; }
  const accountId = $('#ruleAccount').value;
  if (state.rules.some((rule) => rule.prefix === prefix)) { setStatus('这个前缀已存在，请编辑或删除旧绑定。', true); return; }
  state.rules.push({ id: crypto.randomUUID(), prefix, accountId, enabled: true });
  save(); render(); $('#prefix').value = ''; setStatus('页面绑定已保存。', false);
}

function deleteAccount(event) {
  const row = event.target.closest('.account');
  if (!row || !event.target.closest('.delete')) return;
  state.accounts = state.accounts.filter((account) => account.id !== row.dataset.id);
  state.rules = state.rules.filter((rule) => rule.accountId !== row.dataset.id);
  save(); render(); setStatus('账号及其页面绑定已删除。', false);
}

function deleteRule(event) {
  const row = event.target.closest('.rule');
  if (!row || !event.target.closest('.delete')) return;
  state.rules = state.rules.filter((rule) => rule.id !== row.dataset.id);
  save(); render(); setStatus('页面绑定已删除。', false);
}

async function exportBackup() {
  const data = {
    format: 'easy2fa-board', version: 2, groups: state.groups,
    accounts: state.accounts.map(({ secret, label, issuer, group, icon, digits, period, algorithm }) => ({ secret, label, issuer, group, icon, digits, period, algorithm })),
    urlRules: state.rules.map(({ prefix, accountId, enabled }) => ({ prefix, accountId, accountKey: identity(state.accounts.find((account) => account.id === accountId) || {}), enabled }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), { href: url, download: '2fa-plugin-backup.json' });
  anchor.click(); URL.revokeObjectURL(url);
  setStatus('备份已导出。文件包含密钥，请妥善保管。', false);
}

function save() { chrome.storage.local.set({ accounts: state.accounts, rules: state.rules, groups: state.groups }); }
function setStatus(message, isError) { const el = $('#status'); el.textContent = message; el.className = isError ? 'error' : 'ok'; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
function escapeAttr(value) { return escapeHtml(value); }
