/* ============================================================================
   /api/trn-digest — Сургалтын биелэлтийн сарын тайланг ХАРИУЦАГЧДАД илгээнэ
   ----------------------------------------------------------------------------
   Хэнд очих вэ:
     · Албаны хариуцагч → зөвхөн ӨӨРИЙН албаны тоо
     · Үйлдвэрлэл / Борлуулалт хариуцсан захирал → харьяа албад нь
     · Гүйцэтгэх захирал → бүх алба
   Хариуцагчийг хоёр эх сурвалжаас нэгтгэнэ:
     1. R2 training/owners.json (гараар оноосон)
     2. Ажилтны албан тушаал (/дарга/i, /…хариуцсан захирал/i)

   ⚠ Шалгалтын дүнг habea-shalgalt-аас REST-ээр уншина — SDK нь өөр
     төсөлтэй ажиллахад найдваргүй байсан (2026-08-28).

   Дуудах хоёр арга:
     · Cron    — Authorization: Bearer <CRON_SECRET>
     · Админ   — { idToken } (users/{uid}.role === 'admin')
   { dry: true } өгвөл ЮУ Ч ИЛГЭЭХГҮЙ, зөвхөн хэнд юу очихыг буцаана.
   ========================================================================== */
const { sendViaGmail } = require('./_smtp.js');

const R2 = 'https://monos-upload.buynt666.workers.dev';
const HAB_PROJ = 'habea-shalgalt';
const HAB_KEY = 'AIzaSyBRaHjzrEedBZc1Z5zNnJuJvLboKwKed2E';
const FB_WEB_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';
const PROJECT = process.env.FB_PROJECT_ID || 'monos-hab-system';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const DAVTAN = ['davtan_eeljit', 'davtan_eeljit_bus', 'davtan_odor_tutmiin'];

/* Цалингийн сар: 25-наас дараа сарын 24 хүртэл */
function salaryKey(d) {
  const t = d ? new Date(d) : new Date();
  const y = t.getFullYear(), m = t.getMonth(), day = t.getDate();
  const mm = (day >= 25) ? m + 1 : m;
  return (y + Math.floor(mm / 12)) + '-' + String((mm % 12) + 1).padStart(2, '0');
}
function monthLabel(k) {
  const p = String(k).split('-');
  return p.length === 2 ? (p[0] + ' оны ' + Number(p[1]) + '-р сар') : k;
}
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fval(f) {
  if (!f || typeof f !== 'object') return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return Number(f.doubleValue);
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(fval);
  if ('mapValue' in f) {
    const o = {}, m = (f.mapValue && f.mapValue.fields) || {};
    Object.keys(m).forEach(k => { o[k] = fval(m[k]); });
    return o;
  }
  return undefined;
}

async function r2Json(key) {
  const r = await fetch(R2 + '/' + key + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) { if (r.status === 404) return null; throw new Error('R2 ' + r.status + ' ' + key); }
  return await r.json();
}

async function habExams() {
  const base = 'https://firestore.googleapis.com/v1/projects/' + HAB_PROJ +
    '/databases/(default)/documents/habea_exam_results?key=' + HAB_KEY + '&pageSize=300';
  let tok = '', out = [], guard = 0;
  do {
    const r = await fetch(base + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''));
    if (!r.ok) throw new Error('habea ' + r.status);
    const j = await r.json();
    (j.documents || []).forEach(d => {
      const f = d.fields || {};
      out.push({
        email: String(fval(f.email) || '').toLowerCase(),
        key: fval(f.examKey) || '', type: fval(f.examType) || '',
        percent: Number(fval(f.percent) || 0), passed: fval(f.passed) === true,
        at: new Date(fval(f.timestamp) || 0).getTime() || 0
      });
    });
    tok = j.nextPageToken || '';
  } while (tok && ++guard < 20);
  return out;
}

const sameDept = (a, b) => {
  const x = String(a || '').trim().toLowerCase(), y = String(b || '').trim().toLowerCase();
  return !!x && !!y && (x === y || x.slice(0, 18) === y.slice(0, 18));
};

function funnelFor(dept, key, staff, exams) {
  const mine = staff.filter(e => sameDept(e.dept, dept) && !e.onLeave);
  const byMail = {};
  exams.forEach(x => {
    if (!x.email || DAVTAN.indexOf(x.key) < 0) return;
    if (salaryKey(x.at) !== key) return;
    (byMail[x.email] = byMail[x.email] || []).push(x);
  });
  const rows = mine.map(e => {
    const list = byMail[String(e.email || '').toLowerCase()] || [];
    let pre = null, post = null;
    list.forEach(x => {
      if (x.type === 'pre' && (!pre || x.at > pre.at)) pre = x;
      if (x.type === 'post' && (!post || x.at > post.at)) post = x;
    });
    const last = post || pre || list[0] || null;
    return {
      name: e.name || e.email || '?', took: !!list.length,
      pre: pre ? Math.round(pre.percent) : null,
      post: post ? Math.round(post.percent) : null,
      score: last ? Math.round(last.percent) : null,
      passed: !!(last && last.passed)
    };
  });
  const took = rows.filter(r => r.took);
  return {
    dept, should: mine.length, took: took.length,
    passed: took.filter(r => r.passed).length, rows
  };
}

