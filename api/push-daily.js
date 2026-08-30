/* ============================================================================
   /api/push-daily  —  ӨДӨР ТУТМЫН PUSH САНУУЛГА
   ----------------------------------------------------------------------------
   Зорилго: ажилтан вэб сайтыг ХААСАН байсан ч хугацаатай арга хэмжээгээ
   мартахгүй байх. Vercel-ийн cron өдөрт нэг удаа энэ хаягийг дууддаг.

   Урсгал:
     1. R2 дээрх push/subs.json-ыг уншина
        (клиент өөрөө бичдэг: { uid, endpoint, keys, late, pending, ackDue })
     2. Хийх юм байгаа хүн бүрд Web Push (RFC 8291) илгээнэ
     3. Хүчингүй болсон бүртгэлийг (404/410) файлаас хаяна
     4. Тухайн өдөр илгээснийг тэмдэглэж, давхар сануулахаас сэргийлнэ

   Vercel → Settings → Environment Variables:
     VAPID_PRIVATE_KEY  = (заавал) 32 байт EC P-256 нууц түлхүүр, base64url
     VAPID_PUBLIC_KEY   = (сайн дурын) байхгүй бол нууц түлхүүрээс гаргана
     SIGN_SECRET        = (аль хэдийн байгаа) файл бичих гарын үсэгт
     CRON_SECRET        = (сайн дурын) байвал cron-ийн Authorization-ыг шалгана

   Гараар туршихад: POST { idToken, test:1 } → зөвхөн ӨӨРТ нь илгээнэ.
   ========================================================================== */
const crypto = require('crypto');

const R2 = 'https://monos-upload.buynt666.workers.dev';
const { sendViaGmail } = require('./_smtp.js');
const SUBS_KEY = 'push/subs.json';
const NLX = String.fromCharCode(10);
const VAPID_SUB = 'mailto:buynt666@gmail.com';
const KPI_URL = '/kpi/?page=tasks';
const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';

/* ── base64url ── */
function b64u(b) {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s) {
  return Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/* ── HKDF (RFC 5869) — Web Push-д хэрэглэгддэг хэлбэр ── */
function hmac(key, data) { return crypto.createHmac('sha256', key).update(data).digest(); }
function hkdf(salt, ikm, info, len) {
  return hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).slice(0, len);
}

/* ── Агуулгыг шифрлэх: aes128gcm (RFC 8188 + RFC 8291) ──
   fixed нь ЗӨВХӨН тестийн вектор шалгахад хэрэглэгдэнэ. */
function encryptPayload(p256dh, auth, payload, fixed) {
  const ua = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const ecdh = crypto.createECDH('prime256v1');
  if (fixed && fixed.priv) ecdh.setPrivateKey(fixed.priv); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(ua);
  const salt = (fixed && fixed.salt) ? fixed.salt : crypto.randomBytes(16);

  /* IKM нь хүлээн авагч + илгээгчийн нийтийн түлхүүрт холбогдоно */
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), ua, asPub]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

  /* Сүүлийн бичлэгийн хязгаарлагч = 0x02 */
  const rec = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])]);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(rec), c.final(), c.getAuthTag()]);

  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}

/* ── VAPID гарын үсэг (ES256 JWT) ── */
function vapidKeys(privB64) {
  const d = unb64u(privB64);
  if (d.length !== 32) throw new Error('VAPID_PRIVATE_KEY нь 32 байт (43 тэмдэгт base64url) байх ёстой');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey();
  const key = crypto.createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)) }
  });
  return { key: key, pub: b64u(pub) };
}
function vapidHeader(aud, vk) {
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const p = b64u(JSON.stringify({
    aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUB
  }));
  /* Push серверүүд DER биш, ЖИНХЭНЭ 64 байт r||s гарын үсэг шаарддаг */
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + p), { key: vk.key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + h + '.' + p + '.' + b64u(sig) + ', k=' + vk.pub;
}

/* ── Нэг төхөөрөмж рүү илгээх ── */
async function sendPush(rec, msg, vk) {
  let origin;
  try { origin = new URL(rec.endpoint).origin; } catch (e) { return 400; }
  const body = encryptPayload(rec.keys.p256dh, rec.keys.auth, JSON.stringify(msg));
  const r = await fetch(rec.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': vapidHeader(origin, vk),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Urgency': 'normal'
    },
    body: body
  });
  return r.status;
}

