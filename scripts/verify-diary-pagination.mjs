import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3100';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3100', '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Server timeout')), 15000);
    server.once('exit', () => { clearTimeout(timer); reject(Error('Server exited')); });
    server.stdout.on('data', data => { if (data.toString().includes('3100')) { clearTimeout(timer); resolve(); } });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.addInitScript(() => sessionStorage.setItem('mowoo.accessToken', 'pagination-test'));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const month = today.slice(0, 7);
  const diaries = Array.from({ length: 201 }, (_, n) => ({ id: `diary-${n}`, entryDate: n === 200 ? month + '-01' : today, title: `목록 검사 ${n}`, content: '가짜 일기', savedAt: today, emotionConfirmedAt: null, emotions: [], attachments: [] }));
  let failSecond = false, repeatCursor = false, secondCalls = 0, deleted = [];
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/me') return route.fulfill({ json: { id: 'owner', nickname: '테스트' } });
    if (url.pathname === '/api/v1/diaries/bulk-delete') {
      deleted = route.request().postDataJSON().diaryIds;
      return route.fulfill({ json: { isSuccess: true } });
    }
    if (url.pathname === '/api/v1/diaries') {
      assert.equal(url.searchParams.get('limit'), '100');
      const cursor = url.searchParams.get('cursor');
      if (cursor) { secondCalls++; if (failSecond) return route.fulfill({ status: 503, json: { message: '다음 페이지 실패' } }); }
      // Include one overlapping ID to verify de-duplication across pages.
      const data = !cursor ? { items: diaries.slice(0, 100), nextCursor: 'second' }
        : cursor === 'second' ? { items: diaries.slice(99, 199), nextCursor: repeatCursor ? 'second' : 'third' }
        : { items: diaries.slice(199), nextCursor: null };
      return route.fulfill({ json: data });
    }
    return route.fulfill({ json: { items: [], nextCursor: null, days: [] } });
  });
  await page.goto(base + '/calendar');
  await page.waitForFunction(() => document.querySelectorAll('.live-calendar-list .diary-card').length === 201);
  assert((await page.getByRole('button', { name: new RegExp('^' + Number(month.slice(5)) + '월 1일') }).getAttribute('class')).includes('has-diary'));
  await page.goto(base + '/records/select');
  await page.waitForFunction(() => document.querySelectorAll('.delete-live-card').length === 201);
  await page.locator('.delete-live-card').filter({ hasText: '목록 검사 200' }).getByRole('checkbox').check();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 1);
  failSecond = true; await page.reload();
  await page.getByRole('alert').filter({ hasText: '다음 페이지 실패' }).waitFor();
  assert.equal(await page.locator('.delete-live-card').count(), 0, 'Partial data must not appear complete.');
  failSecond = false; await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.delete-live-card').length === 201);
  repeatCursor = true; await page.goto(base + '/calendar');
  await page.getByRole('alert').filter({ hasText: '끝까지 불러오지 못했어요' }).waitFor();
  repeatCursor = false; await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.live-calendar-list .diary-card').length === 201);
  assert(secondCalls > 0);
  await page.goto(base + '/records/select');
  await page.waitForFunction(() => document.querySelectorAll('.delete-live-card').length === 201);
  await page.locator('.delete-live-card').filter({ hasText: '목록 검사 200' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: '선택된 기록 삭제하기', exact: true }).click();
  await page.waitForURL('**/records/deleted');
  assert.deepEqual(deleted, ['diary-200']);
  console.log('PASS: 201 diaries, three pages, overlapping IDs, oldest-day calendar mark, selection after 100, partial-page failure/retry and repeated cursor recovery (mock API).');
} finally { await browser?.close(); server.kill(); }
