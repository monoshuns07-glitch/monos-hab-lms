/* ============================================================================
   /api/exam-save  —  ШАЛГАЛТЫН ДҮНГ ШУУД R2 РУУ (FIRESTORE ОГТ ОРОЛЦОХГҮЙ)
   ----------------------------------------------------------------------------
   ⚠⚠ ЯАГААД (2026-08-31):
   Шалгалтын дүн Firestore дээр байсан тул ажилтан бүр апп нээх бүрдээ
   тэндээс уншиж, өдрийн үнэгүй квот (50,000 уншилт) дүүрч, сервер
   HTTP 429 буцааж, дүн ХООСОН харагддаг байв. Тэр асуудлыг олон удаа
   «зассан» ч квот дээр суурилсан хэвээр байсан тул эргэж ирсээр байсан.

   Одоо квотоос бүрэн салав: дүн нь ҮҮСМЭГЦ R2-д бичигдэнэ.
     exams/<sha256(и-мэйл)-ийн 24 тэмдэгт>.json   — ажилтны өөрийн дүн
     exams/_all.json                              — тайланд зориулсан бүгд

   R2 нь объект хадгалалт — уншилтын квот ГЭЖ БАЙХГҮЙ. Хэдэн ч ажилтан,
   хэдэн ч удаа уншсан хамаагүй.

   ⚠ ЭНЭ ФАЙЛД FIRESTORE-ЫГ ДАХИН БҮҮ НЭМ.
   ========================================================================== */
const crypto = require('crypto');

const R2 = 'https://monos-upload.buynt666.workers.dev';
const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';
const ALL_KEY = 'exams/_all.json';

function emailKey(em) {
  return 'exams/' + crypto.createHash('sha256')
    .update(String(em || '').toLowerCase().trim(), 'utf8').digest('hex').slice(0, 24) + '.json';
}

async function getJson(key) {
  try {
    const r = await fetch(R2 + '/' + key + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function putJson(key, obj) {
  const secret = process.env.SIGN_SECRET || '';
  if (!secret) throw new Error('SIGN_SECRET тохируулаагүй');
  const exp = String(Date.now() + 10 * 60 * 1000);
  const r = await fetch(R2 + '/' + key, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Up': crypto.createHmac('sha256', secret).update('up|' + key + '|' + exp, 'utf8').digest('hex'),
      'X-Exp': exp
    },
    body: JSON.stringify(obj)
  });
  if (!r.ok) throw new Error('R2 PUT ' + r.status);
  return true;
}

async function verifyIdToken(idToken) {
  if (!idToken || String(idToken).length < 40) return null;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: idToken })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId || u.disabled === true) return null;
    return { uid: u.localId, email: String(u.email || '').toLowerCase() };
  } catch (e) { return null; }
}

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', function (c) { raw += c; if (raw.length > 4e6) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST л хүлээн авна' });

  const body = await readBody(req);
  const u = await verifyIdToken(body.idToken);
  if (!u) return res.status(401).json({ ok: false, error: 'Нэвтрээгүй байна' });

  /* ⚠ И-МЭЙЛИЙГ КЛИЕНТЭЭС АВАХГҮЙ — нэвтэрсэн хэрэглэгчийнхийг л
     ашиглана. Эс бөгөөс хэн нэгэн өөр хүний нэрээр дүн бичиж чадна. */
  const email = u.email;
  if (!email) return res.status(400).json({ ok: false, error: 'И-мэйл тодорхойгүй' });

  const r = body.result || {};
  const bd = Array.isArray(r.breakdown) ? r.breakdown : [];
  let qOk = 0;
  bd.forEach(function (b) {
    const pts = num(b && b.pts), earned = num(b && b.earned);
    if (pts > 0 && earned >= pts) qOk++;
  });

  const row = {
    email: email,
    key: String(r.examKey || ''),
    title: String(r.examTitle || 'ХАБЭА шалгалт'),
    type: String(r.examType || ''),
    percent: num(r.percent),
    passed: r.passed === true,
    qs: bd.length,
    qOk: qOk,
    ts: Math.floor(Date.now() / 1000)
  };
  if (!row.key && !row.type) {
    return res.status(400).json({ ok: false, error: 'Шалгалтын мэдээлэл дутуу' });
  }

  /* ── ① Ажилтны өөрийн файл ── */
  let mine = 0;
  try {
    const key = emailKey(email);
    const cur = await getJson(key);
    const list = (cur && Array.isArray(cur.list)) ? cur.list : [];
    /* Давхардлаас сэргийлнэ: ижил шалгалт, ижил төрөл, 2 минутын дотор */
    const dup = list.some(function (x) {
      return x && x.key === row.key && x.type === row.type && Math.abs(num(x.ts) - row.ts) < 120;
    });
    if (!dup) list.push(row);
    list.sort(function (a, b) { return num(b.ts) - num(a.ts); });
    await putJson(key, { updatedAt: new Date().toISOString(), list: list });
    mine = list.length;
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Хадгалж чадсангүй: ' + String(e.message || e).slice(0, 120) });
  }

  /* ── ② Тайлангийн нэгдсэн файл (алдвал ажилтны дүн хэвээр хадгалагдана) ── */
  let allN = 0;
  try {
    const cur = await getJson(ALL_KEY);
    const list = (cur && Array.isArray(cur.list)) ? cur.list : [];
    const dup = list.some(function (x) {
      return x && x.email === row.email && x.key === row.key && x.type === row.type &&
        Math.abs(num(x.ts) - row.ts) < 120;
    });
    if (!dup) list.push(row);
    await putJson(ALL_KEY, { updatedAt: new Date().toISOString(), total: list.length, list: list });
    allN = list.length;
  } catch (e) { allN = -1; }

  return res.status(200).json({ ok: true, mine: mine, all: allN });
};

module.exports._internal = { emailKey };
