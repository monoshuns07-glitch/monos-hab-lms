// ============================================================================
//  monos-upload Worker  —  V3 (УНШИЛТЫН ХАМГААЛАЛТТАЙ)
//  Cloudflare Dashboard → Workers & Pages → monos-upload → Edit code
//  → БҮХ хуучин кодыг устгаад ЭНИЙГ буулгана → Deploy
//
//  ────────────────────────────────────────────────────────────────────────
//  ЯАГААД (2026-09-09, мэдээллийн аюулгүй байдлын дүгнэлт, олдвор №2):
//  R2 дахь БҮХ файл интернэтээс нэвтрэлтгүй уншигдаж байсан — 262 ажилтны
//  нэр, ажлын и-мэйл, алба, албан тушаал, шалгалтын дүн, аудитын гинж,
//  ажлын захиалга. Бодитоор татаж баталсан.
//  CORS энд ХАМГААЛЖ ЧАДАХГҮЙ: тэр нь зөвхөн хөтчийн доторх JavaScript-д
//  үйлчилдэг. Энгийн `curl` тушаалд огт саад болохгүй.
//
//  ЮУ ӨӨРЧЛӨГДСӨН (V2 → V3):
//   · `SIGNED_GET_PREFIXES` — ЗААСАН УГТВАРТАЙ файлыг зөвхөн гарын үсэгтэй
//     татна. Бусад (зураг, видео, хавсралт) хэвээр нээлттэй.
//     ⚠ Ингэснээр өгөгдлийн сангуудыг хамгаалж, медиаг эвдэхгүй.
//   · `REQUIRE_SIGNED_GET=1` хэвээр — БҮХ файлыг хамгаална (хамгийн чанга).
//   · УГТВАРЫН гарын үсэг `dlp|<угтвар>|<хугацаа>` + `?p=<угтвар>` — медиад.
//     Нэг угтварт нэг гарын үсэг; түлхүүр тэр угтвараар эхэлж байх ёстой.
//   · Аль нь ч тохируулаагүй бол хамгаалалт УНТРААЛТТАЙ (одоогийн байдал).
//
//  ────────────────────────────────────────────────────────────────────────
//  ХЭРХЭН АСААХ (дараалал ЧУХАЛ):
//   1. Энэ кодыг буулгаад Deploy хийнэ. ⚠ Энэ алхамд ЮУ Ч ӨӨРЧЛӨГДӨХГҮЙ —
//      хувьсагч тохируулаагүй тул хамгаалалт унтраалттай хэвээр.
//   2. Сайт хэвийн ажиллаж байгааг шалгана (хуудсууд, зураг, видео).
//   3. Settings → Variables → шинэ Variable нэмнэ:
//        Нэр:  SIGNED_GET_PREFIXES
//        Утга: employees/,exams/,audit/,sys/,reports/,push/,notify/,
//              workflow/,workorders/,requests/,meetings/,measures/,
//              risks/,kpi/,lms/,miskill/,training/,tasks/,ack/,registry/
//        (нэг мөрөнд, таслалаар, зайгүй)
//   4. Deploy → сайтаа дахин шалгана. Ажилтны жагсаалт, тайлан гарч байвал
//      амжилттай. Гарахгүй бол хувьсагчийг УСТГААД Deploy — тэр дор нь
//      хуучин байдалдаа буцна.
//   5. Батлах: браузераар шууд нээхэд ХОРИГЛОХ ЁСТОЙ —
//      https://monos-upload.buynt666.workers.dev/employees/all.json → 403
//
//  ⚠ Settings → Variables хэсэгт заавал байх (хуучнаараа):
//     • R2 Bucket Binding : BUCKET
//     • Secret            : SIGN_SECRET  (Vercel дэх SIGN_SECRET-ТЭЙ ИЖИЛ!)
//     • Variable          : ALLOW_ORIGINS = https://monos-hab.vercel.app
// ============================================================================

const enc = new TextEncoder();

