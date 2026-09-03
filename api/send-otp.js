/* ══════════════════════════════════════════════════════════════
   И-МЭЙЛЭЭР НЭГ УДААГИЙН БАТАЛГААЖУУЛАХ КОД ИЛГЭЭХ
   ──────────────────────────────────────────────────────────────
   POST /api/send-otp/   { email, name, examTitle, origin }
   → 6 оронтой код үүсгэж, и-мэйлээр илгээнэ
   → Firestore-д зөвхөн код-ын HASH-ийг хадгална (кодыг өөрийг нь биш)
   → { ok:true, id } буцаана. Код нь зөвхөн и-мэйлд очно.

   Тохируулах орчны хувьсагч (Vercel → Settings → Environment Variables):
     BREVO_API_KEY   — Brevo (өдөрт 300 и-мэйл үнэгүй)   ← аль нэгийг
     RESEND_API_KEY  — Resend (сард 3000 и-мэйл үнэгүй)  ← сонгоно
     OTP_FROM        — илгээгчийн хаяг (жишээ: habea@monos.mn)
     OTP_FROM_NAME   — илгээгчийн нэр (жишээ: Монос Хүнс ХАБЭА)

   ⚠ SPAM-ААС СЭРГИЙЛЭХ: энгийн бичвэр хувилбар (textContent) заавал
   явуулна, холбоосыг цөөлнө, кодыг гарчигт бичнэ — Junk хавтаст орсон ч
   ажилтан кодыг гарчигнаас шууд уншиж чадна.
   ══════════════════════════════════════════════════════════════ */

const FB_PROJECT = 'habea-shalgalt';
const FB_KEY = 'AIzaSyBRaHjzrEedBZc1Z5zNnJuJvLboKwKed2E';
const FS = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;
const TTL_MIN = 10;

function rnd(n) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Энгийн бичвэр хувилбар — spam оноог мэдэгдэхүйц бууруулна */
function mailText(code, name, examTitle, link) {
  return 'Монос Хүнс ХХК - ХАБЭА шалгалтын баталгаажуулалт\n\n'
    + 'Сайн байна уу, ' + (name || 'ажилтан') + '!\n\n'
    + (examTitle ? examTitle + '\n\n' : '')
    + 'ТАНЫ БАТАЛГААЖУУЛАХ КОД:  ' + code + '\n\n'
    + 'Шалгалтын хуудсан дээрх 6 нүдэнд энэ кодыг оруулна уу.\n'
    + 'Код ' + TTL_MIN + ' минут хүчинтэй, нэг удаа ашиглагдана.\n\n'
    + 'Эсвэл доорх хаягаар орж шууд баталгаажуулж болно:\n' + link + '\n\n'
    + 'Хэрэв та шалгалт өгөөгүй бол энэ захидлыг үл тоомсорлоно уу.\n';
}

function mailHtml(code, name, examTitle, link) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F4F6FB">
<div style="font-family:Arial,Helvetica,sans-serif;background:#F4F6FB;padding:24px 14px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #E2E8F0">
    <div style="padding:20px 24px;border-bottom:3px solid #4F46E5">
      <div style="font-size:12px;letter-spacing:2px;color:#64748B">МОНОС ХҮНС ХХК</div>
      <div style="font-size:19px;font-weight:bold;color:#0F172A;margin-top:4px">ХАБЭА шалгалтын баталгаажуулалт</div>
    </div>
    <div style="padding:24px">
      <p style="font-size:15px;color:#1E293B;margin:0 0 6px">Сайн байна уу, <b>${esc(name || 'ажилтан')}</b>!</p>
      ${examTitle ? `<p style="font-size:14px;color:#475569;margin:0 0 18px">${esc(examTitle)}</p>` : ''}
      <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 10px">Таны баталгаажуулах код:</p>
      <div style="text-align:center;font-size:38px;font-weight:bold;letter-spacing:10px;color:#4F46E5;background:#EEF2FF;border-radius:10px;padding:18px 0 18px 10px;margin:0 0 18px">${esc(code)}</div>
      <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px">
        Шалгалтын хуудсан дээрх <b>6 нүдэнд</b> энэ кодыг оруулна уу.
        Код <b>${TTL_MIN} минут</b> хүчинтэй, нэг удаа ашиглагдана.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px">
        <tr><td align="center">
          <a href="${esc(link)}" style="display:inline-block;background:#4F46E5;color:#ffffff;text-decoration:none;font-size:17px;font-weight:bold;padding:16px 40px;border-radius:10px;font-family:Arial,Helvetica,sans-serif">✅ Баталгаажуулах</a>
        </td></tr>
      </table>
      <p style="font-size:13px;color:#64748B;line-height:1.6;margin:0 0 18px;text-align:center">
        Энэ товчийг дарвал <b>код бичих шаардлагагүй</b> — шалгалтын хуудас өөрөө үргэлжилнэ.
      </p>
      <p style="font-size:12px;color:#94A3B8;line-height:1.6;margin:0;border-top:1px solid #E2E8F0;padding-top:14px">
        Хэрэв та шалгалт өгөөгүй бол энэ захидлыг үл тоомсорлоно уу.
      </p>
    </div>
  </div>
