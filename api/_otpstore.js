/* ============================================================================
   НЭГ УДААГИЙН КОДЫН САН  —  ХААЛТТАЙ ТӨСӨЛД (2026-09-09)
   ----------------------------------------------------------------------------
   ⚠⚠ ЯАГААД ЗӨӨВ (аюулгүй байдлын дүгнэлт, олдвор №1 — ЭГЗЭГТЭЙ):
   Код нь `habea-shalgalt` төслийн `habea_otp` цуглуулгад хадгалагддаг байв.
   Тэр төслийн дүрэм нэвтрэлт огт шаарддаггүй тул ХЭН Ч интернэтээс шууд
   бичих, засах, устгах боломжтой байсныг бодит туршилтаар баталсан:
       PATCH …/habea_otp/<id> → 200 OK
   Үр дагавар: халдагч өөрийн сонгосон кодын хэшийг бичээд дурын ажилтны
   нэрээр «баталгаажсан» гарын үсэг үүсгэх, ашигласан кодыг `used:false`
   болгож дахин ашиглах, гарын үсгийн бичлэгийг устгах боломжтой байв.
   Энэ код нь эрсдэлтэй танилцсан, шалгалт өгсөн зэргийг гэрчилдэг тул
   нотлох чанар нь бүрэн алдагдана.

   ЗАСВАР: кодыг ҮНДСЭН төсөлд (`monos-hab-system`) хадгална. Тэр төсөл
   нэвтрэлтгүй хандалтыг 403-аар хаадаг (шалгаж баталсан), сервер нь
   ҮЙЛЧИЛГЭЭНИЙ ДАНСААР (FB_SA_EMAIL / FB_SA_KEY) ханддаг тул дүрмээс
   хамаарахгүй. Хөтөч энэ санд ОГТ хүрэхгүй — зөвхөн /api/* дамжина.

   ⚠ ШИЛЖИЛТИЙН ҮЕ: хуучин байршилд үүссэн, хараахан ашиглагдаагүй кодууд
   (10 минутын хугацаатай) байж болно. Тиймээс УНШИХДАА шинэ байршилд
   олдоогүй бол хуучнаас нь хайна. Бичихдээ ЗӨВХӨН шинэ байршилд.
   Хэдэн өдрийн дараа хуучин замыг устгана.

   ⚠ FAIL-SAFE: үйлчилгээний дансны эрх ямар нэг шалтгаанаар ажиллахгүй
   бол `otpCreate` нь ХУУЧИН замаар бичээд `where:'old'` гэж хэлнэ —
   ажилтны шалгалт ЗОГСОХГҮЙ. Ийм тохиолдол бүр логт бичигдэнэ.
   ========================================================================== */
const crypto = require('crypto');

const PROJECT = process.env.FB_PROJECT_ID || 'monos-hab-system';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
  '/databases/(default)/documents';

/* Хуучин (ил) байршил — ЗӨВХӨН шилжилтийн уншилтад */
const OLD_PROJ = process.env.EXAM_PROJECT_ID || 'habea-shalgalt';
const OLD_KEY = process.env.EXAM_API_KEY || 'AIzaSyBRaHjzrEedBZc1Z5zNnJuJvLboKwKed2E';
const OLD_FS = 'https://firestore.googleapis.com/v1/projects/' + OLD_PROJ +
  '/databases/(default)/documents';

const COL = 'habea_otp';

function b64u(b) {
  return Buffer.from(b).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* Access token — нэг ажиллуулалтын дотор кэшлэнэ (55 минут) */
let _tok = null, _tokExp = 0;
async function adminToken() {
  if (_tok && Date.now() < _tokExp) return _tok;
  const email = process.env.FB_SA_EMAIL || '';
  let key = process.env.FB_SA_KEY || '';
  if (!email || !key) return null;
  key = key.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({
    iss: email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  try {
    const sig = crypto.createSign('RSA-SHA256');
    sig.update(head + '.' + body);
    const jwt = head + '.' + body + '.' + b64u(sig.sign(key));
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt
      })
    });
    const j = await r.json();
    if (!j || !j.access_token) return null;
    _tok = j.access_token; _tokExp = Date.now() + 55 * 60000;
    return _tok;
  } catch (e) { return null; }
}

/* ── Firestore REST утга хөрвүүлэлт ── */
function toField(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v)
    ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}
function fromField(f) {
  if (!f || typeof f !== 'object') return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return Number(f.doubleValue);
  if ('timestampValue' in f) return f.timestampValue;
  if ('nullValue' in f) return null;
  return undefined;
}
function toFields(o) {
  const f = {};
  Object.keys(o || {}).forEach(function (k) { f[k] = toField(o[k]); });
  return f;
}
function fromFields(f) {
  const o = {};
  Object.keys(f || {}).forEach(function (k) { o[k] = fromField(f[k]); });
  return o;
}

