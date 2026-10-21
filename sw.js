/* 离线缓存核心资源。策略：stale-while-revalidate——先回缓存秒开，后台同时拉最新覆盖缓存，
   下次刷新即新版。部署后不再依赖"记得升 CACHE 版本"：版本号只用于大扫除（清掉整套旧缓存），
   平时改静态资源无需动它。 */
const CACHE = '2fa-v18';
const CORE = [
  './',
  './index.html',
  './support.js',
  './manifest.json',
  './icon.svg',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './vendor/qrcode.js',
  './vendor/jsqr.js', // 扫码兜底引擎（Safari/Firefox 没有 BarcodeDetector）——预缓存保住离线扫码
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // HEAD（时钟对表）等直连网络，拿真实响应头
  if (req.cache === 'no-store') return; // 显式绕缓存的请求（tests.html 抓源码自测等）也直连
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // 后台 revalidate：无论是否命中缓存都发起，成功则更新缓存
  const fresh = fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  });
  e.waitUntil(fresh.catch(() => {})); // 返回缓存后保活，让后台更新跑完
  e.respondWith(
    caches.match(req).then((cached) => cached || fresh.catch(() => {
      // 离线兜底：导航请求返回缓存的入口页
      if (req.mode === 'navigate') return caches.match('./index.html');
      return new Response('', { status: 504, statusText: 'offline' });
    }))
  );
});
