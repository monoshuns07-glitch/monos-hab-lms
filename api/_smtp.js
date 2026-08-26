/* ══════════════════════════════════════════════════════════════
   GMAIL SMTP — гаднын сан (npm) ашиглахгүй, Node-ийн tls-ээр шууд.
   Gmail-ийн серверээс илгээснээр Outlook/Exchange итгэж, Junk-д ордоггүй.
   Хэрэглэх: GMAIL_USER + GMAIL_APP_PASSWORD орчны хувьсагч.
   ══════════════════════════════════════════════════════════════ */
const tls = require('tls');

/* Кирилл гарчгийг RFC 2047-оор кодлоно (75 тэмдэгтээс богино хэсгүүдээр) */
function encHeader(s) {
  const str = String(s == null ? '' : s);
  if (/^[\x20-\x7E]*$/.test(str)) return str;          // зөвхөн ASCII бол хэвээр
  const parts = [];
  let cur = '';
  for (const ch of str) {                               // тэмдэгт тус бүрээр (surrogate аюулгүй)
    const test = cur + ch;
    if (Buffer.byteLength(test, 'utf8') > 30) { parts.push(cur); cur = ch; }
    else cur = test;
  }
  if (cur) parts.push(cur);
  return parts.map(p => '=?UTF-8?B?' + Buffer.from(p, 'utf8').toString('base64') + '?=').join('\r\n ');
}

function b64Body(s) {
  return Buffer.from(String(s || ''), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
}

function buildMime(o) {
  const b = 'b' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  return [
    'From: ' + encHeader(o.fromName) + ' <' + o.user + '>',
    'To: <' + o.to + '>',
    'Subject: ' + encHeader(o.subject),
    'Date: ' + new Date().toUTCString(),
    /* ⚠ Message-ID-ийн домэйн нь ЖИНХЭНЭ байх ёстой. Өмнө нь '@monos-hab' гэсэн
   домэйн бус утга байсан нь Microsoft 365 (Outlook)-д спамын дохио болж,
   OTP код хогийн сав/хорионд ордог байв (2026-08-26). */
    'Message-ID: <' + Date.now() + '.' + Math.random().toString(36).slice(2) +
      '@' + String(o.user || 'gmail.com').split('@').pop() + '>',
    'Reply-To: ' + encHeader(o.fromName) + ' <' + o.user + '>',
    'MIME-Version: 1.0',
    'X-Auto-Response-Suppress: All',
    'Content-Type: multipart/alternative; boundary="' + b + '"',
    '',
    '--' + b,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Body(o.text),
    '',
    '--' + b,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Body(o.html),
    '',
    '--' + b + '--'
  ].join('\r\n');
}

function sendViaGmail(o) {
  return new Promise((resolve, reject) => {
    let done = false;
    const fail = (e) => { if (done) return; done = true; try { sock.destroy(); } catch (_) {} reject(e); };
    const ok = (v) => { if (done) return; done = true; try { sock.destroy(); } catch (_) {} resolve(v); };

    const sock = tls.connect({ host: 'smtp.gmail.com', port: 465, servername: 'smtp.gmail.com' });
    sock.setEncoding('utf8');
    const timer = setTimeout(() => fail(new Error('SMTP timeout')), 20000);

    let buffer = '';
    let waiter = null;
    sock.on('data', (d) => {
      buffer += d;
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last)) {
        const reply = buffer; buffer = '';
        if (waiter) { const w = waiter; waiter = null; w(reply); }
      }
    });
    sock.on('error', (e) => { clearTimeout(timer); fail(e); });

    const read = () => new Promise((res) => { waiter = res; });
    const send = (line) => { sock.write(line + '\r\n'); return read(); };
    const expect = (reply, codes) => {
      const c = parseInt(String(reply).slice(0, 3), 10);
      if (codes.indexOf(c) === -1) throw new Error('SMTP: ' + String(reply).trim().slice(0, 140));
      return reply;
    };

    (async () => {
      expect(await read(), [220]);
      expect(await send('EHLO monos-hab.vercel.app'), [250]);
      expect(await send('AUTH LOGIN'), [334]);
      expect(await send(Buffer.from(o.user, 'utf8').toString('base64')), [334]);
      expect(await send(Buffer.from(o.pass, 'utf8').toString('base64')), [235]);
      expect(await send('MAIL FROM:<' + o.user + '>'), [250]);
      expect(await send('RCPT TO:<' + o.to + '>'), [250, 251]);
      expect(await send('DATA'), [354]);
      sock.write(buildMime(o) + '\r\n.\r\n');
      expect(await read(), [250]);
      try { sock.write('QUIT\r\n'); } catch (_) {}
      clearTimeout(timer);
      ok('gmail');
    })().catch((e) => { clearTimeout(timer); fail(e); });
  });
}

module.exports = { sendViaGmail, encHeader, buildMime };
