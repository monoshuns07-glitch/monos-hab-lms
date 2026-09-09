/* ============================================================================
   /api/exam-save  —  ШАЛГАЛТЫН ДҮН: СЕРВЕР ТООЦНО, R2-Д ХАДГАЛНА
   ----------------------------------------------------------------------------
   ⚠⚠ 2026-09-09 — БҮРЭН ДАХИН БИЧИВ (аюулгүй байдлын олдвор №3, №4, №7).
   Өмнөх байдал (аудитаар илэрсэн): шалгалтын хуудас Firebase-д НЭВТЭРДЭГГҮЙ
   байсан тул энэ функц ХЭЗЭЭ Ч дуудагддаггүй (230 дүнгийн НЭГ нь ч серверийн
   тооцоогүй). Дүн нь ил Firestore (habea-shalgalt)-д бичигдэж, тэндээс R2 руу
   тольдогддог байв — хэн ч хуурамч дүн бичих боломжтой, квот дүүрвэл зогсдог.

   Одоо:
   ① ХЭН БЭ — гурван замын аль нэгээр НОТЛОГДСОН и-мэйл л дүнгийн эзэн болно:
        · idToken (апп дотроос)
        · otpId — серверт баталгаажсан нэг удаагийн код (⚠ ЗӨВХӨН хаалттай
          үндсэн төслийн бүртгэл, `where:'main'`; хуучин ил төслийн бүртгэлд
          ИТГЭХГҮЙ — хэн ч «verified» баримт суулгаж болно)
        · vt/vexp/vem — аппын олгосон эрхийн гарын үсэг (otp|email|exp),
          олгосноос хойш 6 цаг хүртэл (шалгалт 15 минутаас урт үргэлжилдэг)
      Нотолгоогүй бол ХАДГАЛАХГҮЙ (403). Клиентийн бичсэн и-мэйлд итгэхгүй.
   ② ОНОО — сервер R2 дахь тохиргооноос (exams/config/*.json, зөв хариулттай)
      тооцно. Хөтөч зөв хариултыг ОГТ авдаггүй (/api/exam-config хасдаг).
   ③ ХАДГАЛАЛТ — R2: exams/<sha256(и-мэйл)[:24]>.json (ажилтных),
      exams/_all.json (тайлан), exams/_index.json, exams/sig/<id>.json (гарын
      үсгийн зураг — тусдаа, том учраас), exams/sigreg/<хэш>.json (бүртгэсэн
      гарын үсэг, дахин ашиглах).
   ⚠ Firestore ЭНД ОГТ ОРОЛЦОХГҮЙ — квотоос бүрэн салсан. Бүү нэм.
   ⚠ exams/_all.json-ийн мөрийн бүтэц нь аппын (readHabeaExamsByEmail,
      сургалтын биелэлт, баримт хэвлэх) уншдагтай НИЙЦТЭЙ байх ёстой:
      email, eid, name, dept, pos, key, title, type, percent, passed, qs, qOk,
      ts, code, otpAt, signedAt, hasSign, bd, ans (+ шинэ талбарууд).
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const OTPSTORE = require('./_otpstore.js');

const R2 = 'https://monos-upload.buynt666.workers.dev';
const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';
const MAIN_FS = 'https://firestore.googleapis.com/v1/projects/monos-hab-system/databases/(default)/documents';
const ALL_KEY = 'exams/_all.json';
const IDX_KEY = 'exams/_index.json';
const ERR_KEY = 'sys/errors.json';
const GRANT_TTL = 15 * 60 * 1000;          /* file-token kind:'otp' — 15 мин */
const GRANT_MAX_AGE = 6 * 60 * 60 * 1000;  /* эрх олгосноос хойш 6 цаг хүчинтэй (энд) */
const SIG_MAX = 700 * 1024;

