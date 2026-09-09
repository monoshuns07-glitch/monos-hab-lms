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

/* ⚠ 2026-09-09 (аюулгүй байдлын олдвор №2): R2-ийн уншилт хамгаалалттай
   болсон тул серверийн уншилт ч ГАРЫН ҮСЭГТЭЙ явна. Worker-ийн шалгадагтай
   ижил: HMAC-SHA256 `dl|<түлхүүр>|<хугацаа>`.
   ⚠ Кэш таслагч `cb=` — `t` БИШ (тэр нь гарын үсэг).
   ⚠ SIGN_SECRET байхгүй бол гарын үсэггүй явна (fail-open). */
function r2GetQ(key) {
  var q = '?cb=' + Date.now();
  try {
    var s = process.env.SIGN_SECRET || '';
    if (s) {
      var e = String(Date.now() + 10 * 60 * 1000);
      q += '&t=' + require('crypto').createHmac('sha256', s)
             .update('dl|' + key + '|' + e, 'utf8').digest('hex') + '&e=' + e;
    }
  } catch (err) {}
  return q;
}

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

/* Firestore-ийн утгыг БҮРЭН задлана (mapValue, arrayValue дотор нь ч) */
function deep(f) {
  if (f === null || f === undefined) return '';
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return Number(f.doubleValue);
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.timestampValue !== undefined) return f.timestampValue;
  if (f.nullValue !== undefined) return '';
  if (f.arrayValue !== undefined) return (f.arrayValue.values || []).map(deep);
  if (f.mapValue !== undefined) {
    const g = f.mapValue.fields || {};
    const o = {};
    Object.keys(g).forEach(function (k) { o[k] = deep(g[k]); });
    return o;
  }
  return '';
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
  /* ⚠ val() нь mapValue-г ЗАДЛАХГҮЙ, дотоод боодлыг нь хэвээр буцаадаг.
     Тиймээс хариултыг ГҮНЗГИЙ задлахгүй бол баримт дээр «[object Object]»
     гэж гарна (2026-08-31-нд бодит шалгалтаар илэрсэн). */
  const ansRaw = (f.answers && f.answers.mapValue && f.answers.mapValue.fields) || {};
  const ans = {};
  Object.keys(ansRaw).forEach(function (k) { ans[k] = deep(ansRaw[k]); });
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

/* ⚠ 2026-09-09 — НЭГТГЭНЭ, ДАРЖ БИЧИХГҮЙ. Серверт (/api/exam-save) шууд
   хадгалагдсан мөрүүд Firestore-д БАЙХГҮЙ тул хуучин «дарж бичих» нь тэднийг
   устгах байв. Ижил мөр: id таарсан, эсвэл email+key+type+ts (2 мин). */
function sameRow(x, r) {
  if (!x || !r) return false;
  if (x.id && r.id && x.id === r.id) return true;
  return x.email === r.email && x.key === r.key && x.type === r.type &&
    Math.abs(Number(x.ts || 0) - Number(r.ts || 0)) < 120;
}
function mergeRows(existing, incoming) {
  const out = (existing || []).slice();
  let added = 0;
  (incoming || []).forEach(function (r) {
    if (!out.some(function (x) { return sameRow(x, r); })) { out.push(r); added++; }
  });
  out.sort(function (a, b) { return Number(b.ts || 0) - Number(a.ts || 0); });
  return { list: out, added: added };
}
async function readList(key) {
  try {
    const r = await fetch(R2 + '/' + key + r2GetQ(key), { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j && j.list) ? j.list : [];
  } catch (e) { return []; }
}
async function writeFor(email, rows) {
  const cur = await readList(emailKey(email));
  const m = mergeRows(cur, rows);
  if (!m.added) return true;                      /* шинэ зүйл алга — бичихгүй */
  return await putJson(emailKey(email), { updatedAt: new Date().toISOString(), list: m.list });
}

/* ── ӨМНӨХ АЖИЛТНУУДЫГ САНАХ ───────────────────────
   ⚠ ЯАГААД (2026-09-02): тольдох нь ЗӨВХӨН бичлэгтэй хүнд файл
   бичдэг байв. Ажилтны бүх шалгалтыг устгавал түүний хуучин толь
   ХӨДӨЛГӨӨГүй үлдэж, «Миний гүйцэтгэл» дээр УСТГАГДСАН дүн хэвээр
   харагдасаар байв — АЛИВАА устгалт дараа нь харагдахгүй болно.
   Шийдэл: хэнд бичснээ тэмдэглэж явна. Дараагийн удаа жагсаалтаас
   алга болсон хүн бүрийг ХООСОН жагсаалтаар дарна. */
const IDX_KEY = 'exams/_index.json';

async function idxRead() {
  try {
    const r = await fetch(R2 + '/' + IDX_KEY + r2GetQ(IDX_KEY), { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j && j.emails) ? j.emails : [];
  } catch (e) { return []; }
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

    /* ⚠ 2026-09-09: ХООСЛОХГҮЙ. Firestore-д байхгүй хүн = серверт шууд
       хадгалсан хүн байж болно. Индексийг зөвхөн НЭМЖ шинэчилнэ. */
    let blanked = 0;
    try {
      const prev = await idxRead();
      const set = {};
      prev.concat(emails).forEach(function (e) { if (e) set[e] = 1; });
      await putJson(IDX_KEY, { updatedAt: new Date().toISOString(), emails: Object.keys(set) });
    } catch (e) { /* тольдолт бүхэлдээ зогсохгүй */ }
    /* ⚠ Асуултын толь (exams/_questions.json)-ийг ЭНД БИЧИХГҮЙ — тэр нь
       зөв хариулттай хуучин баримтаас ирж, /api/exam-config-ийн бичсэн
       (зөв хариултгүй) хувилбарыг дарж бичих байв. */

    let allOk = false;
    try {
      const cur = await readList('exams/_all.json');
      const m = mergeRows(cur, all);
      allOk = m.added ? await putJson('exams/_all.json', {
        updatedAt: new Date().toISOString(), total: m.list.length, list: m.list
      }) : true;
    } catch (e) { allOk = false; }

    return res.status(200).json({
      ok: failed === 0 && allOk, total: all.length, people: emails.length,
      wrote: wrote, failed: failed, blanked: blanked, all: allOk
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) });
  }
};

module.exports._internal = { emailKey, rowFrom };
