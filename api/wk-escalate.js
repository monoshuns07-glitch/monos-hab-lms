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
const { sendViaGmail } = require('./_smtp.js');

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
/* Хэнд push хүрснийг БУЦААНА — хүрээгүй хүнд и-мэйлээр нөхнө.
   ⚠ 2026-08-30-нд илэрсэн: ажлын захиалгын сэрэмжлүүлэг авах ёстой
   4 хүний НЭГЭНД Ч push хүрдэггүй байв (3 нь огт бүртгүүлээгүй, 1-ийнх
   нь хуучин түлхүүрт уяатай). Тэд зөвхөн аппын хонх харах боломжтой
   байсан — өөрөөр хэлбэл аппаа нээхгүй бол хугацаа хэтэрсэн ажил
   чимээгүй өнгөрнө. Энэ нь сэрэмжлүүлгийн бүх зорилгыг үгүй хийж байв. */
async function pushTo(uids, msg, vk, subs) {
  const okUids = [];
  if (!vk || !uids.length) return { sent: 0, okUids: okUids };
  const targets = subs.filter(x => x && x.endpoint && x.keys && !x.dead && uids.indexOf(x.uid) >= 0);
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
      if (r.status >= 200 && r.status < 300) { sent++; okUids.push(rec.uid); }
    } catch (e) {}
  }
  return { sent: sent, okUids: okUids };
}

/* Push хүрээгүй хүнд сэрэмжлүүлгийг И-МЭЙЛЭЭР хүргэнэ */
async function mailTo(email, title, body) {
  const user = process.env.GMAIL_USER || '';
  const pass = process.env.GMAIL_APP_PASSWORD || '';
  if (!user || !pass || !email) return false;
  const link = 'https://monos-hab.vercel.app' + KPI_URL;
  const html =
    '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;' +
    'padding:22px;color:#0F1117">' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:8px">' + title + '</div>' +
    '<div style="font-size:14px;color:#475569;line-height:1.65;margin-bottom:18px">' + body + '</div>' +
    '<a href="' + link + '" style="display:inline-block;background:#0F1117;color:#fff;' +
    'text-decoration:none;border-radius:10px;padding:12px 22px;font-weight:700;' +
    'font-size:14px">Ажлын захиалгыг нээх</a>' +
    '<div style="font-size:12px;color:#94A3B8;margin-top:22px;line-height:1.6">' +
    'Утсандаа мэдэгдэл авмаар байвал аппын Тохиргооноос «Сануулга» асаана уу.' +
    '</div></div>';
  try {
    await sendViaGmail({ user: user, pass: pass, to: email,
      fromName: process.env.OTP_FROM_NAME || 'Монос Хүнс — ХАБЭА',
      subject: title, html: html,
      text: title + String.fromCharCode(10) + body + String.fromCharCode(10) + link });
    return true;
  } catch (e) { return false; }
}

