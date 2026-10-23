(() => {
  if (window.top !== window || location.protocol === 'chrome-extension:') return;
  const HOST_ID = 'twofa-quick-code-host';
  let closed = false;
  let host;
  let panel;

  function mount() {
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
    panel.querySelector('.close').addEventListener('click', () => { closed = true; host.remove(); });
    panel.querySelector('.code').addEventListener('click', copyCode);
    document.documentElement.appendChild(host);
    update(panel);
  }

  async function update(shadow) {
    try {
      const info = await chrome.runtime.sendMessage({ type: '2fa:get-code' });
      if (!info || !host?.isConnected) { host?.remove(); host = null; return; }
      shadow.querySelector('.title').textContent = info.label;
      const codeElement = shadow.querySelector('.code');
      if (codeElement.textContent !== info.code) shadow.querySelector('.copy-hint').textContent = '点击验证码复制';
      codeElement.textContent = info.code;
      shadow.querySelector('.timer').textContent = `${info.remaining}s`;
      shadow.querySelector('.bar').style.width = `${Math.max(0, info.remaining / info.period * 100)}%`;
    } catch { host?.remove(); host = null; }
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
    if (closed) return;
    if (!host?.isConnected) {
      try {
        const info = await chrome.runtime.sendMessage({ type: '2fa:get-code' });
        if (!info) return;
        mount();
      } catch { return; }
    } else {
      update(panel);
    }
  }
  tick();
  setInterval(tick, 1000);
})();
