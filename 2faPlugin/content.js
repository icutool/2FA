(() => {
  if (window.top !== window || location.protocol === 'chrome-extension:') return;
  const HOST_ID = 'twofa-quick-code-host';
  let closed = false;
  let host;
  let panel;
  let ticking = false;
  let positionFrame;
  const fillControls = new Map();
  const OTP_HINT = /验证码|驗證碼|校验码|动态(?:码|口令)|认证码|安全码|one[\s_-]*time[\s_-]*(?:code|password)|(?:otp|totp|mfa|2fa)|(?:verification|verify|auth(?:entication)?|security)[\s_-]*code/i;
  const OTHER_FIELD_HINT = /用户名|账号|帐号|邮箱|手机|电话|搜索|username|user[\s_-]*id|\buid\b|email|phone|search/i;

  function clearHelpers() {
    host?.remove();
    host = null;
    for (const control of fillControls.values()) control.host.remove();
    fillControls.clear();
  }

  function mount(info) {
    if (closed || document.getElementById(HOST_ID)) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:18px;top:18px;';
    panel = host.attachShadow({ mode: 'closed' });
    panel.innerHTML = `<style>
      :host{all:initial} .card{box-sizing:border-box;width:228px;padding:14px 16px;border:1px solid #d9e1e5;border-radius:14px;background:#fff;color:#172126;box-shadow:0 12px 36px #102a381f;font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .top{display:flex;align-items:center;justify-content:space-between;color:#596a70;font-size:11px;gap:12px}.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.close{border:0;background:transparent;color:#829198;font-size:18px;line-height:16px;cursor:pointer;padding:0 0 2px 6px}
      .code{display:block;width:100%;margin:9px 0 5px;padding:0;border:0;background:transparent;text-align:left;font:600 30px/1.1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.13em;color:#0b6e67;cursor:pointer}.code:hover{color:#07564f}.code:focus-visible{outline:2px solid #27a99b;outline-offset:3px;border-radius:3px}.foot{display:flex;align-items:center;justify-content:space-between;color:#839197;font-size:11px}.track{height:3px;background:#eaf0ef;border-radius:5px;margin-top:9px;overflow:hidden}.bar{height:100%;background:#27a99b;transition:width .3s linear}
    </style><div class="card" role="status"><div class="top"><span class="title"></span><button class="close" aria-label="Close">×</button></div><button class="code" type="button" title="点击复制验证码">------</button><div class="foot"><span class="copy-hint">点击验证码复制</span><span class="timer"></span></div><div class="track"><div class="bar"></div></div></div>`;
    panel.querySelector('.close').addEventListener('click', () => { closed = true; clearHelpers(); });
    panel.querySelector('.code').addEventListener('click', copyCode);
    document.documentElement.appendChild(host);
    update(info);
  }

  function update(info) {
    panel.querySelector('.title').textContent = info.label;
    const codeElement = panel.querySelector('.code');
    if (codeElement.textContent !== info.code) panel.querySelector('.copy-hint').textContent = '点击验证码复制';
    codeElement.textContent = info.code;
    panel.querySelector('.timer').textContent = `${info.remaining}s`;
    panel.querySelector('.bar').style.width = `${Math.max(0, info.remaining / info.period * 100)}%`;
  }

  function isEditable(input) {
    if (!input.isConnected || input.disabled || input.readOnly || input.closest('[inert]')) return false;
    if (!['text', 'tel', 'number', 'password'].includes(input.type)) return false;
    const rect = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    return rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && style.display !== 'none';
  }

  function inputScore(input, digits) {
    if (input.maxLength > 0 && input.maxLength < digits && input.maxLength !== 1) return 0;
    const labels = [...(input.labels || [])].map((label) => label.textContent).join(' ');
    const ariaLabels = (input.getAttribute('aria-labelledby') || '').split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || '').join(' ');
    const hint = [input.id, input.name, input.placeholder, input.getAttribute('aria-label'), labels, ariaLabels].join(' ');
    if (input.autocomplete === 'one-time-code') return 200;
    if (OTP_HINT.test(hint)) return 100;
    if (OTHER_FIELD_HINT.test(hint) || input.type === 'password') return 0;
    if (/(?:^|[\s_-])code(?:$|[\s_-])/i.test(hint)) return 80;
    if (input.pattern === `\\d{${digits}}` || input.pattern === `[0-9]{${digits}}`) return 60;
    if (input.maxLength === digits) return 40;
    if (input.inputMode === 'numeric' || input.type === 'number' || input.type === 'tel') return 20;
    return 1;
  }

  function findTargets(digits) {
    const candidates = [...document.querySelectorAll('input')]
      .filter(isEditable)
      .map((input) => ({ input, score: inputScore(input, digits) }))
      .filter(({ score }) => score > 0);
    const targets = [];
    const grouped = new Set();
    // Some login pages render one input per digit. Use the smallest shared container.
    for (const { input } of candidates.filter(({ input }) => input.maxLength === 1)) {
      if (grouped.has(input)) continue;
      for (let parent = input.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const group = candidates.filter(({ input: field }) => parent.contains(field));
        if (group.length > digits) break;
        if (group.length === digits && group.every(({ input: field }) => field.maxLength === 1)) {
          const inputs = group.map(({ input: field }) => field);
          inputs.forEach((field) => grouped.add(field));
          targets.push(inputs);
          break;
        }
      }
    }
    const singleInputs = candidates.filter(({ input }) => !grouped.has(input) && input.maxLength !== 1);
    const explicit = singleInputs.filter(({ score }) => score >= 80);
    if (explicit.length) return [...targets, ...explicit.map(({ input }) => [input])];
    // Avoid guessing between equally plausible fields (for example UID and a search box).
    if (!targets.length && singleInputs.length) {
      const bestScore = Math.max(...singleInputs.map(({ score }) => score));
      const best = singleInputs.filter(({ score }) => score === bestScore);
      if (best.length === 1) targets.push([best[0].input]);
    }
    return targets;
  }

  function syncFillControls(info) {
    const targets = findTargets(info.code.length);
    const active = new Set(targets.map((inputs) => inputs[0]));
    for (const [input, control] of fillControls) {
      if (!active.has(input)) { control.host.remove(); fillControls.delete(input); }
    }
    for (const inputs of targets) {
      const existing = fillControls.get(inputs[0]);
      if (existing?.host.isConnected) { existing.inputs = inputs; continue; }
      existing?.host.remove();
      const buttonHost = document.createElement('div');
      buttonHost.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:block;';
      const shadow = buttonHost.attachShadow({ mode: 'closed' });
      shadow.innerHTML = `<style>
        :host{all:initial}button{box-sizing:border-box;min-height:30px;padding:6px 10px;border:1px solid #16766b;border-radius:7px;background:#fff;color:#0b6e67;box-shadow:0 2px 8px #102a381f;font:600 12px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;cursor:pointer}button:hover{background:#edf8f5}button:focus-visible{outline:2px solid #27a99b;outline-offset:2px}button:disabled{cursor:wait;opacity:.65}
      </style><button type="button" title="填入当前验证码，保留剪贴板内容">填充验证码</button>`;
      const control = { host: buttonHost, button: shadow.querySelector('button'), inputs };
      control.button.addEventListener('click', (event) => {
        event.stopPropagation();
        fillCode(control);
      });
      fillControls.set(inputs[0], control);
      document.documentElement.appendChild(buttonHost);
    }
    positionFillControls();
  }

  function positionFillControls() {
    for (const control of fillControls.values()) {
      const rects = control.inputs.map((input) => input.getBoundingClientRect());
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      const top = Math.min(...rects.map((rect) => rect.top));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      const visible = control.inputs.every(isEditable) && bottom > 0 && top < innerHeight && right > 0 && left < innerWidth;
      control.host.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      const buttonRect = control.button.getBoundingClientRect();
      const fitsRight = right + 8 + buttonRect.width <= innerWidth - 8;
      const x = fitsRight ? right + 8 : right - buttonRect.width;
      const y = fitsRight ? top + (bottom - top - buttonRect.height) / 2 : bottom + 6;
      control.host.style.left = `${Math.max(8, Math.min(x, innerWidth - buttonRect.width - 8))}px`;
      control.host.style.top = `${Math.max(8, Math.min(y, innerHeight - buttonRect.height - 8))}px`;
    }
  }

  function schedulePosition() {
    if (positionFrame || !fillControls.size) return;
    positionFrame = requestAnimationFrame(() => { positionFrame = null; positionFillControls(); });
  }

  async function fillCode(control) {
    if (control.button.disabled) return;
    control.button.disabled = true;
    const url = location.href;
    try {
      // Fetch on click so a code that has just rolled over is never taken from the card.
      const info = await chrome.runtime.sendMessage({ type: '2fa:get-code', url });
      if (closed || location.href !== url || !control.host.isConnected) return;
      if (!info) { clearHelpers(); return; }
      if (!/^\d{6,8}$/.test(info.code) || !control.inputs.every(isEditable)) return;
      if (!findTargets(info.code.length).some((inputs) => inputs.length === control.inputs.length &&
        inputs.every((input, index) => input === control.inputs[index]))) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const split = control.inputs.length > 1;
      control.inputs.forEach((input, index) => {
        const value = split ? info.code[index] : info.code;
        // Use the native setter so React's value tracker also sees the change.
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      });
      control.inputs[control.inputs.length - 1].focus({ preventScroll: true });
      control.button.textContent = '已填充 ✓';
      if (host?.isConnected) update(info);
    } catch {
      if (control.host.isConnected) control.button.textContent = '填充失败，重试';
    } finally {
      control.button.disabled = false;
    }
  }

  async function copyCode() {
    const code = panel.querySelector('.code').textContent;
    if (!/^\d{6,8}$/.test(code)) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      // execCommand supports clipboard copying from HTTP pages where Clipboard API is unavailable.
      const input = document.createElement('textarea');
      input.value = code;
      input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      panel.appendChild(input);
      input.select();
      copied = document.execCommand('copy');
      input.remove();
    }
    panel.querySelector('.copy-hint').textContent = copied ? '已复制 ✓' : '复制失败，请手动复制';
  }

  async function tick() {
    if (closed || ticking) return;
    ticking = true;
    try {
      const url = location.href;
      const info = await chrome.runtime.sendMessage({ type: '2fa:get-code', url });
      if (closed || location.href !== url) return;
      if (!info) { clearHelpers(); return; }
      if (!host?.isConnected) mount(info);
      else update(info);
      syncFillControls(info);
    } catch { clearHelpers(); }
    finally { ticking = false; }
  }
  document.addEventListener('scroll', schedulePosition, true);
  window.addEventListener('resize', schedulePosition);
  tick();
  setInterval(tick, 1000);
})();
