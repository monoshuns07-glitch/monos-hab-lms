/* ============================================================================
   /api/exam-save  —  ШАЛГАЛТЫН ДҮНГ ШУУД R2 РУУ (FIRESTORE ОГТ ОРОЛЦОХГҮЙ)
   ----------------------------------------------------------------------------
   ⚠⚠ ЯАГААД (2026-08-31):
   Шалгалтын дүн Firestore дээр байсан тул ажилтан бүр апп нээх бүрдээ
   тэндээс уншиж, өдрийн үнэгүй квот (50,000 уншилт) дүүрч, сервер
   HTTP 429 буцааж, дүн ХООСОН харагддаг байв. Тэр асуудлыг олон удаа
   «зассан» ч квот дээр суурилсан хэвээр байсан тул эргэж ирсээр байсан.

   Одоо квотоос бүрэн салав: дүн нь ҮҮСМЭГЦ R2-д бичигдэнэ.
     exams/<sha256(и-мэйл)-ийн 24 тэмдэгт>.json   — ажилтны өөрийн дүн
     exams/_all.json                              — тайланд зориулсан бүгд

   R2 нь объект хадгалалт — уншилтын квот ГЭЖ БАЙХГҮЙ. Хэдэн ч ажилтан,
   хэдэн ч удаа уншсан хамаагүй.

   ⚠ ЭНЭ ФАЙЛД ДҮНГИЙН ХАДГАЛАЛТАД FIRESTORE-ЫГ ДАХИН БҮҮ НЭМ.
   ----------------------------------------------------------------------------
   v530 (2026-09-09) — хуулийн зөвлөхийн захидалд «сул тал» гэж бичсэн зүйлс:
   ① ОНООГ СЕРВЕР ДАХИН ТООЦНО. Хөтөч percent/passed илгээдэг хэвээр (дэлгэцэнд
      харуулсантай нь таарна), харин сервер ХАРИУЛТУУДЫГ авч, асуултын санг
      ШАЛГАЛТЫН төслөөс (habea-shalgalt, нийтийн вэб түлхүүр — нэг шалгалтад
      1–2 уншилт, квотод нөлөөгүй) уншиж, habea-exam.html-ийн grade()-ийн ЯГ
      хуулбараар дахин тооцоод pctS / passS / chk (ok|mismatch|unavailable)
      гэж хамт бичнэ. Зөрвөл sys/errors.json-д (эрүүл мэндийн самбар) бүртгэнэ.
      ⚠ Хөтчийн утгыг ДАРЖ БИЧИХГҮЙ — ажилтанд харуулсан дүнтэй зөрөхгүйн тулд;
      админ зөрүүтэйг тусад нь харна.
   ② ТӨХӨӨРӨМЖ ДАВХЦАЛ: нэг төхөөрөмжөөс (dev) 24 цагийн дотор ӨӨР хүний
      нэрээр өгсөн шалгалт байвал devShared=[и-мэйлүүд] гэж тэмдэглэнэ
      (2026-09-07-ны «өөр хүний нэвтрэлтээр шалгалт өгсөн» тохиолдлын илрүүлэлт).
   ③ Байршил (geo), хугацаа (dur), таб солилт (tab), кодын шалгасан зам (otpBy),
      кодгүй өнгөрсөн эсэх (skip), хугацааны хязгаар (tl), хугацаа дууссан (to).
   ========================================================================== */
const crypto = require('crypto');

const R2 = 'https://monos-upload.buynt666.workers.dev';
const FB_API_KEY = process.env.FB_API_KEY || 'AIzaSyDMTpIUFiyOO_7MPQq3xVsV8j-4xIuYGX0';
const ALL_KEY = 'exams/_all.json';
const ERR_KEY = 'sys/errors.json';

/* Шалгалтын төсөл — асуултын сан, тохиргоо (нийтийн вэб түлхүүр, хөтөч дээр угаасаа байдаг) */
const EX_PROJ = process.env.EXAM_PROJECT_ID || 'habea-shalgalt';
const EX_KEY = process.env.EXAM_API_KEY || 'AIzaSyBRaHjzrEedBZc1Z5zNnJuJvLboKwKed2E';
const EX_FS = 'https://firestore.googleapis.com/v1/projects/' + EX_PROJ + '/databases/(default)/documents';

function emailKey(em) {
  return 'exams/' + crypto.createHash('sha256')
    .update(String(em || '').toLowerCase().trim(), 'utf8').digest('hex').slice(0, 24) + '.json';
}