/* ── Үүсгэх. Буцаана: { ok, where:'main'|'old', error } ── */
async function otpCreate(id, doc) {
  const tok = await adminToken();
  if (tok) {
    try {
      /* PATCH нь баримт байхгүй бол ҮҮСГЭДЭГ (create-or-replace) */
      const r = await fetch(FS + '/' + COL + '/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ fields: toFields(doc) })
      });
      if (r.ok) return { ok: true, where: 'main' };
      return await createOld(id, doc, 'main ' + r.status);
    } catch (e) {
      return await createOld(id, doc, 'main ' + String((e && e.message) || e).slice(0, 40));
    }
  }
  return await createOld(id, doc, 'үйлчилгээний данс алга');
}

/* ⚠ ЗӨВХӨН ОСЛЫН ҮЕД: шинэ зам ажиллахгүй бол ажилтныг зогсоохгүйн тулд
   хуучин (ил) байршилд бичнэ. Ийм тохиолдол `where:'old'` гэж мэдэгдэнэ. */
/* ⚠ 2026-09-09: хуучин сан ХААГДСАН. Тэр рүү бичих оролдлого утгагүй тул
   шууд бүтэлгүй гэж хариулна (сүлжээний хүсэлт үүсгэхгүй). */
const LEGACY_CLOSED = true;
async function createOld(id, doc, why) {
  if (LEGACY_CLOSED) return { ok: false, where: 'old', error: 'хуучин сан хаалттай', why: why };
  try {
    const r = await fetch(OLD_FS + '/' + COL + '?documentId=' + encodeURIComponent(id) +
      '&key=' + OLD_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFields(doc) })
    });
    if (r.ok) return { ok: true, where: 'old', why: why };
    return { ok: false, where: 'old', error: 'Firestore ' + r.status, why: why };
  } catch (e) {
    return { ok: false, where: 'old', error: String((e && e.message) || e).slice(0, 80), why: why };
  }
}

/* ── Унших. Буцаана: { found, data, where } эсвэл { error } ── */
async function otpGet(id) {
  const tok = await adminToken();
  if (tok) {
    try {
      const r = await fetch(FS + '/' + COL + '/' + encodeURIComponent(id),
        { headers: { Authorization: 'Bearer ' + tok }, cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (j && j.fields) return { found: true, data: fromFields(j.fields), where: 'main' };
      } else if (r.status !== 404) {
        return { error: 'main Firestore ' + r.status };
      }
    } catch (e) { return { error: 'main ' + String((e && e.message) || e).slice(0, 60) }; }
  }
  /* Шинэ байршилд алга — шилжилтийн өмнө үүссэн код байж болно */
  try {
    const r = await fetch(OLD_FS + '/' + COL + '/' + encodeURIComponent(id) + '?key=' + OLD_KEY,
      { cache: 'no-store' });
    /* ⚠ 2026-09-09: хуучин ил төсөл ХААГДСАН (deny-all) тул 403 ирнэ.
       Энэ нь «алдаа» БИШ, «энд байхгүй» гэсэн үг — эс бөгөөс буруу код
       бичсэн ажилтанд «Код буруу» гэхийн оронд серверийн алдаа гарна. */
    if (r.status === 404 || r.status === 403 || r.status === 401) return { found: false, where: 'none' };
    if (!r.ok) return { error: 'old Firestore ' + r.status };
    const j = await r.json();
    if (!j || !j.fields) return { found: false, where: 'none' };
    return { found: true, data: fromFields(j.fields), where: 'old' };
  } catch (e) { return { error: 'old ' + String((e && e.message) || e).slice(0, 60) }; }
}

/* ── Талбар шинэчлэх. `where` нь otpGet-ээс ирнэ. Буцаана: true/false ── */
async function otpPatch(id, fields, where) {
  const mask = Object.keys(fields).map(function (f) {
    return 'updateMask.fieldPaths=' + encodeURIComponent(f);
  }).join('&');
  if (where === 'old') {
    try {
      const r = await fetch(OLD_FS + '/' + COL + '/' + encodeURIComponent(id) +
        '?key=' + OLD_KEY + '&' + mask, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFields(fields) })
      });
      return r.ok;
    } catch (e) { return false; }
  }
  const tok = await adminToken();
  if (!tok) return false;
  try {
    const r = await fetch(FS + '/' + COL + '/' + encodeURIComponent(id) + '?' + mask, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: JSON.stringify({ fields: toFields(fields) })
    });
    return r.ok;
  } catch (e) { return false; }
}

module.exports = { adminToken, otpCreate, otpGet, otpPatch, PROJECT, COL };
