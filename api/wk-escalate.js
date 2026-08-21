/* ============================================================================
   /api/wk-escalate  —  WORK ORDER-ИЙН ХУГАЦААНЫ ШАТЛАН СЭРЭМЖЛҮҮЛЭГ (сервер)
   ----------------------------------------------------------------------------
   ⚠ ЯАГААД ХЭРЭГТЭЙ ВЭ: өмнө нь сэрэмжлүүлэг зөвхөн ХАБЭА/ИТА/админы хөтөч
   Work order цэсийг НЭЭХЭД ажилладаг байв. Хэн ч нээхгүй өдөр хугацаа
   хэтэрсэн ажил чимээгүй өнгөрдөг байсан. Одоо сервер өөрөө шалгана.

   ⚠ ЯАГААД FIRESTORE-ООС ШУУД УНШИХГҮЙ ВЭ: энэ серверт Firebase-ийн админ
   түлхүүр БАЙХГҮЙ (зориуд — repo нь нийтийн). Тиймээс хөтөч нээлттэй
   ажлуудын ХУРААНГУЙГ R2 дээрх workflow/_open.json руу толь болгон бичдэг
   (клиент дээр wkMirrorPush). Энэ функц тэр тольноос уншина.

   Урсгал:
     1. workflow/_open.json  ->  нээлттэй ажлууд + хүлээн авагчид
     2. Босго давсан бөгөөд ХАРААХАН илгээгээгүйг ялгана
     3. notify/_all.json руу мэдэгдэл нэмнэ (аппын хонх — VAPID шаардахгүй)
     4. Боломжтой бол push илгээнэ (VAPID_PRIVATE_KEY тохируулсан үед)
     5. Илгээсэн тэмдгийг _open.json-д бичнэ -> давхар илгээхгүй
        (хөтөч дараагийн удаа тэр тэмдгийг Firestore рүү буулгана)

   Босго (клиентийн wkEscalate-тай ЯГ ИЖИЛ байх ёстой):
     25%  хэн ч аваагүй    -> албаны дарга(нар)
     50%  (авсан үед)      -> хүлээж авсан ажилтан
     100% хугацаа дуусав   -> албаны дарга(нар)
     200% 2 дахин хэтэрлээ -> үйлдвэрлэл эрхэлсэн захирал

   Env: SIGN_SECRET (заавал) · VAPID_PRIVATE_KEY (сайн дурын) · CRON_SECRET
   Гараар шалгах: /api/wk-escalate/?dry=1  (юу ч илгээхгүй, зөвхөн харуулна)
   ========================================================================== */
const crypto = require('crypto');

const R2 = 'https://monos-upload.buynt666.workers.dev';
const OPEN_KEY = 'workflow/_open.json';
const NTF_KEY = 'notify/_all.json';
const SUBS_KEY = 'push/subs.json';
const VAPID_SUB = 'mailto:buynt666@gmail.com';
const KPI_URL = '/kpi/?page=reportflow';

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const hkdf = (salt, ikm, info, len) => hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).slice(0, len);

