/* ============================================================================
   /api/file-token  —  Файл байршуулах/татах ТҮР ЗУУРЫН эрх олгоно
   ----------------------------------------------------------------------------
   Зорилго: R2-ийн түлхүүрийг хөтөч рүү ХЭЗЭЭ Ч ГАРГАХГҮЙ байх.
   Урсгал:
     1. Хөтөч нэвтэрсэн хэрэглэгчийн Firebase ID token-оо илгээнэ
     2. Энэ функц түүнийг Google дээр шалгана
     3. Зөв бол 15 минут хүчинтэй ГАРЫН ҮСЭГ (HMAC) буцаана
     4. Хөтөч тэр гарын үсгээр R2 Worker руу шууд байршуулна

   Vercel → Settings → Environment Variables:
     SIGN_SECRET  = (Cloudflare Worker дээрхтэй ЯГ ИЖИЛ урт санамсаргүй мөр)
   ========================================================================== */
const crypto = require('crypto');

/* monos-hab-system-ийн вэб API түлхүүр — энэ нь угаасаа нийтийн (хөтөч дээр байдаг) */
const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';

const UP_TTL = 15 * 60 * 1000;        // байршуулах эрх — 15 минут

/* Аудитын лог бичих, эрх шалгахад хэрэгтэй хаягууд.
   ⚠ R2 нь бусад цэгүүд (r2-backup, trn-digest)-тэй ИЖИЛ байх ёстой. */
const R2 = 'https://monos-upload.buynt666.workers.dev';
const FB_PROJECT = process.env.FB_PROJECT_ID || 'monos-hab-system';
const FS = 'https://firestore.googleapis.com/v1/projects/' + FB_PROJECT +
  '/databases/(default)/documents';

/* ══ ТҮЛХҮҮРИЙН ХЯЗГААР (2026-09-03) ══
   ⚠ Өмнө нэвтэрсэн ХЭН Ч ямар ч түлхүүрт (employees/all.json, exams/*,
   push/subs.json …) бичих эрх авч чаддаг байв — нэг ажилтан бүх хүний
   бүртгэл, шалгалтын дүнг дарж бичих боломжтой гэсэн үг.
   Одоо: админ бүгдэд; бусад нь ЗӨВХӨН аппын хамтын ажиллагааны файлууд
   болон өөрийн байршуулалтад. Шалгалтын дүн зөвхөн сервер (exam-save) бичнэ. */
const ADMIN_EMAILS = ['buynt666@gmail.com'];
/* Нэвтэрсэн хүн бүрд зөвшөөрөгдөх угтварууд (клиент дээр merge-ээр бичдэг хамтын файлууд) */
const USER_PREFIXES = [
  'ack/', 'measures/', 'risks/', 'training/', 'tasks/', 'reports/', 'workflow/', 'workorders/',
  'notify/', 'requests/', 'push/', 'sys/', 'evidence/', 'att_task_', 'vid_task_', 'uploads/',
  /* 7 хоногийн ХАБЭА уулзалт (meetings/_weekly.json). ⚠ Энд нэмээгүйгээс болж
     ХАБЭА-н албаны ажилтнууд уулзалт бүртгэж чадахгүй «R2 401» өгч байв
     (2026-09-04). ШИНЭ хамтын файл нэмэх бүрд ЭНЭ ЖАГСААЛТЫГ БАС ЗАС. */
  'meetings/'
];
/* ⚠⚠ ЗӨВХӨН АДМИН БИЧНЭ. `training/` нь дээрх USER_PREFIXES-д байгаа ч
   ирцийн засвар нь ХУУЛИЙН НОТЛОХ БАРИМТ тул тусад нь хаана.
   2026-09-08: өмнө нь ямар ч ажилтан ирцийн бүртгэлийг дарж бичих эрх
   авч чаддаг байсныг бодит туршилтаар илрүүлсэн.
   `audit/` — аудитын гинж; ажилтан дарж бичвэл нотлох чанар алдагдана. */
const ADMIN_ONLY_PREFIXES = ['training/attend/', 'audit/'];

function isAdminOnlyKey(key) {
  return ADMIN_ONLY_PREFIXES.some(function (p) { return String(key).indexOf(p) === 0; });
}

