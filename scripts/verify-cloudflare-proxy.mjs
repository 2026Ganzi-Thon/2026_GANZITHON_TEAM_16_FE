import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
import fs from 'node:fs';

const realFetch = globalThis.fetch;
const origin = 'https://2026-ganzithon-team-16-fe.pages.dev';
let observed, result;
globalThis.fetch = async (url, options) => { observed = { url, options }; return result; };
try {
  result = Response.json({ accessToken: 'test' }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  result.headers.append('Set-Cookie', 'refresh_token=refresh; Domain=api.mowoo.kro.kr; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax');
  result.headers.append('Set-Cookie', 'other=value; Path=/; HttpOnly; Secure');
  const login = await onRequest({ request: new Request(origin + '/api/v1/auth/google', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer test', Cookie: 'refresh_token=old' }, body: JSON.stringify({ code: 'test-code' }),
  }) });
  assert.equal(observed.url, 'https://api.mowoo.kro.kr/api/v1/auth/google');
  assert.equal(observed.options.redirect, 'manual');
  assert.equal(observed.options.headers.get('Origin'), null);
  assert.equal(observed.options.headers.get('Authorization'), 'Bearer test');
  assert.equal(observed.options.headers.get('Cookie'), 'refresh_token=old');
  assert.deepEqual(JSON.parse(await new Response(observed.options.body).text()), { code: 'test-code' });
  assert.equal(login.headers.get('Cache-Control'), 'no-store');
  assert.equal(login.headers.getSetCookie().length, 2);
  assert(!login.headers.get('Set-Cookie').includes('Domain='));
  assert(login.headers.get('Set-Cookie').includes('HttpOnly; Secure; SameSite=Lax'));
  assert.deepEqual(await login.json(), { accessToken: 'test' });

  result = Response.json({ items: [] });
  await onRequest({ request: new Request(origin + '/api/v1/diaries?limit=100&cursor=a%2Bb%3D') });
  assert.equal(new URL(observed.url).search, '?limit=100&cursor=a%2Bb%3D');
  const form = new FormData(); form.append('payload', '{"content":"사진"}'); form.append('files', new Blob(['photo-bytes'], { type: 'image/jpeg' }), 'photo.jpg');
  await onRequest({ request: new Request(origin + '/api/v1/chat-sessions/session/messages', { method: 'POST', body: form }) });
  const sent = await new Response(observed.options.body, { headers: observed.options.headers }).formData();
  assert.equal(sent.get('payload'), '{"content":"사진"}');
  assert.equal(await sent.get('files').text(), 'photo-bytes');

  result = new Response(null, { status: 204 });
  assert.equal((await onRequest({ request: new Request(origin + '/api/v1/me/records', { method: 'DELETE' }) })).status, 204);
  result = Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401, headers: { 'Set-Cookie': 'refresh_token=; Domain=.mowoo.kro.kr; Max-Age=0; Path=/api/v1/auth; HttpOnly; Secure' } });
  const denied = await onRequest({ request: new Request(origin + '/api/v1/auth/reissue', { method: 'POST' }) });
  assert.equal(denied.status, 401); assert(denied.headers.get('Set-Cookie').includes('Max-Age=0')); assert(!denied.headers.get('Set-Cookie').includes('Domain='));
  assert.equal((await denied.json()).error.code, 'UNAUTHORIZED');
  assert.equal((await onRequest({ request: new Request(origin + '/api/v1/auth/reissue', { method: 'POST', headers: { Origin: 'https://unrelated.example' } }) })).status, 403);
  assert.equal((await onRequest({ request: new Request(origin + '/home') })).status, 404);
  result = new Response(null, { status: 302, headers: { Location: 'https://unrelated.example' } });
  assert.equal((await onRequest({ request: new Request(origin + '/api/v1/me') })).status, 502);
  globalThis.fetch = async () => { throw Error('network failure'); };
  assert.equal((await onRequest({ request: new Request(origin + '/api/v1/me') })).status, 502);
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../public/_routes.json', import.meta.url), 'utf8')).include, ['/api/*']);
  console.log('PASS: fixed upstream, paths/query, JSON/multipart streams, auth/cookies, cookie expiry, no-store, HTTP errors, redirects, origin gate and API-only routing.');
} finally { globalThis.fetch = realFetch; }
