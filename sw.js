/* Монос Хүнс ХАБЭА-н алба — Service Worker
   ⚠️ ЗОРИЛГО: апп суулгах боломж (installable) + PUSH САНУУЛГА.
   HTML/JS-ийг КЭШЛЭХГҮЙ — үргэлж сүлжээнээс шинийг авна (хуучин хувилбар үлдэхээс сэргийлнэ).
   Зөвхөн icon/manifest зэрэг статик жижиг файлыг кэшэлнэ. */

const CACHE = 'monos-hab-static-v4';
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

/* ══════════════════════════════════════════════════════════════════════
   🔔 PUSH САНУУЛГА
   Сайт ХААЛТТАЙ, хөтөч бүр хаагдсан байсан ч (утас/компьютер аль нь ч)
   сервер сануулга илгээвэл систем энэ кодыг сэрээж мэдэгдэл гаргана.
   ⚠️ userVisibleOnly:true тул push ирэх бүрд ЗААВАЛ мэдэгдэл гаргах ёстой —
      эс бөгөөс браузер бүртгэлийг хүчингүй болгоно.
   ══════════════════════════════════════════════════════════════════════ */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) {
    try { d = { body: e.data.text() }; } catch (__) { d = {}; }
  }
  const title = d.title || 'Монос Хүнс — ХАБЭА';
  const body = d.body || 'Танд хугацаатай арга хэмжээ хүлээгдэж байна.';
  /* ⭐ ЯАРАЛТАЙ (хугацаа хэтэрсэн) мэдэгдлийг энгийнээс ЯЛГАНА.
     · requireInteraction: хэрэглэгч дартал дэлгэцээс арилахгүй
     · урт чичиргээ: гар халаасанд байсан ч мэдэгдэнэ
     · тус тусдаа таг: олон зүйл бие биенээ дарахгүй, бүгд харагдана */
  const urgent = !!d.urgent;
  const opts = {
    body: body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag: d.tag || (urgent ? ('mh-urgent-' + (d.id || Date.now())) : 'monos-hab-mea'),
    renotify: true,
    requireInteraction: urgent,
    vibrate: urgent ? [300, 120, 300, 120, 300, 120, 500] : [90, 45, 90],
    data: { url: d.url || '/kpi/?page=tasks', urgent: urgent },
    actions: [{ action: 'open', title: urgent ? 'Одоо хийх' : 'Нээх' }]
  };
  e.waitUntil((async () => {
    await self.registration.showNotification(title, opts);
    /* Аппын дүрс дээрх тоо — хэдэн зүйл хүлээгдэж байгааг харуулна */
    try {
      if (typeof d.badgeCount === 'number' && navigator.setAppBadge) {
        if (d.badgeCount > 0) await navigator.setAppBadge(d.badgeCount);
        else if (navigator.clearAppBadge) await navigator.clearAppBadge();
      }
    } catch (_) {}
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  try { if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (_) {}
  const target = (e.notification.data && e.notification.data.url) || '/kpi/';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.indexOf('/kpi/') !== -1) {
        try { await w.focus(); } catch (_) {}
        try { if (w.navigate) await w.navigate(target); } catch (_) {}
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

/* Хэрэглэгч хөтчийн тохиргооноос сануулгыг хааж/сэргээхэд бүртгэл шинэчлэгдэнэ.
   Дараагийн удаа сайтад орох үед клиент код өөрөө нөхөж бүртгүүлнэ. */
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(Promise.resolve());
});