/* ── R2 ─────────────────────────────────────────────────────────────────── */
function r2GetQ(key) {
  var q = '?cb=' + Date.now();
  try { var s = process.env.SIGN_SECRET || '';
    if (s) { var e = String(Date.now() + 10 * 60 * 1000);
      q += '&t=' + crypto.createHmac('sha256', s).update('dl|' + key + '|' + e, 'utf8').digest('hex') + '&e=' + e; }
  } catch (err) {}
  return q;
}
async function getJson(key) {
  const r = await fetch(R2 + '/' + key + r2GetQ(key), { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('R2 ' + r.status);
  return await r.json();
}
async function putJson(key, obj) {
  const secret = process.env.SIGN_SECRET || '';
  if (!secret) throw new Error('SIGN_SECRET алга');
  const exp = String(Date.now() + 5 * 60 * 1000);
  const r = await fetch(R2 + '/' + key, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json',
      'X-Up': crypto.createHmac('sha256', secret).update('up|' + key + '|' + exp, 'utf8').digest('hex'),
      'X-Exp': exp },
    body: JSON.stringify(obj)
  });
  if (!r.ok) throw new Error('R2 PUT ' + r.status);
  return true;
}
function emailKey(em) {
  return 'exams/' + crypto.createHash('sha256').update(String(em || '').toLowerCase().trim(), 'utf8').digest('hex').slice(0, 24) + '.json';
}
function sigRegKey(em) { return 'exams/sigreg/' + crypto.createHash('sha256').update(String(em || '').toLowerCase().trim(), 'utf8').digest('hex').slice(0, 24) + '.json'; }