/* R2 бичих эрх — file-token.js-тэй ЯГ ИЖИЛ томьёо */
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
async function getJson(key) {
  try {
    const r = await fetch(R2 + '/' + key + '?t=' + Date.now(), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}
async function putJson(key, obj) {
  const h = upHeaders(key);
  if (!h) return false;
  try {
    const r = await fetch(R2 + '/' + key, { method: 'PUT', headers: h, body: JSON.stringify(obj) });
    return r.ok;
  } catch (e) { return false; }
}

/* ── Web Push — push-now.js-ийн адил ── */
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
async function pushTo(uids, msg, vk, subs) {
  if (!vk || !uids.length) return 0;
  const targets = subs.filter(x => x && x.endpoint && x.keys && uids.indexOf(x.uid) >= 0);
  let sent = 0;
  for (const rec of targets) {
    try {
      const r = await fetch(rec.endpoint, {
        method: 'POST',
        headers: {
          Authorization: vapidHeader(new URL(rec.endpoint).origin, vk),
          'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
          TTL: '86400', Urgency: 'high'
        },
        body: encryptPayload(rec.keys.p256dh, rec.keys.auth, JSON.stringify(msg))
      });
      if (r.status >= 200 && r.status < 300) sent++;
    } catch (e) {}
  }
  return sent;
}

function hoursText(h) {
  h = Math.round(h);
  if (h < 24) return h + ' цаг';
  const d = Math.floor(h / 24), r = h % 24;
  return d + ' хоног' + (r ? ' ' + r + ' цаг' : '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const cs = process.env.CRON_SECRET || '';
  const auth = String(req.headers.authorization || '');
  const isCron = !cs || auth === 'Bearer ' + cs;
  const dry = String((req.query && req.query.dry) || '') === '1';
  if (!isCron && !dry) return res.status(401).json({ ok: false, error: 'Зөвшөөрөлгүй' });
  if (!process.env.SIGN_SECRET) {
    return res.status(503).json({ ok: false, error: 'SIGN_SECRET тохируулаагүй', notConfigured: true });
  }

  const mirror = await getJson(OPEN_KEY);
  const rows = (mirror && Array.isArray(mirror.list)) ? mirror.list : [];
  if (!rows.length) {
    return res.status(200).json({ ok: true, rows: 0, note: 'толь хоосон — хөтөч хараахан бичээгүй' });
  }

  const now = Date.now();
  const jobs = [];
  for (const r of rows) {
    if (!r || !r.id || r.closed) continue;
    const hrs = Number(r.hours || 0);
    if (!hrs || !r.createdAt) continue;
    const pct = (now - new Date(r.createdAt).getTime()) / (hrs * 3600000);
    const claimed = !!r.claimUid;
    if (!r.esc) r.esc = {};
    const e = r.esc;
    if (!claimed && pct >= 0.25 && !e.noclaim) jobs.push({ r: r, k: 'noclaim' });
    if (claimed && pct >= 0.5 && pct < 1 && !e.half) jobs.push({ r: r, k: 'half' });
    if (pct >= 1 && !e.due) jobs.push({ r: r, k: 'due' });
    if (pct >= 2 && !e.late2) jobs.push({ r: r, k: 'late2' });
  }
  if (!jobs.length) {
    return res.status(200).json({ ok: true, rows: rows.length, sent: 0, note: 'босго давсан зүйл алга' });
  }

  const stamp = new Date().toISOString();
  const out = [];
  for (const j of jobs.slice(0, 40)) {
    const r = j.r;
    const body = (r.kindAb || 'Аюул') + ' · ' + (r.loc || '') + ' — ' + String(r.desc || '').slice(0, 90);
    let to = [], title = '';
    if (j.k === 'noclaim') {
      to = r.leads || [];
      title = '⚠ ХЭН Ч АВААГҮЙ ' + hoursText(Math.max(0, (now - new Date(r.createdAt).getTime()) / 3600000)) +
        ' — ' + (r.gateAb || '') + ' (зэрэг ' + (r.urg || 3) + ')';
      r.esc.noclaim = stamp;
    } else if (j.k === 'half') {
      to = r.claimer ? [r.claimer] : [];
      const left = Math.max(0, (new Date(r.createdAt).getTime() + Number(r.hours) * 3600000 - now) / 3600000);
      title = '⏳ Хугацааны тал өнгөрлөө — ' + hoursText(left) + ' үлдсэн';
      r.esc.half = stamp;
    } else if (j.k === 'due') {
      to = r.leads || [];
      title = '🔴 ХУГАЦАА ДУУСЛАА — ' + (r.gateAb || '') +
        ' (' + ((r.claimer && r.claimer.name) || 'хэн ч аваагүй') + ')';
      r.esc.due = stamp;
    } else {
      to = r.director ? [r.director] : [];
      title = '🚨 ХУГАЦАА 2 ДАХИН ХЭТЭРЛЭЭ — ' + (r.gateAb || '');
      r.esc.late2 = stamp;
    }
    const uids = [];
    (to || []).forEach(function (x) { if (x && x.uid && uids.indexOf(x.uid) < 0) uids.push(x.uid); });
    if (uids.length) out.push({ uids: uids, title: title, body: body, id: r.id, k: j.k });
  }

  if (dry) return res.status(200).json({ ok: true, dry: true, rows: rows.length, would: out });

  /* ① Аппын хонх — НЭГ удаа бичнэ (зэрэг бичвэл бие биенээ дарна) */
  const ntf = await getJson(NTF_KEY);
  const list = (ntf && Array.isArray(ntf.list)) ? ntf.list : [];
  for (const o of out) {
    list.push({
      id: 'N-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: stamp, to: o.uids, byUid: '', byName: 'Систем',
      kind: 'wk', title: o.title, body: o.body, url: KPI_URL, riskId: '', read: {}
    });
  }
  const ntfOk = await putJson(NTF_KEY, { updatedAt: stamp, list: list.slice(-800) });

  /* ② Push */
  let pushed = 0, note = '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  if (priv) {
    try {
      const vk = vapidKeys(priv);
      const sf = await getJson(SUBS_KEY);
      const subs = (sf && Array.isArray(sf.list)) ? sf.list : [];
      for (const o of out) {
        pushed += await pushTo(o.uids, { title: o.title, body: o.body, url: KPI_URL, tag: 'monos-wk' }, vk, subs);
      }
    } catch (e) { note = e.message; }
  } else {
    note = 'VAPID_PRIVATE_KEY тохируулаагүй — зөвхөн аппын хонхонд очлоо';
  }

  /* ③ Тэмдгийг тольд бичнэ */
  const mirOk = await putJson(OPEN_KEY, { updatedAt: stamp, by: 'cron', list: rows });

  return res.status(200).json({
    ok: true, rows: rows.length, sent: out.length,
    bell: ntfOk, push: pushed, mirror: mirOk, note: note,
    items: out.map(function (o) { return { id: o.id, k: o.k, to: o.uids.length, title: o.title }; })
  });
};