async function getJson(key) {
  try {
    const r = await fetch(R2 + '/' + key + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function putJson(key, obj) {
  const secret = process.env.SIGN_SECRET || '';
  if (!secret) throw new Error('SIGN_SECRET тохируулаагүй');
  const exp = String(Date.now() + 10 * 60 * 1000);
  const r = await fetch(R2 + '/' + key, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Up': crypto.createHmac('sha256', secret).update('up|' + key + '|' + exp, 'utf8').digest('hex'),
      'X-Exp': exp
    },
    body: JSON.stringify(obj)
  });
  if (!r.ok) throw new Error('R2 PUT ' + r.status);
  return true;
}

async function verifyIdToken(idToken) {
  if (!idToken || String(idToken).length < 40) return null;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: idToken })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j && j.users && j.users[0];
    if (!u || !u.localId || u.disabled === true) return null;
    return { uid: u.localId, email: String(u.email || '').toLowerCase() };
  } catch (e) { return null; }
}

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', function (c) { raw += c; if (raw.length > 4e6) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

/* ── Firestore REST утга → энгийн JS (SDK-тэй адил: integerValue → Number) ── */
function fsVal(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(fsVal);
  if ('mapValue' in v) return fsFields((v.mapValue && v.mapValue.fields) || {});
  return null;
}
function fsFields(f) {
  const o = {};
  Object.keys(f || {}).forEach(function (k) { o[k] = fsVal(f[k]); });
  return o;
}
/* {ok, data|null, status} — 404 бол ok:true, data:null (хөтчийн `exists` шиг) */
async function fsDoc(path) {
  try {
    const r = await fetch(EX_FS + '/' + path + '?key=' + EX_KEY, { cache: 'no-store' });
    if (r.status === 404) return { ok: true, data: null, status: 404 };
    if (!r.ok) return { ok: false, data: null, status: r.status };
    const j = await r.json();
    return { ok: true, data: fsFields(j.fields || {}), status: 200 };
  } catch (e) { return { ok: false, data: null, status: 0 }; }
}

/* ── Дүн тооцох — habea-exam.html-ийн pts()/grade()/TMAP-ийн ЯГ хуулбар ──
   ⚠ Хөтчийн функц өөрчлөгдвөл ЭНД ч өөрчил (scratchpad/t_grade.js хоёуланг тулгадаг). */
const TMAP = { matching: 'match', 'three-words': 'words3', 'three-mistakes': 'mistakes3' };
function normQ(q) { return Object.assign({}, q, { type: TMAP[q.type] || q.type }); }
function pts(q) { return q.pts || q.points || 0; }
function grade(q, a) {
  const p = pts(q); if (a == null) return 0;
  if (q.type === 'single') return a === (q.ans || q.correct) ? p : 0;
  if (q.type === 'multi') { if (!Array.isArray(a)) return 0; const C = new Set(q.ans || q.correct || []), G = new Set(a); let h = 0, w = 0; C.forEach(c => { if (G.has(c)) h++; }); G.forEach(g => { if (!C.has(g)) w++; }); return Math.max(0, Math.round(((h - w) / C.size) * p)); }
  if (q.type === 'match') { if (!a || typeof a !== 'object') return 0; const cor = q.ans || q.correct || {}; const k = Object.keys(cor); const ok = k.filter(kk => a[kk] === cor[kk]).length; return k.length ? Math.round((ok / k.length) * p) : 0; }
  if (q.type === 'open') { const t = String(a || '').toLowerCase().trim(); if (t.length < 8) return 0; const kws = q.kw || q.keywords || []; const m = kws.filter(kw => t.includes(kw)).length; return Math.round(Math.min(1, m / 2) * p); }
  if (q.type === 'words3') { if (!Array.isArray(a)) return 0; const kws = q.kw || q.keywords || []; let c = 0; kws.forEach((g, i) => { const w = String(a[i] || '').toLowerCase().trim(); const arr = Array.isArray(g) ? g : String(g || '').split(',').map(s => s.trim()).filter(Boolean); if (w && arr.some(kw => w.includes(kw))) c++; }); return kws.length ? Math.round((c / kws.length) * p) : 0; }
  if (q.type === 'mistakes3') { if (!Array.isArray(a)) return 0; const f = a.filter(x => String(x || '').trim().length >= 5).length; return Math.round((f / 3) * p); }
  return 0;
}
function scoreOf(qs, answers) {
  const bd = qs.map(function (q) { return { id: q.id, pts: pts(q), earned: grade(q, answers ? answers[String(q.id)] : null) }; });
  const tot = bd.reduce(function (s, b) { return s + b.earned; }, 0);
  const totalPts = qs.reduce(function (s, q) { return s + pts(q); }, 0);
  const pct = totalPts ? Math.round((tot / totalPts) * 100) : 0;
  return { bd: bd, tot: tot, totalPts: totalPts, pct: pct };
}
/* Хөтчийн init()-тэй адил: тухайн шалгалтын questions_<key>/settings_<key>, байхгүй бол үндсэн */
async function loadExam(examKey) {
  const suf = examKey ? '_' + String(examKey) : '';
  const q1 = await fsDoc('habea_config/questions' + suf);
  if (!q1.ok) return null;
  let qsDoc = (q1.data && Array.isArray(q1.data.list) && q1.data.list.length) ? q1.data : null;
  const s1 = await fsDoc('habea_config/settings' + suf);
  let ssDoc = s1.ok ? s1.data : null;
  if (suf && (!qsDoc || !ssDoc)) {
    if (!qsDoc) { const q0 = await fsDoc('habea_config/questions'); if (!q0.ok) return null; qsDoc = (q0.data && Array.isArray(q0.data.list) && q0.data.list.length) ? q0.data : null; }
    if (!ssDoc) { const s0 = await fsDoc('habea_config/settings'); ssDoc = s0.ok ? s0.data : null; }
  }
  if (!qsDoc) return null;
  return { qs: qsDoc.list.map(normQ), passPercent: Number(ssDoc && ssDoc.passPercent) || 60 };
}

