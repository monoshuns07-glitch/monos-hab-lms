/* ============================================================================
   _r2cas.js — Хуваалцсан R2 JSON файлд ЗЭРЭГ БИЧИЛТИЙН ХАМГААЛАЛТТАЙ бичих (сервер)
   ----------------------------------------------------------------------------
   ⚠ ЯАГААД (2026-09-11): серверийн функцууд (аудит, шалгалтын дүн, сэрэмжлүүлэг)
   нэг файлыг «уншаад → нэгтгээд → бичдэг». Хоёр дуудлага зэрэг явахад сүүлд
   газардсан нь эхнийхийн мөрийг ЧИМЭЭГҮЙ дардаг байв (аудитын гинж тасрах,
   шалгалтын дүн алга болох).
   Worker уншихад X-Etag өгч, бичихэд X-If-Match шалгана (412 → шинээр уншиж
   build()-ийг дахин ажиллуулна). build(cur) ЦЭВЭР функц байх ёстой; null → бичихгүй.
   Уншилт унавал (404-өөс бусад) ХЭЗЭЭ Ч бичихгүй.
   ========================================================================== */
const crypto = require('crypto');
const R2 = 'https://monos-upload.buynt666.workers.dev';

function secret() { return process.env.SIGN_SECRET || ''; }
function dlQ(key) {
  let q = '?cb=' + Date.now();
  const s = secret();
  if (s) {
    const e = String(Date.now() + 10 * 60 * 1000);
    q += '&t=' + crypto.createHmac('sha256', s).update('dl|' + key + '|' + e, 'utf8').digest('hex') + '&e=' + e;
  }
  return q;
}
function upH(key) {
  const e = String(Date.now() + 10 * 60 * 1000);
  return {
    'Content-Type': 'application/json',
    'X-Up': crypto.createHmac('sha256', secret()).update('up|' + key + '|' + e, 'utf8').digest('hex'),
    'X-Exp': e
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getTag(key) {
  const r = await fetch(R2 + '/' + key + dlQ(key), { cache: 'no-store' });
  if (r.status === 404) return { status: 404, data: null, etag: '' };
  if (!r.ok) return { status: r.status, data: null, etag: '' };
  const etag = r.headers.get('x-etag') || '';
  let data = null;
  try { data = await r.json(); } catch (e) { return { status: -1, data: null, etag: etag }; }
  return { status: 200, data: data, etag: etag };
}
async function putTag(key, obj, etag) {
  const h = upH(key);
  if (etag) h['X-If-Match'] = etag;
  else h['X-If-None-Match'] = '*';
  const r = await fetch(R2 + '/' + encodeURIComponent(key), { method: 'PUT', headers: h, body: JSON.stringify(obj) });
  return { status: r.status, etag: r.headers.get('x-etag') || '' };
}
/* casJson(key, build, {tries}) → { ok, body, tries, skipped } эсвэл алдаа шиднэ */
async function casJson(key, build, opts) {
  if (!secret()) throw new Error('SIGN_SECRET алга');
  const tries = (opts && opts.tries) || 10;
  let why = '', net = 0;
  for (let a = 0; a < tries; a++) {
    const g = await getTag(key);
    if (g.status !== 200 && g.status !== 404) {
      why = 'уншилт ' + g.status;
      if ((g.status === 429 || g.status >= 500 || g.status === -1) && ++net < 4) { await sleep(400 * net); continue; }
      break;
    }
    const body = await build(g.status === 404 ? null : g.data, a);
    if (body === null || body === undefined) return { ok: true, skipped: true, body: g.data };
    const p = await putTag(key, body, g.etag);
    if (p.status === 200) return { ok: true, body: body, tries: a + 1 };
    if (p.status === 412 || p.status === 428) {
      why = 'зэрэг бичилт';
      await sleep(Math.min(3000, 100 * Math.pow(1.7, a)) * (0.5 + Math.random()));
      continue;
    }
    why = 'бичилт ' + p.status;
    if ((p.status === 429 || p.status >= 500) && ++net < 4) { await sleep(600 * net); continue; }
    break;
  }
  throw new Error('R2 ' + key + ': ' + why);
}

module.exports = { casJson, getTag, putTag, R2 };
