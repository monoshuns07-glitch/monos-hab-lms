/* ============================================================================
   /api/exam-sync  —  ШАЛГАЛТЫН ДҮНГ FIRESTORE-ООС R2 РУУ ТОЛЬДОХ
   ----------------------------------------------------------------------------
   ⚠⚠ ЯАГААД ХЭРЭГТЭЙ ВЭ (2026-08-31):
   Ажилтны шалгалтын дүн «гарч ирээд алга болдог» асуудлыг олон удаа зассан
   ч эргэж ирсэн. Жинхэнэ шалтгаан нь дэлгэц зурах бүрд habea-shalgalt
   төслийн Firestore руу хүсэлт явуулдаг байсан явдал. Ажилтан олон,
   дэлгэц байнга дахин зурагддаг тул үнэгүй квот дүүрч, сервер HTTP 429
   буцаадаг → дүн хоосон харагддаг.

   Шийдэл: эрсдэл, даалгавартай яг адил — дүнг R2 тольд хадгална.
     exams/<sha256(и-мэйл)-ийн эхний 24 тэмдэгт>.json
   Ажилтан R2-оос уншина (квотгүй, хурдан). Firestore руу ажилтны хөтөч
   ОГТ ХАНДАХГҮЙ — зөвхөн ЭНЭ сервер, өдөрт хэдхэн удаа хандана.

   ⚠ Файлын нэр нь и-мэйлийн хэшээс болсон тул жагсаах боломжгүй.

   Дуудах:
     · cron / админ    → бүгдийг тольдоно
     · ажилтны idToken → ЗӨВХӨН өөрийнхийг (шалгалт өгмөгц)
   ========================================================================== */
const crypto = require('crypto');

const R2 = 'https://monos-upload.buynt666.workers.dev';
const EX_PROJ = 'habea-shalgalt';
const EX_KEY = process.env.HABEA_EXAM_KEY || 'AIzaSyBRaHjzrEedBZc1Z5zNnJuJvLboKwKed2E';
const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';
const ADMIN_EMAIL = 'buynt666@gmail.com';
const FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + EX_PROJ + '/databases/(default)/documents';

function emailKey(em) {
  return 'exams/' + crypto.createHash('sha256')
    .update(String(em || '').toLowerCase().trim(), 'utf8').digest('hex').slice(0, 24) + '.json';
}

function val(f) {
  if (!f) return undefined;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return Number(f.doubleValue);
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.timestampValue !== undefined) return f.timestampValue;
  if (f.arrayValue !== undefined) return f.arrayValue.values || [];
  if (f.mapValue !== undefined) return f.mapValue.fields || {};
  return undefined;
}

function rowFrom(doc) {
  const f = doc.fields || {};
  const bd = (val(f.breakdown) || []).map(function (v) {
    return (v && v.mapValue && v.mapValue.fields) || {};
  });
  let qOk = 0;
  bd.forEach(function (b) {
    const pts = Number(val(b.pts) || 0), earned = Number(val(b.earned) || 0);
    if (pts > 0 && earned >= pts) qOk++;
  });
  let ts = 0;
  try { ts = Math.floor(new Date(String(val(f.timestamp) || 0)).getTime() / 1000) || 0; } catch (e) {}
  /* ⚠ Баримт (ирц, дэвтэр, шалгалтын хуудас) үүсгэхэд шаардагдах БҮХ
     талбарыг тольд авчирна. Зурсан гарын үсгийн ЗУРГИЙГ авчрахгүй
     (50 KB × 200 = хэт том) — зөвхөн зурсан эсэх, хэзээ зурсныг авна. */
  const ansRaw = val(f.answers) || {};
  const ans = {};
  Object.keys(ansRaw).forEach(function (k) {
    const v = ansRaw[k];
    ans[k] = (v && typeof v === 'object' && !Array.isArray(v))
      ? Object.keys(v).reduce(function (o2, kk) { o2[kk] = String(v[kk]); return o2; }, {})
      : (Array.isArray(v) ? v.map(String) : String(v == null ? '' : v));
  });
  return {
    email: String(val(f.email) || '').toLowerCase().trim(),
    eid: val(f.eid) || '',
    name: val(f.name) || '',
    dept: val(f.department) || '',
    pos: val(f.position) || '',
    key: val(f.examKey) || '',
    title: val(f.examTitle) || 'ХАБЭА шалгалт',
    type: val(f.examType) || '',
    percent: Number(val(f.percent) || 0),
    passed: val(f.passed) === true,
    qs: bd.length,
    qOk: qOk,
    ts: ts,
    /* Гарын үсгийн баталгаа */
    code: val(f.signCode) || '',
    otpAt: String(val(f.otpVerifiedAt) || ''),
    signedAt: String(val(f.signedAt) || ''),
    hasSign: !!f.signature,
    /* Асуулт тус бүрийн оноо ба хариулт */
    bd: bd.map(function (b) {
      return { id: String(val(b.id) || ''), pts: Number(val(b.pts) || 0), earned: Number(val(b.earned) || 0) };
    }),
    ans: ans
  };
}

