const admin = require('firebase-admin');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Initialize if not already done
    if (!admin.apps.length) {
      const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
      if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 env var missing');
      const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }

    let deleted = 0;
    let pageToken;

    do {
      const result = await admin.auth().listUsers(1000, pageToken);
      const uids = result.users.map(u => u.uid);
      if (uids.length > 0) {
        await admin.auth().deleteUsers(uids);
        deleted += uids.length;
      }
      pageToken = result.pageToken;
    } while (pageToken);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, deleted })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e.message, stack: e.stack })
    };
  }
};
