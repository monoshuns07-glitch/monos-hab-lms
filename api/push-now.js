/* ============================================================================
   /api/push-now  —  ШУУД МЭДЭГДЭЛ (үйл явдал болмогц)
   ----------------------------------------------------------------------------
   Ажилтан арга хэмжээгээ баримтжуулмагц удирдлагад нь ШУУД push очно.
   Өдөр тутмын cron (/api/push-daily) нь сануулга; энэ нь үйл явдлын мэдэгдэл.

   Хамгаалалт:
     · Firebase ID token заавал — нэвтрээгүй хүн мэдэгдэл илгээхгүй
     · Нэг удаад 40 хүртэл хүнд
     · Гарчиг/бичвэрийн урт хязгаартай
   ========================================================================== */
const crypto = require('crypto');

const R2 = 'https://monos-upload.buynt666.workers.dev';
const SUBS_KEY = 'push/subs.json';
const VAPID_SUB = 'mailto:buynt666@gmail.com';
const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const hkdf = (salt, ikm, info, len) => hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).slice(0, len);

function encryptPayload(p256dh, auth, payload) {
  const ua = unb64u(p256dh), authSecret = unb64u(auth);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(ua);
  const salt = crypto.randomBytes(16);
  const ikm = hkdf(authSecret, shared,
    Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), ua, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);
  const rec = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])]);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(rec), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}

function vapidKeys(privB64) {
  const d = unb64u(privB64);
  if (d.length !== 32) throw new Error('VAPID_PRIVATE_KEY буруу');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey();
  const key = crypto.createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)) }
  });
  return { key, pub: b64u(pub) };
}
function vapidHeader(aud, vk) {
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const p = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUB }));
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + p), { key: vk.key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + h + '.' + p + '.' + b64u(sig) + ', k=' + vk.pub;
}

async function verifyIdToken(idToken) {
  if (!idToken || idToken.length < 40) return null;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId || u.disabled === true) return null;
    return { uid: u.localId };
  } catch (e) { return null; }
}

function readBody(req) {
  return new Promise(resolve => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST л хүлээн авна' });

  const priv = process.env.VAPID_PRIVATE_KEY || '';
  if (!priv) return res.status(503).json({ ok: false, error: 'VAPID_PRIVATE_KEY тохируулаагүй', notConfigured: true });

  const body = await readBody(req);
  const me = await verifyIdToken(body.idToken);
  if (!me) return res.status(401).json({ ok: false, error: 'Нэвтрээгүй байна' });

  const to = Array.isArray(body.to) ? body.to.filter(x => typeof x === 'string').slice(0, 40) : [];
  if (!to.length) return res.status(400).json({ ok: false, error: 'Хүлээн авагч дутуу' });

  const msg = {
    title: String(body.title || 'Монос Хүнс — ХАБЭА').slice(0, 90),
    body: String(body.body || '').slice(0, 180),
    url: String(body.url || '/kpi/?page=hazards').slice(0, 120),
    tag: 'monos-ntf'
  };

  let vk;
  try { vk = vapidKeys(priv); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }

  let file = null;
  try {
    const r = await fetch(R2 + '/' + SUBS_KEY + '?t=' + Date.now(), { cache: 'no-store' });
    file = r.ok ? await r.json() : null;
  } catch (e) {}
  const list = (file && Array.isArray(file.list)) ? file.list : [];
  const targets = list.filter(x => x && x.endpoint && x.keys && to.indexOf(x.uid) >= 0);

  let sent = 0, failed = 0;
  for (const rec of targets) {
    try {
      const r = await fetch(rec.endpoint, {
        method: 'POST',
        headers: {
          Authorization: vapidHeader(new URL(rec.endpoint).origin, vk),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: '86400', Urgency: 'high'
        },
        body: encryptPayload(rec.keys.p256dh, rec.keys.auth, JSON.stringify(msg))
      });
      if (r.status >= 200 && r.status < 300) sent++; else failed++;
    } catch (e) { failed++; }
  }

  return res.status(200).json({ ok: true, to: to.length, found: targets.length, sent, failed });
};
