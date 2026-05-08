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
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    const projectId = sa.project_id;

    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;

    const users = [];
    let nextPageToken = '';
    while (true) {
      const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users`);
      url.searchParams.set('pageSize', '300');
      if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);

      const res = await fetch(url.toString(), { headers: { 'Authorization': 'Bearer ' + token } });
      if (!res.ok) {
        const err = await res.text();
        return { statusCode: res.status, headers, body: JSON.stringify({ error: err.substring(0, 300) }) };
      }
      const data = await res.json();
      const docs = data.documents || [];
      for (const d of docs) {
        const id = d.name.split('/').pop();
        users.push({ id, ...decodeFields(d.fields) });
      }
      if (!data.nextPageToken || docs.length === 0) break;
      nextPageToken = data.nextPageToken;
    }

    return { statusCode: 200, headers, body: JSON.stringify({ users }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
