#!/usr/bin/env node
/* ============================================================================
   tools/deploy-rules.js — Firestore ДҮРМИЙГ КОДООС БАЙРШУУЛНА (2026-09-09)
   ----------------------------------------------------------------------------
   ⚠ ЯАГААД: өмнө нь дүрмийг Firebase консол дээр ГАРААР тавьдаг, repo дахь
   firestore.rules нь зөвхөн хуулбар байв (аудитын олдвор №10). Хэн нэгэн
   хуучирсан хуулбарыг байршуулбал бүх дата хаагдах эрсдэлтэй байсан.
   Одоо энэ хэрэгсэл нь:
     ① амьд дүрмийг ЭХЛЭЭД татаж tools/rules-backup/ дотор хадгална (буцаахад)
     ② repo-гийн firestore.rules-ыг шинэ ruleset болгож үүсгэнэ
     ③ cloud.firestore release-ийг тэр ruleset рүү шилжүүлнэ
   Буцаах:  node tools/deploy-rules.js --key <sa.json> --rollback <rulesetId>
   Тест:    node tools/deploy-rules.js --key <sa.json> --test   (байршуулахгүй)

   ⚠ Үйлчилгээний дансны түлхүүр (JSON) — Downloads-д байдаг, repo-д ХЭЗЭЭ Ч
     БҮҮ ОРУУЛ. Эсвэл FB_SA_EMAIL + FB_SA_KEY орчны хувьсагчаар өгч болно.
   ⚠ Зөвхөн үндсэн төсөл (monos-hab-system). Шалгалтын хуучин төсөл
     (habea-shalgalt)-д энэ дансны эрх ХҮРДЭГГҮЙ (403).
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] || '') : def; }
const has = (n) => args.indexOf(n) >= 0;

const PROJECT = opt('--project', 'monos-hab-system');
const RULES_FILE = opt('--rules', path.join(__dirname, '..', 'firestore.rules'));
const TESTS_FILE = opt('--tests', path.join(__dirname, 'rules-tests.json'));
const BACKUP_DIR = path.join(__dirname, 'rules-backup');

function loadSA() {
  const kp = opt('--key', '');
  if (kp) return JSON.parse(fs.readFileSync(kp, 'utf8'));
  if (process.env.FB_SA_EMAIL && process.env.FB_SA_KEY) {
    return { client_email: process.env.FB_SA_EMAIL, private_key: String(process.env.FB_SA_KEY).replace(/\\n/g, '\n') };
  }
  throw new Error('Түлхүүр алга: --key <sa.json> эсвэл FB_SA_EMAIL/FB_SA_KEY');
}

function b64(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }

async function token(sa) {
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pl = b64(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  const sig = b64(crypto.sign('RSA-SHA256', Buffer.from(hdr + '.' + pl), sa.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + hdr + '.' + pl + '.' + sig
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('OAuth: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

const API = 'https://firebaserules.googleapis.com/v1';
async function call(tok, method, p, body) {
  const r = await fetch(API + p, {
    method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t }; }
  if (!r.ok) throw new Error(method + ' ' + p + ' → HTTP ' + r.status + ' ' + t.slice(0, 400));
  return j;
}

async function liveRuleset(tok) {
  const rel = await call(tok, 'GET', '/projects/' + PROJECT + '/releases/cloud.firestore');
  const rs = await call(tok, 'GET', '/' + rel.rulesetName);
  return { rulesetName: rel.rulesetName, source: rs.source.files[0].content };
}

async function runTests(tok, source) {
  if (!fs.existsSync(TESTS_FILE)) { console.log('  (тест файл алга — алгаслаа)'); return true; }
  const suite = JSON.parse(fs.readFileSync(TESTS_FILE, 'utf8'));
  /* Файлд { cases: [{ name, tc }] } — API-д зөвхөн tc илгээнэ (нэр нь тайлбар) */
  const cases = (suite.cases || []).map(function (c) { return c.tc; });
  const names = (suite.cases || []).map(function (c) { return c.name; });
  let res;
  try {
    res = await call(tok, 'POST', '/projects/' + PROJECT + ':test', {
      source: { files: [{ name: 'firestore.rules', content: source }] },
      testSuite: { testCases: cases }
    });
  } catch (e) {
    /* ⚠ Үйлчилгээний данс энэ төсөлд `firebaserules.rulesets.test` эрхгүй
       (2026-09-09-нд HTTP 403). Тэр үед тестийг алгасаад, байршуулсны ДАРАА
       амьд шалгалт (scratchpad/t_rules.js — ажилтан/админы REST оролдлого)
       заавал хийнэ. Буцаах команд хэвлэгддэг. */
    if (/HTTP 403/.test(e.message)) { console.log('  ⚠ тест API-д эрх алга (403) — алгаслаа; байршуулсны дараа амьд шалгалт хий'); return true; }
    throw e;
  }
  const issues = res.issues || [];
  issues.forEach(function (i) { console.log('  ⚠ ' + (i.severity || '') + ' ' + (i.description || '')); });
  const results = res.testResults || [];
  let fail = 0;
  results.forEach(function (tr, i) {
    const ok = tr.state === 'SUCCESS';
    if (!ok) fail++;
    console.log('  ' + (ok ? '✔' : '✘') + ' ' + (names[i] || ('#' + (i + 1))) +
      (ok ? '' : '  → ' + tr.state + ' ' + JSON.stringify(tr.debugMessages || tr.errorPosition || '').slice(0, 200)));
  });
  console.log('  ДҮН: ' + (results.length - fail) + '/' + results.length + ' тэнцэв');
  return fail === 0 && !issues.some(function (i) { return i.severity === 'ERROR'; });
}

