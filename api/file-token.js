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
  const kind = body.kind === 'dl' ? 'dl' : 'up';
  const keys = Array.isArray(body.keys) ? body.keys
             : (body.key ? [body.key] : []);

  if (!keys.length) return res.status(400).json({ ok: false, error: 'key дутуу' });
  if (keys.length > 60) return res.status(400).json({ ok: false, error: 'нэг удаад 60 хүртэл' });
  for (const k of keys) {
    if (typeof k !== 'string' || !k || k.length > 400) {
      return res.status(400).json({ ok: false, error: 'key буруу' });
    }
  }

  const user = await verifyIdToken(body.idToken);
  if (!user) return res.status(401).json({ ok: false, error: 'Нэвтрээгүй байна' });

  const exp = String(Date.now() + (kind === 'dl' ? DL_TTL : UP_TTL));
  const tokens = {};
  for (const k of keys) tokens[k] = hmacHex(secret, kind + '|' + k + '|' + exp);

  return res.status(200).json({
    ok: true, kind: kind, exp: exp, tokens: tokens,
    token: tokens[keys[0]],          // нэг файлын үед хялбар байлгах
    uid: user.uid
  });
};