async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Тэмдэгт бүрийг адил хугацаанд харьцуулна (timing attack-аас сэргийлнэ) */
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function corsHeaders(env, request) {
  const allow = (env.ALLOW_ORIGINS || '*').trim();
  const origin = request.headers.get('Origin') || '';
  let out = '*';
  if (allow !== '*') {
    const list = allow.split(',').map(s => s.trim()).filter(Boolean);
    out = list.includes(origin) ? origin : list[0];
  }
  return {
    'Access-Control-Allow-Origin': out,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    /* X-If-Match / X-Etag — зэрэг бичилтийн хамгаалалт (2026-09-10) */
    'Access-Control-Allow-Headers': 'Content-Type, X-Key, X-Up, X-Exp, X-If-Match, X-If-None-Match',
    'Access-Control-Expose-Headers': 'ETag, X-Etag, X-Now',
    'Vary': 'Origin',
  };
}

/* Бичих эрх: гарын үсэгтэй түр эрх (эсхүл шилжилтийн хуучин түлхүүр) */
async function mayWrite(request, url, key, env) {
  const secret = env.SIGN_SECRET || '';
  const tok = request.headers.get('X-Up') || '';
  const exp = request.headers.get('X-Exp') || '';
  if (secret && tok && exp) {
    const until = Number(exp);
    if (!Number.isFinite(until)) return 'bad';
    if (Date.now() > until) return 'expired';
    const want = await hmacHex(secret, 'up|' + key + '|' + exp);
    if (safeEq(want, tok)) return 'ok';
    return 'bad';
  }
  const legacy = env.UPLOAD_KEY || '';
  if (legacy && request.headers.get('X-Key') === legacy) return 'ok';
  return 'bad';
}

/* ⚠ ЭНЭ ФАЙЛЫГ ГАРЫН ҮСЭГГҮЙ ТАТАЖ БОЛОХ УУ?
   · REQUIRE_SIGNED_GET=1        → БҮХ файл хамгаалалттай
   · SIGNED_GET_PREFIXES="a/,b/" → зөвхөн тэр угтвартай нь
   · аль нь ч байхгүй            → хамгаалалт УНТРААЛТТАЙ */
function needsSignedGet(key, env) {
  if (String(env.REQUIRE_SIGNED_GET || '') === '1') return true;
  const raw = String(env.SIGNED_GET_PREFIXES || '').trim();
  if (!raw) return false;
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  return list.some(p => key.startsWith(p));
}

/* ⚠ ЗААВАЛ ТАМГАТАЙ БИЧИХ файлууд (2026-09-11).
   CAS_REQUIRED_KEYS = "reports/_all.json,audit/,…" — таслалаар; '/'-ээр төгссөн нь угтвар.
   Эдгээрт X-If-Match / X-If-None-Match ТОЛГОЙГҮЙ PUT ирвэл 428 буцаана: хуучин апп,
   скрипт хуучин хуулбараараа бусдын өөрчлөлтийг ХЭЗЭЭ Ч дарж чадахгүй. */
function needsCas(key, env) {
  const raw = String(env.CAS_REQUIRED_KEYS || '').trim();
  if (!raw) return false;
  return raw.split(',').map(s => s.trim()).filter(Boolean)
    .some(p => p.endsWith('/') ? key.startsWith(p) : key === p);
}