(async function main() {
  const sa = loadSA();
  const tok = await token(sa);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  if (has('--rollback')) {
    const id = opt('--rollback', '');
    const name = id.indexOf('/') >= 0 ? id : ('projects/' + PROJECT + '/rulesets/' + id);
    await call(tok, 'PATCH', '/projects/' + PROJECT + '/releases/cloud.firestore?updateMask=rulesetName',
      { release: { name: 'projects/' + PROJECT + '/releases/cloud.firestore', rulesetName: name } });
    console.log('↩ Буцаав → ' + name);
    return;
  }

  /* ① амьд дүрмийг татаж хадгална */
  const live = await liveRuleset(tok);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bk = path.join(BACKUP_DIR, 'firestore-' + stamp + '.rules');
  fs.writeFileSync(bk, '// live ruleset: ' + live.rulesetName + '\n' + live.source);
  console.log('① Амьд дүрэм хадгалагдав: ' + path.relative(process.cwd(), bk) + '  (' + live.rulesetName.split('/').pop() + ')');

  const source = fs.readFileSync(RULES_FILE, 'utf8');
  if (source.replace(/\r/g, '') === live.source.replace(/\r/g, '')) {
    console.log('  Амьд дүрэм repo-тэй ИЖИЛ — байршуулах шаардлагагүй.');
    if (!has('--test')) return;
  }

  /* ② тест */
  console.log('② Дүрмийн тест:');
  const ok = await runTests(tok, source);
  if (!ok) { console.log('✘ Тест унав — БАЙРШУУЛААГҮЙ.'); process.exit(1); }
  if (has('--test')) { console.log('(зөвхөн тест — байршуулаагүй)'); return; }

  /* ③ ruleset үүсгэж release шилжүүлнэ */
  const rs = await call(tok, 'POST', '/projects/' + PROJECT + '/rulesets',
    { source: { files: [{ name: 'firestore.rules', content: source }] } });
  await call(tok, 'PATCH', '/projects/' + PROJECT + '/releases/cloud.firestore?updateMask=rulesetName',
    { release: { name: 'projects/' + PROJECT + '/releases/cloud.firestore', rulesetName: rs.name } });
  console.log('③ БАЙРШУУЛАВ → ' + rs.name.split('/').pop());
  console.log('   Буцаах бол: node tools/deploy-rules.js --key <sa.json> --rollback ' + live.rulesetName.split('/').pop());
})().catch(function (e) { console.error('✘ ' + e.message); process.exit(1); });
