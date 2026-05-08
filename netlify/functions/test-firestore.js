const admin = require('firebase-admin');

exports.handler = async (event) => {
  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    const projectId = sa.project_id;

    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;

    const results = {};

    // Test 1: Try writing a single doc
    const testDoc = {
      writes: [{
        update: {
          name: `projects/${projectId}/databases/(default)/documents/users/test-uid-12345`,
          fields: {
            uid: { stringValue: 'test-uid-12345' },
            email: { stringValue: 'test@test.com' },
            firstName: { stringValue: 'Test' },
            lastName: { stringValue: 'User' }
          }
        }
      }]
    };
    const writeRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(testDoc)
      }
    );
    results.write_status = writeRes.status;
    results.write_body = (await writeRes.text()).substring(0, 500);

    // Test 2: List documents in users collection
    const listRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?pageSize=5`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    results.list_status = listRes.status;
    const listText = await listRes.text();
    results.list_body = listText.substring(0, 800);

    // Test 3: Get the test doc we just wrote
    const getRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/test-uid-12345`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    results.get_status = getRes.status;
    results.get_body = (await getRes.text()).substring(0, 500);

    // Test 4: List Auth users
    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:query`,
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUserInfo: false, limit: 1 })
      }
    );
    results.auth_status = authRes.status;
    const authData = await authRes.json();
    results.auth_count = authData.recordsCount || 'unknown';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, results }, null, 2)
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
