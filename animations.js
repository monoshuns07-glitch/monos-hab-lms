/* ============================================================
   МОНОС ХҮНС ХК — Premium Animation System (JS)
   ============================================================ */
(function(){
  'use strict';
  if (window.__monosAnimsLoaded) return;
  window.__monosAnimsLoaded = true;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. Scroll progress bar ── */
  function initScrollProgress(){
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    document.body.appendChild(bar);
    let raf;
    const update = () => {
      const st = window.pageYOffset;
      const dh = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (dh > 0 ? (st / dh) * 100 : 0) + '%';
    };
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { update(); raf = null; });
    }, { passive: true });
    update();
  }

  /* ── 2. Page transition overlay ── */
  function initPageTransition(){
    const overlay = document.createElement('div');
    overlay.className = 'page-transition-overlay';
    document.body.appendChild(overlay);
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript') || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel') || link.target === '_blank') return;
      e.preventDefault();
      overlay.classList.add('active');
      setTimeout(() => { window.location.href = href; }, 320);
    });
    window.addEventListener('pageshow', () => overlay.classList.remove('active'));
  }

  /* ── 3. Auto-tag elements with .sr classes ── */
  function autoTag(){
    const map = [
      { sel: '.section-header', cls: 'sr' },
      { sel: '.info-card,.nav-card,.training-card,.lms-card,.video-card,.user-card,.stat-card', cls: 'sr-scale' },
      { sel: '.feature-card,.case-block,.help-row,.qa-card,.acc-item,.cnt-card,.pdf-row,.timeline-item', cls: 'sr' }
    ];
    map.forEach(({sel,cls}) => {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (!el.classList.contains('sr') && !el.classList.contains('sr-left') && !el.classList.contains('sr-right') && !el.classList.contains('sr-scale')) {
          el.classList.add(cls);
        }
        // Auto-stagger delay
        const idx = Array.from(el.parentNode?.children || []).indexOf(el);
        const dCls = `sr-d${Math.min((idx % 8) + 1, 8)}`;
        if (!Array.from(el.classList).some(c => /^sr-d\d/.test(c))) {
          el.classList.add(dCls);
        }
      });
    });
  }

  /* ── 4. IntersectionObserver scroll reveal ── */
  function initScrollReveal(){
    const els = document.querySelectorAll('.sr,.sr-left,.sr-right,.sr-scale,.section-header');
    if (!('IntersectionObserver' in window) || reduce) {
      els.forEach(el => el.classList.add('visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => io.observe(el));
  }

  /* ── 5. Mouse glow on cards ── */
  function initMouseGlow(){
    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest('.info-card,.nav-card,.stat-card,.training-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    });
  }

  /* ── 6. Number count-up ── */
  function initCountUp(){
    if (reduce) return;
    const els = document.querySelectorAll('.stat-num,.stat-value');
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        const text = el.textContent.trim();
        const m = text.match(/^(\d[\d,\s]*)/);
        if (!m) { io.unobserve(el); return; }
        const target = parseInt(m[1].replace(/[\s,]/g, ''));
        if (isNaN(target) || target <= 0) { io.unobserve(el); return; }
        const suffix = text.slice(m[0].length);
        const dur = 1600;
        const start = performance.now();
        const tick = (now) => {
          const p = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 4);
          el.textContent = Math.floor(eased * target).toLocaleString() + suffix;
          if (p < 1) requestAnimationFrame(tick);
          else el.textContent = target.toLocaleString() + suffix;
        };
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.4 });
    els.forEach(el => io.observe(el));
  }

  /* ── 7. Page-loaded class ── */
  function markLoaded(){
    const loader = document.getElementById('loadingScreen');
    if (loader) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          loader.classList.add('fade-out');
          document.body.classList.add('page-loaded');
          setTimeout(() => loader.remove?.(), 600);
        }, 300);
      });
    } else {
      document.body.classList.add('page-loaded');
    }
  }

  /* ── Init ── */
  function init(){
    try{ initScrollProgress(); }catch(e){}
    try{ initPageTransition(); }catch(e){}
    try{ autoTag(); }catch(e){}
    try{ initScrollReveal(); }catch(e){}
    try{ initMouseGlow(); }catch(e){}
    try{ initCountUp(); }catch(e){}
    try{ markLoaded(); }catch(e){}

    // Re-tag on dynamic content (debounced)
    let mtimer;
    const mo = new MutationObserver(() => {
      clearTimeout(mtimer);
      mtimer = setTimeout(() => { autoTag(); initScrollReveal(); initCountUp(); }, 250);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
