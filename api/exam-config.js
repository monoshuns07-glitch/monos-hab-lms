/* ============================================================================
   /api/exam-config  —  ШАЛГАЛТЫН ТОХИРГОО, АСУУЛТ (FIRESTORE-ООС БҮРЭН САЛСАН)
   ----------------------------------------------------------------------------
   ⚠⚠ ЯАГААД (2026-09-09, аюулгүй байдлын олдвор №3, №4):
   Шалгалтын асуултууд ЗӨВ ХАРИУЛТТАЙГАА хамт habea-shalgalt төслийн
   нийтэд ил Firestore баримтад байсан — хэн ч интернэтээс уншиж чаддаг
   байв. Мөн тэр төслийн квот дүүрэхэд шалгалт бүхэлдээ зогсдог байв.
   Одоо:
     · Эх сурвалж — R2: exams/config/<түлхүүр>.json (гарын үсэгтэй уншилт,
       нэвтрэлтгүй татагдахгүй). Түлхүүргүй бол exams/config/default.json.
     · GET (нийтийн) — асуултуудыг ЗӨВ ХАРИУЛТГҮЙГЭЭР буцаана. Шалгалтын
       хуудас үүгээр асуултаа авна; оноог /api/exam-save сервер дээр тооцно.
     · POST (зөвхөн админ, idToken) — get-full / save / import-legacy.
   ⚠ Зөв хариулт (correct, ans, keywords, kw) ЭНЭ ФАЙЛЫН stripQ()-ээс
     гадуур ХЭЗЭЭ Ч клиент рүү явахгүй. Шинэ талбар нэмвэл тэнд нэм.
   ========================================================================== */
'use strict';
const crypto = require('crypto');

const R2 = 'https://monos-upload.buynt666.workers.dev';
const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';
const MAIN_FS = 'https://firestore.googleapis.com/v1/projects/monos-hab-system/databases/(default)/documents';
/* Хуучин (нийтэд ил) төсөл — ЗӨВХӨН нэг удаагийн шилжүүлэлтэд (import-legacy) */
const EX_KEY = process.env.EXAM_API_KEY || 'AIzaSyBRaHjzrEedBZc1Z5zNnJuJvLboKwKed2E';
const EX_FS = 'https://firestore.googleapis.com/v1/projects/habea-shalgalt/databases/(default)/documents';

const SECRET_KEYS = ['correct', 'ans', 'keywords', 'kw'];
const SETTING_KEYS = ['examTitle', 'orgName', 'passPercent', 'timeLimitMin', 'regUrl', 'evalUrl'];
const DEF_SETTINGS = { examTitle: 'ХАБЭА Сургалтын шалгалт', orgName: 'МОНОС ХҮНС ХК', passPercent: 60, timeLimitMin: 0, regUrl: '', evalUrl: '' };

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

