/* ============================================================================
   /api/sec-status  —  СЕРВЕРИЙН ЧАДВАРЫН ОНОШИЛГОО (зөвхөн админ)
   ----------------------------------------------------------------------------
   Яагаад хэрэгтэй вэ (2026-09-09): аюулгүй байдлын дүгнэлтийн олдвор №1-ийг
   (нэг удаагийн кодын сан нэвтрэлтгүй бичигдэнэ) засахын тулд OTP-г ил
   төслөөс хаалттай төсөл рүү зөөх ёстой. Тэр нь серверт үйлчилгээний
   дансны эрх (FB_SA_EMAIL / FB_SA_KEY) байгаа эсэхээс шалтгаална.
   Тааж эхлэхийн оронд ЭНД бодитоор шалгана.

   ⚠ ЮУ Ч БУЦААХГҮЙ: зөвхөн «тохируулагдсан эсэх» гэсэн ҮНЭН/ХУДАЛ утга.
     Түлхүүр, нууц үг, и-мэйл, өгөгдөл огт буцаахгүй.
   ⚠ Зөвхөн users/{uid}.role === 'admin' хүн дуудаж чадна.
   ========================================================================== */

const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';
const PROJECT = process.env.FB_PROJECT_ID || 'monos-hab-system';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';

function b64u(b) {
  return Buffer.from(b).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* Үйлчилгээний дансаар Google-ийн access token авах оролдлого.
   Буцаана: { ok, why } — токеныг ӨӨРИЙГ НЬ БУЦААХГҮЙ. */
async function adminTokenProbe() {
  const crypto = require('crypto');
  const email = process.env.FB_SA_EMAIL || '';
  let key = process.env.FB_SA_KEY || '';
  if (!email) return { ok: false, why: 'FB_SA_EMAIL тохируулаагүй' };
  if (!key) return { ok: false, why: 'FB_SA_KEY тохируулаагүй' };
  key = key.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  let jwt;
  try {
    const sig = crypto.createSign('RSA-SHA256');
    sig.update(head + '.' + body);
    jwt = head + '.' + body + '.' + b64u(sig.sign(key));
  } catch (e) {
    return { ok: false, why: 'Түлхүүр гарын үсэг зурахад алдаа: ' + String(e.message || e).slice(0, 60) };
  }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt
      })
    });
    const j = await r.json();
    if (j && j.access_token) return { ok: true, why: 'болно' };
    return { ok: false, why: 'Google татгалзав: ' + String((j && (j.error_description || j.error)) || r.status).slice(0, 80) };
  } catch (e) {
    return { ok: false, why: 'Сүлжээ: ' + String(e.message || e).slice(0, 60) };
  }
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
    return { uid: u.localId, email: String(u.email || '').toLowerCase() };
  } catch (e) { return null; }
}

async function isAdmin(idToken, uid) {
  try {
    const r = await fetch(FS + '/users/' + encodeURIComponent(uid),
      { headers: { Authorization: 'Bearer ' + idToken } });
    if (!r.ok) return false;
    const j = await r.json();
    return (((j.fields || {}).role || {}).stringValue === 'admin');
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST л хүлээн авна' });

  const body = await readBody(req);
  const me = await whoIs(body.idToken);
  if (!me) return res.status(401).json({ ok: false, error: 'Нэвтрээгүй байна' });
  if (!(await isAdmin(body.idToken, me.uid))) {
    return res.status(403).json({ ok: false, error: 'Зөвхөн админ' });
  }

  const sa = await adminTokenProbe();
  const has = function (n) { return !!(process.env[n] && String(process.env[n]).length > 3); };

  return res.status(200).json({
    ok: true,
    serviceAccount: { configured: sa.ok, note: sa.why },
    env: {
      FB_SA_EMAIL: has('FB_SA_EMAIL'), FB_SA_KEY: has('FB_SA_KEY'),
      SIGN_SECRET: has('SIGN_SECRET'), CRON_SECRET: has('CRON_SECRET'),
      GMAIL_USER: has('GMAIL_USER'), GMAIL_APP_PASSWORD: has('GMAIL_APP_PASSWORD'),
      BREVO_API_KEY: has('BREVO_API_KEY'), RESEND_API_KEY: has('RESEND_API_KEY'),
      EXAM_API_KEY: has('EXAM_API_KEY'), EXAM_SA_KEY: has('EXAM_SA_KEY'),
      VAPID_PRIVATE_KEY: has('VAPID_PRIVATE_KEY')
    },
    project: PROJECT
  });
};