/* ⚠ Firestore REST нь pageSize-аас БАГА буцааж болно — nextPageToken
   дуустал заавал дагана, эс бөгөөс бичлэг дутуу тольдогдоно. */
async function readAll() {
  const out = [];
  let tok = '';
  for (let guard = 0; guard < 40; guard++) {
    const u = FS_BASE + '/habea_exam_results?key=' + EX_KEY + '&pageSize=300' +
      (tok ? '&pageToken=' + tok : '');
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw new Error('Firestore HTTP ' + r.status);
    const j = await r.json();
    (j.documents || []).forEach(function (d) { out.push(rowFrom(d)); });
    tok = j.nextPageToken || '';
    if (!tok) break;
  }
  return out;
}

async function readOne(email) {
  const r = await fetch(FS_BASE + ':runQuery?key=' + EX_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'habea_exam_results' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'email' }, op: 'EQUAL',
            value: { stringValue: email }
          }
        }
      }
    })
  });
  if (!r.ok) throw new Error('Firestore HTTP ' + r.status);
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error('хүлээгээгүй хариу');
  return j.filter(function (x) { return x && x.document; })
          .map(function (x) { return rowFrom(x.document); });
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
  return r.ok;
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
    req.on('data', function (c) { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}

async function writeFor(email, rows) {
  rows.sort(function (a, b) { return b.ts - a.ts; });
  return await putJson(emailKey(email), {
    updatedAt: new Date().toISOString(),
    list: rows
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const body = req.method === 'POST' ? await readBody(req) : {};
  const cs = process.env.CRON_SECRET || '';
  const isCron = !!cs && String(req.headers.authorization || '') === 'Bearer ' + cs;

  let one = '';
  if (!isCron) {
    const u = await verifyIdToken(body.idToken);
    if (!u) return res.status(401).json({ ok: false, error: 'Эрх хүрэхгүй' });
    const admin = u.email === ADMIN_EMAIL;
    one = (admin && body.all) ? '' : u.email;
    if (!admin && !one) return res.status(400).json({ ok: false, error: 'и-мэйл алга' });
  }

  try {
    if (one) {
      const rows = await readOne(one);
      const ok = await writeFor(one, rows);
      return res.status(200).json({ ok: ok, one: true, rows: rows.length });
    }
    const all = await readAll();
    const by = {};
    all.forEach(function (r) { if (r.email) (by[r.email] = by[r.email] || []).push(r); });
    const emails = Object.keys(by);
    let wrote = 0, failed = 0;
    for (const em of emails) {
      try { if (await writeFor(em, by[em])) wrote++; else failed++; }
      catch (e) { failed++; }
    }
    /* Админы тайлан, KPI-ийн нэгтгэлд хэрэгтэй БҮХ бичлэгийн толь.
       Өмнө нь ажилтан бүр апп нээх бүрдээ ЭНЭ бүх бичлэгийг Firestore-оос
       татдаг байсан нь квот дүүргэдэг гол шалтгаан байв. */
    /* Асуултын сан — шалгалтын хуудсыг зурахад хэрэгтэй */
    try {
      const qr = await fetch(FS_BASE + '/habea_config/questions?key=' + EX_KEY, { cache: 'no-store' });
      if (qr.ok) {
        const qj = await qr.json();
        const arr = (((qj.fields || {}).list || {}).arrayValue || {}).values || [];
        const qs = arr.map(function (x) {
          const g = (x.mapValue || {}).fields || {};
          const o = {};
          Object.keys(g).forEach(function (k) { o[k] = val(g[k]); });
          if (o.options) {
            o.options = (o.options || []).map(function (v) {
              const gf = (v && v.mapValue && v.mapValue.fields) || {};
              return { id: val(gf.id), text: val(gf.text) };
            });
          }
          return o;
        });
        await putJson('exams/_questions.json', { updatedAt: new Date().toISOString(), list: qs });
      }
    } catch (e) { /* асуултгүй ч дүн тольдогдоно */ }

    let allOk = false;
    try {
      allOk = await putJson('exams/_all.json', {
        updatedAt: new Date().toISOString(), total: all.length, list: all
      });
    } catch (e) { allOk = false; }

    return res.status(200).json({
      ok: failed === 0 && allOk, total: all.length, people: emails.length,
      wrote: wrote, failed: failed, all: allOk
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) });
  }
};

module.exports._internal = { emailKey, rowFrom };
