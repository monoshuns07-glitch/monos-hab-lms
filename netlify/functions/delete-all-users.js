const admin = require('firebase-admin');

function getFirestore(sa) {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
  }
  return admin.firestore();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const debug = [];

  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 missing');

    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    const projectId = sa.project_id;

    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;

    const db = getFirestore(sa);

    // 1. List all UIDs via Identity Platform query API (paginated)
    const allUids = [];
    let nextPageToken = null;
    while (true) {
      const body = { returnUserInfo: true, limit: 500 };
      if (nextPageToken) body.offset = nextPageToken;

      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:query`,
        {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );
      if (!res.ok) throw new Error(`list ${res.status}: ${(await res.text()).substring(0, 200)}`);
      const data = await res.json();
      const users = data.userInfo || [];
      if (users.length === 0) break;
      allUids.push(...users.map(u => u.localId));
      // accounts:query doesn't have built-in pagination tokens, use offset
      if (users.length < 500) break;
      nextPageToken = String(allUids.length);
    }
    debug.push('total=' + allUids.length);

    // 2. Delete from Auth in chunks of 100, parallel
    const CHUNK = 100;
    const chunks = [];
    for (let i = 0; i < allUids.length; i += CHUNK) {
      chunks.push(allUids.slice(i, i + CHUNK));
    }

    let deleted = 0;
    if (chunks.length > 0) {
      const results = await Promise.all(chunks.map(async (uids) => {
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchDelete`,
          {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ localIds: uids, force: true })
          }
        );
        if (!res.ok) throw new Error(`delete ${res.status}: ${(await res.text()).substring(0, 200)}`);
        return uids.length;
      }));
      deleted = results.reduce((a, b) => a + b, 0);
    }
    debug.push('auth_deleted=' + deleted);

    // 3. Delete all Firestore users docs via REST API
    let firestoreDeleted = 0;
    try {
      while (true) {
        // List documents
        const listRes = await fetch(
          `https://firestore.googleapis.com/v1/projects/${projectId}/databases/default/documents/users?pageSize=300`,
          { headers: { 'Authorization': 'Bearer ' + token } }
        );
        if (!listRes.ok) {
          debug.push('fs_list_' + listRes.status);
          break;
        }
        const listData = await listRes.json();
        const docs = listData.documents || [];
        if (docs.length === 0) break;

        // Delete via batch commit
        const writes = docs.map(d => ({ delete: d.name }));
        const commitRes = await fetch(
          `https://firestore.googleapis.com/v1/projects/${projectId}/databases/default/documents:commit`,
          {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ writes })
          }
        );
        if (!commitRes.ok) {
          debug.push('fs_commit_' + commitRes.status);
          break;
        }
        firestoreDeleted += docs.length;
        if (docs.length < 300) break;
      }
      debug.push('fs_deleted=' + firestoreDeleted);
    } catch (fe) {
      debug.push('fs_err=' + (fe.message||'').substring(0, 80));
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, deleted, firestoreDeleted, debug })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e.message, debug })
    };
  }
};
