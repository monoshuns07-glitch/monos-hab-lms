/* ═══════════════════════════════════════════════════════════════════
   ЛОКАЛ ХӨГЖҮҮЛЭЛТИЙН СЕРВЕР — Монос ХАБЭА
   ХӨГЖҮҮЛЭХ.bat үүнийг ажиллуулна. Гаднын сан хэрэггүй (цэвэр Node).

   Юу хийдэг вэ:
     • D:\monos-hab-lms хавтсыг http://localhost:8080 болгож үзүүлнэ
     • /r2/*  → Cloudflare worker руу дамжуулна (сервер талаас тул CORS үгүй)
     • /api/* → monos-hab.vercel.app руу дамжуулна (файлын түлхүүр г.м)
     • Файл хадгалмагц браузер ӨӨРӨӨ шинэчлэгдэнэ
     • Кэш огт үүсгэхгүй — ?v= дугаар нэмэх шаардлагагүй
     • Service worker-ийг унтраана (хуучин хувилбар харагдахаас сэргийлнэ)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const R2 = 'monos-upload.buynt666.workers.dev';
const LIVE = 'monos-hab.vercel.app';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.map': 'application/json'
};

/* ── Браузерт "шинэчил" гэж хэлэх суваг ── */
let clients = [];
function tellReload(what) {
  clients = clients.filter(function (c) {
    try { c.write('data: ' + what + '\n\n'); return true; } catch (e) { return false; }
  });
}

/* ── HTML дотор шигтгэх скрипт ── */
const INJECT = `
<script>
(function(){
  /* Хуучин хувилбар харуулахгүйн тулд service worker-ийг унтраана */
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then(function(rs){
      rs.forEach(function(r){ r.unregister(); });
    }).catch(function(){});
    if (window.caches) caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); });
  }
  /* Анхааруулах туг — ЖИНХЭНЭ дата дээр ажиллаж байгааг мартуулахгүй */
  window.addEventListener('DOMContentLoaded', function(){
    var b = document.createElement('div');
    b.id = '__devbar';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;'
      + 'background:#7C2D12;color:#FED7AA;font:600 12px/1.5 system-ui,sans-serif;'
      + 'padding:5px 12px;display:flex;gap:14px;align-items:center;'
      + 'box-shadow:0 -2px 10px rgba(0,0,0,.25)';
    b.innerHTML = '<span style="background:#EA580C;color:#fff;border-radius:5px;padding:1px 7px;'
      + 'font-weight:800">ЛОКАЛ</span>'
      + '<span>Файл хадгалмагц энэ хуудас өөрөө шинэчлэгдэнэ</span>'
      + '<span style="margin-left:auto;opacity:.85">⚠ Дата нь ЖИНХЭНЭ — хадгалсан зүйл бодитоор өөрчлөгдөнө</span>';
    document.body.appendChild(b);
    document.body.style.paddingBottom = '30px';
  });
  /* Файл өөрчлөгдөхөд шинэчилнэ */
  try {
    var es = new EventSource('/__reload');
    es.onmessage = function(e){
      var bar = document.getElementById('__devbar');
      if (bar) bar.innerHTML = '<span style="background:#16A34A;color:#fff;border-radius:5px;'
        + 'padding:1px 7px;font-weight:800">ШИНЭЧИЛЖ БАЙНА</span><span>' + e.data + '</span>';
      setTimeout(function(){ location.reload(); }, 120);
    };
  } catch(e) {}
})();
</script>
`;

