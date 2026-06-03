// _middleware.js — Бүх /api/* function-уудад CORS header нэмнэ
// Cloudflare Pages Functions автоматаар сонгож ачаална.

export async function onRequest(context) {
  // OPTIONS preflight-ийг шууд хариулна
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-internal-token',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const response = await context.next();
  // Хариу руу CORS header нэмнэ
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
