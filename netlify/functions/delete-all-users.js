const admin = require('firebase-admin');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const debug = [];

  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 missing');
    debug.push('b64_len=' + b64.length);

    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    if (!sa.project_id || !sa.private_key || !sa.client_email) {
      throw new Error('SA invalid');
    }
    debug.push('project=' + sa.project_id);

    // Use admin.credential to get OAuth access token only (bypass auth SDK)
    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;
    if (!token) throw new Error('No access token');
    debug.push('got_token len=' + token.length);

    const projectId = sa.project_id;
    let deleted = 0;
    let pageToken = null;

    // Direct REST API: list users via batchGet
    while (true) {
      const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet`);
      url.searchParams.set('maxResults', '1000');
      if (pageToken) url.searchParams.set('nextPageToken', pageToken);

      const listRes = await fetch(url.toString(), {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if (!listRes.ok) {
        const errText = await listRes.text();
        throw new Error(`listUsers failed ${listRes.status}: ${errText.substring(0, 300)}`);
      }

      const listData = await listRes.json();
      const users = listData.users || [];
      if (users.length === 0 && !pageToken) {
        debug.push('no_users');
        break;
      }
      debug.push('listed=' + users.length);

      const uids = users.map(u => u.localId);
      if (uids.length > 0) {
        const delRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchDelete`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ localIds: uids, force: true })
          }
        );
        if (!delRes.ok) {
          const errText = await delRes.text();
          throw new Error(`deleteUsers failed ${delRes.status}: ${errText.substring(0, 300)}`);
        }
        deleted += uids.length;
      }

      pageToken = listData.nextPageToken;
      if (!pageToken) break;
    }

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
  }
};
