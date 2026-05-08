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

    // Validate input first
    const validUsers = users.filter(u => {
      const email = (u.email || '').trim().toLowerCase();
      const password = String(u.password || '').trim();
      if (!email || password.length < 6) { skipped++; return false; }
      u._email = email; u._password = password;
      return true;
    });

    // Create all Auth users IN PARALLEL (much faster than sequential)
    const authResults = await Promise.all(validUsers.map(async (u) => {
      try {
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`,
          {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: u._email, password: u._password, emailVerified: true })
          }
        );
        if (!res.ok) {
          const errText = await res.text();
          if (errText.includes('EMAIL_EXISTS') || errText.includes('DUPLICATE_EMAIL')) {
            return { skip: true, email: u._email };
          }
          return { fail: true, email: u._email, error: errText.substring(0, 100) };
        }
        const data = await res.json();
        return { uid: data.localId, user: u };
      } catch (e) {
        return { fail: true, email: u._email, error: e.message };
      }
    }));

    // Build Firestore batch
    let firestoreBatch = db.batch();
    let batchCount = 0;

    for (const r of authResults) {
      if (r.skip) { skipped++; continue; }
      if (r.fail) { failed++; errors.push(`${r.email}: ${r.error}`); continue; }
      const u = r.user;
      firestoreBatch.set(db.collection('users').doc(r.uid), {
        uid: r.uid,
        email: u._email,
        password: u._password,
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
      if (batchCount >= 400) {
        await firestoreBatch.commit();
        firestoreBatch = db.batch();
        batchCount = 0;
      }
      created++;
    }
    if (batchCount > 0) await firestoreBatch.commit();

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
