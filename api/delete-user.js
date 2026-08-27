/* ============================================================================
   /api/delete-user  —  Ажилтны бүртгэлийг БҮРЭН устгана (Auth + Firestore)
   ----------------------------------------------------------------------------
   ⚠ ЯАГААД ХЭРЭГТЭЙ ВЭ: өмнө нь admin.html нь ажилтны ХАДГАЛСАН нууц үгээр
   нь secondary app-д нэвтэрч Auth дансыг устгадаг байв. 2026-08-27-нд бүх
   ажилтан өөрийн нууц үгээ зохиодог болсон тул хадгалсан нууц үг хуучирч,
   тэр арга АЖИЛЛАХАА БОЛЬСОН. Одоо серверийн эрхээр зөв аргаар устгана.

   Аюулгүй байдал:
     1. Дуудагчийн Firebase ID token-ыг Google дээр шалгана
     2. Тухайн хүн users/{uid}.role === 'admin' эсэхийг Firestore-оос шалгана
     3. Зөвхөн тэр үед л устгана. Админ ӨӨРИЙГӨӨ устгаж чадахгүй.

   Vercel → Settings → Environment Variables:
     FB_SA_EMAIL = service account-ийн client_email
     FB_SA_KEY   = service account-ийн private_key (BEGIN/END мөрийг нь бүтнээр)
   ========================================================================== */
const crypto = require('crypto');

const FB_WEB_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';
const PROJECT = process.env.FB_PROJECT_ID || 'monos-hab-system';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';

function b64u(b) {
  return Buffer.from(b).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* Service account-аар Google-ийн access token авна */
async function adminToken() {
  const email = process.env.FB_SA_EMAIL || '';
  let key = process.env.FB_SA_KEY || '';
  if (!email || !key) return null;
  key = key.replace(/\\n/g, '\n');            // Vercel дээр \n тэмдэгтээр хадгалагддаг
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  const sig = crypto.createSign('RSA-SHA256');
  sig.update(head + '.' + body);
  const jwt = head + '.' + body + '.' + b64u(sig.sign(key));
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });
    const j = await r.json();
    return j.access_token || null;
  } catch (e) { return null; }
}

/* Дуудагчийг таних */
async function whoIs(idToken) {
  if (!idToken || String(idToken).length < 40) return null;
  try {
    const r = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_WEB_KEY,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken }) });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId || u.disabled === true) return null;
    return { uid: u.localId, email: String(u.email || '').toLowerCase() };
  } catch (e) { return null; }
}

/* Тухайн хүн админ мөн эсэх — users/{uid}.role */
async function isAdmin(uid, token) {
  try {
    const r = await fetch(FS + '/users/' + encodeURIComponent(uid),
      { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return false;
    const j = await r.json();
    const role = j && j.fields && j.fields.role && j.fields.role.stringValue;
    return role === 'admin';
  } catch (e) { return false; }
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

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST л хүлээн авна' });

  const body = await readBody(req);
  const targetUid = String(body.uid || '').trim();
  if (!targetUid) return res.status(400).json({ error: 'uid дутуу байна' });

  /* 1. Дуудагчийг таних */
  const me = await whoIs(body.idToken);
  if (!me) return res.status(401).json({ error: 'Нэвтрээгүй байна' });
  if (me.uid === targetUid) {
    return res.status(400).json({ error: 'Өөрийгөө устгах боломжгүй' });
  }

  /* 2. Серверийн эрх */
  const token = await adminToken();
  if (!token) {
    return res.status(503).json({
      error: 'Серверийн эрх тохируулаагүй байна. Vercel дээр FB_SA_EMAIL, FB_SA_KEY нэмнэ үү.',
      notConfigured: true
    });
  }

  /* 3. Дуудагч ҮНЭХЭЭР админ эсэх */
  if (!(await isAdmin(me.uid, token))) {
    return res.status(403).json({ error: 'Зөвхөн админ устгах эрхтэй' });
  }

  /* 4. Auth данс устгах (байхгүй байсан ч алдаа гэж үзэхгүй) */
  let authDeleted = false, authNote = '';
  try {
    const r = await fetch(
      'https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:delete',
      { method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: targetUid }) });
    authDeleted = r.ok;
    if (!r.ok) {
      const t = (await r.text()).slice(0, 200);
      authNote = /USER_NOT_FOUND/.test(t) ? 'Auth данс аль хэдийн байхгүй' : t;
      if (/USER_NOT_FOUND/.test(t)) authDeleted = true;   // үр дүн нь ижил
    }
  } catch (e) { authNote = String(e.message || e).slice(0, 150); }

  /* 5. Firestore баримт устгах */
  let docDeleted = false;
  try {
    const r = await fetch(FS + '/users/' + encodeURIComponent(targetUid),
      { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    docDeleted = r.ok;
  } catch (e) {}

  if (!authDeleted && !docDeleted) {
    return res.status(502).json({ error: 'Устгаж чадсангүй. ' + authNote });
  }
  return res.status(200).json({ ok: true, authDeleted, docDeleted, note: authNote });
};
