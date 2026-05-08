const admin = require('firebase-admin');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const uid = body.uid;
    if (!uid) throw new Error('uid required');

    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 missing');

    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));

    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;

    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${sa.project_id}/accounts:delete`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ localId: uid })
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.substring(0, 300)}`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, uid })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};
