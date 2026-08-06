/* ══════════════════════════════════════════════════════════════
   И-МЭЙЛЭЭР НЭГ УДААГИЙН БАТАЛГААЖУУЛАХ КОД ИЛГЭЭХ
   ──────────────────────────────────────────────────────────────
   POST /api/send-otp   { email, name, examTitle, origin }
   → 6 оронтой код үүсгэж, и-мэйлээр илгээнэ
   → Firestore-д зөвхөн код-ын HASH-ийг хадгална (кодыг өөрийг нь биш)
   → { ok:true, id } буцаана. Код нь зөвхөн и-мэйлд очно.

   Тохируулах орчны хувьсагч (Vercel → Settings → Environment Variables):
     BREVO_API_KEY   — Brevo (өдөрт 300 и-мэйл үнэгүй)   ← аль нэгийг
     RESEND_API_KEY  — Resend (сард 3000 и-мэйл үнэгүй)  ← сонгоно
     OTP_FROM        — илгээгчийн хаяг (жишээ: habea@monos.mn)
     OTP_FROM_NAME   — илгээгчийн нэр (жишээ: Монос Хүнс ХАБЭА)
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

function mailHtml(code, name, examTitle, link) {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;background:#F4F6FB;padding:26px 14px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.10)">
    <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:22px 26px;color:#fff">
      <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.85">Монос Хүнс ХХК</div>
      <div style="font-size:20px;font-weight:800;margin-top:4px">ХАБЭА шалгалтын баталгаажуулалт</div>
    </div>
    <div style="padding:26px">
      <p style="font-size:15px;color:#1E293B;margin:0 0 6px">Сайн байна уу, <b>${esc(name || 'ажилтан')}</b>!</p>
      <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px">
        <b>${esc(examTitle || 'ХАБЭА шалгалт')}</b>-ыг баталгаажуулахын тулд доорх товчийг дарна уу.
        Товч дарахад шалгалтын хуудас <b>өөрөө үргэлжилнэ</b> — код бичих шаардлагагүй.
      </p>
      <div style="text-align:center;margin:0 0 22px">
        <a href="${esc(link)}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;font-size:16px;font-weight:800;padding:15px 34px;border-radius:12px">✅ Баталгаажуулах</a>
      </div>
      <div style="border-top:1px solid #E2E8F0;padding-top:18px">
        <p style="font-size:13px;color:#64748B;margin:0 0 8px">Товч ажиллахгүй бол энэ кодыг гараар оруулна уу:</p>
        <div style="text-align:center;font-size:34px;font-weight:900;letter-spacing:.42em;color:#4F46E5;font-family:Consolas,monospace;background:#EEF2FF;border-radius:12px;padding:14px 0 14px 14px">${esc(code)}</div>
      </div>
      <p style="font-size:12px;color:#94A3B8;line-height:1.6;margin:18px 0 0">
        Код <b>${TTL_MIN} минут</b> хүчинтэй, нэг удаа ашиглагдана.<br>
        Хэрэв та шалгалт өгөөгүй бол энэ захидлыг үл тоомсорлоно уу.
      </p>
    </div>
  </div>
</div>`;
}

async function sendMail(to, subject, html) {
  const fromMail = process.env.OTP_FROM || 'no-reply@monos-hab.vercel.app';
  const fromName = process.env.OTP_FROM_NAME || 'Монос Хүнс ХАБЭА';

  if (process.env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { email: fromMail, name: fromName }, to: [{ email: to }], subject, htmlContent: html })
    });
    if (!r.ok) throw new Error('Brevo: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return 'brevo';
  }
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromMail}>`, to: [to], subject, html })
    });
    if (!r.ok) throw new Error('Resend: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return 'resend';
  }
  throw new Error('NO_PROVIDER');
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

    let provider = '';
    try {
      provider = await sendMail(email, 'ХАБЭА шалгалт — баталгаажуулах код: ' + code,
        mailHtml(code, body.name, body.examTitle, link));
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
