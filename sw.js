/* Монос Хүнс ХАБЭА-н алба — Service Worker
   ⚠️ ЗОРИЛГО: апп суулгах боломж (installable) олгох.
   HTML/JS-ийг КЭШЛЭХГҮЙ — үргэлж сүлжээнээс шинийг авна (хуучин хувилбар үлдэхээс сэргийлнэ).
   Зөвхөн icon/manifest зэрэг статик жижиг файлыг кэшэлнэ. */

const CACHE = 'monos-hab-static-v2';
const STATIC_ASSETS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/icons/icon-maskable-512.png',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;   // гадны сервер (Firebase, CDN) — хөндөхгүй

  // ⚠️ ЗӨВХӨН icon/manifest-ийг л зохицуулна.
  // Бусад БҮХ хүсэлтэд respondWith дуудахгүй → браузер өөрөө шууд авна
  // (service worker огт байхгүй үеийнхтэй ЯГ адил ажиллана).
  if (STATIC_ASSETS.indexOf(url.pathname) === -1) return;

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }))
  );
});
