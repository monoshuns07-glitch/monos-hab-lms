/* Монос Хүнс ХАБЭА-н алба — PWA эхлүүлэгч
   • Service worker бүртгэнэ (апп суулгах боломж нээгдэнэ)
   • "Апп суулгах" товчийг автоматаар гаргана (Android/Windows/Chrome)
   • iPhone дээр Safari-д зориулсан заавар харуулна */
(function () {
  'use strict';

  // ── 0. iframe дотор бол ЮУ Ч ХИЙХГҮЙ ──
  // Даатгал (/nohon-tulbur.html), Контент удирдлага (/admin.html), Видео сургалт
  // (/employee.html) зэрэг нь KPI апп дотор iframe-ээр ачаалагддаг.
  // Тэдгээрийн дотор суулгах товч гаргавал хуудасны харагдацыг эвдэнэ.
  var inFrame = false;
  try { inFrame = (window.self !== window.top); } catch (e) { inFrame = true; }
  if (inFrame) return;

  /* ══════════════════════════════════════════════════════════════════
     0.5. ХУВИЛБАР ШАЛГАГЧ — «шинэчлэлт хүрэхгүй байна» асуудлыг таслана
     ------------------------------------------------------------------
     ⚠ АСУУДАЛ: сайтыг шинэчилсэн ч зарим ажилтны утсанд ХУУЧИН хувилбар
     үлдэж, шинэ цэс/товч харагдахгүй байв. Шалтгаан нь index.html-ийг
     хөтөч (эсвэл байгууллагын прокси, эсвэл суусан PWA) кэшлээд, дотор
     нь бичигдсэн `script.js?v=NNN` хуучин үлддэгт байна.

     ШИЙДЭЛ: серверээс `version.json`-ыг кэшгүйгээр асууж, ажиллаж байгаа
     хувилбартай тааруулна. Таарахгүй бол кэшийг цэвэрлэж, ӨӨР хаягаар
     (?_v=NNN) нэг удаа дахин ачаална — ингэснээр кэш давхаргууд бүгд
     алгасагдана. Давталтад орохгүйн тулд sessionStorage-оор хамгаална. */
  (function versionGuard() {
    function running() {
      var t = document.querySelector('script[src*="script.js?v="]');
      var m = t && String(t.getAttribute('src') || '').match(/v=(\d+)/);
      return m ? m[1] : '';
    }
    function go() {
      var mine = running();
      if (!mine) return;
      fetch('/kpi/version.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var latest = j && j.v != null ? String(j.v) : '';
          if (!latest || latest === mine) {
            /* Таарсан — хаягнаас ?_v= тэмдэглэгээг цэвэрлэнэ */
            try {
              if (location.search.indexOf('_v=') >= 0) {
                var u = new URL(location.href);
                u.searchParams.delete('_v');
                history.replaceState(null, '', u.pathname + (u.search === '?' ? '' : u.search) + u.hash);
              }
              sessionStorage.removeItem('mhVerTry');
              sessionStorage.removeItem('mhVerNuke');
            } catch (e) {}
            return;
          }
          var tried = '';
          try { tried = sessionStorage.getItem('mhVerTry') || ''; } catch (e) {}
          if (tried === latest) {
            /* ⚠ Нэг удаа цэвэрлээд ч засарсангүй — хамгийн сүүлийн арга:
               service worker-ийг БҮРЭН устгана. Эвдэрсэн эсвэл гацсан SW
               хуучин файлыг зөрүүдлэн өгсөөр байх тохиолдол бий.
               Устгасны дараа хуудас өөрөө дахин бүртгүүлнэ. */
            var nuked = false;
            try { nuked = sessionStorage.getItem('mhVerNuke') === latest; } catch (e) {}
            if (!nuked && navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
              try { sessionStorage.setItem('mhVerNuke', latest); } catch (e) {}
              navigator.serviceWorker.getRegistrations().then(function (rs) {
                return Promise.all(rs.map(function (r) { return r.unregister().catch(function () {}); }));
              }).catch(function () {}).then(function () {
                try { sessionStorage.removeItem('mhVerTry'); } catch (e) {}
                location.reload();
              });
              return;
            }
            banner(latest); return;
          }
          try { sessionStorage.setItem('mhVerTry', latest); } catch (e) {}

          /* Кэш + service worker-ийг цэвэрлээд дахин ачаална */
          var jobs = [];
          try {
            if (window.caches && caches.keys) {
              jobs.push(caches.keys().then(function (ks) {
                return Promise.all(ks.map(function (k) { return caches.delete(k); }));
              }));
            }
          } catch (e) {}
          try {
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
              jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
                return Promise.all(rs.map(function (r) { return r.update().catch(function () {}); }));
              }));
            }
          } catch (e) {}
          Promise.all(jobs).catch(function () {}).then(function () {
            var u;
            try { u = new URL(location.href); } catch (e) { location.reload(); return; }
            u.searchParams.set('_v', latest);
            location.replace(u.toString());
          });
        })
        .catch(function () {});
    }
    /* Хэрэглэгчид харагдах анхааруулга — автоматаар засарсангүй бол */
    function banner(latest) {
      if (document.getElementById('mhVerBar')) return;
      var d = document.createElement('div');
      d.id = 'mhVerBar';
      d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483600;' +
        'background:#B91C1C;color:#fff;font-family:inherit;font-size:13px;font-weight:700;' +
        'padding:11px 14px;text-align:center;line-height:1.5;box-shadow:0 4px 14px rgba(0,0,0,.25)';
      d.innerHTML = 'Шинэ хувилбар (' + latest + ') гарсан байна. Апп-аа бүрэн хаагаад ' +
        'дахин нээнэ үү. <button id="mhVerGo" style="margin-left:8px;border:0;border-radius:8px;' +
        'padding:6px 12px;background:#fff;color:#B91C1C;font-weight:800;font-family:inherit;' +
        'font-size:12.5px;cursor:pointer">Дахин ачаалах</button>';
      (document.body || document.documentElement).appendChild(d);
      var b = d.querySelector('#mhVerGo');
      if (b) b.addEventListener('click', function () {
        try { sessionStorage.removeItem('mhVerTry'); } catch (e) {}
        location.reload();
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
    /* ⚠ 30 минут нь удаан байв — админ шинэчлэлт хийвэл ажилтнууд удаан
       хүлээдэг. 2 минут тутам шалгана (version.json нь ~15 байт). */
    setInterval(go, 2 * 60 * 1000);
    /* Утсанд апп-ыг ар талаас буцаан нээхэд шалгана */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) go();
    });
  })();

  // ── 1. Service worker ──
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      /* ⚠ updateViaCache:'none' — эс бөгөөс хөтөч sw.js-ийг өөрөө кэшлээд
         шинэ service worker хэзээ ч ирэхгүй байх эрсдэлтэй. */
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .catch(function () {});
    });
  }

  // Аль хэдийн апп болж суусан бол товч харуулахгүй
  function isInstalled() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           window.navigator.standalone === true;
  }

  var deferred = null;

  function makeBtn(label, onClick) {
    var b = document.createElement('button');
    b.id = 'pwaInstallBtn';
    b.type = 'button';
    b.innerHTML = '<span style="font-size:16px;line-height:1">⬇</span>' + label;
    // bottom:88px — "Аюул мэдээлэх" хөвөгч товчтой давхцахгүй
    b.style.cssText = [
      'position:fixed', 'right:18px', 'bottom:88px', 'z-index:2147483000',
      'display:inline-flex', 'align-items:center', 'gap:9px',
      'padding:12px 18px', 'border:none', 'border-radius:14px', 'cursor:pointer',
      'font-family:inherit', 'font-size:13.5px', 'font-weight:800', 'color:#fff',
      'background:linear-gradient(135deg,#C10010,#E30613 55%,#FF2535)',
      'box-shadow:0 10px 30px rgba(227,6,19,.42),0 2px 8px rgba(0,0,0,.2)',
      'transition:transform .2s, box-shadow .2s'
    ].join(';');
    b.onmouseenter = function () { b.style.transform = 'translateY(-2px)'; };
    b.onmouseleave = function () { b.style.transform = 'none'; };
    b.addEventListener('click', onClick);
    document.body.appendChild(b);
    return b;
  }

  // ── 2. Android / Windows / Chrome — жинхэнэ суулгах товч ──
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (isInstalled() || document.getElementById('pwaInstallBtn')) return;
    var btn = makeBtn('Апп суулгах', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () {
        deferred = null;
        var el = document.getElementById('pwaInstallBtn');
        if (el) el.remove();
      });
    });
    void btn;
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    var el = document.getElementById('pwaInstallBtn');
    if (el) el.remove();
  });

  // ── 3. iPhone / iPad (Safari) — гарын авлагын заавар ──
  document.addEventListener('DOMContentLoaded', function () {
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (!isIOS || !isSafari || isInstalled()) return;
    try { if (localStorage.getItem('pwa_ios_hint') === 'off') return; } catch (e) {}

    makeBtn('Утсанд суулгах', function () {
      var w = document.createElement('div');
      w.style.cssText = 'position:fixed;inset:0;z-index:2147483100;background:rgba(8,12,28,.62);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;padding:18px';
      w.innerHTML =
        '<div style="background:#fff;border-radius:20px;padding:22px 20px;max-width:420px;width:100%;max-height:calc(100vh - 36px);display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.35);font-family:inherit">' +
          '<div style="font-size:17px;font-weight:800;color:#0F1117;margin-bottom:10px">Утсанд суулгах</div>' +
          '<div style="font-size:14px;color:#374151;line-height:1.75;flex:1 1 auto;overflow-y:auto;min-height:0;-webkit-overflow-scrolling:touch">' +
            '1. Доод талын <b>Хуваалцах</b> товч <b>&#x2934;</b> дарна<br>' +
            '2. <b>«Нүүр дэлгэцэд нэмэх»</b> (Add to Home Screen) сонгоно<br>' +
            '3. <b>Нэмэх</b> дарна — апп нүүр дэлгэцэд суулаа' +
          '</div>' +
          '<button style="flex:0 0 auto;margin-top:16px;width:100%;padding:13px;border:none;border-radius:12px;background:#E30613;color:#fff;font-weight:800;font-size:14px;font-family:inherit;cursor:pointer">Ойлголоо</button>' +
        '</div>';
      w.querySelector('button').addEventListener('click', function () {
        try { localStorage.setItem('pwa_ios_hint', 'off'); } catch (e) {}
        w.remove();
        var el = document.getElementById('pwaInstallBtn');
        if (el) el.remove();
      });
      w.addEventListener('click', function (ev) { if (ev.target === w) w.remove(); });
      document.body.appendChild(w);
    });
  });

  // ── 4. Android — «Суулгах» товч ГАРААГҮЙ үеийн нөөц зам ──
  /* ⚠ ЯАГААД: Chrome-ын `beforeinstallprompt` тохиолдол дараах үед ОГТ
     ажилладаггүй — Messenger/Facebook/Instagram зэргийн дотоод хөтөч
     (чатаас QR уншуулбал ихэвчлэн ингэж нээгддэг), Samsung Internet,
     Firefox, MIUI. Тэр үед ажилтан ямар ч товч харахгүй тул «апп суухгүй
     байна» гэж ойлгодог байв (2026-08-26). Одоо гарын авлагын заавар
     харуулна, дотоод хөтөч бол Chrome-оор нээхийг санал болгоно. */
  document.addEventListener('DOMContentLoaded', function () {
    var ua = navigator.userAgent || '';
    if (!/Android/i.test(ua) || isInstalled()) return;
    setTimeout(function () {
      if (deferred) return;                                   // жинхэнэ товч гарсан
      if (document.getElementById('pwaInstallBtn')) return;
      try { if (localStorage.getItem('pwa_and_hint') === 'off') return; } catch (e) {}

      var inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Zalo|MicroMessenger|TwitterAndroid|EdgA?\/.*wv|; wv\)/i.test(ua);
      var samsung = /SamsungBrowser/i.test(ua);
      var steps, head;
      if (inApp) {
        head = 'Chrome хөтчөөр нээнэ үү';
        steps = 'Та энэ хуудсыг чат аппын дотоод хөтчөөр нээсэн байна. ' +
                'Тэндээс апп суулгах боломжгүй.<br><br>' +
                '1. Баруун дээд булангийн <b>&#8942;</b> цэс дарна<br>' +
                '2. <b>«Chrome-оор нээх»</b> (Open in Chrome / Browser) сонгоно<br>' +
                '3. Chrome дээр нээгдмэгц <b>«Апп суулгах»</b> товч гарч ирнэ';
      } else if (samsung) {
        head = 'Утсанд суулгах';
        steps = '1. Доод талын <b>&#8801;</b> цэс дарна<br>' +
                '2. <b>«Add page to»</b> сонгоно<br>' +
                '3. <b>«Home screen»</b> дарна — апп нүүр дэлгэцэд суулаа';
      } else {
        head = 'Утсанд суулгах';
        steps = '1. Баруун дээд булангийн <b>&#8942;</b> цэс дарна<br>' +
                '2. <b>«Апп суулгах»</b> эсвэл <b>«Нүүр дэлгэцэд нэмэх»</b> сонгоно<br>' +
                '3. <b>Суулгах</b> дарна — апп нүүр дэлгэцэд суулаа<br><br>' +
                '<span style="color:#6B7280;font-size:13px">Заавар олдохгүй бол хуудсаа ' +
                '<b>Chrome</b> хөтчөөр нээж үзнэ үү.</span>';
      }

      makeBtn('Утсанд суулгах', function () {
        var w = document.createElement('div');
        w.style.cssText = 'position:fixed;inset:0;z-index:2147483100;background:rgba(8,12,28,.62);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;padding:18px';
        var chromeBtn = inApp
          ? '<button id="pwaOpenChrome" style="flex:0 0 auto;margin-top:14px;width:100%;padding:13px;border:none;border-radius:12px;background:#0F1117;color:#fff;font-weight:800;font-size:14px;font-family:inherit;cursor:pointer">Chrome-оор нээх</button>'
          : '';
        w.innerHTML =
          '<div style="background:#fff;border-radius:20px;padding:22px 20px;max-width:420px;width:100%;max-height:calc(100vh - 36px);display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.35);font-family:inherit">' +
            '<div style="font-size:17px;font-weight:800;color:#0F1117;margin-bottom:10px">' + head + '</div>' +
            '<div style="font-size:14px;color:#374151;line-height:1.75;flex:1 1 auto;overflow-y:auto;min-height:0;-webkit-overflow-scrolling:touch">' + steps + '</div>' +
            chromeBtn +
            '<button id="pwaHintOk" style="flex:0 0 auto;margin-top:10px;width:100%;padding:13px;border:none;border-radius:12px;background:#E30613;color:#fff;font-weight:800;font-size:14px;font-family:inherit;cursor:pointer">Ойлголоо</button>' +
          '</div>';
        var oc = w.querySelector('#pwaOpenChrome');
        if (oc) oc.addEventListener('click', function () {
          var host = location.host + location.pathname;
          location.href = 'intent://' + host + '#Intent;scheme=https;package=com.android.chrome;end';
        });
        w.querySelector('#pwaHintOk').addEventListener('click', function () {
          try { localStorage.setItem('pwa_and_hint', 'off'); } catch (e) {}
          w.remove();
          var el = document.getElementById('pwaInstallBtn');
          if (el) el.remove();
        });
        w.addEventListener('click', function (ev) { if (ev.target === w) w.remove(); });
        document.body.appendChild(w);
      });
    }, 3500);
  });
})();
