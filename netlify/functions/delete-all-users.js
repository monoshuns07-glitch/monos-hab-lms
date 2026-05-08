const { initializeApp, getApps, deleteApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const debug = [];
  let app = null;

  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 env var missing');
    debug.push('b64_len=' + b64.length);

    let sa;
    try {
      sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    } catch (e) {
      throw new Error('JSON parse failed: ' + e.message);
    }

    if (!sa.project_id || !sa.private_key || !sa.client_email) {
      throw new Error('SA invalid — proj:' + !!sa.project_id + ' key:' + !!sa.private_key + ' email:' + !!sa.client_email);
    }
    debug.push('sa_ok project=' + sa.project_id);

    // Clean up any apps from warm Lambda
    const existing = getApps();
    if (existing.length > 0) {
      for (const a of existing) {
        try { await deleteApp(a); } catch (_) {}
      }
      debug.push('cleared_' + existing.length);
    }

    // Initialize as DEFAULT app (no name argument) — most compatible
    app = initializeApp({ credential: cert(sa) });
    debug.push('app_init_ok name=' + app.name);

    const auth = getAuth(app);
    debug.push('got_auth');

    let deleted = 0;
    let pageToken;
    let firstPage = true;
    do {
      const result = await auth.listUsers(1000, pageToken);
      if (firstPage) { debug.push('list_ok=' + result.users.length); firstPage = false; }
      const uids = result.users.map(u => u.uid);
      if (uids.length > 0) {
        await auth.deleteUsers(uids);
        deleted += uids.length;
      }
      pageToken = result.pageToken;
    } while (pageToken);

    debug.push('deleted=' + deleted);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, deleted, debug })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e.message, code: e.code || '', debug })
    };
  } finally {
    if (app) try { await deleteApp(app); } catch (_) {}
  }
};