/* ── Нэвтрэлт ──────────────────────────────────────────────────────────── */
async function verifyIdToken(idToken) {
  if (!idToken || String(idToken).length < 40) return null;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: idToken }) });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId || u.disabled === true) return null;
    return { uid: u.localId, email: String(u.email || '').toLowerCase() };
  } catch (e) { return null; }
}
async function isAdmin(idToken, u) {
  try {
    const r = await fetch(MAIN_FS + '/users/' + encodeURIComponent(u.uid) + '?mask.fieldPaths=role',
      { headers: { Authorization: 'Bearer ' + idToken }, cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && j.fields && j.fields.role && j.fields.role.stringValue === 'admin');
  } catch (e) { return false; }
}
function grantOk(email, token, exp) {
  try {
    const secret = process.env.SIGN_SECRET || '';
    if (!secret || !token || !exp) return false;
    const issued = Number(exp) - GRANT_TTL;
    if (!(issued > 0) || Date.now() - issued > GRANT_MAX_AGE || issued > Date.now() + 60000) return false;
    const want = crypto.createHmac('sha256', secret).update('otp|' + email + '|' + String(exp), 'utf8').digest('hex');
    const a = Buffer.from(String(token)), b = Buffer.from(want);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}
/* ХЭН БЭ — нотлогдсон и-мэйл. Байхгүй бол null. */
async function resolveIdentity(body) {
  const u = await verifyIdToken(body.idToken);
  if (u && u.email) return { email: u.email, how: 'token' };
  const otpId = String(body.otpId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (otpId) {
    try {
      const got = await OTPSTORE.otpGet(otpId);
      const d = got && got.found ? got.data : null;
      /* ⚠ ЗӨВХӨН хаалттай үндсэн төслийн бүртгэл */
      if (d && got.where === 'main' && d.verified === true && d.email) {
        return { email: String(d.email).toLowerCase().trim(), how: 'otp', otpAt: String(d.verifiedAt || ''), code: String(d.code || '') };
      }
    } catch (e) {}
  }
  const vem = String(body.vem || '').toLowerCase().trim();
  if (vem && grantOk(vem, body.vt, body.vexp)) return { email: vem, how: 'grant' };
  return null;
}

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', function (c) { raw += c; if (raw.length > 2e6) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}
function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function str(v, n) { return String(v === undefined || v === null ? '' : v).slice(0, n || 200); }

/* ── ОНОО — habea-exam.html-ийн хуучин grade()-ийн ЯГ хуулбар ──────────── */
const TMAP = { matching: 'match', 'three-words': 'words3', 'three-mistakes': 'mistakes3' };
function normQ(q) { return Object.assign({}, q, { type: TMAP[q.type] || q.type }); }
function pts(q) { return q.pts || q.points || 0; }
function grade(q, a) {
  /* ⚠ habea-exam.html-ийн хуучин grade()-ийн ЯГ хуулбар (2026-09-09-ний
     хувилбар). Клиент одоо оноо тооцдоггүй тул ЭНЭ л жинхэнэ дүн. */
  const p = pts(q); if (a === null || a === undefined) return 0;
  if (q.type === 'single') return a === (q.ans || q.correct) ? p : 0;
  if (q.type === 'multi') {
    if (!Array.isArray(a)) return 0;
    const C = new Set(q.ans || q.correct || []), G = new Set(a); let h = 0, w = 0;
    C.forEach(function (c) { if (G.has(c)) h++; }); G.forEach(function (g) { if (!C.has(g)) w++; });
    return Math.max(0, Math.round(((h - w) / C.size) * p));
  }
  if (q.type === 'match') {
    if (!a || typeof a !== 'object') return 0;
    const cor = q.ans || q.correct || {}; const k = Object.keys(cor);
    const ok = k.filter(function (kk) { return a[kk] === cor[kk]; }).length;
    return k.length ? Math.round((ok / k.length) * p) : 0;
  }
  if (q.type === 'open') {
    const t = String(a || '').toLowerCase().trim(); if (t.length < 8) return 0;
    const kws = q.kw || q.keywords || []; const m = kws.filter(function (kw) { return t.includes(kw); }).length;
    return Math.round(Math.min(1, m / 2) * p);
  }
  if (q.type === 'words3') {
    if (!Array.isArray(a)) return 0;
    const kws = q.kw || q.keywords || []; let c = 0;
    kws.forEach(function (g, i) {
      const w = String(a[i] || '').toLowerCase().trim();
      const arr = Array.isArray(g) ? g : String(g || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (w && arr.some(function (kw) { return w.includes(kw); })) c++;
    });
    return kws.length ? Math.round((c / kws.length) * p) : 0;
  }
  if (q.type === 'mistakes3') {
    if (!Array.isArray(a)) return 0;
    const f = a.filter(function (x) { return String(x || '').trim().length >= 5; }).length;
    return Math.round((f / 3) * p);
  }
  return 0;
}
function scoreOf(qs, answers) {
  const bd = qs.map(function (q) { return { id: q.id, pts: pts(q), earned: grade(q, answers ? answers[q.id] : undefined) }; });
  const tot = bd.reduce(function (s, b) { return s + b.earned; }, 0);
  const max = qs.reduce(function (s, q) { return s + pts(q); }, 0);
  const pct = max ? Math.round((tot / max) * 100) : 0;
  let qOk = 0; bd.forEach(function (b) { if (b.pts > 0 && b.earned >= b.pts) qOk++; });
  return { pct: pct, tot: tot, max: max, bd: bd, qOk: qOk };
}
function safeKey(k) { const s = String(k || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40); return s || 'default'; }
async function loadExam(examKey) {
  let cfg = null;
  if (safeKey(examKey) !== 'default') cfg = await getJson('exams/config/' + safeKey(examKey) + '.json');
  if (!cfg) cfg = await getJson('exams/config/default.json');
  if (!cfg || !Array.isArray(cfg.questions) || !cfg.questions.length) return null;
  const s = cfg.settings || {};
  return { qs: cfg.questions.map(normQ), passPercent: Number(s.passPercent) || 60, timeLimitMin: Number(s.timeLimitMin) || 0, title: String(s.examTitle || '') };
}

/* Нэг төхөөрөмжөөс 24 цагийн дотор өөр хүний нэрээр өгсөн шалгалтууд */
function devSharedOf(list, row) {
  if (!row.dev) return [];
  const since = row.ts - 24 * 3600, seen = {};
  list.forEach(function (x) {
    if (!x || x.dev !== row.dev || num(x.ts) < since) return;
    const em = String(x.email || '').toLowerCase();
    if (em && em !== row.email) seen[em] = 1;
  });
  return Object.keys(seen);
}
function compactGeo(g) {
  if (!g || typeof g !== 'object') return { status: 'none' };
  const o = { status: str(g.status, 20) };
  if (g.lat !== undefined && g.lng !== undefined) { o.lat = Math.round(num(g.lat) * 1e5) / 1e5; o.lng = Math.round(num(g.lng) * 1e5) / 1e5; }
  if (g.acc !== undefined) o.acc = Math.round(num(g.acc));
  return o;
}
async function logErr(kind, msg, where, email) {
  try {
    const cur = await getJson(ERR_KEY);
    const rows = (cur && Array.isArray(cur.rows)) ? cur.rows : [];
    const at = new Date().toISOString();
    rows.push({ at: at, k: kind, m: String(msg).slice(0, 300), w: where, e: String(email || '').slice(0, 80), v: 'srv' });
    while (rows.length > 400) rows.shift();
    await putJson(ERR_KEY, { updatedAt: at, rows: rows });
  } catch (e) {}
}
function newId(ts) { return 'x' + ts.toString(36) + crypto.randomBytes(4).toString('hex'); }
function sameRow(x, row) {
  if (!x) return false;
  if (row.id && x.id === row.id) return true;
  return x.email === row.email && x.key === row.key && x.type === row.type && Math.abs(num(x.ts) - row.ts) < 120;
}
function validSig(s) { return typeof s === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,/.test(s) && s.length <= SIG_MAX; }

/* ══════════════════════════════════════════════════════════════════════ */
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST л хүлээн авна' });
  const body = await readBody(req);
  const action = String(body.action || 'save');

  /* ── АДМИН: дүн устгах ── */
  if (action === 'delete') {
    const u = await verifyIdToken(body.idToken);
    if (!u) return res.status(401).json({ ok: false, error: 'Нэвтрээгүй байна' });
    if (!(await isAdmin(body.idToken, u))) return res.status(403).json({ ok: false, error: 'Зөвхөн админ' });
    const id = str(body.id, 60), em = String(body.email || '').toLowerCase().trim(), ts = num(body.ts);
    if (!id && !(em && ts)) return res.status(400).json({ ok: false, error: 'id эсвэл email+ts хэрэгтэй' });
    const hit = function (x) { return x && ((id && x.id === id) || (!id && x.email === em && num(x.ts) === ts)); };
    let removed = 0, victimEmail = em;
    try {
      const all = await getJson(ALL_KEY);
      const list = (all && Array.isArray(all.list)) ? all.list : [];
      const keep = list.filter(function (x) { if (hit(x)) { removed++; victimEmail = victimEmail || x.email; return false; } return true; });
      if (removed) await putJson(ALL_KEY, { updatedAt: new Date().toISOString(), total: keep.length, list: keep });
    } catch (e) { return res.status(502).json({ ok: false, error: 'Тайлангийн файл: ' + str(e.message, 80) }); }
    if (victimEmail) {
      try {
        const k = emailKey(victimEmail), cur = await getJson(k);
        const l = (cur && Array.isArray(cur.list)) ? cur.list : [];
        const keep2 = l.filter(function (x) { return !hit(x); });
        if (keep2.length !== l.length) await putJson(k, { updatedAt: new Date().toISOString(), list: keep2 });
      } catch (e) {}
    }
    if (id) { try { await putJson('exams/sig/' + id + '.json', { deleted: true, at: new Date().toISOString(), by: u.email }); } catch (e) {} }
    await logErr('exam', 'Дүн устгав: ' + (id || (em + '@' + ts)) + ' — ' + u.email, 'exam-save/delete', victimEmail);
    return res.status(200).json({ ok: true, removed: removed });
  }

  /* ── Нотлогдсон и-мэйл (бусад бүх үйлдэлд) ── */
  const who = await resolveIdentity(body);
  if (!who) {
    return res.status(403).json({ ok: false, error: 'ident',
      msg: 'Таныг хэн болохыг баталгаажуулж чадсангүй. Аппаас (Миний шалгалт) дахин орж, кодоо баталгаажуулна уу.' });
  }

  /* ── Бүртгэсэн гарын үсэг ── */
  if (action === 'sig-get') {
    try {
      const s = await getJson(sigRegKey(who.email));
      return res.status(200).json({ ok: true, signature: (s && s.signature) || '', name: (s && s.name) || '', updatedAt: (s && s.updatedAt) || '' });
    } catch (e) { return res.status(200).json({ ok: true, signature: '' }); }
  }
  if (action === 'sig-put') {
    if (!validSig(body.signature)) return res.status(400).json({ ok: false, error: 'Гарын үсгийн зураг буруу/хэт том' });
    try {
      await putJson(sigRegKey(who.email), { email: who.email, name: str(body.name, 120), dept: str(body.dept, 120), pos: str(body.pos, 120),
        signature: body.signature, consent: true, consentText: str(body.consentText, 600), updatedAt: new Date().toISOString(), ident: who.how });
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(502).json({ ok: false, error: str(e.message, 80) }); }
  }
  if (action !== 'save') return res.status(400).json({ ok: false, error: 'Үйлдэл тодорхойгүй' });

  /* ── ДҮН ХАДГАЛАХ ── */
  const r = body.result || {};
  const key = String(r.examKey || '').trim().slice(0, 40);
  const type = str(r.examType, 12);
  if (!key && !type) return res.status(400).json({ ok: false, error: 'Шалгалтын мэдээлэл дутуу' });
  const answers = (r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers)) ? r.answers : null;
  if (!answers) return res.status(400).json({ ok: false, error: 'Хариулт алга' });

  let ex;
  try { ex = await loadExam(key); } catch (e) { ex = null; }
  if (!ex) return res.status(503).json({ ok: false, error: 'Шалгалтын тохиргоо уншигдсангүй — түр зуурын алдаа, дахин илгээнэ үү' });
  const sc = scoreOf(ex.qs, answers);
  const passed = sc.pct >= ex.passPercent;
  const ts = Math.floor(Date.now() / 1000);
  const claimed = String(r.email || '').toLowerCase().trim();
  const sig = validSig(r.signature) ? r.signature : '';

  const row = {
    id: newId(ts),
    email: who.email, eid: str(r.eid, 40),
    name: str(r.name, 120), dept: str(r.department || r.dept, 120), pos: str(r.position || r.pos, 120),
    key: key, title: str(r.examTitle || ex.title || 'ХАБЭА шалгалт', 160), type: type,
    percent: sc.pct, passed: passed, qs: ex.qs.length, qOk: sc.qOk, ts: ts, at: new Date().toISOString(),
    code: who.code || str(r.signCode, 12), otpAt: who.otpAt || str(r.otpVerifiedAt, 40),
    signedAt: sig ? new Date().toISOString() : '', hasSign: !!sig,
    bd: sc.bd, ans: answers,
    /* нөхцөл */
    dev: String(r.deviceId || r.dev || '').replace(/[^0-9a-f]/gi, '').slice(0, 32),
    geo: compactGeo(r.geo), dur: Math.max(0, Math.round(num(r.durationSec || r.dur))),
    tab: Math.max(0, Math.round(num(r.tabAway || r.tab))), tl: Math.max(0, Math.round(num(r.timeLimitMin || r.tl))),
    to: r.timedOut === true || r.to === true,
    skip: r.otpSkipped === true || r.skip === true, otpBy: str(r.otpBypassBy || r.otpBy, 80),
    otpChannel: str(r.otpChannel, 10), signMethod: str(r.signMethod, 12), sigSrc: str(r.signatureSource, 12),
    ua: str(r.device, 180), consent: true,
    ident: who.how, pctC: r.percent === undefined ? null : num(r.percent)
  };
  if (claimed && claimed !== who.email) row.emailClaimed = claimed;
  row.chk = (row.pctC === null) ? 'noclient' : (row.pctC === sc.pct ? 'ok' : 'mismatch');
  /* Өөрчлөгдөөгүйн нотолгоо — серверийн хэш (клиентийнхийг ч хадгална) */
  row.hash = crypto.createHash('sha256').update(JSON.stringify([row.email, row.key, row.type, row.percent, row.ts, answers]), 'utf8').digest('hex');
  if (r.recordHash) row.hashC = str(r.recordHash, 64);

  /* ② тайлангийн файл — төхөөрөмж давхцал */
  let allCur = null;
  try { allCur = await getJson(ALL_KEY); } catch (e) { allCur = null; }
  const allList = (allCur && Array.isArray(allCur.list)) ? allCur.list : [];
  const shared = devSharedOf(allList, row);
  if (shared.length) row.devShared = shared.slice(0, 10);

  /* ③ ажилтны өөрийн файл (ЭНЭ унавал бүхэлдээ унана) */
  let mine = 0;
  try {
    const k = emailKey(who.email), cur = await getJson(k);
    const list = (cur && Array.isArray(cur.list)) ? cur.list : [];
    if (!list.some(function (x) { return sameRow(x, row); })) list.push(row);
    list.sort(function (a, b) { return num(b.ts) - num(a.ts); });
    await putJson(k, { updatedAt: new Date().toISOString(), list: list });
    mine = list.length;
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Хадгалж чадсангүй: ' + str(e.message, 100) });
  }
  /* ④ тайлангийн нэгдсэн файл */
  let allN = -1;
  try {
    const cur = allCur || (await getJson(ALL_KEY));
    const list = (cur && Array.isArray(cur.list)) ? cur.list : [];
    if (!list.some(function (x) { return sameRow(x, row); })) list.push(row);
    await putJson(ALL_KEY, { updatedAt: new Date().toISOString(), total: list.length, list: list });
    allN = list.length;
  } catch (e) { allN = -1; }
  /* ⑤ индекс (хэнд файл бичсэн бэ) */
  try {
    const idx = await getJson(IDX_KEY);
    const emails = (idx && Array.isArray(idx.emails)) ? idx.emails : [];
    if (emails.indexOf(who.email) < 0) { emails.push(who.email); await putJson(IDX_KEY, { updatedAt: new Date().toISOString(), emails: emails }); }
  } catch (e) {}
  /* ⑥ гарын үсгийн зураг — тусдаа файл */
  let sigOk = false;
  if (sig) {
    try {
      await putJson('exams/sig/' + row.id + '.json', { id: row.id, email: who.email, name: row.name, dept: row.dept, pos: row.pos,
        signature: sig, signedAt: row.signedAt, consentText: str(r.consentText, 600), hash: row.hash, code: row.code });
      sigOk = true;
    } catch (e) { sigOk = false; }
  }
  /* ⑦ эрүүл мэндийн самбарт */
  if (row.chk === 'mismatch') await logErr('exam', 'Оноо зөрүү: хөтөч ' + row.pctC + '% / сервер ' + row.percent + '% (' + (row.key || row.type) + ')', 'exam-save', who.email);
  if (row.devShared) await logErr('exam', 'Нэг төхөөрөмжөөс 24 цагт ' + (row.devShared.length + 1) + ' хүн шалгалт өгөв (dev ' + row.dev.slice(0, 8) + ')', 'exam-save', who.email);
  if (allN < 0) await logErr('exam', 'Тайлангийн файл (_all) шинэчлэгдсэнгүй — ажилтны файл хадгалагдсан', 'exam-save', who.email);

  return res.status(200).json({ ok: true, id: row.id, percent: sc.pct, passed: passed, passPercent: ex.passPercent,
    qs: ex.qs.length, qOk: sc.qOk, tot: sc.tot, max: sc.max, bd: sc.bd, chk: row.chk, ident: who.how,
    email: who.email, code: row.code, hash: row.hash, sig: sigOk, mine: mine, all: allN, devShared: row.devShared || [] });
};

module.exports._internal = { emailKey, sigRegKey, normQ, pts, grade, scoreOf, devSharedOf, compactGeo, loadExam, grantOk, sameRow, validSig };