function keyAllowed(key, isAdmin) {
  /* ⚠ Замын гажуудлыг АДМИН дээр ч шалгана — эрхээс үл хамааран хориотой. */
  if (/(^|\/)\.\.(\/|$)/.test(key)) return false;
  /* ⚠ Энэ шалгалт `isAdmin` буцаахаас ӨМНӨ байх ЁСТОЙ — эс бөгөөс
     админ-онлайн угтвар USER_PREFIXES-д залгигдана. */
  if (isAdminOnlyKey(key)) return !!isAdmin;
  if (isAdmin) return true;
  return USER_PREFIXES.some(function (p) { return key.indexOf(p) === 0; });
}

/* ══ АУДИТЫН ГИНЖ ═══════════════════════════════════════════════════
   Чухал файлд бичих эрх олгосон/татгалзсан бүрийг бүртгэнэ. Бичлэг бүр
   өмнөхийн хэшийг агуулна тул дундаас устгавал гинж тасарч ИЛЭРНЭ.
   ⚠ Бүх байршуулалтыг бүртгэхгүй — зөвхөн доорх жагсаалтад тохирсныг
     (зураг, түр файл бүрийг бүртгэвэл лог хэрэглэхийн аргагүй болно).
     Харин ТАТГАЛЗЛЫГ бүгдийг нь бүртгэнэ — аюулгүй байдлын дохио. */
const AUDIT_KEYS = [
  'training/attend/', 'training/owners.json', 'exams/', 'reports/_all.json',
  'kpi/state.json', 'workflow/_open.json', 'workflow/_locations.json',
  'employees/all.json', 'lms/', 'miskill/', 'risks/', 'sys/cols.json', 'audit/'
];
function auditWorthy(key) {
  return AUDIT_KEYS.some(function (p) { return String(key).indexOf(p) === 0; });
}

async function auditAppend(entry) {
  const secret = process.env.SIGN_SECRET || '';
  if (!secret) return;
  const day = new Date().toISOString().slice(0, 10);
  const file = 'audit/' + day + '.json';
  let cur = null;
  try {
    const r = await fetch(R2 + '/' + file + '?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) cur = await r.json();
  } catch (e) { cur = null; }
  if (!cur || !Array.isArray(cur.rows)) cur = { day: day, rows: [], last: '' };

  const row = {
    n: cur.rows.length + 1,
    at: new Date().toISOString(),
    by: entry.by || '', uid: entry.uid || '',
    act: entry.act || '', keys: entry.keys || [],
    ok: entry.ok === true,
    prev: cur.last || ''
  };
  /* ⚠ Хэшийг бичлэгийн БҮХ талбараас авна — аль нэгийг өөрчилвөл
     хэш зөрж, дараагийн бичлэгийн `prev`-тэй таарахаа болино. */
  row.hash = crypto.createHash('sha256')
    .update(JSON.stringify([row.n, row.at, row.by, row.uid, row.act, row.keys, row.ok, row.prev]), 'utf8')
    .digest('hex');
  cur.rows.push(row);
  cur.last = row.hash;
  cur.updatedAt = row.at;

  const exp = String(Date.now() + 5 * 60 * 1000);
  const sig = crypto.createHmac('sha256', secret).update('up|' + file + '|' + exp, 'utf8').digest('hex');
  await fetch(R2 + '/' + encodeURIComponent(file), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Up': sig, 'X-Exp': exp },
    body: JSON.stringify(cur)
  });
}

/* Аппын ЖИНХЭНЭ эрхийн загвараар админ эсэхийг шалгана.
   ⚠ Хатуу бичсэн и-мэйлийн жагсаалт ХАНГАЛТГҮЙ — системд хоёр админ
     байгаа бөгөөд нэг нь тэр жагсаалтад байхгүй байв (2026-09-08).
   ⚠ Firestore уншилт нэмдэг тул ЗӨВХӨН шаардлагатай үед дуудна. */
async function roleIsAdmin(idToken, uid) {
  try {
    const r = await fetch(FS + '/users/' + encodeURIComponent(uid),
      { headers: { Authorization: 'Bearer ' + idToken } });
    if (!r.ok) return false;
    const j = await r.json();
    return (((j.fields || {}).role || {}).stringValue === 'admin');
  } catch (e) { return false; }
}
const DL_TTL = 6 * 60 * 60 * 1000;    // татах холбоос — 6 цаг

