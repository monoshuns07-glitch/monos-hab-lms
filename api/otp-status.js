/* ============================================================================
   /api/otp-status  —  КОДЫН ТӨЛӨВ (хөтөч Firestore руу шууд хандахгүйн тулд)
   ----------------------------------------------------------------------------
   POST { id }  →  { found, used, verified, expired, verifiedAt, verifiedServer, code? }

   ⚠ ЯАГААД (2026-09-09, олдвор №1): шалгалтын хуудас нь «и-мэйл дэх товч
   өөр төхөөрөмж дээр дарагдсан уу» гэдгийг мэдэхийн тулд кодын баримтыг
   ХӨТЧӨӨС ШУУД уншдаг байв. Тэр нь тухайн цуглуулгыг нийтэд нээлттэй
   байлгахыг шаарддаг байсан — яг тэр нээлттэй байдал нь гарын үсэг
   хуурамчаар үйлдэх боломж өгч байсан. Одоо хөтөч ЗӨВХӨН энэ цэгээр
   дамжина; цуглуулга өөрөө хаалттай төсөлд байна.

   ⚠ ЮУ БУЦААХГҮЙ: hash, и-мэйл, оролдлогын тоо — огт буцаахгүй.
   ⚠ `code` нь ЗӨВХӨН баталгаажсаны дараа буцна: тэр үед код аль хэдийн
     ашиглагдсан, дахин ашиглагдахгүй. Шалгалтын хуудас түүнийг зөвхөн
     бүртгэлд «ямар кодоор баталгаажсан» гэж тэмдэглэхэд ашиглана.
   ⚠ `id` нь 28 тэмдэгтийн санамсаргүй нууц — түүнийг мэдэж байгаа нь
     кодыг хүсэлт гаргасан хүн мөн гэсэн үг.
   ========================================================================== */
const OTPSTORE = require('./_otpstore.js');

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', function (c) { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
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
  if (!id || id.length > 64) return res.status(400).json({ ok: false, error: 'Кодын дугаар алга' });

  const got = await OTPSTORE.otpGet(id);
  if (got.error) {
    /* ⚠ ГЭМТЭЛ — хөтөч зүгээр л дахин асууна. Шалгалтыг зогсоохгүй. */
    return res.status(502).json({ ok: false, error: String(got.error).slice(0, 120) });
  }
  if (!got.found) return res.status(200).json({ ok: true, found: false });

  const d = got.data || {};
  const expired = !!(d.expiresAt && new Date(d.expiresAt).getTime() < Date.now());
  const verified = d.verified === true;

  return res.status(200).json({
    ok: true, found: true,
    used: d.used === true,
    verified: verified,
    expired: expired,
    verifiedAt: String(d.verifiedAt || ''),
    verifiedServer: d.verifiedServer === true,
    code: verified ? String(d.code || '') : ''
  });
};
