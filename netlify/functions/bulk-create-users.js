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

    // Validate input first
    const validUsers = users.filter(u => {
      const email = (u.email || '').trim().toLowerCase();
      const password = String(u.password || '').trim();
      if (!email || password.length < 6) { skipped++; return false; }
      u._email = email; u._password = password;
      return true;
    });

    // Create all Auth users IN PARALLEL
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

    // Build Firestore writes via REST API (commit endpoint)
    const writes = [];
    for (const r of authResults) {
      if (r.skip) { skipped++; continue; }
      if (r.fail) { failed++; errors.push(`${r.email}: ${r.error}`); continue; }
      const u = r.user;
      writes.push({
        update: {
          name: `projects/${projectId}/databases/(default)/documents/users/${r.uid}`,
          fields: {
            uid: { stringValue: r.uid },
            email: { stringValue: u._email },
            password: { stringValue: u._password },
            lastName: { stringValue: (u.lastName || '').trim() },
            firstName: { stringValue: (u.firstName || '').trim() },
            position: { stringValue: (u.position || '').trim() },
            department: { stringValue: (u.department || '').trim() },
            role: { stringValue: 'employee' },
            isActive: { booleanValue: true },
            createdAt: { timestampValue: new Date().toISOString() },
            totalSiteTime: { integerValue: '0' }
          }
        }
      });
      created++;
    }

    // Commit all writes via Firestore REST API (max 500 per commit)
    for (let i = 0; i < writes.length; i += 400) {
      const chunk = writes.slice(i, i + 400);
      const commitRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
        {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ writes: chunk })
        }
      );
      if (!commitRes.ok) {
        const err = await commitRes.text();
        throw new Error(`Firestore commit ${commitRes.status}: ${err.substring(0, 200)}`);
      }
    }

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