function hoursText(h) {
  h = Math.round(h);
  if (h < 24) return h + ' цаг';
  const d = Math.floor(h / 24), r = h % 24;
  return d + ' хоног' + (r ? ' ' + r + ' цаг' : '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  /* ⚠⚠ АЮУЛГҮЙ БАЙДЛЫН ЗАСВАР (2026-08-29).
     ӨМНӨ НЬ: `isCron = !cs || ...` буюу CRON_SECRET тохируулаагүй бол
     ХЭН Ч энэ цэгийг дуудаж, ажилтнууд руу мэдэгдэл/push илгээж чаддаг
     байв. Бодитоор шалгахад эрхгүй POST → 200 буцааж байсан.
     ОДОО: нууц үг тохируулаагүй бол ажиллуулахгүй (fail-closed).

     ⚠ Мөн `dry` нь ЗӨВХӨН URL-ээс уншигддаг байсан тул {"dry":true} гэж
     биед явуулбал ЖИНХЭНЭЭР ажиллаж, санамсаргүй мэдэгдэл илгээдэг байв.
     Одоо биеэс ч уншина. */
  const cs = process.env.CRON_SECRET || '';
  const auth = String(req.headers.authorization || '');
  const isCron = !!cs && auth === 'Bearer ' + cs;
  let body = {};
  try {
    if (req.body && typeof req.body === 'object') body = req.body;
    else if (typeof req.body === 'string') body = JSON.parse(req.body || '{}');
  } catch (e) { body = {}; }
  const dry = String((req.query && req.query.dry) || '') === '1' || body.dry === true;
  if (!isCron && !dry) {
    return res.status(401).json({ ok: false,
      error: cs ? 'Зөвшөөрөлгүй' : 'CRON_SECRET тохируулаагүй байна — Vercel дээр нэмнэ үү',
      notConfigured: !cs });
  }
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
    /* ⚠ ОНООЛТ нь сэрэмжлүүлэгээс ТУСДАА. esc.due аль хэдийн
       илгээгдсэн хуучин ажлууд ч эзэнгүй хэвээр байж болно
       (бодит датанд 8 хоног хэвтсэн ажил байсан). */
    if (pct >= 1 && !claimed && !r.autoAssign && (r.leads || []).length)
      jobs.push({ r: r, k: 'assign' });
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
    } else if (j.k === 'assign') {
      const lead1 = (r.leads || [])[0];
      r.autoAssign = { uid: lead1.uid, name: lead1.name || '', at: stamp };
      to = [lead1];
      title = '📌 Хугацаа хэтэрсэн ажил танд автоматаар оноогдлоо — ' + (r.gateAb || '');
    } else if (j.k === 'due') {
      to = r.leads || [];
      /* ⚠ ХУГАЦАА ДУУСААД ХЭН Ч АВААГҮЙ бол ажил ЭЗЭНГҮЙ үлдэхгүй —
         албаны дарга дээр АВТОМАТААР онооно. Бодит датанд 8 хоног хэн ч
         аваагүй ажил хэвтэж байсан: сэрэмжлүүлэг гурвуулаа илгээгдсэн ч
         хүлээж авах нь сайн дурын байсан тул хэн ч хариуцахгүй өнгөрдөг
         байв (2026-08-29). Дарга дараа нь өөр хүнд шилжүүлж болно.
         ⚠ Энэ серверт Firebase түлхүүр БАЙХГҮЙ тул шууд бичихгүй —
         тольд тэмдэглэнэ, хөтөч дараагийн ачаалалтад Firestore руу
         буулгана (esc тэмдгүүдтэй яг ижил механизм). */
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

  let pushed = 0, mailed = 0, note = '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  /* uid → и-мэйл (нөхөж илгээхэд) */
  const mailOf = {};
  try {
    const emp = await getJson('employees/all.json');
    ((emp && (emp.rows || emp.employees)) || []).forEach(function (e) {
      if (e && e.uid && e.email) mailOf[e.uid] = String(e.email).trim();
    });
  } catch (e) {}

  let subs = [];
  let vk = null;
  if (priv) {
    try {
      vk = vapidKeys(priv);
      const sf = await getJson(SUBS_KEY);
      subs = (sf && Array.isArray(sf.list)) ? sf.list : [];
    } catch (e) { note = e.message; }
  } else {
    note = 'VAPID_PRIVATE_KEY тохируулаагүй';
  }

  /* Хуурай горим: ХЭНД, ЯМАР СУВГААР хүрэхийг илгээхгүйгээр харуулна */
  if (dry) {
    const canPush = {};
    subs.forEach(function (x) { if (x && x.endpoint && x.keys && !x.dead) canPush[x.uid] = 1; });
    return res.status(200).json({ ok: true, dry: true, rows: rows.length,
      would: out.map(function (o) {
        return { id: o.id, k: o.k, title: o.title,
          push: o.uids.filter(function (u) { return canPush[u]; }),
          mail: o.uids.filter(function (u) { return !canPush[u] && mailOf[u]; }),
          none: o.uids.filter(function (u) { return !canPush[u] && !mailOf[u]; }) };
      }) });
  }

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

  /* ② Push, дараа нь хүрээгүй хүнд И-МЭЙЛ */

  /* Нэг хүнд нэг сэрэмжлүүлгээр НЭГ л и-мэйл — давхардуулахгүй */
  const mailedTo = {};
  for (const o of out) {
    let okUids = [];
    if (vk) {
      const r = await pushTo(o.uids, { title: o.title, body: o.body, url: KPI_URL, tag: 'monos-wk' }, vk, subs);
      pushed += r.sent; okUids = r.okUids;
    }
    /* ⭐ Мэдэгдэл хүрээгүй хүн бүрд и-мэйлээр очно. Аппын хонх нь
       ажилтан аппаа нээхээс нааш харагдахгүй тул ганцаараа хангалтгүй. */
    for (const uid of o.uids) {
      if (okUids.indexOf(uid) >= 0) continue;
      const key = uid + '|' + o.id + '|' + o.k;
      if (mailedTo[key]) continue;
      mailedTo[key] = 1;
      if (await mailTo(mailOf[uid], o.title, o.body)) mailed++;
    }
  }

  /* ③ Тэмдгийг тольд бичнэ */
  const mirOk = await putJson(OPEN_KEY, { updatedAt: stamp, by: 'cron', list: rows });

  return res.status(200).json({
    ok: true, rows: rows.length, sent: out.length,
    bell: ntfOk, push: pushed, mailed: mailed, mirror: mirOk, note: note,
    items: out.map(function (o) { return { id: o.id, k: o.k, to: o.uids.length, title: o.title }; })
  });
};