</div>
</body></html>`;
}

async function sendMail(to, subject, html, text) {
  const fromMail = process.env.OTP_FROM || 'no-reply@monos-hab.vercel.app';
  const fromName = process.env.OTP_FROM_NAME || 'Монос Хүнс ХАБЭА';

  /* ① GMAIL — хамгийн сайн хүргэлт (Outlook итгэдэг, Junk-д ордоггүй).
        Алдвал доорх Brevo руу автоматаар шилжинэ. */
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const { sendViaGmail } = require('./_smtp.js');
      await sendViaGmail({
        user: process.env.GMAIL_USER,
        pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, ''),
        fromName, to, subject, text, html
      });
      return 'gmail';
    } catch (e) {
      console.error('[OTP] Gmail SMTP амжилтгүй, Brevo руу шилжиж байна:', e && e.message);
    }
  }

  if (process.env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: fromMail, name: fromName },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
        tags: ['habea-otp'],
        headers: { 'X-Mailin-Tag': 'habea-otp', 'X-Auto-Response-Suppress': 'All' }
      })
    });
    if (!r.ok) throw new Error('Brevo: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return 'brevo';
  }
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromMail}>`, to: [to], subject, html, text })
    });
    if (!r.ok) throw new Error('Resend: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return 'resend';
  }
  throw new Error('NO_PROVIDER');
}

/* ── Нэвтэрсэн хэрэглэгчийг таних ───────────────────────────────────
   ⚠ ЗӨВХӨН код авах хэсэгт хэрэглэнэ. Ажилтан аль хэдийн сайтдаа
   нэвтэрсэн байдаг тул кодыг и-мэйлээр 2-3 минут хүлээхийн оронд
   аппаараа шууд авах боломж олгоно. Бусад бүх зүйл (зөвшөөрөл,
   гарын үсэг, дүн бүртгэх) ЯГ ХЭВЭЭР. */
const _crypto = require('crypto');
const FB_WEB_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';
/* Шалгалтын хуудсаас ирсэн богино эрх (file-token kind:'otp') зөв эсэх.
   Аппын таб амьд байхыг шаардахгүй — утсан дээр найдвартай. */
function otpGrantOk(email, token, exp) {
  try {
    const secret = process.env.SIGN_SECRET || '';
    if (!secret || !token || !exp) return false;
    if (Number(exp) < Date.now()) return false;
    const c = require('crypto');
    const want = c.createHmac('sha256', secret)
      .update('otp|' + email + '|' + String(exp), 'utf8').digest('hex');
    const a = Buffer.from(String(token)), b = Buffer.from(want);
    return a.length === b.length && c.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

async function whoIs(idToken) {
  if (!idToken || String(idToken).length < 40) return null;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_WEB_KEY,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken }) });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId || u.disabled === true) return null;
    return { uid: u.localId, email: String(u.email || '').toLowerCase().trim() };
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'И-мэйл хаяг буруу байна' });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const id = rnd(28);
    const hash = await sha256Hex(code + '|' + id + '|' + email);
    const expires = new Date(Date.now() + TTL_MIN * 60000).toISOString();

    // Firestore-д зөвхөн hash — кодыг өөрийг нь ХАДГАЛАХГҮЙ
    const doc = {
      fields: {
        email: { stringValue: email },
        hash: { stringValue: hash },
        expiresAt: { stringValue: expires },
        verified: { booleanValue: false },
        used: { booleanValue: false },
        createdAt: { stringValue: new Date().toISOString() }
      }
    };
    const fr = await fetch(`${FS}/habea_otp?documentId=${id}&key=${FB_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc)
    });
    if (!fr.ok) throw new Error('Firestore: ' + fr.status + ' ' + (await fr.text()).slice(0, 200));

    const origin = String(body.origin || 'https://monos-hab.vercel.app').replace(/\/+$/, '');
    const link = `${origin}/otp.html?id=${encodeURIComponent(id)}&c=${encodeURIComponent(code)}`;
    const subject = 'Баталгаажуулах код ' + code + ' — ХАБЭА шалгалт';

    /* ⚡ АППААР АВАХ: хүсэлт нэвтэрсэн ажилтнаас өөрөөс нь ирсэн бөгөөд
       и-мэйл нь таарч байвал кодыг ШУУД буцаана — и-мэйл илгээхгүй.
       Код өөрөө хэвээр: нэг удаагийн, хугацаатай, hash-аар шалгагдана. */
    if (String(body.channel || '') === 'app') {
      /* 1) Богино эрх (URL-аар ирсэн) — аппын таб хэрэггүй */
      if (otpGrantOk(email, body.vt, body.vexp)) {
        return res.status(200).json({ ok: true, id, ttl: TTL_MIN, code, channel: 'app' });
      }
      /* 2) Эсвэл нэвтэрсэн аппаас шууд ирсэн бол */
      const who = await whoIs(body.idToken);
      if (who && who.email && who.email === email) {
        return res.status(200).json({ ok: true, id, ttl: TTL_MIN, code, channel: 'app' });
      }
      /* ⚠ noMail: аппын зам бүтээгүй ч и-мэйл рүү ХЭЗЭЭ Ч явуулахгүй (нэг удаагийн
         ажлын танилцалт — код зөвхөн дэлгэцэнд гарна, 2026-09-03) */
      if (body.noMail) {
        return res.status(403).json({ ok: false, error: 'Нэвтрэлт баталгаажсангүй — код зөвхөн аппын дотор гардаг. Хуудсыг дахин ачаалаад оролдоно уу.' });
      }
      /* Таниагүй бол доош үргэлжилж, хуучин ёсоор и-мэйлээр явна */
    }

    let provider = '';
    try {
      provider = await sendMail(email, subject,
        mailHtml(code, body.name, body.examTitle, link),
        mailText(code, body.name, body.examTitle, link));
    } catch (e) {
      if (String(e.message).indexOf('NO_PROVIDER') >= 0) {
        return res.status(503).json({ error: 'И-мэйл илгээгч тохируулаагүй байна. Vercel дээр BREVO_API_KEY эсвэл RESEND_API_KEY нэмнэ үү.', id });
      }
      return res.status(502).json({ error: 'И-мэйл илгээж чадсангүй: ' + e.message, id });
    }

    return res.status(200).json({ ok: true, id, ttl: TTL_MIN, provider });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
