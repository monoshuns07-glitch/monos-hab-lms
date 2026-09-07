/* ============================================================================
   /api/r2-backup  —  R2 ДАХЬ ДАТАГ ӨДӨР БҮР ОГНООТОЙ ХУУЛБАРЛАНА
   ----------------------------------------------------------------------------
   ⚠⚠ ЯАГААД (2026-09-07):
   Систем Firestore-оос R2 руу шилжиж байгаа. Гэтэл Firestore нь өнөөг хүртэл
   ЧИМЭЭГҮЙХЭН нөөцийн үүрэг гүйцэтгэж байсан: R2 толь эвдэрсэн үед (жишээ нь
   баталгаа алдагдсан) эх бичлэгээс сэргээх боломжтой байв. Яг ийм зүйл
   2026-09-07-нд болж, Гандолгорын батлалтыг Firestore-оос сэргээсэн.

   Firestore-г салгахаас ӨМНӨ тэр нөөцийг орлуулах ёстой. Эс бөгөөс R2-д
   гарсан алдаа БУЦААХ АРГАГҮЙ болно.

   ЭНЭ ЦЭГ: чухал файлуудыг өдөр бүр `backup/<огноо>/<нэр>` рүү хуулна.
   Хуулбар нь бүтэн JSON — сэргээхэд буцааж тавихад л хангалттай.

   Дуудах: cron (CRON_SECRET), эсвэл ?dry=1 (юу хуулахыг харуулна)
   ========================================================================== */
const crypto = require('crypto');

const R2 = 'https://monos-upload.buynt666.workers.dev';

/* ⚠ ШИНЭ ЧУХАЛ ФАЙЛ НЭМБЭЛ ЭНД БИЧНЭ — эс бөгөөс нөөцлөгдөхгүй. */
const KEYS = [
  'reports/_all.json',        /* аюул, ажлын захиалга */
  'kpi/state.json',           /* тохиргоо, даалгавар, явц */
  'employees/all.json',       /* ажилтны жагсаалт */
  'exams/_all.json',          /* шалгалтын дүн */
  'lms/progress.json',        /* видео сургалтын явц */
  'workflow/_open.json',      /* сэрэмжлүүлэгийн толь */
  'workflow/_locations.json', /* байршил, хугацааны тохиргоо */
  'registry/health.json',     /* бүртгэлийн онош */
  'sys/clients.json',         /* хэн ямар хувилбар дээр байна */
  'push/subs.json'            /* мэдэгдлийн бүртгэл */
];


const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';
const ADMIN_EMAILS = ['buynt666@gmail.com'];

/* Админ гараар ажиллуулж болно — cron ажиллаж байгаа эсэхийг батлах,
   мөн шаардлагатай үед даруй нөөцлөхөд хэрэгтэй. */
async function verifyAdmin(idToken) {
  if (!idToken || String(idToken).length < 40) return null;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: idToken }) });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId || u.disabled === true) return null;
    const em = String(u.email || '').toLowerCase();
    return ADMIN_EMAILS.indexOf(em) > -1 ? { uid: u.localId, email: em } : null;
  } catch (e) { return null; }
}

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let d = '';
    req.on('data', function (c) { d += c; });
    req.on('end', function () { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}

function upHeaders(key) {
  const secret = process.env.SIGN_SECRET || '';
  if (!secret) return null;
  const exp = String(Date.now() + 10 * 60 * 1000);
  return {
    'Content-Type': 'application/json',
    'X-Up': crypto.createHmac('sha256', secret).update('up|' + key + '|' + exp, 'utf8').digest('hex'),
    'X-Exp': exp
  };
}

async function getRaw(key) {
  try {
    const r = await fetch(R2 + '/' + key + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
}

async function putRaw(key, text) {
  const h = upHeaders(key);
  if (!h) return false;
  try {
    const r = await fetch(R2 + '/' + encodeURIComponent(key), { method: 'PUT', headers: h, body: text });
    return r.ok;
  } catch (e) { return false; }
}

/* Хуулбар нь ЖИНХЭНЭЭР бичигдсэн эсэхийг шалгана — бичээд орхивол
   нөөц байхгүй атлаа «байна» гэж итгэх эрсдэлтэй. */
async function verify(key, len) {
  const t = await getRaw(key);
  return !!t && Math.abs(t.length - len) <= 2;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const cs = process.env.CRON_SECRET || '';
  const auth = String(req.headers.authorization || '');
  const isCron = !!cs && auth === 'Bearer ' + cs;
  const body = req.method === 'POST' ? await readBody(req) : {};
  const dry = String((req.query && req.query.dry) || '') === '1' || body.dry === true;
  let byAdmin = null;
  if (!isCron && body.idToken) byAdmin = await verifyAdmin(body.idToken);
  if (!isCron && !byAdmin && !dry) {
    return res.status(401).json({ ok: false,
      error: cs ? 'Зөвшөөрөлгүй' : 'CRON_SECRET тохируулаагүй байна', notConfigured: !cs });
  }
  if (!process.env.SIGN_SECRET && !dry) {
    return res.status(503).json({ ok: false, error: 'SIGN_SECRET тохируулаагүй', notConfigured: true });
  }

  const day = new Date().toISOString().slice(0, 10);
  const out = [];
  let okN = 0, failN = 0, bytes = 0;

  for (const key of KEYS) {
    const txt = await getRaw(key);
    if (txt === null) { out.push({ key: key, state: 'эх файл алга' }); continue; }
    bytes += txt.length;
    const dst = 'backup/' + day + '/' + key.replace(/\//g, '__');
    if (dry) { out.push({ key: key, dst: dst, size: txt.length, state: 'хуулах байсан' }); continue; }
    const wrote = await putRaw(dst, txt);
    const ok = wrote && await verify(dst, txt.length);
    if (ok) okN++; else failN++;
    out.push({ key: key, dst: dst, size: txt.length, state: ok ? 'хуулав' : 'ЧАДСАНГҮЙ' });
  }

  /* Индекс — ямар өдрүүд нөөцлөгдсөнийг нэг файлаас харна */
  if (!dry) {
    let idx = null;
    try {
      const t = await getRaw('backup/_index.json');
      idx = t ? JSON.parse(t) : null;
    } catch (e) { idx = null; }
    if (!idx || !Array.isArray(idx.days)) idx = { days: [] };
    if (idx.days.indexOf(day) < 0) idx.days.push(day);
    idx.days = idx.days.sort().slice(-120);          /* сүүлийн 120 өдөр */
    idx.updatedAt = new Date().toISOString();
    idx.last = { day: day, files: okN, failed: failN, bytes: bytes };
    await putRaw('backup/_index.json', JSON.stringify(idx));
  }

  return res.status(200).json({ ok: failN === 0, dry: dry, day: day, by: isCron ? 'cron' : (byAdmin ? 'админ' : 'туршилт'),
    files: okN, failed: failN, bytes: bytes, items: out });
};

module.exports._internal = { KEYS };
