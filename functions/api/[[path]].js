// Pages executes this on the server. The upstream is fixed: client input cannot
// choose a host, and neither OAuth secrets nor an AI key belong in this proxy.
const BACKEND = 'https://api.mowoo.kro.kr';

const failure = (status, message) => Response.json({
  isSuccess: false, message, error: { code: 'API_PROXY_ERROR', message },
}, { status, headers: { 'Cache-Control': 'no-store' } });

export async function onRequest({ request }) {
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith('/api/')) return failure(404, 'API 경로를 확인해 주세요.');
  // Cookie-authenticated mutations must originate from this frontend.
  const origin = request.headers.get('Origin');
  if (origin && origin !== incoming.origin) return failure(403, '허용되지 않은 요청 출처예요.');
  const target = new URL(BACKEND);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  for (const name of ['host', 'origin', 'referer', 'connection', 'content-length', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for']) headers.delete(name);
  // Server-to-server fetch does not require CORS. The original browser Origin
  // was checked above; Spring must not reject it as an unconfigured API origin.
  try {
    const upstream = await fetch(target.href, {
      method: request.method, headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual', signal: request.signal,
      // Node's fetch test runner requires duplex for streamed upload bodies.
      duplex: 'half',
    });
    // API responses are JSON/files, never OAuth navigation. Do not forward
    // credentials through a redirect or turn an HTTP login redirect into HTML.
    if (upstream.status >= 300 && upstream.status < 400) return failure(502, 'API 서버의 연결 주소를 확인해 주세요.');
    const responseHeaders = new Headers(upstream.headers);
    const cookies = typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : upstream.headers.getAll('Set-Cookie');
    responseHeaders.delete('Set-Cookie');
    for (const cookie of cookies) {
      // Make refresh cookies host-only for pages.dev; preserve HttpOnly,
      // Secure, SameSite, Path and expiry (including logout/withdrawal expiry).
      responseHeaders.append('Set-Cookie', cookie.replace(/;\s*Domain=[^;]*/gi, ''));
    }
    responseHeaders.set('Cache-Control', 'no-store');
    for (const name of ['access-control-allow-origin', 'access-control-allow-credentials', 'content-length']) responseHeaders.delete(name);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    return failure(502, 'API 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
}
