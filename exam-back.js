/* ══════════════════════════════════════════════════════════════
   ХАБЭА шалгалтын хуудсуудын "← Буцах" товч (зүүн ДЭЭД булан)
   Бүх шалгалтын HTML-д <script src="/exam-back.js" defer></script>
   • Толгой хэсэг (.hdr / .nav / header) байвал түүний ЭХЭНД оруулна
   • Байхгүй бол зүүн дээд буланд хөвөгч байдлаар гарна
   • Шалгалт дундуур бол гарахаас өмнө баталгаажуулна
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // iframe дотор бол харуулахгүй (эх хуудсандаа буцах товч бий)
  try { if (window.self !== window.top) return; } catch (e) { return; }

  var CSS = [
    '.exam-back-btn{',
    '  display:inline-flex;align-items:center;gap:6px;flex-shrink:0;',
    '  padding:8px 14px;margin-right:12px;',
    '  border:1.5px solid rgba(0,0,0,.10);border-radius:11px;cursor:pointer;',
    '  background:#fff;color:#374151;',
    '  font-family:inherit;font-size:13px;font-weight:800;line-height:1.2;',
    '  box-shadow:0 2px 6px rgba(0,0,0,.07);',
    '  transition:background .15s,color .15s,border-color .15s,transform .15s;',
    '  text-decoration:none;white-space:nowrap;',
    '}',
    '.exam-back-btn:hover{background:#111827;color:#fff;border-color:#111827;transform:translateY(-1px)}',
    '.exam-back-btn .eb-a{font-size:15px;line-height:1}',
    /* Толгой олдоогүй үед — зүүн дээд буланд хөвөгч */
    '.exam-back-btn.floating{',
    '  position:fixed;top:14px;left:14px;z-index:2147483000;margin:0;',
    '  padding:10px 16px;font-size:13.5px;',
    '  box-shadow:0 6px 20px rgba(15,23,42,.20);',
    '}',
    '@media(max-width:520px){',
    '  .exam-back-btn{padding:7px 11px;font-size:12px;margin-right:9px}',
    '  .exam-back-btn .eb-t{display:none}',        /* жижиг дэлгэцэд зөвхөн сум */
    '  .exam-back-btn.floating{padding:9px 12px;top:10px;left:10px}',
    '}'
  ].join('');

  function injectCss() {
    if (document.getElementById('examBackCss')) return;
    var s = document.createElement('style');
    s.id = 'examBackCss';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* Шалгалт дундуур эсэхийг тодорхойлно (хариулт алдагдахаас сэргийлнэ) */
  function inProgress() {
    try {
      var ids = ['screenExam', 'screenSignature'];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el && el.classList.contains('active')) return true;
      }
      // Бусад бүтэцтэй хуудсууд: асуулт харагдаж байвал
      var q = document.querySelector('#qCard, .q-card, #questionBox');
      if (q && q.offsetParent !== null && q.textContent.trim().length > 20) return true;
    } catch (e) {}
    return false;
  }

  function goBack() {
    if (inProgress() && !confirm('Шалгалт дуусаагүй байна. Гарвал хариултууд хадгалагдахгүй. Гарах уу?')) return;
    var ref = '';
    try { ref = document.referrer || ''; } catch (e) {}
    if (ref && ref.indexOf(location.host) !== -1 && history.length > 1) { history.back(); return; }
    location.href = '/kpi/';
  }

  function makeBtn(floating) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'exam-back-btn' + (floating ? ' floating' : '');
    b.title = 'Буцах';
    b.innerHTML = '<span class="eb-a">&#8592;</span><span class="eb-t">Буцах</span>';
    b.addEventListener('click', goBack);
    return b;
  }

  function place() {
    injectCss();
    // Хуудасны бүх толгой хэсэгт (дэлгэц тус бүрд байж болно) оруулна
    var heads = document.querySelectorAll('.hdr, .nav, header, .header, .top-nav, .hub-header');
    var placed = 0;
    heads.forEach(function (h) {
      if (h.querySelector(':scope > .exam-back-btn')) { placed++; return; }
      try {
        h.insertBefore(makeBtn(false), h.firstChild);
        placed++;
      } catch (e) {}
    });
    // Толгой олдсонгүй → хөвөгч товч
    if (!placed && document.body && !document.querySelector('.exam-back-btn')) {
      document.body.appendChild(makeBtn(true));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
  else place();
  // Дэлгэц динамикаар үүсдэг хуудсанд — 1 секундын дараа дахин шалгана
  setTimeout(place, 1200);
})();
