const admin = require('firebase-admin');

function decodeFields(fields) {
  const data = {};
  for (const [key, val] of Object.entries(fields || {})) {
    if (val.stringValue !== undefined) data[key] = val.stringValue;
    else if (val.booleanValue !== undefined) data[key] = val.booleanValue;
    else if (val.integerValue !== undefined) data[key] = parseInt(val.integerValue);
    else if (val.doubleValue !== undefined) data[key] = val.doubleValue;
    else if (val.timestampValue !== undefined) data[key] = val.timestampValue;
    else if (val.arrayValue) data[key] = (val.arrayValue.values || []).map(v => v.stringValue || v.integerValue || v.booleanValue);
    else if (val.mapValue) data[key] = decodeFields(val.mapValue.fields);
  }
  return data;
}

async function listAll(token, projectId, collection) {
  const out = [];
  let pageToken = '';
  while (true) {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.toString(), { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) return out;
    const data = await res.json();
    const docs = data.documents || [];
    for (const d of docs) {
      const id = d.name.split('/').pop();
      out.push({ id, ...decodeFields(d.fields) });
    }
    if (!data.nextPageToken || docs.length === 0) break;
    pageToken = data.nextPageToken;
  }
  return out;
}

exports.handler = async () => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    const projectId = sa.project_id;
    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;

    const [users, trainings, progress, chapters, topics] = await Promise.all([
      listAll(token, projectId, 'users'),
      listAll(token, projectId, 'trainings'),
      listAll(token, projectId, 'training_progress'),
      listAll(token, projectId, 'chapters'),
      listAll(token, projectId, 'topics')
    ]);

    // Compute per-training stats
    const trainingStats = trainings.map(t => {
      const tProg = progress.filter(p => p.trainingId === t.id);
      const passed = tProg.filter(p => p.status === 'passed').length;
      const failed = tProg.filter(p => p.status === 'failed').length;
      const inProgress = tProg.filter(p => p.status === 'in_progress' || (!p.status && p.watchProgress > 0)).length;
      const scores = tProg.filter(p => typeof p.examScore === 'number').map(p => p.examScore);
      const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0) / scores.length) : null;
      return {
        id: t.id,
        title: t.title,
        duration: t.duration,
        invitedCount: (t.invitedEmployees || []).length,
        passed, failed, inProgress,
        avgScore,
        startDate: t.startDate,
        endDate: t.endDate,
        isActive: t.isActive !== false
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalUsers: users.length,
        totalTrainings: trainings.length,
        totalChapters: chapters.length,
        totalTopics: topics.length,
        totalProgressRecords: progress.length,
        trainingStats
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
