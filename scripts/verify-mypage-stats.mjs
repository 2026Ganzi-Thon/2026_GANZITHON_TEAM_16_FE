import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = 'http://127.0.0.1:3100';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3100', '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exit ${code}`)); });
    server.stdout.on('data', chunk => { if (chunk.toString().includes('3100')) { clearTimeout(timer); resolve(); } });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 393, height: 900 } });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = days => new Date(Date.parse(today + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  const diary = (id, day, savedAt = today + 'T01:00:00Z') => ({ id, entryDate: date(day), savedAt });
  let diaryPages = [[diary('a', 0), diary('b', 0)], [diary('b', 0), diary('c', -1), diary('d', -2), diary('draft', -3, null)]];
  let sessions = [{ id: 's1', completedTurns: 1 }, { id: 's2', completedTurns: 0 }, { id: 's3', completedTurns: 5 }];
  let failure = false;
  const calls = [];
  await page.addInitScript(() => sessionStorage.setItem('mowoo.accessToken', 'test-stats-token'));
  await page.route('**/api/v1/**', route => {
    const url = new URL(route.request().url()); calls.push(url.pathname + url.search);
    assert.equal(route.request().headers().authorization, 'Bearer test-stats-token');
    if (url.pathname === '/api/v1/me') return route.fulfill({ json: { id: 'test-owner', nickname: '통계 사용자', email: null, birthDate: null, createdAt: '2026-11-12T15:30:00Z', usePastDiaries: true, eveningReminderEnabled: false } });
    if (failure) return route.fulfill({ status: 503, json: { error: { message: '통계 조회 실패 테스트' } } });
    if (url.pathname === '/api/v1/diaries') {
      const cursor = url.searchParams.get('cursor');
      return route.fulfill({ json: { items: diaryPages[cursor ? 1 : 0], nextCursor: !cursor && diaryPages.length > 1 ? 'second-page' : null } });
    }
    if (url.pathname === '/api/v1/chat-sessions') return route.fulfill({ json: { items: sessions, nextCursor: null } });
    return route.fulfill({ status: 404, json: {} });
  });
  const value = id => page.locator(`[data-node-id="${id}"]`).textContent();
  async function expected(diaries, conversations, streak) {
    await page.waitForFunction(v => ['33:3991', '33:3978', '33:3984'].every((id, i) => document.querySelector(`[data-node-id="${id}"]`)?.textContent === String(v[i])), [diaries, conversations, streak]);
  }
  await page.goto(base + '/mypage');
  await expected(4, 2, 3);
  assert(calls.some(call => call.includes('cursor=second-page')));
  assert((await value('33:3973')).includes('2026년 11월 13일부터'));
  assert(!(await value('33:3973')).includes('999일'));
  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    const bounds = await page.locator('.mypage-membership').evaluate(node => {
      const [joined, days] = [...node.querySelectorAll('p')].map(line => line.getBoundingClientRect());
      const nickname = document.querySelector('[data-node-id="33:3972"]').getBoundingClientRect();
      return { joinedTop: joined.top, joinedBottom: joined.bottom, daysTop: days.top, nicknameBottom: nickname.bottom };
    });
    assert(bounds.joinedTop >= bounds.nicknameBottom - 1, 'join date must be below nickname');
    assert(bounds.daysTop >= bounds.joinedBottom - 1, 'membership lines must not overlap');
  }
  await page.setViewportSize({ width: 393, height: 900 });
  fs.mkdirSync('.local/mypage-stats', { recursive: true });
  await page.screenshot({ path: '.local/mypage-stats/profile-card.png', fullPage: true });
  diaryPages = [[diary('yesterday', -1), diary('before', -2)]];
  sessions = [];
  await page.reload(); await expected(2, 0, 2);
  diaryPages = [[diary('old', -3)]];
  await page.reload(); await expected(1, 0, 0);
  diaryPages = [[]];
  await page.reload(); await expected(0, 0, 0);
  failure = true;
  await page.reload();
  await page.getByRole('button', { name: /통계 조회 실패 테스트/ }).waitFor();
  assert.equal(await value('33:3991'), '—');
  failure = false;
  await page.getByRole('button', { name: /통계 조회 실패 테스트/ }).click(); await expected(0, 0, 0);
  const before = calls.length;
  await page.goto(base + '/design/MyPage');
  assert.equal(calls.filter(call => call.startsWith('/api/v1/diaries') || call.startsWith('/api/v1/chat-sessions')).length,
    calls.slice(0, before).filter(call => call.startsWith('/api/v1/diaries') || call.startsWith('/api/v1/chat-sessions')).length);
  console.log('PASS: pagination/deduplication, draft exclusion, completed conversation count, unique-day streak, yesterday/gaps/empty data, Seoul join date, error/retry and design preview isolation (mock API).');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