/* Нэг төхөөрөмжөөс 24 цагийн дотор өөр хүний нэрээр өгсөн шалгалтууд */
function devSharedOf(list, row) {
  if (!row || !row.dev) return [];
  const seen = {};
  (list || []).forEach(function (x) {
    if (!x || !x.dev || x.dev !== row.dev || x.email === row.email) return;
    if (Math.abs(num(x.ts) - num(row.ts)) > 86400) return;
    seen[x.email] = 1;
  });
  return Object.keys(seen);
}

function compactGeo(g) {
  if (!g || typeof g !== 'object') return { s: 'none' };
  const s = String(g.status || 'none').slice(0, 12);
  if (s !== 'ok') return { s: s };
  return { s: 'ok', la: num(g.lat), ln: num(g.lng), ac: Math.round(num(g.acc)) };
}

/* sys/errors.json — аппын sysErrLog-той ижил бүтэц (rows[], k/m/w-ээр давхардлыг нэгтгэнэ) */
async function logErr(kind, msg, where, email) {
  try {
    const all = (await getJson(ERR_KEY)) || {};
    let rows = Array.isArray(all.rows) ? all.rows : [];
    const at = new Date().toISOString();
    let hit = null;
    for (let i = 0; i < rows.length; i++) { if (rows[i] && rows[i].k === kind && rows[i].m === msg && rows[i].w === where) { hit = rows[i]; break; } }
    if (hit) { hit.c = (hit.c || 1) + 1; hit.at = at; hit.u = hit.u || []; if (email && hit.u.indexOf(email) < 0 && hit.u.length < 40) hit.u.push(email); }
    else rows.unshift({ at: at, k: kind, m: msg, w: where, e: email || '', v: 'srv', os: 'server', br: 'exam-save', p: '/api/exam-save', c: 1, u: email ? [email] : [] });
    rows.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    if (rows.length > 200) rows = rows.slice(0, 200);
    await putJson(ERR_KEY, { updatedAt: at, rows: rows });
  } catch (e) { /* лог унасан ч дүнг унагаахгүй */ }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST л хүлээн авна' });

  const body = await readBody(req);
  const u = await verifyIdToken(body.idToken);
  if (!u) return res.status(401).json({ ok: false, error: 'Нэвтрээгүй байна' });

  /* ⚠ И-МЭЙЛИЙГ КЛИЕНТЭЭС АВАХГҮЙ — нэвтэрсэн хэрэглэгчийнхийг л
     ашиглана. Эс бөгөөс хэн нэгэн өөр хүний нэрээр дүн бичиж чадна. */
  const email = u.email;
  if (!email) return res.status(400).json({ ok: false, error: 'И-мэйл тодорхойгүй' });

  const r = body.result || {};
  const bd = Array.isArray(r.breakdown) ? r.breakdown : [];
  let qOk = 0;
  bd.forEach(function (b) {
    const pts = num(b && b.pts), earned = num(b && b.earned);
    if (pts > 0 && earned >= pts) qOk++;
  });

  const row = {
    email: email,
    key: String(r.examKey || ''),
    title: String(r.examTitle || 'ХАБЭА шалгалт'),
    type: String(r.examType || ''),
    percent: num(r.percent),
    passed: r.passed === true,
    qs: bd.length,
    qOk: qOk,
    ts: Math.floor(Date.now() / 1000),
    /* v530 — нөхцөлийн талбарууд */
    dev: String(r.dev || '').replace(/[^0-9a-f]/gi, '').slice(0, 32),
    geo: compactGeo(r.geo),
    dur: Math.max(0, Math.round(num(r.dur))),
    tab: Math.max(0, Math.round(num(r.tab))),
    otpBy: String(r.otpBy || '').slice(0, 10),
    skip: r.skip === true,
    tl: Math.max(0, Math.round(num(r.tl))),
    to: r.to === true
  };
  if (!row.key && !row.type) {
    return res.status(400).json({ ok: false, error: 'Шалгалтын мэдээлэл дутуу' });
  }

  /* ── ① СЕРВЕР ОНООГ ДАХИН ТООЦНО ── */
  const answers = (r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers)) ? r.answers : null;
  row.chk = 'unavailable';
  if (!answers) row.chk = 'noanswers';
  else {
    try {
      const ex = await loadExam(row.key);
      if (ex && ex.qs.length) {
        const sc = scoreOf(ex.qs, answers);
        row.pctS = sc.pct;
        row.passS = sc.pct >= ex.passPercent;
        row.qsS = ex.qs.length;
        row.chk = (sc.pct === row.percent && row.passS === row.passed) ? 'ok' : 'mismatch';
      }
    } catch (e) { row.chk = 'unavailable'; }
  }

  /* ── ② Тайлангийн нэгдсэн файлыг ЭХЛЭЭД уншина — төхөөрөмж давхцал шалгахад хэрэгтэй ── */
  let allCur = null;
  try { allCur = await getJson(ALL_KEY); } catch (e) { allCur = null; }
  const allList = (allCur && Array.isArray(allCur.list)) ? allCur.list : [];
  const shared = devSharedOf(allList, row);
  if (shared.length) row.devShared = shared.slice(0, 10);

  /* ── ③ Ажилтны өөрийн файл ── */
  let mine = 0;
  try {
    const key = emailKey(email);
    const cur = await getJson(key);
    const list = (cur && Array.isArray(cur.list)) ? cur.list : [];
    /* Давхардлаас сэргийлнэ: ижил шалгалт, ижил төрөл, 2 минутын дотор */
    const dup = list.some(function (x) {
      return x && x.key === row.key && x.type === row.type && Math.abs(num(x.ts) - row.ts) < 120;
    });
    if (!dup) list.push(row);
    list.sort(function (a, b) { return num(b.ts) - num(a.ts); });
    await putJson(key, { updatedAt: new Date().toISOString(), list: list });
    mine = list.length;
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Хадгалж чадсангүй: ' + String(e.message || e).slice(0, 120) });
  }

  /* ── ④ Тайлангийн нэгдсэн файл (алдвал ажилтны дүн хэвээр хадгалагдана) ── */
  let allN = 0;
  try {
    const cur = allCur || (await getJson(ALL_KEY));
    const list = (cur && Array.isArray(cur.list)) ? cur.list : [];
    const dup = list.some(function (x) {
      return x && x.email === row.email && x.key === row.key && x.type === row.type &&
        Math.abs(num(x.ts) - row.ts) < 120;
    });
    if (!dup) list.push(row);
    await putJson(ALL_KEY, { updatedAt: new Date().toISOString(), total: list.length, list: list });
    allN = list.length;
  } catch (e) { allN = -1; }

  /* ── ⑤ Зөрүү, давхцлыг эрүүл мэндийн самбарт ил гаргана (унасан ч дүнг унагаахгүй) ── */
  if (row.chk === 'mismatch') {
    await logErr('exam', 'Оноо зөрүү: хөтөч ' + row.percent + '% / сервер ' + row.pctS + '% (' + (row.key || row.type) + ')', 'exam-save', email);
  }
  if (row.devShared) {
    await logErr('exam', 'Нэг төхөөрөмжөөс 24 цагт ' + (row.devShared.length + 1) + ' хүн шалгалт өгөв (dev ' + row.dev.slice(0, 6) + ')', 'exam-save', email);
  }

  return res.status(200).json({ ok: true, mine: mine, all: allN, chk: row.chk, pctS: row.pctS, devShared: row.devShared || [] });
};

module.exports._internal = { emailKey, fsVal, fsFields, normQ, pts, grade, scoreOf, devSharedOf, compactGeo, loadExam };
