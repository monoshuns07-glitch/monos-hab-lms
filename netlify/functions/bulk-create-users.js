const admin = require('firebase-admin');

// Initialize Firestore once via Admin SDK (bypasses security rules)
function getFirestore(sa) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id
    });
  }
  return admin.firestore();
}

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

    const db = getFirestore(sa);
    const FieldValue = admin.firestore.FieldValue;

    let created = 0, skipped = 0, failed = 0;
    const errors = [];

    // Use Firestore batched writes (max 500 per batch)
    let firestoreBatch = db.batch();
    let batchCount = 0;

    const flushBatch = async () => {
      if (batchCount > 0) {
        await firestoreBatch.commit();
        firestoreBatch = db.batch();
        batchCount = 0;
      }
    };

    for (const u of users) {
      const email = (u.email || '').trim().toLowerCase();
      const password = String(u.password || '').trim();
      if (!email || password.length < 6) { skipped++; continue; }

      try {
        // Create user in Firebase Auth via REST API
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

        // Add to Firestore batch
        firestoreBatch.set(db.collection('users').doc(uid), {
          uid,
          email,
          password,
          lastName: (u.lastName || '').trim(),
          firstName: (u.firstName || '').trim(),
          position: (u.position || '').trim(),
          department: (u.department || '').trim(),
          role: 'employee',
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
          totalSiteTime: 0
        });
        batchCount++;
        if (batchCount >= 400) await flushBatch();

        created++;
      } catch (e) {
        errors.push(`${email}: ${e.message}`);
        failed++;
      }
    }

    await flushBatch();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, created, skipped, failed, errors: errors.slice(0, 10) })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};