/* ── R2 (Cloudflare Worker) — унших/бичих ── */
async function r2Get(key) {
  const r = await fetch(R2 + '/' + key + '?t=' + Date.now(), { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('R2 GET ' + r.status);
  return await r.json();
}
async function r2PutJson(key, obj) {
  const secret = process.env.SIGN_SECRET || '';
  if (!secret) return false;                     // бичих эрхгүй — сануулга илгээх нь тасрахгүй
  const exp = String(Date.now() + 10 * 60 * 1000);
  const token = crypto.createHmac('sha256', secret).update('up|' + key + '|' + exp, 'utf8').digest('hex');
  const r = await fetch(R2 + '/' + encodeURIComponent(key), {
    method: 'PUT',
    headers: { 'X-Up': token, 'X-Exp': exp, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  });
  return r.ok;
}

/* ── Улаанбаатарын огноо (UTC+8) ── */
function ubDate() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function ubWeekday() {
  return new Date(Date.now() + 8 * 3600 * 1000).getUTCDay();   // 0=Ням, 1=Даваа
}

/* ── Хэнд, юу гэж сануулах вэ ── */
function messageFor(rec, weekday) {
  const late = +rec.late || 0;
  const pending = +rec.pending || 0;
  const ackDue = +rec.ackDue || 0;
  const reqN = +rec.reqN || 0;

  /* Батлах хүлээгдэж буй хүсэлт нь бусдыг ЗОГСООДОГ тул хамгийн эхэнд */
  if (reqN > 0 && late > 0) {
    return {
      title: '⚠ ' + reqN + ' хүсэлт таны шийдвэрийг хүлээж байна',
      body: 'Хугацаа хэтэрсэн тул KPI-ийн босго онооноос хасагдаж эхэллээ.',
      tag: 'monos-req', url: '/kpi/?page=hazards'
    };
  }
  if (reqN > 0 && (weekday === 1 || weekday === 4)) {
    return {
      title: reqN + ' хүсэлт таны шийдвэрийг хүлээж байна',
      body: 'Ажлын хувцас, хамгаалах хэрэгслийн хүсэлт. Дарж шууд нээнэ.',
      tag: 'monos-req', url: '/kpi/?page=hazards'
    };
  }
  if (late > 0) {
    return {
      title: '⚠ ' + late + ' арга хэмжээ хугацаа хэтэрсэн',
      body: 'Гүйцэтгээд зураг/файлаа хавсаргана уу. Дарж шууд орно.',
      tag: 'monos-late', url: KPI_URL
    };
  }
  if (ackDue) {
    /* Долоо хоногт 2 удаа (Даваа, Пүрэв) — гарын үсэг зурах ээлж болсон хүнд */
    if (weekday === 1 || weekday === 4) {
      return {
        title: 'Эрсдэлтэй танилцах ээлж танд ирлээ',
        body: 'Эрсдэлүүдийг уншиж, гарын үсгээ зурснаар дараагийн хүн үргэлжлүүлнэ.',
        tag: 'monos-ack', url: '/kpi/?page=risks'
      };
    }
    return null;
  }
  if (pending > 0 && weekday === 1) {
    /* Хугацаа хэтрээгүй бол зөвхөн ДАВАА гарагт нэг удаа — хэт их сануулахгүй */
    return {
      title: pending + ' арга хэмжээ хүлээгдэж байна',
      body: 'Хугацаанд нь гүйцэтгээд баримтжуулбал биелсэнд тооцно.',
      tag: 'monos-pending', url: KPI_URL
    };
  }
  return null;
}

/* ── Push хүрэхгүй бол И-МЭЙЛЭЭР нөхнө ─────────────────────────────
   ⚠ 2026-08-30: хоёр ажилтны төхөөрөмж хуучин VAPID түлхүүрт уяатай
   тул push нь 401 болж, сануулга ХЭЗЭЭ Ч хүрдэггүй байв. Төхөөрөмжийг
   сервер талаас засах БОЛОМЖГҮЙ (зөвхөн хөтөч өөрөө дахин бүртгүүлнэ).
   Тиймээс сануулга нь алдагдахгүйн тулд и-мэйлээр давхар илгээнэ.
   Ажилтан аппаа дараа нээхэд клиент өөрөө бүртгэлээ шинэчилнэ. */
async function mailFallback(email, msg) {
  const user = process.env.GMAIL_USER || '';
  const pass = process.env.GMAIL_APP_PASSWORD || '';
  if (!user || !pass || !email) return false;
  const link = 'https://monos-hab.vercel.app' + (msg.url || KPI_URL);
  const html =
    '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;' +
    'padding:22px;color:#0F1117">' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:8px">' + msg.title + '</div>' +
    '<div style="font-size:14px;color:#475569;line-height:1.65;margin-bottom:18px">' +
    msg.body + '</div>' +
    '<a href="' + link + '" style="display:inline-block;background:#0F1117;color:#fff;' +
    'text-decoration:none;border-radius:10px;padding:12px 22px;font-weight:700;' +
    'font-size:14px">Нээх</a>' +
    '<div style="font-size:12px;color:#94A3B8;margin-top:22px;line-height:1.6">' +
    'Энэ сануулга и-мэйлээр ирсэн шалтгаан: таны төхөөрөмжийн мэдэгдэл ' +
    'ажиллахгүй байна. Аппаа нэг удаа нээхэд өөрөө засагдана.</div></div>';
  try {
    await sendViaGmail({ user: user, pass: pass, to: email,
      fromName: process.env.OTP_FROM_NAME || 'Монос Хүнс — ХАБЭА',
      subject: msg.title, html: html, text: msg.title + NLX + msg.body + NLX + link });
    return true;
  } catch (e) { return false; }
}

/* ── Firebase ID token шалгах (гараар туршихад) ── */
async function verifyIdToken(idToken) {
  if (!idToken || idToken.length < 40) return null;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: idToken })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId || u.disabled === true) return null;
    return { uid: u.localId, email: u.email || '' };
  } catch (e) { return null; }
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

  const priv = process.env.VAPID_PRIVATE_KEY || '';
  if (!priv) {
    return res.status(503).json({
      ok: false, error: 'VAPID_PRIVATE_KEY тохируулаагүй байна', notConfigured: true
    });
  }

  /* Хэн дуудаж байна? */
  const body = req.method === 'POST' ? await readBody(req) : {};
  let onlyUid = null;
  let testerMail = '';

  if (body && body.test) {
    const u = await verifyIdToken(body.idToken);
    if (!u) return res.status(401).json({ ok: false, error: 'Нэвтрээгүй байна' });
    onlyUid = u.uid;
    /* Туршилтад push унавал и-мэйл нь ТУРШИГЧ рүү очно — ингэснээр
       нөхөх сувгаа бодитоор шалгаж болно. */
    testerMail = u.email || '';
  } else {
    /* ⚠⚠ АЮУЛГҮЙ БАЙДАЛ (2026-08-29): өмнө нь CRON_SECRET тохируулаагүй
       бол ХЭН Ч энэ цэгийг дуудаж бүх ажилтанд push илгээж чаддаг байв.
       Одоо нууц үг заавал шаардана (fail-closed). */
    const cs = process.env.CRON_SECRET || '';
    if (!cs) {
      return res.status(401).json({ ok: false, notConfigured: true,
        error: 'CRON_SECRET тохируулаагүй байна — Vercel дээр нэмнэ үү' });
    }
    if (cs) {
      const got = String(req.headers.authorization || '');
      if (got !== 'Bearer ' + cs) {
        return res.status(401).json({ ok: false, error: 'Эрх хүрэхгүй' });
      }
    }
  }

  let vk;
  try { vk = vapidKeys(priv); }
  catch (e) { return res.status(500).json({ ok: false, error: e.message }); }

  let file;
  try { file = await r2Get(SUBS_KEY); }
  catch (e) { return res.status(502).json({ ok: false, error: 'Бүртгэлийн файлыг уншиж чадсангүй: ' + e.message }); }

  const list = (file && Array.isArray(file.list)) ? file.list : [];
  if (!list.length) {
    return res.status(200).json({ ok: true, total: 0, sent: 0, why: 'Сануулга авах хүн бүртгэгдээгүй байна' });
  }

  const today = ubDate();
  const weekday = ubWeekday();

  /* uid → и-мэйл (push унасан үед нөхөж илгээхэд хэрэгтэй) */
  const mailOf = {};
  try {
    const emp = await r2Get('employees/all.json');
    ((emp && (emp.rows || emp.employees)) || []).forEach(function (e) {
      if (e && e.uid && e.email) mailOf[e.uid] = String(e.email).trim();
    });
  } catch (e) { /* и-мэйл нөхөлтгүйгээр үргэлжилнэ */ }
  let sent = 0, skipped = 0, failed = 0;
  const drop = {};
  let mailed = 0;
  let touched = false;   // бичлэг өөрчлөгдсөн эсэх — файлыг хадгалах эсэхийг шийднэ

  for (const rec of list) {
    if (!rec || !rec.endpoint || !rec.keys || !rec.keys.p256dh || !rec.keys.auth) { skipped++; continue; }
    if (onlyUid && rec.uid !== onlyUid) { skipped++; continue; }

    let msg;
    if (onlyUid) {
      /* Туршилт — юу ч байхгүй байсан ч нэг мэдэгдэл гаргана */
      msg = messageFor(rec, weekday) || {
        title: 'Сануулга ажиллаж байна ✓',
        body: 'Одоогоор хугацаа хэтэрсэн арга хэмжээ байхгүй. Гарвал ингэж мэдэгдэнэ.',
        tag: 'monos-test', url: KPI_URL
      };
    } else {
      if (rec.lp === today) { skipped++; continue; }          // өнөөдөр аль хэдийн сануулсан
      msg = messageFor(rec, weekday);
      if (!msg) { skipped++; continue; }
    }

    let st = 0;
    if (rec.dead && !onlyUid) {
      st = 0;                                   // дахин оролдохгүй — шууд и-мэйл рүү
    } else {
      try { st = await sendPush(rec, msg, vk); }
      catch (e) { st = 0; }
    }

    /* ⭐ Push хүрээгүй бол сануулга алдагдахгүй — и-мэйлээр очно.
       Өдөрт нэг л удаа (rec.lp) тул давхардахгүй. */
    if (!(st >= 200 && st < 300)) {
      var to = mailOf[rec.uid] || (onlyUid ? testerMail : '');
      if (await mailFallback(to, msg)) { mailed++; if (!onlyUid) { rec.lp = today; touched = true; } }
    }
    if (st >= 200 && st < 300) {
      sent++;
      if (!onlyUid) { rec.lp = today; delete rec.err; delete rec.errN; delete rec.errAt; delete rec.dead; touched = true; }
    } else if (st === 404 || st === 410) {
      /* Төхөөрөмж бүртгэлээ цуцалсан. Мөн адил хаяхгүй — и-мэйлээр
         сануулсаар байна. */
      if (!onlyUid) { rec.dead = 1; rec.err = st; rec.errAt = today; touched = true; }
      failed++;
    } else {
      /* ⚠⚠ 2026-08-30: 401/403 нь «түлхүүр таарахгүй» гэсэн үг —
         төхөөрөмж хуучин VAPID түлхүүрээр бүртгүүлсэн. Өмнө нь энэ нь
         зүгээр `failed++` болоод ҮҮРД дахин оролдож, сануулга нь ХЭЗЭЭ Ч
         хүрдэггүй, хэн ч мэддэггүй байв. Одоо тэмдэглэж, 3 удаа дараалан
         унасны дараа хаяна — клиент дараагийн орох үедээ өөрөө
         шинээр бүртгүүлнэ (pushKeyOk). */
      failed++;
      if (!onlyUid) {
        rec.err = st; rec.errAt = today; rec.errN = (rec.errN || 0) + 1;
        /* ⚠ БҮРТГЭЛИЙГ ХАЯХГҮЙ. Хаявал энэ хүн жагсаалтаас гарч,
           и-мэйлээр нөхөх ч боломжгүй болж, БҮР МӨСӨН чимээгүй болно.
           Оронд нь «үхсэн» гэж тэмдэглээд push оролдохоо болино —
           сануулга нь и-мэйлээр үргэлжилнэ. Ажилтан аппаа нээхэд
           клиент энэ бичлэгийг шинэ, ажилладаг бүртгэлээр дарж бичнэ. */
        if (rec.errN >= 3) rec.dead = 1;
        touched = true;
      }
    }
  }

  /* Файлыг шинэчилнэ: хүчингүй бүртгэлийг хаяж, сануулсан огноог тэмдэглэнэ */
  let saved = false;
  if (touched || Object.keys(drop).length) {
    try {
      const next = list.filter(function (x) { return x && !drop[x.endpoint]; });
      saved = await r2PutJson(SUBS_KEY, { updatedAt: new Date().toISOString(), list: next });
    } catch (e) { saved = false; }
  }

  /* ⭐ Work order-ийн хугацааны сэрэмжлүүлгийг МӨН энд дуудна.
     Vercel-ийн үнэгүй багцад cron ажил ХОЁР л байж болно, өдөрт нэг удаа
     ажиллана. Тиймээс өглөө (энэ cron) + өдөр (0 6 * * *) гэж хоёр удаа
     шалгаж чадаж байна. Алдаа гарсан ч энэ хариуг унагаахгүй. */
  let esc = null;
  if (!onlyUid) {
    try {
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const cs2 = process.env.CRON_SECRET || '';
      const r = await fetch('https://' + host + '/api/wk-escalate/', {
        headers: cs2 ? { Authorization: 'Bearer ' + cs2 } : {}
      });
      esc = await r.json().catch(function () { return { ok: false, status: r.status }; });
    } catch (e) { esc = { ok: false, error: String(e.message || e) }; }
  }

  return res.status(200).json({
    ok: true, date: today, weekday: weekday, total: list.length,
    sent: sent, skipped: skipped, failed: failed, mailed: mailed,
    dropped: Object.keys(drop).length, saved: saved,
    wkEscalate: esc,
    why: sent ? '' : 'Сануулах шаардлагатай хүн олдсонгүй'
  });
};

/* Тестэд хэрэглэнэ (Vercel-д нөлөөлөхгүй) */
module.exports._internal = { encryptPayload, vapidKeys, vapidHeader, hkdf, messageFor, b64u, unb64u };
