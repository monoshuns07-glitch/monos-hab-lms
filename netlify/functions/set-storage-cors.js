/* One-shot function: configures CORS on the Firebase Storage bucket
   using the FIREBASE_SERVICE_ACCOUNT_B64 env var. Hit it once after
   adding a new origin or installing the project.

   URL: /.netlify/functions/set-storage-cors
*/
const admin = require('firebase-admin');

exports.handler = async () => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 env var missing');

    const sa = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    const cred = admin.credential.cert(sa);
    const tokenInfo = await cred.getAccessToken();
    const token = tokenInfo.access_token;
    const bucket = `${sa.project_id}.firebasestorage.app`;

    // PATCH the bucket metadata with CORS config
    const corsConfig = [{
      origin: ['*'],
      method: ['GET', 'PUT', 'POST', 'HEAD'],
      responseHeader: [
        'Content-Type',
        'Authorization',
        'Content-Range',
        'X-Goog-Resumable',
        'X-Goog-Upload-URL',
        'X-Goog-Upload-Status',
        'X-Goog-Upload-Chunk-Granularity'
      ],
      maxAgeSeconds: 3600
    }];

    const res = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucket}?fields=cors,id`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cors: corsConfig })
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        bucket: data.id,
        cors: data.cors,
        message: '✓ CORS амжилттай тохируулагдлаа. Одоо browser-аас Firebase Storage руу видео ачаалах боломжтой.'
      }, null, 2)
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};