/* ── Хэнд юу илгээх вэ ── */
function recipients(staff, owners) {
  const out = new Map();                    /* и-мэйл → {name, depts|'all'} */
  const depts = [...new Set(staff.map(e => e.dept).filter(Boolean))];
  const add = (email, name, scope) => {
    const k = String(email || '').toLowerCase();
    if (!k) return;
    const cur = out.get(k) || { name, depts: new Set(), all: false };
    if (scope === 'all') cur.all = true;
    else (Array.isArray(scope) ? scope : [scope]).forEach(d => cur.depts.add(d));
    out.set(k, cur);
  };
  const PROD = /(үйлдвэр|лаборатори|инженер|чанар)/i;
  const SALES = /(борлуулалт|маркетинг|экспорт)/i;
  staff.forEach(e => {
    const pos = String(e.pos || e.role || '');
    if (!e.email) return;
    if (/гүйцэтгэх\s*захирал/i.test(pos)) add(e.email, e.name, 'all');
    else if (/үйлдвэрлэл\s*хариуцсан\s*захирал/i.test(pos)) add(e.email, e.name, depts.filter(d => PROD.test(d)));
    else if (/(борлуулалт.*маркетинг|үйл\s*ажиллагаа)\s*хариуцсан\s*захирал/i.test(pos))
      add(e.email, e.name, depts.filter(d => SALES.test(d)));
    else if (/дарга/i.test(pos) && e.dept) add(e.email, e.name, e.dept);
  });
  Object.entries(owners || {}).forEach(([dept, mails]) => {
    (mails || []).forEach(m => {
      const who = staff.find(e => String(e.email || '').toLowerCase() === String(m).toLowerCase());
      add(m, (who && who.name) || m, dept);
    });
  });
  return out;
}

