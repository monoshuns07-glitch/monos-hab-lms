/* ============================================================================
   /api/otp-verify  —  НЭГ УДААГИЙН КОДЫГ СЕРВЕР ДЭЭР ШАЛГАНА
   ----------------------------------------------------------------------------
   ⚠⚠ ЯАГААД (2026-09-08, нийцлийн үнэлгээний К1):
   Кодын шалгалт ХӨТӨЧ дээр хийгддэг байв: хөтөч хэшийг татаж, өөрөө
   тооцоолж, өөрөө «зөв» гэж шийдээд «ашигласан» гэж тэмдэглэдэг.
   Хөтчийн кодыг өөрчилсөн хүн шалгалтыг БҮХЭЛД НЬ алгасах боломжтой
   байсан. Код нь ГАРЫН ҮСГИЙН үүрэг гүйцэтгэдэг тул энэ нь нотлох
   чанарыг үндсээр нь сулруулж байв (MNS 4969-2 5.5.2 «найдвартай
   таньж баталгаажуулах»).

   ОДОО: код зөв эсэхийг ЗӨВХӨН сервер шийднэ. Хөтөч зөвхөн асууна.

   ⚠ ОНОШИЛГООНЫ ЧУХАЛ ЗҮЙЛ: код нь `habea-shalgalt` гэсэн ӨӨР Firebase
   төсөлд хадгалагддаг (KPI-ийн төсөлд БИШ). Нэвтрэлтийг үндсэн
   төслөөр, кодыг шалгалтын төслөөр шалгана — хоёр өөр төсөл.

   ⚠ ХАРИУ БУЦААХ ЗАРЧИМ: «код буруу» гэдэг нь ШИЙДВЭР (200 + verdict),
   «сервер хүрэхгүй байна» гэдэг нь ГЭМТЭЛ (5xx). Хөтөч зөвхөн ГЭМТЭЛ
   дээр нөөц зам руу шилжинэ — эс бөгөөс буруу кодтой хүн серверийг
   унагаагаад хуучин (сул) замаар өнгөрөх боломжтой болно.
   ========================================================================== */
const crypto = require('crypto');

/* Нэвтрэлт — ҮНДСЭН төсөл */
const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';

/* Код — ШАЛГАЛТЫН төсөл (нийтийн вэб түлхүүр, хөтөч дээр угаасаа байдаг) */
const EX_PROJ = process.env.EXAM_PROJECT_ID || 'habea-shalgalt';
const EX_KEY = process.env.EXAM_API_KEY || 'AIzaSyBRaHjzrEedBZc1Z5zNnJuJvLboKwKed2E';
const EX_FS = 'https://firestore.googleapis.com/v1/projects/' + EX_PROJ +
  '/databases/(default)/documents';

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    var raw = '';
    req.on('data', function (c) { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}

async function whoIs(idToken) {
  if (!idToken || String(idToken).length < 40) return null;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: idToken })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId || u.disabled === true) return null;
    return { uid: u.localId, email: String(u.email || '').toLowerCase().trim() };
  } catch (e) { return null; }
}

/* ⚠ 2026-09-09 (олдвор №5б): буруу оролдлогын тоолуур байгаагүй тул 6 оронтой
   кодыг автомат скриптээр тасралтгүй оролдох боломжтой байв. Одоо 8 буруу
   оролдлогын дараа ТУХАЙН КОДЫГ хаана — ажилтан «Дахин илгээх»-ээр шинэ код
   авах боломжтой тул ажил зогсохгүй.
   ⚠ FAIL-OPEN: тоолуурыг уншиж/бичиж чадаагүй бол өмнөх шигээ үргэлжилнэ. */
const MAX_TRIES = 8;

/* ⚠ 2026-09-09 (олдвор №1): кодыг ХААЛТТАЙ төслөөс уншина. Дэлгэрэнгүйг
   api/_otpstore.js-ээс үз. */
const OTPSTORE = require('./_otpstore.js');

/* ⚠ 2026-09-09 (олдвор №2): шалгалтын хуудас `sys/otp_bypass.json`-ыг R2-оос
   ШУУД уншдаг байв. Тэр хуудас үндсэн Firebase төсөлд нэвтэрдэггүй тул
   татах гарын үсэг авч чадахгүй — иймд `sys/` угтварыг хамгаалахад тэр
   уншилт 403 болно. Одоо СЕРВЕР уншиж, төлвийг л буцаана. */