/* ── Нэвтрэлт, админ эрх ───────────────────────────────────────────────── */
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
/* Админ эсэх — users/{uid}.role (дүрэм: эзэн өөрийн баримтаа уншина) */
async function isAdmin(idToken, u) {
  try {
    const r = await fetch(MAIN_FS + '/users/' + encodeURIComponent(u.uid) + '?mask.fieldPaths=role',
      { headers: { Authorization: 'Bearer ' + idToken }, cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && j.fields && j.fields.role && j.fields.role.stringValue === 'admin');
  } catch (e) { return false; }
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

/* ── Түлхүүр, хэлбэр ───────────────────────────────────────────────────── */
function safeKey(k) {
  const s = String(k || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  return s || 'default';
}
function cfgPath(k) { return 'exams/config/' + safeKey(k) + '.json'; }

/* ⚠ Зөв хариултыг ХАСНА — клиент рүү явах ГАНЦ зам */
function stripQ(q) {
  const o = {};
  Object.keys(q || {}).forEach(function (k) { if (SECRET_KEYS.indexOf(k) < 0) o[k] = q[k]; });
  return o;
}
function cleanSettings(s) {
  const o = Object.assign({}, DEF_SETTINGS);
  SETTING_KEYS.forEach(function (k) {
    if (s && s[k] !== undefined && s[k] !== null) o[k] = (k === 'passPercent' || k === 'timeLimitMin') ? Number(s[k]) || 0 : String(s[k]).slice(0, 400);
  });
  o.passPercent = Math.min(100, Math.max(0, o.passPercent || 60));
  o.timeLimitMin = Math.min(180, Math.max(0, o.timeLimitMin || 0));
  return o;
}
function validQuestions(list) {
  if (!Array.isArray(list) || list.length > 500) return false;
  return list.every(function (q) { return q && typeof q === 'object' && q.id !== undefined && typeof q.type === 'string'; });
}

/* Тохиргоог уншина: тухайн түлхүүр → default */
async function loadConfig(key) {
  let cfg = null, from = '';
  if (safeKey(key) !== 'default') { cfg = await getJson(cfgPath(key)); from = safeKey(key); }
  if (!cfg) { cfg = await getJson(cfgPath('default')); from = 'default'; }
  if (!cfg) return null;
  return { key: from, settings: cleanSettings(cfg.settings), questions: Array.isArray(cfg.questions) ? cfg.questions : [], updatedAt: cfg.updatedAt || '' };
}

/* Хуучин төслийн баримтыг задлана (import-legacy) */
function fsVal(v) {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fsVal);
  if (v.mapValue !== undefined) { const o = {}; Object.keys(v.mapValue.fields || {}).forEach(function (k) { o[k] = fsVal(v.mapValue.fields[k]); }); return o; }
  return null;
}
async function legacyDoc(path) {
  const r = await fetch(EX_FS + '/' + path + '?key=' + EX_KEY, { cache: 'no-store' });
  if (!r.ok) return null;
  const j = await r.json();
  const o = {}; Object.keys(j.fields || {}).forEach(function (k) { o[k] = fsVal(j.fields[k]); });
  return o;
}

/* Сургалтын баримтад (шалгалтын хуудас хэвлэх) — зөв хариултгүй хуулбар */
async function writePublicMirror(questions) {
  try { await putJson('exams/_questions.json', { updatedAt: new Date().toISOString(), list: questions.map(stripQ) }); } catch (e) {}
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  /* ── GET: шалгалтын хуудсанд (нийтийн, зөв хариултгүй) ── */
  if (req.method === 'GET') {
    let key = '';
    try { key = new URL(req.url, 'http://x').searchParams.get('exam') || ''; } catch (e) {}
    try {
      const cfg = await loadConfig(key);
      if (!cfg) return res.status(404).json({ ok: false, error: 'Шалгалтын тохиргоо алга' });
      return res.status(200).json({ ok: true, key: cfg.key, settings: cfg.settings,
        questions: cfg.questions.map(stripQ), n: cfg.questions.length, updatedAt: cfg.updatedAt });
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'Тохиргоо уншигдсангүй: ' + String(e.message || e).slice(0, 80) });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET эсвэл POST' });

  /* ── POST: зөвхөн админ ── */
  const body = await readBody(req);
  const u = await verifyIdToken(body.idToken);
  if (!u) return res.status(401).json({ ok: false, error: 'Нэвтрээгүй байна' });
  if (!(await isAdmin(body.idToken, u))) return res.status(403).json({ ok: false, error: 'Зөвхөн админ' });
  const action = String(body.action || '');
  const key = safeKey(body.exam);

  try {
    if (action === 'get-full') {
      const cfg = await loadConfig(key);
      if (!cfg) return res.status(200).json({ ok: true, key: key, exists: false, settings: cleanSettings(null), questions: [] });
      return res.status(200).json({ ok: true, key: cfg.key, exists: true, settings: cfg.settings, questions: cfg.questions, updatedAt: cfg.updatedAt });
    }

    if (action === 'save') {
      const settings = cleanSettings(body.settings);
      let questions = body.questions;
      if (questions === undefined) {           /* зөвхөн тохиргоо хадгалах бол асуултыг хэвээр */
        const cur = await getJson(cfgPath(key));
        questions = (cur && Array.isArray(cur.questions)) ? cur.questions : [];
      }
      if (!validQuestions(questions)) return res.status(400).json({ ok: false, error: 'Асуултын хэлбэр буруу' });
      const doc = { updatedAt: new Date().toISOString(), by: u.email, key: key, settings: settings, questions: questions };
      await putJson(cfgPath(key), doc);
      if (key === 'default') await writePublicMirror(questions);
      return res.status(200).json({ ok: true, key: key, n: questions.length, updatedAt: doc.updatedAt });
    }

    if (action === 'import-legacy') {
      /* Нэг удаагийн шилжүүлэлт: хуучин төслийн settings/questions → R2.
         ⚠ R2-д аль хэдийн байвал `force` байхгүй бол ДАРЖ БИЧИХГҮЙ. */
      const cur = await getJson(cfgPath(key));
      if (cur && !body.force) return res.status(200).json({ ok: true, skipped: true, key: key, n: (cur.questions || []).length });
      const suf = key === 'default' ? '' : ('_' + key);
      const qd = await legacyDoc('habea_config/questions' + suf);
      const sd = await legacyDoc('habea_config/settings' + suf);
      const questions = (qd && Array.isArray(qd.list)) ? qd.list : [];
      /* ⚠ 2026-09-09: хуучин ил төсөл ХААГДСАН — энэ шилжүүлэлт аль хэдийн
         хийгдсэн (exams/config/default.json). Дахин хэрэглэх шаардлагагүй. */
      if (!questions.length) return res.status(404).json({ ok: false,
        error: 'Хуучин сан хаагдсан эсвэл асуулт алга (' + key + ') — шилжүүлэлт аль хэдийн хийгдсэн' });
      const settings = cleanSettings(sd || {});      /* adminPin зэрэг халагдана */
      const doc = { updatedAt: new Date().toISOString(), by: u.email, key: key, settings: settings, questions: questions, importedFrom: 'habea-shalgalt' };
      await putJson(cfgPath(key), doc);
      if (key === 'default') await writePublicMirror(questions);
      return res.status(200).json({ ok: true, key: key, n: questions.length, imported: true });
    }

    return res.status(400).json({ ok: false, error: 'Үйлдэл тодорхойгүй' });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Алдаа: ' + String(e.message || e).slice(0, 100) });
  }
};

module.exports._internal = { stripQ, cleanSettings, safeKey, validQuestions };
