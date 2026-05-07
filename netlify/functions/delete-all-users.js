const admin = require('firebase-admin');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const debug = [];
  let app;

  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 env var missing');
    debug.push('b64_len=' + b64.length);

    let sa;
    try {
      sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    } catch (e) {
      throw new Error('base64/JSON parse failed: ' + e.message);
    }

    if (!sa.project_id || !sa.private_key || !sa.client_email) {
      throw new Error('SA invalid — proj:' + !!sa.project_id + ' key:' + !!sa.private_key + ' email:' + !!sa.client_email);
    }
    debug.push('sa_ok project=' + sa.project_id);

    // Delete any stale apps to avoid warm-Lambda conflicts
    await Promise.all(admin.apps.slice().map(a => a.delete().catch(() => {})));
    debug.push('stale_cleared');

    // Use timestamp-named app so it's always fresh
    app = admin.initializeApp(
      { credential: admin.credential.cert(sa) },
      'job_' + Date.now()
    );
    debug.push('app_init_ok');

    const authSvc = app.auth();
    debug.push('auth_svc_ok');

    let deleted = 0;
    let pageToken;
    do {
      const result = await authSvc.listUsers(1000, pageToken);
      const uids = result.users.map(u => u.uid);
      if (uids.length > 0) {
        await authSvc.deleteUsers(uids);
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
      body: JSON.stringify({ success: false, error: e.message, debug })
    };
  } finally {
    if (app) try { await app.delete(); } catch (_) {}
  }
};
