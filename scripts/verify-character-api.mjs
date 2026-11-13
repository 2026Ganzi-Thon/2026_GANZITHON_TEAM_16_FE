import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3100';
const tokenFor = sub => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.test`;
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3100', '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exit ${code}`)); });
    server.stdout.on('data', chunk => { if (chunk.toString().includes('3100')) { clearTimeout(timeout); resolve(); } });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 393, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let token = tokenFor('owner-a');
  let items = [
    { id: ids[0], code: 'KIND', name: '서버 다정한 모우', description: '목록 소개', imageUrl: null, isPremium: false, isOwned: true },
    { id: ids[1], code: 'COOL', name: '서버 냉철한 모우', description: '차분한 소개', imageUrl: null, isPremium: true, isOwned: false },
    { id: ids[2], code: 'NEW_CHARACTER', name: '새로운 서버 모우', description: '새 캐릭터', imageUrl: '/missing-character-test.png', isPremium: false, isOwned: true },
  ];
  let listFailure = false, detailFailure = false, detailDelay = 0, listCalls = 0, detailCalls = 0;
  await page.addInitScript(initialToken => {
    if (!sessionStorage.getItem('mowoo.accessToken')) sessionStorage.setItem('mowoo.accessToken', initialToken);
  }, token);
  await page.route('**/api/v1/me', route => route.fulfill({ json: { id: 'owner-a', nickname: '검증 사용자', email: null, birthDate: null, usePastDiaries: true, eveningReminderEnabled: false } }));
  await page.route('**/api/v1/characters**', async route => {
    assert.equal(route.request().headers().authorization, `Bearer ${token}`);
    const id = new URL(route.request().url()).pathname.split('/')[4];
    if (!id) {
      listCalls++;
      return route.fulfill(listFailure ? { status: 503, json: { error: { message: '목록 오류 테스트' } } } : { json: { isSuccess: true, items } });
    }
    detailCalls++;
    const item = items.find(entry => entry.id === id);
    if (detailDelay) await new Promise(resolve => setTimeout(resolve, detailDelay));
    try {
      if (detailFailure || !item) return await route.fulfill({ status: 404, json: { error: { message: '상세 오류 테스트' } } });
      const { code, ...rest } = item;
      await route.fulfill({ json: { ...rest, isSuccess: true, characterCode: code, description: `상세 응답: ${item.name}` } });
    } catch { /* An obsolete request may have been aborted during navigation. */ }
  });
  fs.mkdirSync('.local/character-api', { recursive: true });
  await page.goto(base + '/characters');
  await page.getByRole('button', { name: '서버 다정한 모우 상세보기', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /퀸 마인드 모우/ }).count(), 0);
  await page.waitForFunction(() => [...document.querySelectorAll('.character-card img')].every(image => image.complete && image.naturalWidth > 0));
  await page.getByRole('button', { name: '서버 다정한 모우 상세보기', exact: true }).click();
  await page.getByRole('dialog').getByText('상세 응답: 서버 다정한 모우', { exact: true }).waitFor();
  await page.getByRole('button', { name: '이 모우 선택하기', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('mowoo.selectedCharacter'))), { owner: 'owner-a', id: ids[0] });
  await page.reload();
  await page.getByRole('button', { name: '선택된 모우예요', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.waitForURL(base + '/characters');
  await page.screenshot({ path: '.local/character-api/list-393.png', fullPage: true });
  await page.getByRole('button', { name: '서버 냉철한 모우 상세보기', exact: true }).click();
  await page.getByRole('dialog').getByText('상세 응답: 서버 냉철한 모우', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '보유한 캐릭터만 선택할 수 있어요' }).isDisabled(), true);
  await page.screenshot({ path: '.local/character-api/detail-393.png', fullPage: true });
  // Direct legacy links resolve to a real UUID and use the detail endpoint.
  await page.goto(base + '/characters/detail?character=kind');
  await page.getByRole('button', { name: '선택된 모우예요', exact: true }).waitFor();
  // Account changes discard the previous account's preference and refetch ownership.
  token = tokenFor('owner-b');
  await page.evaluate(nextToken => { sessionStorage.setItem('mowoo.accessToken', nextToken); window.dispatchEvent(new Event('mowoo:auth-change')); }, token);
  await page.getByRole('button', { name: '이 모우 선택하기', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('mowoo.selectedCharacter')), null);
  await page.getByRole('button', { name: '이 모우 선택하기', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('mowoo.selectedCharacter')).owner), 'owner-b');
  items = items.map(item => ({ ...item, isOwned: false }));
  await page.reload();
  await page.getByRole('button', { name: '보유한 캐릭터만 선택할 수 있어요' }).waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('mowoo.selectedCharacter')), null);
  listFailure = true;
  await page.goto(base + '/characters');
  await page.getByRole('alert').getByText('목록 오류 테스트').waitFor();
  assert.equal(await page.locator('.character-card').count(), 0);
  listFailure = false;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await page.getByRole('button', { name: '서버 다정한 모우 상세보기', exact: true }).waitFor();
  detailFailure = true;
  await page.getByRole('button', { name: '서버 다정한 모우 상세보기', exact: true }).click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  assert.equal(await page.getByRole('button', { name: '이 모우 선택하기', exact: true }).count(), 0);
  detailFailure = false;
  await page.getByRole('dialog').getByRole('button', { name: '다시 시도' }).click();
  await page.getByRole('dialog').getByText('상세 응답: 서버 다정한 모우', { exact: true }).waitFor();
  // A slow detail response must not replace the next character's detail.
  detailDelay = 300;
  await page.goto(base + `/characters/detail?character=${ids[0]}`);
  await page.goto(base + `/characters/detail?character=${ids[1]}`);
  await page.getByRole('dialog').getByText('상세 응답: 서버 냉철한 모우', { exact: true }).waitFor();
  detailDelay = 0;
  items = [];
  await page.goto(base + '/characters');
  await page.getByText('보유한 모우가 없어요.', { exact: true }).waitFor();
  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 700 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  }
  assert(listCalls > 0 && detailCalls > 0);
  assert.deepEqual(errors, []);
  const preview = await browser.newPage();
  await preview.route('**/api/v1/characters**', () => assert.fail('Unauthenticated preview must not call the character API'));
  await preview.goto(base + '/characters');
  await preview.getByRole('button', { name: '다정한 모우 상세보기', exact: true }).waitFor();
  await preview.getByRole('button', { name: '다정한 모우 상세보기', exact: true }).click();
  await preview.locator('[data-node-id="120:460"]').waitFor();
  console.log('PASS: authenticated list/detail, UUID selection and reload, ownership enforcement, account reset, image fallback, unknown characters, empty/error/retry, stale detail cancellation, legacy links, preview and responsive layout (mock backend).');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
