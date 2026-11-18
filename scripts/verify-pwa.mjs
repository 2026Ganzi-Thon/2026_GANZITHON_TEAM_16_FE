import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:3100';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '3100', '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Preview timeout')), 15000);
    server.once('exit', () => { clearTimeout(timer); reject(Error('Preview exited')); });
    server.stdout.on('data', data => { if (data.toString().includes('3100')) { clearTimeout(timer); resolve(); } });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  assert(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
  for (const path of ['/home', '/chat', '/me/edit', '/calendar', '/records/select', '/design/Home']) {
    await page.goto(base + path);
    await page.waitForURL(base + '/');
    await page.getByRole('button', { name: '카카오 로그인', exact: true }).waitFor();
    assert.equal(await page.getByText('김유저야 반가워!', { exact: true }).count(), 0);
  }
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
  assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/'); assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) assert(manifest.icons.some(icon => icon.sizes === `${size}x${size}`));
  for (const icon of manifest.icons) {
    const dimensions = await page.evaluate(src => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(`${image.naturalWidth}x${image.naturalHeight}`); image.onerror = reject; image.src = src; }), icon.src);
    assert.equal(dimensions, icon.sizes);
  }
  const session = await context.newCDPSession(page);
  const appManifest = await session.send('Page.getAppManifest');
  assert.deepEqual(appManifest.errors, []);
  await page.route('**/api/v1/me', route => route.fulfill({ json: { nickname: 'private-test-data' } }));
  assert.equal(await page.evaluate(async () => (await (await fetch('/api/v1/me')).json()).nickname), 'private-test-data');
  const cached = await page.evaluate(async () => {
    const entries = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) entries.push(new URL(request.url).pathname);
    return entries;
  });
  assert(cached.includes('/offline.html'));
  assert(cached.every(path => path === '/offline.html' || path.startsWith('/icons/')));
  await context.setOffline(true);
  await page.goto(base + '/diary');
  await page.getByRole('heading', { name: '인터넷 연결을 확인해 주세요' }).waitFor();
  await context.setOffline(false);
  await page.getByRole('link', { name: '다시 연결하기' }).click();
  await page.getByRole('button', { name: '카카오 로그인', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: production service worker, manifest/CDP validation, icon dimensions, API exclusion, static-only cache, offline guidance and online recovery.');
} finally { await browser?.close(); server.kill(); }
