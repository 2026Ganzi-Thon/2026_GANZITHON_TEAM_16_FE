import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3100';
let browser, server;
async function start(overrides = {}) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3100', '--strictPort'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
      VITE_KAKAO_CLIENT_ID: 'test-kakao', VITE_KAKAO_REDIRECT_URI: `${base}/login/oauth2/code/kakao`,
      VITE_GOOGLE_CLIENT_ID: 'test-google', VITE_GOOGLE_REDIRECT_URI: `${base}/login/oauth2/code/google`,
      VITE_NAVER_CLIENT_ID: 'test-naver', VITE_NAVER_REDIRECT_URI: `${base}/login/oauth2/code/naver`, ...overrides },
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exit ${code}`)); });
    server.stdout.on('data', data => { if (data.toString().includes('3100')) { clearTimeout(timeout); resolve(); } });
  });
}
async function stop() { if (server?.exitCode === null) { server.kill(); await once(server, 'exit'); } }
try {
  await start(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const calls = [], profileCalls = [];
  let mode = 'success', release;
  const names = { kakao: '카카오', google: '구글', naver: '네이버' };
  const endpoints = { kakao: 'https://kauth.kakao.com/oauth/authorize', google: 'https://accounts.google.com/o/oauth2/v2/auth', naver: 'https://nid.naver.com/oauth2.0/authorize' };
  for (const endpoint of Object.values(endpoints)) await page.route(`${endpoint}**`, route => route.fulfill({ contentType: 'text/html', body: '<p>Mock authorization screen</p>' }));
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const provider = path.match(/^\/api\/v1\/auth\/(kakao|google|naver)$/)?.[1];
    if (provider) {
      assert.equal(req.method(), 'POST'); assert.equal(req.headers().authorization, undefined, 'Code exchange must not send an old Bearer token');
      const body = req.postDataJSON(); calls.push({ provider, body });
      if (provider === 'naver') assert.equal(typeof body.state, 'string');
      else assert.deepEqual(Object.keys(body), ['code']);
      const selectedMode = mode;
      if (selectedMode === 'network') return route.abort('failed');
      if (selectedMode === 'delay') await new Promise(resolve => { release = resolve; });
      if (selectedMode === 'invalid') return route.fulfill({ status: 400, json: { error: { code: 'SOCIAL_CODE_INVALID', message: '잘못된 인가 코드예요.' } } });
      if (selectedMode === 'unavailable') return route.fulfill({ status: 503, json: { error: { code: 'SOCIAL_PROVIDER_UNAVAILABLE', message: '로그인을 잠시 후 다시 시도해 주세요.' } } });
      if (selectedMode === 'missing-api') return route.fulfill({ status: 404, json: {} });
      return route.fulfill({ json: selectedMode === 'malformed' ? { isSuccess: true } : { accessToken: `${provider}-access-token`, id: `${provider}-owner`, nickname: `${provider} 사용자` }, headers: { 'Set-Cookie': `refresh_token=${provider}-refresh; Path=/api/v1/auth; HttpOnly; SameSite=Lax` } });
    }
    if (path === '/api/v1/me') { profileCalls.push(req.headers().authorization); return route.fulfill({ json: { id: 'owner', nickname: '사용자', usePastDiaries: true, email: null, birthDate: null } }); }
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  const reset = async () => { await page.goto(base + '/'); await page.evaluate(() => sessionStorage.clear()); };
  const attempt = async provider => {
    await reset();
    return page.evaluate(async provider => { const { authorizationUrl } = await import('/src/features/auth/oauth.ts'); return new URL(authorizationUrl(provider)).searchParams.get('state'); }, provider);
  };
  const callback = (provider, code, state, extra = {}) => page.goto(`${base}/login/oauth2/code/${provider}?${new URLSearchParams({ ...(code === null ? {} : { code }), ...(state === null ? {} : { state }), ...extra })}`);
  for (const provider of ['google', 'naver', 'kakao']) {
    await reset(); await page.getByRole('button', { name: `${names[provider]} 로그인`, exact: true }).click();
    await page.waitForURL(`${endpoints[provider]}**`);
    const url = new URL(page.url()), state = url.searchParams.get('state');
    assert.equal(url.searchParams.get('client_id'), `test-${provider}`);
    assert.equal(url.searchParams.get('redirect_uri'), `${base}/login/oauth2/code/${provider}`);
    assert.equal(url.searchParams.get('response_type'), 'code'); assert.match(state, /^[a-f0-9]{64}$/);
    if (provider === 'google') assert.equal(url.searchParams.get('scope'), 'openid profile email');
    const before = calls.length, code = provider === 'google' ? '4/test+code/한글' : 'same-code-across-providers';
    await callback(provider, code, state); await page.waitForURL(base + '/home');
    assert.equal(calls.length, before + 1, 'StrictMode must exchange a code only once');
    assert.equal(calls.at(-1).body.code, code, 'Preserve the URL-decoded code without another decoding pass');
    if (provider === 'naver') assert.equal(calls.at(-1).body.state, state);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('mowoo.accessToken')), `${provider}-access-token`);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('mowoo.oauth.pending')), null);
    assert(!(await page.evaluate(() => document.cookie)).includes('refresh_token'));
    const beforeReplay = calls.length;
    await page.evaluate(async () => { const { tokens } = await import('/src/lib/http.ts'); tokens.clear(); });
    await callback(provider, code, state);
    await page.getByRole('status').filter({ hasText: '로그인 요청이 만료됐거나 일치하지 않아요.' }).waitFor();
    assert.equal(calls.length, beforeReplay); assert.equal(page.url(), base + '/');
  }
  assert(profileCalls.length > 0);
  // Missing/mismatched/expired/wrong-provider/duplicate state never reaches the backend.
  for (const scenario of ['missing', 'wrong', 'expired', 'future', 'provider', 'duplicate', 'missing-code']) {
    const state = await attempt('naver');
    if (scenario === 'expired' || scenario === 'future') await page.evaluate(future => {
      const pending = JSON.parse(sessionStorage.getItem('mowoo.oauth.pending')); pending.createdAt = Date.now() + (future ? 60000 : -660000); sessionStorage.setItem('mowoo.oauth.pending', JSON.stringify(pending));
    }, scenario === 'future');
    const before = calls.length;
    if (scenario === 'duplicate') await page.goto(`${base}/login/oauth2/code/naver?code=test&state=${state}&state=${state}`);
    else await callback(scenario === 'provider' ? 'google' : 'naver', scenario === 'missing-code' ? null : 'test', scenario === 'missing' ? null : scenario === 'wrong' ? 'mismatch' : state);
    await page.getByRole('status').filter({ hasText: /로그인|인가 코드/ }).waitFor();
    assert.equal(calls.length, before, scenario); assert.equal(page.url(), base + '/');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('mowoo.accessToken')), null);
  }
  const cancelledState = await attempt('google'), beforeCancel = calls.length;
  await callback('google', null, cancelledState, { error: 'access_denied', error_description: 'untrusted text' });
  await page.getByRole('status').filter({ hasText: '구글 로그인을 취소했어요.' }).waitFor();
  assert.equal(calls.length, beforeCancel); assert.equal(await page.getByText('untrusted text').count(), 0);
  for (const [failureMode, message] of [['invalid', '잘못된 인가 코드예요.'], ['unavailable', '로그인을 잠시 후 다시 시도해 주세요.'], ['missing-api', '이 로그인 방법을 지금 사용할 수 없어요.'], ['malformed', '로그인 응답을 확인하지 못했어요.'], ['network', '로그인 서버에 연결하지 못했어요.']]) {
    const state = await attempt('google'); mode = failureMode;
    await callback('google', `test-${failureMode}`, state); await page.getByRole('status').filter({ hasText: message }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('mowoo.accessToken')), null); assert.equal(page.url(), base + '/');
  }
  // A response arriving after logout/account change cannot sign the old user back in.
  mode = 'delay'; const state = await attempt('naver');
  const request = page.waitForRequest(req => req.url().endsWith('/auth/naver') && req.method() === 'POST');
  await callback('naver', 'delayed-code', state); await request;
  await page.getByRole('status').filter({ hasText: '로그인을 완료하고 있어요' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '구글 로그인', exact: true }).getAttribute('aria-disabled'), 'true');
  const beforeBlocked = calls.length; await page.getByRole('button', { name: '구글 로그인', exact: true }).dispatchEvent('click'); assert.equal(calls.length, beforeBlocked);
  await page.evaluate(async () => { const { tokens } = await import('/src/lib/http.ts'); tokens.set('newer-account-token'); });
  const delayedResponse = page.waitForResponse(response => response.url().endsWith('/auth/naver'));
  release(); await delayedResponse;
  await page.getByRole('status').filter({ hasText: '로그인을 완료하고 있어요' }).waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => sessionStorage.getItem('mowoo.accessToken')), 'newer-account-token');
  assert.notEqual(page.url(), base + '/home');
  assert.deepEqual(errors, []); await context.close(); await stop();
  // Missing provider settings do not silently turn a real login into preview mode.
  await start({ VITE_KAKAO_CLIENT_ID: '', VITE_NAVER_CLIENT_ID: '' });
  const missing = await browser.newPage(); await missing.goto(base + '/');
  await missing.getByRole('button', { name: '네이버 로그인', exact: true }).click();
  await missing.getByRole('status').filter({ hasText: '네이버 로그인 설정이 아직 준비되지 않았어요.' }).waitFor();
  assert.equal(missing.url(), base + '/');
  await missing.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'mowoo.oauth.pending') throw new Error('blocked'); return original.call(this, key, value); };
  });
  await missing.getByRole('button', { name: '구글 로그인', exact: true }).click();
  await missing.getByRole('status').filter({ hasText: '로그인 정보를 보관할 수 없어요.' }).waitFor();
  await missing.close(); await stop();
  await start({ VITE_KAKAO_CLIENT_ID: '', VITE_NAVER_CLIENT_ID: '', VITE_GOOGLE_CLIENT_ID: '' });
  const preview = await browser.newPage(); await preview.goto(base + '/');
  await preview.getByRole('button', { name: '구글 로그인', exact: true }).click(); await preview.waitForURL(base + '/home');
  assert.equal(await preview.evaluate(() => sessionStorage.getItem('mowoo.accessToken')), null); await preview.close();
  await stop(); await start({ VITE_GOOGLE_REDIRECT_URI: 'https://other.example/login/oauth2/code/google' });
  const wrongOrigin = await browser.newPage(); await wrongOrigin.goto(base + '/');
  await wrongOrigin.getByRole('button', { name: '구글 로그인', exact: true }).click();
  await wrongOrigin.getByRole('status').filter({ hasText: '현재 접속 주소와 로그인 콜백 설정이 맞지 않아요.' }).waitFor();
  assert.equal(wrongOrigin.url(), base + '/');
  assert.equal(await wrongOrigin.evaluate(() => sessionStorage.getItem('mowoo.oauth.pending')), null); await wrongOrigin.close();
  console.log('PASS: Google/Naver/Kakao authorization, state/expiry/provider validation, one-time code exchange, HttpOnly cookie and token storage, cancellation/errors, stale-account response, missing settings/storage and preview separation (mock API).');
} finally { await browser?.close(); await stop(); }
