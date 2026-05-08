const admin = require('firebase-admin');

exports.handler = async (event) => {
  const uid = event.queryStringParameters?.uid;
  if (!uid) return { statusCode: 400, body: JSON.stringify({ error: 'uid required' }) };

  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    const projectId = sa.project_id;

    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;

    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/default/documents/users/${uid}`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );

    if (res.status === 404) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ exists: false })
      };
    }

    if (!res.ok) {
      const err = await res.text();
      return {
        statusCode: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: err.substring(0, 300) })
      };
    }

    const doc = await res.json();
    // Convert Firestore field format to plain object
    const data = {};
    for (const [key, val] of Object.entries(doc.fields || {})) {
      if (val.stringValue !== undefined) data[key] = val.stringValue;
      else if (val.booleanValue !== undefined) data[key] = val.booleanValue;
      else if (val.integerValue !== undefined) data[key] = parseInt(val.integerValue);
      else if (val.doubleValue !== undefined) data[key] = val.doubleValue;
      else if (val.timestampValue !== undefined) data[key] = val.timestampValue;
      else if (val.nullValue !== undefined) data[key] = null;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ exists: true, data })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
