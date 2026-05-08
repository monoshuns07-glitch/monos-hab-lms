const admin = require('firebase-admin');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const users = body.users || [];
    if (!Array.isArray(users) || users.length === 0) {
      throw new Error('users array required');
    }

    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 missing');

    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    const projectId = sa.project_id;

    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;

    let created = 0, skipped = 0, failed = 0;
    const errors = [];
    const createdDocs = [];

    for (const u of users) {
      const email = (u.email || '').trim().toLowerCase();
      const password = String(u.password || '').trim();
      if (!email || password.length < 6) { skipped++; continue; }

      try {
        // Create user in Firebase Auth
        const authRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`,
          {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, emailVerified: true })
          }
        );

        if (!authRes.ok) {
          const errText = await authRes.text();
          if (errText.includes('EMAIL_EXISTS') || errText.includes('DUPLICATE_EMAIL')) {
            skipped++;
          } else {
            errors.push(`${email}: ${errText.substring(0, 100)}`);
            failed++;
          }
          continue;
        }

        const authData = await authRes.json();
        const uid = authData.localId;

        createdDocs.push({
          uid,
          email,
          password,
          lastName: (u.lastName || '').trim(),
          firstName: (u.firstName || '').trim(),
          position: (u.position || '').trim(),
          department: (u.department || '').trim()
        });

        created++;
      } catch (e) {
        errors.push(`${email}: ${e.message}`);
        failed++;
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, created, skipped, failed, errors: errors.slice(0, 10), users: createdDocs })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};
