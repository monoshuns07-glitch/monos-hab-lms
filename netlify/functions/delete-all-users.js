const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
  );
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
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
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};
