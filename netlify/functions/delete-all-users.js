const { initializeApp, getApps, deleteApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const debug = [];
  let app = null;

  try {
    // Check env var
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 env var missing');
    debug.push(`env_len=${b64.length}`);

    // Parse service account
    let serviceAccount;
    try {
      const json = Buffer.from(b64.trim(), 'base64').toString('utf8');
      serviceAccount = JSON.parse(json);
    } catch (e) {
      throw new Error('JSON parse failed: ' + e.message);
    }

    const hasFields = !!(serviceAccount.project_id && serviceAccount.private_key && serviceAccount.client_email);
    debug.push(`sa_ok=${hasFields},project=${serviceAccount.project_id || 'MISSING'}`);
    if (!hasFields) throw new Error('Service account missing required fields');

    // Always use fresh app to avoid warm Lambda issues
    const existingApps = getApps();
    if (existingApps.length > 0) {
      await Promise.all(existingApps.map(a => deleteApp(a)));
      debug.push('deleted_existing_apps');
    }

    app = initializeApp({ credential: cert(serviceAccount) }, 'deleteJob');
    debug.push('app_initialized');

    const auth = getAuth(app);
    debug.push('auth_ok');

    let deleted = 0;
    let pageToken;
    do {
      const result = await auth.listUsers(1000, pageToken);
      const uids = result.users.map(u => u.uid);
      if (uids.length > 0) {
        await auth.deleteUsers(uids);
        deleted += uids.length;
      }
      pageToken = result.pageToken;
    } while (pageToken);

    debug.push(`deleted=${deleted}`);
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
    if (app) {
      try { await deleteApp(app); } catch (_) {}
    }
  }
};
