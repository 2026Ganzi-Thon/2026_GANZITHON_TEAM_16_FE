import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = 'http://127.0.0.1:3100';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3100', '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const token = 'test-access-token';
const item = (id, title, year = 2026) => ({ id, title, summary: '보관된 대화 내용', characterId: 'kind', startedAt: `${year}-01-16T09:00:00Z`, endedAt: null, completedTurns: 1, canGenerateDiary: false });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
    server.stdout.on('data', data => { if (data.toString().includes('3100')) { clearTimeout(timeout); resolve(); } });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let sessions = [item('first', '첫 번째 대화'), item('second', '다른 대화', 2025), item('third', '마지막 대화', 2024)];
  let deleteCalls = 0, fail = false, missing = false, delay = false, listFail = false;
  await page.addInitScript(value => sessionStorage.setItem('mowoo.accessToken', value), token);
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const ok = extra => ({ isSuccess: true, code: 'SUCCESS', ...extra });
    if (path === '/api/v1/me') return route.fulfill({ json: ok({ nickname: '검증 사용자', usePastDiaries: true }) });
    if (path === '/api/v1/chat-sessions' && req.method() === 'GET') {
      if (listFail) return route.fulfill({ status: 503, json: { error: { message: '목록 조회 실패' } } });
      const cursor = url.searchParams.get('cursor');
      return route.fulfill({ json: ok({ items: cursor ? sessions.filter(s => s.id === 'third') : sessions.filter(s => s.id !== 'third'), nextCursor: cursor ? null : 'page-two' }) });
    }
    if (req.method() === 'DELETE') {
      assert.equal(req.headers().authorization, `Bearer ${token}`);
      deleteCalls++;
      if (delay) await new Promise(resolve => setTimeout(resolve, 250));
      if (fail) return route.fulfill({ status: 503, json: { error: { message: '삭제 요청 실패' } } });
      const id = path.split('/').at(-1); sessions = sessions.filter(s => s.id !== id);
      return route.fulfill(missing ? { status: 404, json: { error: { code: 'SESSION_NOT_FOUND', message: '이미 삭제됨' } } } : { json: ok({}) });
    }
    return route.fulfill({ json: ok({ items: [], nextCursor: null }) });
  });
  await page.goto(base + '/archive');
  await page.getByRole('button', { name: '첫 번째 대화 대화 삭제', exact: true }).waitFor();
  await page.evaluate(() => {
    localStorage.setItem('mowoo.chat.active.live', 'first');
    localStorage.setItem('mowoo.chat.active', 'preview-session');
    localStorage.setItem('mowoo.diary', '보존할 일기');
  });
  page.on('dialog', () => assert.fail('Browser confirmation must not be used'));
  await page.getByRole('button', { name: '첫 번째 대화 대화 삭제', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '대화를 삭제할까요?' });
  await modal.waitFor();
  assert(await modal.getByRole('button', { name: '취소', exact: true }).evaluate(node => node === document.activeElement));
  await modal.getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(deleteCalls, 0);
  await page.getByRole('button', { name: '첫 번째 대화 대화 삭제', exact: true }).click();
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'detached' });
  assert.equal(deleteCalls, 0);
  fail = true;
  await page.getByRole('button', { name: '첫 번째 대화 대화 삭제', exact: true }).click();
  await modal.getByText('이 대화로 만든 일기는 남아 있어요.').waitFor();
  await modal.getByRole('button', { name: '삭제하기', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '삭제 요청 실패' }).waitFor();
  assert.equal(await page.locator('.archive-entry').count(), 2);
  assert.equal(await page.evaluate(() => localStorage.getItem('mowoo.chat.active.live')), 'first');
  fail = false; delay = true;
  await modal.getByRole('button', { name: '삭제하기', exact: true }).click();
  await modal.getByRole('button', { name: '삭제 중…' }).waitFor();
  assert(await modal.getByRole('button', { name: '취소', exact: true }).isDisabled());
  await page.keyboard.press('Escape');
  assert(await modal.isVisible());
  assert(await page.getByRole('button', { name: '다른 대화 대화 삭제', exact: true }).isDisabled());
  await page.getByRole('status').filter({ hasText: '대화를 삭제했어요' }).waitFor();
  assert.equal(deleteCalls, 2);
  assert.equal(await page.evaluate(() => localStorage.getItem('mowoo.chat.active.live')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('mowoo.chat.active')), 'preview-session');
  assert.equal(await page.evaluate(() => localStorage.getItem('mowoo.diary')), '보존할 일기');
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await page.getByRole('button', { name: '마지막 대화 대화 삭제', exact: true }).waitFor();
  missing = true;
  await page.evaluate(() => localStorage.setItem('mowoo.chat.active.live', 'other-active'));
  await page.getByRole('button', { name: '다른 대화 대화 삭제', exact: true }).click();
  await modal.getByRole('button', { name: '삭제하기', exact: true }).click();
  await page.getByRole('button', { name: '다른 대화 대화 삭제', exact: true }).waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => localStorage.getItem('mowoo.chat.active.live')), 'other-active');
  await page.getByRole('button', { name: '마지막 대화 대화 삭제', exact: true }).click();
  await modal.getByRole('button', { name: '삭제하기', exact: true }).click();
  await page.getByText('아직 보관된 대화가 없어요.', { exact: false }).waitFor();
  await page.reload(); await page.getByRole('button', { name: '더 보기', exact: true }).waitFor();
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await page.getByText('아직 보관된 대화가 없어요.', { exact: false }).waitFor();
  listFail = true; await page.reload();
  await page.getByRole('alert').filter({ hasText: '목록 조회 실패' }).waitFor();
  listFail = false;
  sessions = [item('long', '긴 제목 '.repeat(25))];
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await page.locator('.archive-card').waitFor();
  fs.mkdirSync('.local/chat-delete', { recursive: true });
  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 600 });
    await page.waitForFunction(() => document.querySelector('main').getBoundingClientRect().width <= innerWidth);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.archive-delete').scrollIntoViewIfNeeded();
    const button = await page.locator('.archive-delete').boundingBox();
    assert(button.x >= 0 && button.x + button.width <= width);
    await page.locator('.archive-delete').click();
    await modal.waitFor();
    const box = await modal.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 600);
    await page.screenshot({ path: `.local/chat-delete/archive-${width}.png` });
    await modal.getByRole('button', { name: '취소', exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: cancel, failed delete and retry, duplicate lock, active-pointer cleanup, diary preservation, existing 404, pagination, empty/reload, list retry and responsive delete controls (mock API).');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