function deny(state, cors) {
  const msg = state === 'expired' ? 'Upload permission expired' : 'Unauthorized';
  return new Response(msg, { status: 401, headers: cors });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.searchParams.get('key') || decodeURIComponent(url.pathname.slice(1));
    const action = url.searchParams.get('action') || '';
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // ── Multipart: эхлүүлэх ──
    if (request.method === 'POST' && action === 'mpu-create') {
      const st = await mayWrite(request, url, key, env);
      if (st !== 'ok') return deny(st, cors);
      if (!key) return new Response('Key required', { status: 400, headers: cors });
      const mpu = await env.BUCKET.createMultipartUpload(key, {
        httpMetadata: { contentType: url.searchParams.get('type') || 'application/octet-stream' },
      });
      return new Response(JSON.stringify({ uploadId: mpu.uploadId, key }),
        { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ── Multipart: нэг хэсэг ──
    if (request.method === 'PUT' && action === 'mpu-part') {
      const st = await mayWrite(request, url, key, env);
      if (st !== 'ok') return deny(st, cors);
      const uploadId = url.searchParams.get('uploadId');
      const partNumber = parseInt(url.searchParams.get('part'), 10);
      if (!key || !uploadId || !partNumber) return new Response('Bad request', { status: 400, headers: cors });
      const mpu = env.BUCKET.resumeMultipartUpload(key, uploadId);
      const buf = await request.arrayBuffer();
      const part = await mpu.uploadPart(partNumber, buf);
      return new Response(JSON.stringify(part), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ── Multipart: дуусгах ──
    if (request.method === 'POST' && action === 'mpu-complete') {
      const st = await mayWrite(request, url, key, env);
      if (st !== 'ok') return deny(st, cors);
      const uploadId = url.searchParams.get('uploadId');
      if (!key || !uploadId) return new Response('Bad request', { status: 400, headers: cors });
      const parts = await request.json();
      const mpu = env.BUCKET.resumeMultipartUpload(key, uploadId);
      await mpu.complete(parts);
      return new Response(JSON.stringify({ url: url.origin + '/' + encodeURIComponent(key), key }),
        { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ── Файл унших (GET) — видео тоглуулах, Range дэмжинэ ──
    if (request.method === 'GET') {
      if (!key) return new Response('Not found', { status: 404, headers: cors });

      /* ⚠ УНШИЛТЫН ХАМГААЛАЛТ. Гарын үсэг нь `dl|<түлхүүр>|<хугацаа>`,
         аппын сервер `/api/file-token` (kind:'dl') олгодог, 6 цаг хүчинтэй.
         Хөтөч `?t=<гарын үсэг>&e=<хугацаа>` гэж дамжуулна.
         ⚠ Кэш таслагч нь `cb=` — `t` БИШ (тэр нь гарын үсэг). */
      if (needsSignedGet(key, env) && env.SIGN_SECRET) {
        const t = url.searchParams.get('t') || '', e = url.searchParams.get('e') || '';
        const p = url.searchParams.get('p') || '';
        let ok = false;
        const until = Number(e);
        if (t && e && Number.isFinite(until) && Date.now() <= until) {
          if (p) {
            /* ⚠ УГТВАРЫН гарын үсэг (`dlp`). Медиа (зураг, видео, хавсралт)-д
               зориулав: тэдгээрийн хаяг өгөгдөл дотор хадгалагдсан, олон зуун
               газар `<img src>`-ээр ашиглагддаг тул түлхүүр бүрд тусад нь
               гарын үсэг авах боломжгүй. Нэг угтварт нэг гарын үсэг авч,
               тухайн угтвар доорх БҮХ файлд хэрэглэнэ.
               ⚠ Түлхүүр нь тэр угтвараар ЭХЭЛЖ байх ЁСТОЙ — эс бөгөөс
               аль ч файлыг татаж болох байсан. */
            ok = key.indexOf(p) === 0 &&
                 safeEq(await hmacHex(env.SIGN_SECRET, 'dlp|' + p + '|' + e), t);
          } else {
            ok = safeEq(await hmacHex(env.SIGN_SECRET, 'dl|' + key + '|' + e), t);
          }
        }
        if (!ok) {
          return new Response('Forbidden — signed link required', { status: 403, headers: cors });
        }
      }

      const range = request.headers.get('range');
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range);
        if (m) {
          const offset = parseInt(m[1], 10);
          const end = m[2] ? parseInt(m[2], 10) : undefined;
          const length = end !== undefined ? (end - offset + 1) : undefined;
          const obj = await env.BUCKET.get(key, { range: { offset, length } });
          if (!obj) return new Response('Not found', { status: 404, headers: cors });
          const size = obj.size;
          const realEnd = end !== undefined ? end : (offset + (obj.range?.length || size) - 1);
          return new Response(obj.body, {
            status: 206,
            headers: { ...cors,
              'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes ${offset}-${realEnd}/${size}` }
          });
        }
      }
      const obj = await env.BUCKET.get(key);
      /* X-Now — серверийн цаг: хөтөч төхөөрөмжийнхөө цагийн зөрүүг сурч,
         тамгыг серверийн цагаар бичнэ (буруу цагтай утас бусдыг дардаггүй). */
      if (!obj) return new Response('Not found', { status: 404, headers: { ...cors, 'X-Now': String(Date.now()) } });
      /* X-Etag — хөтөч «уншсан хувилбараа» мэдэж, бичихдээ X-If-Match-аар
         буцааж өгнө. Стандарт ETag-ийг ЗОРИУД тавихгүй: хөтөч/кэш нөхцөлт
         хүсэлт (304) эхлүүлж одоогийн ачаалалтыг өөрчлөхгүйн тулд. */
      return new Response(obj.body, {
        headers: { ...cors,
          'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
          'Accept-Ranges': 'bytes',
          'X-Etag': obj.etag,
          'X-Now': String(Date.now()) }
      });
    }

    // ── Жижиг файл шууд бичих (PUT, <100MB) ──
    if (request.method === 'PUT') {
      const st = await mayWrite(request, url, key, env);
      if (st !== 'ok') return deny(st, cors);
      if (!key) return new Response('Key required', { status: 400, headers: cors });
      /* ⚠ ЗЭРЭГ БИЧИЛТИЙН ХАМГААЛАЛТ (2026-09-10).
         Олон хөтөч нэг JSON файлыг «уншаад → нэгтгээд → бичдэг». Хоёр хүн
         зэрэг бичвэл сүүлд газардсан нь эхнийхийн өөрчлөлтийг ЧИМЭЭГҮЙ
         дардаг байв (ажлын захиалгын батлалт алга болсон). Хөтөч уншихдаа
         авсан X-Etag-аа X-If-Match-аар буцааж өгвөл файл тэр хооронд
         өөрчлөгдсөн үед БИЧИХГҮЙ, 412 буцаана — хөтөч шинээр уншиж нэгтгэнэ.
         Толгойгүй бичилт (медиа, хуучин хөтөч) урьдын адил шууд бичигдэнэ. */
      const ifMatch = (request.headers.get('X-If-Match') || '').trim();
      const ifNone = (request.headers.get('X-If-None-Match') || '').trim();
      const jh = { ...cors, 'Content-Type': 'application/json', 'X-Now': String(Date.now()) };
      /* Заавал тамгатай файл — тамгагүй бичилтийг ХҮЛЭЭЖ АВАХГҮЙ (428) */
      if (!ifMatch && !ifNone && needsCas(key, env)) {
        return new Response(JSON.stringify({ required: true, key }), { status: 428, headers: jh });
      }
      /* X-If-None-Match: * — «файл байхгүй үед л үүсгэ» (хоёр хүн зэрэг үүсгэхэд нэг нь ялна) */
      if (ifNone === '*') {
        const had = await env.BUCKET.head(key);
        if (had) return new Response(JSON.stringify({ conflict: true, key, exists: true }),
          { status: 412, headers: { ...jh, 'X-Etag': had.etag } });
      }
      const putOpts = {
        httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' },
      };
      if (ifMatch) putOpts.onlyIf = { etagMatches: ifMatch };
      let saved = null;
      try {
        saved = await env.BUCKET.put(key, request.body, putOpts);
      } catch (err) {
        if (!(ifMatch && /precondition/i.test(String((err && err.message) || err)))) throw err;
        saved = null;
      }
      if (!saved) {
        return new Response(JSON.stringify({ conflict: true, key }), { status: 412, headers: jh });
      }
      return new Response(JSON.stringify({ url: url.origin + '/' + encodeURIComponent(key), key, etag: saved.etag }),
        { headers: { ...jh, 'X-Etag': saved.etag } });
    }

    return new Response('Method Not Allowed', { status: 405, headers: cors });
  },
};