function bodyFor(name, funnels, key, isAll) {
  const tS = funnels.reduce((a, f) => a + f.should, 0);
  const tT = funnels.reduce((a, f) => a + f.took, 0);
  const tP = funnels.reduce((a, f) => a + f.passed, 0);
  const pct = tS ? Math.round(tT * 100 / tS) : 0;
  const rows = funnels.map(f => {
    const p = f.should ? Math.round(f.took * 100 / f.should) : 0;
    const col = p >= 80 ? '#15803D' : p >= 40 ? '#B45309' : '#B91C1C';
    return '<tr>' +
      '<td style="padding:9px 10px;border-top:1px solid #EEF1F4;font-size:13.5px;color:#0F1117">' + esc(f.dept) + '</td>' +
      '<td style="padding:9px 10px;border-top:1px solid #EEF1F4;font-size:13.5px;text-align:right;white-space:nowrap;color:' + col + ';font-weight:700">' +
      f.took + ' / ' + f.should + ' · ' + p + '%</td>' +
      '<td style="padding:9px 10px;border-top:1px solid #EEF1F4;font-size:13.5px;text-align:right;white-space:nowrap;color:#15803D;font-weight:700">' + f.passed + '</td>' +
      '</tr>';
  }).join('');
  const html =
    '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;color:#0F1117">' +
    '<div style="font-size:19px;font-weight:800;margin-bottom:4px">Сургалтын биелэлт · ' + esc(monthLabel(key)) + '</div>' +
    '<div style="font-size:13.5px;color:#64748B;margin-bottom:18px">Сайн байна уу, ' + esc(name) + '. ' +
    (isAll ? 'Компанийн' : 'Таны хариуцах албадын') + ' ээлжит давтан зааварчилгааны биелэлтийг хүргэж байна.</div>' +
    '<table style="width:100%;border-collapse:collapse;background:#F8FAFC;border-radius:10px;overflow:hidden">' +
    '<tr style="background:#EEF2FF">' +
    '<td style="padding:11px 10px;font-size:12px;font-weight:800;color:#3730A3">АЛБА</td>' +
    '<td style="padding:11px 10px;font-size:12px;font-weight:800;color:#3730A3;text-align:right">СУУСАН</td>' +
    '<td style="padding:11px 10px;font-size:12px;font-weight:800;color:#3730A3;text-align:right">ТЭНЦСЭН</td></tr>' +
    rows +
    '<tr style="background:#EEF2FF"><td style="padding:11px 10px;font-size:13.5px;font-weight:800">НИЙТ</td>' +
    '<td style="padding:11px 10px;font-size:13.5px;font-weight:800;text-align:right">' + tT + ' / ' + tS + ' · ' + pct + '%</td>' +
    '<td style="padding:11px 10px;font-size:13.5px;font-weight:800;text-align:right;color:#15803D">' + tP + '</td></tr>' +
    '</table>' +
    '<div style="margin:20px 0 8px"><a href="https://monos-hab.vercel.app/kpi/" ' +
    'style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;border-radius:10px;' +
    'padding:12px 22px;font-weight:700;font-size:14px">Ажилтан бүрээр харах →</a></div>' +
    '<div style="font-size:12px;color:#94A3B8;line-height:1.6;margin-top:16px">' +
    'Апп → «Сургалтын биелэлт» цэснээс хэн сууж, хэн суугаагүйг нэрээр нь харна.</div></div>';
  const text = 'Сургалтын биелэлт · ' + monthLabel(key) + '\n\n' +
    funnels.map(f => '  ' + f.dept + ': суусан ' + f.took + '/' + f.should + ', тэнцсэн ' + f.passed).join('\n') +
    '\n\n  НИЙТ: ' + tT + '/' + tS + ' (' + pct + '%), тэнцсэн ' + tP +
    '\n\nДэлгэрэнгүй: https://monos-hab.vercel.app/kpi/';
  return { html, text, tS, tT, tP };
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

async function isAdminCaller(idToken) {
  if (!idToken || String(idToken).length < 40) return false;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_WEB_KEY,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    if (!r.ok) return false;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId) return false;
    /* ⚠ Зөвхөн API түлхүүрээр уншвал дүрэм зөвшөөрөхгүй — дуудагчийн
       өөрийнх нь токеноор уншина (users/{uid} өөрийн баримт). */
    const d = await fetch(FS + '/users/' + encodeURIComponent(u.localId),
      { headers: { Authorization: 'Bearer ' + idToken } });
    if (!d.ok) return false;
    const dj = await d.json();
    return ((dj.fields || {}).role || {}).stringValue === 'admin';
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const body = await readBody(req);
  const cronOk = (() => {
    const cs = process.env.CRON_SECRET || '';
    const h = String(req.headers.authorization || '');
    return !!cs && h === 'Bearer ' + cs;
  })();
  const adminOk = cronOk ? true : await isAdminCaller(body.idToken);
  if (!adminOk) return res.status(403).json({ ok: false, error: 'Зөвхөн админ эсвэл cron' });

  const dry = !!body.dry;          /* cron нь dry дамжуулдаггүй */
  const key = String(body.month || '') || salaryKey();

  let staff, owners, exams;
  try {
    const [e1, o1] = await Promise.all([r2Json('employees/all.json'), r2Json('training/owners.json')]);
    staff = (e1 && (e1.rows || e1.employees)) || [];
    owners = (o1 && o1.map) || {};
    exams = await habExams();
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Дата уншиж чадсангүй: ' + String(e.message).slice(0, 120) });
  }
  if (!staff.length) return res.status(502).json({ ok: false, error: 'Ажилтны бүртгэл хоосон' });

  const allDepts = [...new Set(staff.map(e => e.dept).filter(Boolean))];
  const funnelCache = {};
  const fOf = d => (funnelCache[d] = funnelCache[d] || funnelFor(d, key, staff, exams));

  /* Энэ сард хамрагдсан алба л тайланд орно */
  const active = allDepts.filter(d => fOf(d).took > 0);
  if (!active.length) {
    return res.status(200).json({ ok: true, month: key, sent: 0, note: 'Энэ сард хамрагдсан алба алга' });
  }

  const recs = recipients(staff, owners);
  const plan = [];
  recs.forEach((v, mail) => {
    const scope = v.all ? active : active.filter(d => [...v.depts].some(x => sameDept(x, d)));
    if (!scope.length) return;
    plan.push({ email: mail, name: v.name, all: v.all, depts: scope });
  });

  if (dry) {
    return res.status(200).json({
      ok: true, dry: true, month: key, wouldSend: plan.length,
      plan: plan.map(p => ({ name: p.name, depts: p.all ? ['(бүх алба ' + active.length + ')'] : p.depts }))
    });
  }

  let sent = 0; const failed = [];
  for (const p of plan) {
    try {
      const b = bodyFor(p.name, p.depts.map(fOf), key, p.all);
      await sendViaGmail({
        user: process.env.GMAIL_USER,
        pass: String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
        fromName: 'МОНОС ХАБЭА',
        to: p.email,
        subject: 'Сургалтын биелэлт · ' + monthLabel(key),
        text: b.text, html: b.html
      });
      sent++;
    } catch (e) { failed.push(p.name + ': ' + String(e.message).slice(0, 60)); }
  }
  return res.status(200).json({ ok: true, month: key, sent, total: plan.length, failed });
};
