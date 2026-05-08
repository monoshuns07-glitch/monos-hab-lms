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

    // 1. List all UIDs (paginated)
    const allUids = [];
    let pageToken = null;
    while (true) {
      const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet`);
      url.searchParams.set('maxResults', '1000');
      if (pageToken) url.searchParams.set('nextPageToken', pageToken);

      const res = await fetch(url.toString(), {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) throw new Error(`list ${res.status}: ${(await res.text()).substring(0, 200)}`);
      const data = await res.json();
      const users = data.users || [];
      allUids.push(...users.map(u => u.localId));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
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

    // 3. Delete all Firestore users docs (paginated batch deletes)
    let firestoreDeleted = 0;
    while (true) {
      const snap = await db.collection('users').limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      firestoreDeleted += snap.size;
      if (snap.size < 400) break;
    }
    debug.push('fs_deleted=' + firestoreDeleted);

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
