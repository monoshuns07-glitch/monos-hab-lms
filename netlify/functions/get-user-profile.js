const admin = require('firebase-admin');

function decodeFields(fields) {
  const data = {};
  for (const [key, val] of Object.entries(fields || {})) {
    if (val.stringValue !== undefined) data[key] = val.stringValue;
    else if (val.booleanValue !== undefined) data[key] = val.booleanValue;
    else if (val.integerValue !== undefined) data[key] = parseInt(val.integerValue);
    else if (val.doubleValue !== undefined) data[key] = val.doubleValue;
    else if (val.timestampValue !== undefined) data[key] = val.timestampValue;
    else if (val.nullValue !== undefined) data[key] = null;
  }
  return data;
}

exports.handler = async (event) => {
  const uid = event.queryStringParameters?.uid;
  const email = event.queryStringParameters?.email;
  if (!uid && !email) return { statusCode: 400, body: JSON.stringify({ error: 'uid or email required' }) };

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    const projectId = sa.project_id;

    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;

    // Try UID lookup first
    if (uid) {
      const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/default/documents/users/${uid}`,
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      if (res.ok) {
        const doc = await res.json();
        return { statusCode: 200, headers, body: JSON.stringify({ exists: true, data: decodeFields(doc.fields) }) };
      }
    }

    // Fall back to email query
    if (email) {
      const queryBody = {
        structuredQuery: {
          from: [{ collectionId: 'users' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'email' },
              op: 'EQUAL',
              value: { stringValue: email.toLowerCase() }
            }
          },
          limit: 1
        }
      };
      const qRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/default/documents:runQuery`,
        {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(queryBody)
        }
      );
      if (qRes.ok) {
        const arr = await qRes.json();
        const doc = arr.find(r => r.document)?.document;
        if (doc) {
          return { statusCode: 200, headers, body: JSON.stringify({ exists: true, data: decodeFields(doc.fields), foundBy: 'email' }) };
        }
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ exists: false }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
