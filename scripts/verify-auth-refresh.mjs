import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3100';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3100', '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exit ${code}`)); });
    server.stdout.on('data', data => { if (data.toString().includes('3100')) { clearTimeout(timer); resolve(); } });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  let refreshes = 0, attempts = [], refreshMode = 'ok', protectedStatus = 200, delay = 100;
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), auth = req.headers().authorization;
    if (url.pathname === '/api/v1/me') return route.fulfill({ json: { id: 'owner', nickname: '테스트', email: null, birthDate: null, usePastDiaries: false, eveningReminderEnabled: false } });
    if (url.pathname === '/api/v1/auth/kakao') return route.fulfill({ status: 401, json: { error: { message: '인가 실패' } } });
    if (url.pathname === '/api/v1/auth/reissue') {
      refreshes++;
      assert.equal(auth, undefined, 'refresh must not carry an expired Bearer');
      assert(req.headers().cookie?.includes('refresh_token=test-cookie'));
      await new Promise(resolve => setTimeout(resolve, delay));
      if (refreshMode === 'network') return route.abort();
      if (refreshMode === 'invalid') return route.fulfill({ json: { accessToken: '' } });
      if (refreshMode === 'fail') return route.fulfill({ status: 401, json: {} });
      return route.fulfill({ json: { accessToken: 'new-token' } });
    }
    attempts.push({ path: url.pathname, auth, method: req.method(), body: req.postData(), tag: req.headers()['x-test-tag'] });
    if (url.pathname.endsWith('/late') && auth === 'Bearer old-token') await new Promise(resolve => setTimeout(resolve, 300));
    const status = auth === 'Bearer old-token' ? 401 : protectedStatus;
    return route.fulfill({ status, json: status === 200 ? { ok: true } : { error: { code: 'TEST_ERROR', message: '테스트 오류' } } });
  });
  await page.goto(base + '/');
  await page.context().addCookies([{ name: 'refresh_token', value: 'test-cookie', domain: '127.0.0.1', path: '/api/v1/auth', httpOnly: true, sameSite: 'Lax' }]);
  const run = fn => page.evaluate(fn);
  const reset = async () => {
    refreshes = 0; attempts = []; refreshMode = 'ok'; protectedStatus = 200; delay = 100;
    await run(async () => { const { tokens } = await import('/src/lib/http.ts'); tokens.set('old-token'); sessionStorage.setItem('mowoo.selectedCharacter', 'keep-on-refresh'); });
  };
  await reset();
  const concurrent = await run(async () => {
    const { request } = await import('/src/lib/http.ts');
    return Promise.all([
      request('/api/v1/test/a', { method: 'PATCH', body: JSON.stringify({ nickname: '보존' }), headers: { 'X-Test-Tag': 'preserved' } }),
      request('/api/v1/test/b'), request('/api/v1/test/late'),
    ]);
  });
  assert(concurrent.every(value => value.ok)); assert.equal(refreshes, 1);
  assert.equal(attempts.filter(item => item.path.endsWith('/a')).length, 2);
  const retry = attempts.find(item => item.path.endsWith('/a') && item.auth === 'Bearer new-token');
  assert.equal(retry.method, 'PATCH'); assert.equal(retry.tag, 'preserved'); assert.deepEqual(JSON.parse(retry.body), { nickname: '보존' });
  assert.equal(await run(() => sessionStorage.getItem('mowoo.selectedCharacter')), 'keep-on-refresh');
  assert.equal(await run(() => sessionStorage.getItem('mowoo.accessToken')), 'new-token');

  for (const mode of ['fail', 'invalid', 'network']) {
    await reset(); refreshMode = mode;
    await page.goto(base + '/me');
    const error = await run(async () => { const { request } = await import('/src/lib/http.ts'); try { await request('/api/v1/test/expired'); } catch (e) { return e.code; } });
    assert.equal(error, 'SESSION_EXPIRED'); assert.equal(refreshes, 1);
    assert.equal(await run(() => sessionStorage.getItem('mowoo.accessToken')), null);
    await page.getByRole('status').filter({ hasText: '다시 로그인' }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/');
  }
  await reset(); protectedStatus = 401;
  await run(async () => { const { request } = await import('/src/lib/http.ts'); try { await request('/api/v1/test/rejected'); } catch {} });
  assert.equal(refreshes, 1); assert.equal(attempts.length, 2, 'retry must be bounded');
  assert.equal(await run(() => sessionStorage.getItem('mowoo.accessToken')), null);

  for (const status of [403, 500]) {
    await reset(); protectedStatus = status;
    await run(async () => { const { tokens, request } = await import('/src/lib/http.ts'); tokens.set('valid-token'); try { await request('/api/v1/test/no-refresh'); } catch {} });
    assert.equal(refreshes, 0); assert.equal(attempts.length, 1);
  }
  await reset();
  await run(async () => { const { request } = await import('/src/lib/http.ts'); try { await request('/api/v1/auth/kakao', { method: 'POST', body: '{}' }); } catch {} });
  assert.equal(refreshes, 0);
  await run(async () => { const { tokens, request } = await import('/src/lib/http.ts'); tokens.clear(); try { await request('/api/v1/test/anonymous'); } catch {} });
  assert.equal(refreshes, 0, 'no automatic refresh in anonymous preview');

  await reset(); delay = 200;
  const aborted = await run(async () => {
    const { request } = await import('/src/lib/http.ts');
    const controller = new AbortController();
    const first = request('/api/v1/test/cancelled', { signal: controller.signal }).catch(e => e.name);
    const second = request('/api/v1/test/survivor');
    setTimeout(() => controller.abort(), 80);
    return Promise.all([first, second]);
  });
  assert.equal(aborted[0], 'AbortError'); assert(aborted[1].ok); assert.equal(refreshes, 1);

  for (const action of ['logout', 'account-change']) {
    await reset(); delay = 200;
    const result = await page.evaluate(async change => {
      const { tokens, request } = await import('/src/lib/http.ts');
      const pending = request('/api/v1/test/race').catch(e => e.code);
      setTimeout(() => change === 'logout' ? tokens.clear() : tokens.set('other-account-token'), 80);
      return pending;
    }, action);
    assert.equal(result, 'SESSION_CHANGED');
    assert.equal(await run(() => sessionStorage.getItem('mowoo.accessToken')), action === 'logout' ? null : 'other-account-token');
    assert.equal(attempts.length, 1, 'old request must not retry as another account');
  }
  console.log('PASS: shared refresh, late 401, preserved PATCH body/headers, silent rotation, failed/invalid/network refresh, bounded retry, public/anonymous exclusions, cancellation and logout/account-change races (mock API).');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