function hmacHex(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg, 'utf8').digest('hex');
}

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    var raw = '';
    req.on('data', function (c) { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}

/* Firebase ID token-ийг Google дээр шалгана. Зөв бол хэрэглэгчийн мэдээллийг буцаана. */
async function verifyIdToken(idToken) {
  if (!idToken || idToken.length < 40) return null;
  try {
    const r = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_API_KEY,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken }) });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId) return null;
    if (u.disabled === true) return null;
    return { uid: u.localId, email: (u.email || '').toLowerCase() };
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST л хүлээн авна' });
  }

  const secret = process.env.SIGN_SECRET || '';
  if (!secret) {
    /* Тохируулаагүй байна — хуучин арга ажилласаар байг гэж мэдэгдэнэ */
    return res.status(503).json({ ok: false, error: 'SIGN_SECRET тохируулаагүй', notConfigured: true });
  }

  const body = await readBody(req);
  /* ⚠ 'otp' — шалгалтын хуудсанд кодыг ӨӨРТ НЬ авах богино эрх.
     Өмнө нь аппын ТАБААР дамжуулдаг байсан нь утсан дээр найдваргүй:
     шалгалт шинэ табд нээгдэхэд аппын таб ард үлдэж, санах ой багатай
     утсанд УСТДАГ тул хариу өгөх код байхгүй болж, и-мэйл рүү шилждэг
     байв (2026-08-28). Одоо энэ богино эрхийг URL-аар дамжуулна. */
  const kind = body.kind === 'dl' ? 'dl' : (body.kind === 'otp' ? 'otp' : 'up');
  const keys = Array.isArray(body.keys) ? body.keys
             : (body.key ? [body.key] : []);

  if (kind !== 'otp' && !keys.length) return res.status(400).json({ ok: false, error: 'key дутуу' });
  if (keys.length > 60) return res.status(400).json({ ok: false, error: 'нэг удаад 60 хүртэл' });
  for (const k of keys) {
    if (typeof k !== 'string' || !k || k.length > 400) {
      return res.status(400).json({ ok: false, error: 'key буруу' });
    }
  }

  const user = await verifyIdToken(body.idToken);
  if (!user) return res.status(401).json({ ok: false, error: 'Нэвтрээгүй байна' });

  /* Байршуулах эрх — түлхүүр бүрийг эрхээр шалгана (татах 'dl' хязгаарлахгүй) */
  if (kind === 'up') {
    let isAdmin = ADMIN_EMAILS.indexOf(String(user.email || '').toLowerCase()) >= 0;
    /* ⚠ Firestore-оос эрх шалгахыг ЗӨВХӨН хэрэгтэй үед хийнэ: ердийн
       (ажилтны угтвартай) байршуулалт нэмэлт уншилт үүсгэхгүй. */
    if (!isAdmin && keys.some(function (k) { return !keyAllowed(k, false); })) {
      isAdmin = await roleIsAdmin(body.idToken, user.uid);
    }
    const bad = keys.filter(function (k) { return !keyAllowed(k, isAdmin); });

    /* ⚠ Бүртгэлийг эрх олгохоос ӨМНӨ бичнэ — татгалзлыг ч бүртгэнэ. */
    try {
      if (bad.length || keys.some(auditWorthy)) {
        await auditAppend({
          by: user.email, uid: user.uid, act: bad.length ? 'татгалзсан' : 'бичих эрх',
          keys: keys.map(function (k) { return String(k).slice(0, 120); }),
          ok: bad.length === 0
        });
      }
    } catch (e) { /* лог унасан ч байршуулалтыг зогсоохгүй */ }

    if (bad.length) {
      return res.status(403).json({ ok: false, error: 'Энэ файлд бичих эрх байхгүй',
        denied: bad.map(function (k) { return k.slice(0, 60); }) });
    }
  }

  const exp = String(Date.now() + (kind === 'dl' ? DL_TTL : UP_TTL));
  if (kind === 'otp') {
    /* 15 минут хүчинтэй, ЗӨВХӨН энэ и-мэйлд зориулсан */
    return res.status(200).json({ ok: true, kind: 'otp', exp: exp,
      email: user.email,
      token: hmacHex(secret, 'otp|' + user.email + '|' + exp) });
  }
  const tokens = {};
  for (const k of keys) tokens[k] = hmacHex(secret, kind + '|' + k + '|' + exp);

  return res.status(200).json({
    ok: true, kind: kind, exp: exp, tokens: tokens,
    token: tokens[keys[0]],          // нэг файлын үед хялбар байлгах
    uid: user.uid
  });
};
