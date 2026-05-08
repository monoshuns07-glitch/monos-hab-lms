const admin = require('firebase-admin');

exports.handler = async (event) => {
  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    const projectId = sa.project_id;

    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;

    // List all Firestore databases in the project
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );

    const text = await res.text();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, status: res.status, response: text })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