/* ── Прокси: сервер талаас дамжуулна тул CORS хамаарахгүй ── */
function proxy(req, res, host, upstreamPath) {
  const chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () {
    const body = Buffer.concat(chunks);
    const headers = {};
    ['content-type', 'x-key', 'x-up', 'x-exp', 'authorization', 'accept', 'content-length']
      .forEach(function (h) { if (req.headers[h]) headers[h] = req.headers[h]; });
    headers.host = host;
    headers.origin = 'https://' + LIVE;      // worker-ийн зөвшөөрсөн эх сурвалж
    headers.referer = 'https://' + LIVE + '/kpi/';

    const up = https.request({ host: host, path: upstreamPath, method: req.method, headers: headers },
      function (r) {
        const out = {};
        Object.keys(r.headers).forEach(function (k) {
          if (k === 'content-encoding' || k === 'transfer-encoding' ||
            k.indexOf('access-control') === 0) return;
          out[k] = r.headers[k];
        });
        out['access-control-allow-origin'] = '*';
        out['cache-control'] = 'no-store';
        res.writeHead(r.statusCode || 200, out);
        r.pipe(res);
      });
    up.on('error', function (e) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Прокси алдаа: ' + e.message);
    });
    if (body.length) up.write(body);
    up.end();
  });
}

const server = http.createServer(function (req, res) {
  const u = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(u.pathname);

  /* Шинэчлэлийн суваг */
  if (p === '/__reload') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store',
      connection: 'keep-alive' });
    res.write('retry: 800\n\n');
    clients.push(res);
    req.on('close', function () { clients = clients.filter(function (c) { return c !== res; }); });
    return;
  }
  /* Cloudflare R2 */
  if (p.indexOf('/r2/') === 0) return proxy(req, res, R2, p.slice(3) + u.search);
  /* Vercel serverless (файлын түлхүүр, OTP, push) */
  if (p.indexOf('/api/') === 0) return proxy(req, res, LIVE, p + u.search);

  if (p === '/') p = '/kpi/';
  if (p.endsWith('/')) p += 'index.html';

  const file = path.join(ROOT, p.replace(/^[\\/]+/, ''));
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('Хориотой'); return; }

  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Олдсонгүй: ' + p);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const head = { 'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store, no-cache, must-revalidate' };
    if (ext === '.html') {
      let html = data.toString('utf8');
      html = html.indexOf('</body>') >= 0
        ? html.replace('</body>', INJECT + '</body>')
        : html + INJECT;
      data = Buffer.from(html, 'utf8');
    }
    head['content-length'] = data.length;
    res.writeHead(200, head);
    res.end(data);
  });
});

/* ── Файл ажиглах ── */
const WATCH = [path.join(ROOT, 'kpi'), ROOT];
const seen = {};
WATCH.forEach(function (dir) {
  try {
    fs.watch(dir, { persistent: true }, function (ev, name) {
      if (!name || !/\.(js|html|css)$/i.test(name)) return;
      if (/^(dev-server|node_modules)/.test(name)) return;
      const key = dir + '|' + name;
      const now = Date.now();
      if (seen[key] && now - seen[key] < 400) return;   // хадгалахад 2 удаа дуудагддаг
      seen[key] = now;
      const t = new Date().toTimeString().slice(0, 8);
      console.log('  [' + t + '] ' + name + ' → браузер шинэчлэгдэж байна');
      tellReload(name);
    });
  } catch (e) {}
});

server.listen(PORT, function () {
  const url = 'http://localhost:' + PORT + '/kpi/';
  console.log('');
  console.log('  ════════════════════════════════════════════════════════');
  console.log('   ЛОКАЛ ХӨГЖҮҮЛЭЛТ АЖИЛЛАЖ БАЙНА');
  console.log('  ════════════════════════════════════════════════════════');
  console.log('');
  console.log('   Хаяг:    ' + url);
  console.log('   Хавтас:  ' + ROOT);
  console.log('');
  console.log('   Файлаа заслаад ХАДГАЛ → браузер өөрөө шинэчлэгдэнэ');
  console.log('   ?v= дугаар нэмэх ШААРДЛАГАГҮЙ (локалд кэш байхгүй)');
  console.log('');
  console.log('   ⚠ Дата нь ЖИНХЭНЭ. Хадгалсан зүйл бодитоор өөрчлөгдөнө.');
  console.log('   ⚠ Сайт руу гаргах бол 2-ИЛГЭЭХ.bat дарна.');
  console.log('');
  console.log('   Зогсоох: энэ цонхонд Ctrl+C');
  console.log('');
  try { execFile('cmd', ['/c', 'start', '', url]); } catch (e) {}
});