const R2 = 'https://monos-upload.buynt666.workers.dev';
function r2GetQ(key) {
  var q = '?cb=' + Date.now();
  try {
    var s = process.env.SIGN_SECRET || '';
    if (s) {
      var e = String(Date.now() + 10 * 60 * 1000);
      q += '&t=' + crypto.createHmac('sha256', s)
             .update('dl|' + key + '|' + e, 'utf8').digest('hex') + '&e=' + e;
    }
  } catch (err) {}
  return q;
}

function val(f) {
  if (!f || typeof f !== 'object') return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('timestampValue' in f) return f.timestampValue;
  return undefined;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST л хүлээн авна' });

  const body = await readBody(req);
  const id = String(body.id || '').trim();
  const code = String(body.code || '').replace(/\D/g, '');

  /* ══ КОДГҮЙ НӨӨЦ ЗАМЫН ТӨЛӨВ (action:'bypass') ═════════════════════════
     Шалгалтын хуудас админ түр нээсэн эсэхийг ЭНДЭЭС асууна (R2 руу шууд
     хандахаа больсон). `id` шаардахгүй тул id-ийн шалгалтаас ӨМНӨ.
     ⚠ Зөвхөн: нээлттэй эсэх, хэн нээсэн, хэдийг хүртэл. Өөр юу ч биш. */
  if (String(body.action || '') === 'bypass') {
    try {
      const br = await fetch(R2 + '/sys/otp_bypass.json' + r2GetQ('sys/otp_bypass.json'),
        { cache: 'no-store' });
      if (br.status === 404) return res.status(200).json({ ok: true, open: false });
      if (!br.ok) return res.status(200).json({ ok: true, open: false, note: 'R2 ' + br.status });
      const bj = await br.json();
      const until = (bj && bj.until) ? new Date(bj.until).getTime() : 0;
      if (!until || until < Date.now()) return res.status(200).json({ ok: true, open: false });
      return res.status(200).json({ ok: true, open: true,
        by: String((bj && bj.by) || '').slice(0, 80), until: String(bj.until) });
    } catch (e) {
      /* ⚠ FAIL-CLOSED: уншиж чадаагүй бол ХААЛТТАЙ гэж үзнэ */
      return res.status(200).json({ ok: true, open: false, note: 'алдаа' });
    }
  }

  if (!id) return res.status(400).json({ ok: false, verdict: 'no-id', error: 'Кодын дугаар алга' });

  /* ══ ТӨЛӨВ АСУУХ (action:'status') ══════════════════════════════════════
     Яагаад энд байна вэ: шалгалтын хуудас «и-мэйл дэх товч ӨӨР төхөөрөмж
     дээр дарагдсан уу» гэдгийг мэдэхийн тулд кодын баримтыг ХӨТЧӨӨС ШУУД
     уншдаг байв — тэр нь цуглуулгыг нийтэд нээлттэй байлгахыг шаарддаг
     байсан (олдвор №1). Одоо зөвхөн сервер уншина.
     ⚠ Тусдаа файл БИШ: Vercel-ийн үнэгүй багц 12 функц л зөвшөөрдөг тул
     нэг сэдвийн үйлдлүүдийг нэг цэгт нэгтгэв (2026-09-09-ний унасан deploy).
     ⚠ hash, и-мэйл, оролдлогын тоог ОГТ буцаахгүй. `code` нь ЗӨВХӨН
     баталгаажсаны дараа буцна — тэр үед код ашиглагдсан, дахин хэрэглэгдэхгүй. */
  if (String(body.action || '') === 'status') {
    const st = await OTPSTORE.otpGet(id);
    if (st.error) {
      /* ГЭМТЭЛ — хөтөч зүгээр дахин асууна, шалгалт зогсохгүй */
      return res.status(502).json({ ok: false, error: String(st.error).slice(0, 120) });
    }
    if (!st.found) return res.status(200).json({ ok: true, found: false });
    const sd = st.data || {};
    const sVerified = sd.verified === true;
    return res.status(200).json({
      ok: true, found: true,
      used: sd.used === true,
      verified: sVerified,
      expired: !!(sd.expiresAt && new Date(sd.expiresAt).getTime() < Date.now()),
      verifiedAt: String(sd.verifiedAt || ''),
      verifiedServer: sd.verifiedServer === true,
      code: sVerified ? String(sd.code || '') : ''
    });
  }
  if (!/^\d{4,8}$/.test(code)) {
    return res.status(200).json({ ok: false, verdict: 'format', error: 'Код буруу форматтай байна' });
  }

  /* Нэвтэрсэн хүн — ⚠ энэ нь заавал биш: кодыг эзэмшиж байгаа нь өөрөө
     таних баталгаа. Гэхдээ нэвтэрсэн бол хэн шалгуулсныг БҮРТГЭНЭ. */
  const me = await whoIs(body.idToken);

  /* ── Кодыг ХААЛТТАЙ төслөөс уншина (олдохгүй бол шилжилтийн хуучнаас) ── */
  let d = null, dWhere = 'main';
  {
    const got = await OTPSTORE.otpGet(id);
    if (got.error) {
      /* ⚠ ГЭМТЭЛ — ШИЙДВЭР БИШ. Хөтөч нөөц зам руу шилжинэ. */
      return res.status(502).json({ ok: false, error: 'Кодын сан уншигдсангүй: ' +
        String(got.error).slice(0, 120) });
    }
    if (!got.found) {
      return res.status(200).json({ ok: false, verdict: 'notfound',
        error: 'Код олдсонгүй эсвэл хугацаа дууссан' });
    }
    d = got.data; dWhere = got.where;
  }

  if (d.used === true) {
    return res.status(200).json({ ok: false, verdict: 'used', error: 'Энэ код аль хэдийн ашиглагдсан' });
  }
  if (d.expiresAt && new Date(d.expiresAt).getTime() < Date.now()) {
    return res.status(200).json({ ok: false, verdict: 'expired', error: 'Кодын хугацаа дууссан' });
  }
  if (Number(d.tries || 0) >= MAX_TRIES) {
    return res.status(200).json({ ok: false, verdict: 'locked',
      error: 'Хэт олон буруу оролдлого. «Дахин илгээх» дарж шинэ код авна уу.' });
  }

  const stored = String(d.email || '').toLowerCase().trim();
  const mine = crypto.createHash('sha256')
    .update(code + '|' + id + '|' + stored, 'utf8').digest('hex');

  if (mine !== String(d.hash || '')) {
    /* Буруу оролдлогыг тоолно. Бичилт алдвал ажилтныг ЗОГСООХГҮЙ. */
    var nTry = Number(d.tries || 0) + 1;
    try { await OTPSTORE.otpPatch(id, { tries: nTry }, dWhere); } catch (e) {}
    var left = Math.max(0, MAX_TRIES - nTry);
    return res.status(200).json({ ok: false, verdict: 'wrong', tries: nTry, left: left,
      error: left > 0 ? ('Код буруу байна. Үлдсэн оролдлого: ' + left)
                      : 'Код буруу байна. Оролдлого дууслаа — шинэ код авна уу.' });
  }

  /* ⚠ ТАНИЛТЫН ЗӨРҮҮГ ХАТУУ ХААХГҮЙ, ХАРИН БҮРТГЭНЭ.
     Нэвтэрсэн хаяг ба код илгээсэн хаяг зөрөх нь ЗӨВ тохиолдол ч байж
     болно (давхар данстай хүн). Хатуу хаавал жинхэнэ ажилтан шалгалтаа
     өгч чадахгүй болно. Тиймээс одоохондоо ЗӨРҮҮГ ТЭМДЭГЛЭЖ, бодит
     дата хуримтлагдсаны дараа чангаруулна. */
  const identityMatch = !!(me && me.email && stored && me.email === stored);

  const verifiedAt = new Date().toISOString();
  let marked = false;
  try {
    /* ⚠ `code`-ыг ЗӨВХӨН ЭНД, баталгаажсаны ДАРАА үлдээнэ. Тэр агшинд код
       ашиглагдсан тул дахин хэрэглэгдэхгүй. Хэрэгцээ нь: ажилтан и-мэйл дэх
       товчийг ӨӨР төхөөрөмж дээр дарсан бол шалгалтын хуудас /api/otp-status
       -аар кодыг авч бүртгэлд «ямар кодоор баталгаажсан» гэж тэмдэглэнэ.
       ⚠ Баримт нь ХААЛТТАЙ төсөлд — нийтэд уншигдахгүй. */
    marked = await OTPSTORE.otpPatch(id, {
      used: true, verified: true, verifiedAt: verifiedAt, code: code,
      verifiedBy: (me && me.email) || '', verifiedServer: true
    }, dWhere);
  } catch (e) { marked = false; }

  /* ⚠ Тэмдэглэж чадаагүй ч ШАЛГАЛТ нь ЗӨВ болсон — ажилтныг зогсоохгүй.
     `marked:false` нь «код дахин ашиглагдаж болзошгүй» гэсэн дохио. */
  return res.status(200).json({
    ok: true, verdict: 'ok', verifiedAt: verifiedAt,
    by: (me && me.email) || '', identityMatch: identityMatch, marked: marked
  });
};
