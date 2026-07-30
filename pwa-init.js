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

  // ── 1. Service worker ──
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
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
        '<div style="background:#fff;border-radius:20px;padding:22px 20px;max-width:420px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,.35);font-family:inherit">' +
          '<div style="font-size:17px;font-weight:800;color:#0F1117;margin-bottom:10px">Утсанд суулгах</div>' +
          '<div style="font-size:14px;color:#374151;line-height:1.75">' +
            '1. Доод талын <b>Хуваалцах</b> товч <b>&#x2934;</b> дарна<br>' +
            '2. <b>«Нүүр дэлгэцэд нэмэх»</b> (Add to Home Screen) сонгоно<br>' +
            '3. <b>Нэмэх</b> дарна — апп нүүр дэлгэцэд суулаа' +
          '</div>' +
          '<button style="margin-top:16px;width:100%;padding:13px;border:none;border-radius:12px;background:#E30613;color:#fff;font-weight:800;font-size:14px;font-family:inherit;cursor:pointer">Ойлголоо</button>' +
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
})();
