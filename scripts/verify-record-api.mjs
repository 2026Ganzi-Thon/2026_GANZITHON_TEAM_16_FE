// Logged-in chat, diary, calendar, record deletion and withdrawal against an in-memory
// mock of the backend develop API (same paths and DTO fields). No real server is used.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3100';
const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'owner-a' })).toString('base64url')}.test`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3100', '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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
  fs.mkdirSync('.local/record-api', { recursive: true });

  // ---- in-memory backend ----
  let seq = 100;
  const ok = (extra = {}) => ({ isSuccess: true, code: 'SUCCESS', message: '성공', ...extra });
  const character = { id: uuid(1), code: 'KIND', name: '서버 다정한 모우', description: '소개', imageUrl: null, isPremium: false, isOwned: true };
  const sessions = new Map(), messages = new Map(), diaries = new Map();
  const calls = [];
  const turns = id => { const list = messages.get(id); let n = 0; for (let i = 0; i + 1 < list.length; i++) if (list[i].senderRole === 'USER' && list[i + 1].senderRole === 'ASSISTANT') { n++; i++; } return n; };
  const sessionView = id => { const s = sessions.get(id); const n = turns(id); return { ...s, completedTurns: n, canGenerateDiary: n >= 5 }; };
  const diaryView = d => ({ ...d, emotions: [], attachments: [] });
  await page.addInitScript(t => { if (!sessionStorage.getItem('mowoo.accessToken') && !sessionStorage.getItem('test.loggedOut')) sessionStorage.setItem('mowoo.accessToken', t); }, token);
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push(`${method} ${path}${url.search}`);
    assert.equal(request.headers().authorization, `Bearer ${token}`, `${method} ${path} must send the token`);
    const json = (data, status = 200) => route.fulfill({ status, json: data });
    if (path === '/api/v1/me') return json(ok({ id: 'owner-a', nickname: '검증 사용자', email: null, birthDate: null, usePastDiaries: true, eveningReminderEnabled: false }));
    if (path === '/api/v1/characters') return json(ok({ items: [character] }));
    if (path === '/api/v1/chat-sessions' && method === 'POST') {
      assert.equal(body.characterId, character.id, 'chat must start with the owned character UUID');
      const id = uuid(++seq); sessions.set(id, { id, characterId: body.characterId, title: null, summary: null, startedAt: new Date().toISOString(), endedAt: null }); messages.set(id, []);
      return json(ok(sessionView(id)), 201);
    }
    if (path === '/api/v1/chat-sessions' && method === 'GET') return json(ok({ items: [...sessions.keys()].reverse().map(sessionView), nextCursor: null }));
    let m = path.match(/^\/api\/v1\/chat-sessions\/([^/]+)$/);
    if (m && method === 'GET') return json(ok({ session: sessionView(m[1]), messages: { items: messages.get(m[1]), nextCursor: null } }));
    if (m && method === 'PATCH') { sessions.get(m[1]).endedAt = new Date().toISOString(); sessions.get(m[1]).title = '면접 걱정'; return json(ok(sessionView(m[1]))); }
    m = path.match(/^\/api\/v1\/chat-sessions\/([^/]+)\/messages$/);
    if (m) {
      const list = messages.get(m[1]), at = new Date().toISOString();
      const user = { id: uuid(++seq), sequenceNo: list.length + 1, senderRole: 'USER', characterId: null, content: body.content, createdAt: at, editedAt: null, diaryReferences: [] };
      const reply = { id: uuid(++seq), sequenceNo: list.length + 2, senderRole: 'ASSISTANT', characterId: character.id, content: `답변 ${list.length / 2 + 1}`, createdAt: at, editedAt: null, diaryReferences: [] };
      list.push(user, reply); const v = sessionView(m[1]);
      return json(ok({ userMessage: user, assistantMessage: reply, completedTurns: v.completedTurns, canGenerateDiary: v.canGenerateDiary }), 201);
    }
    m = path.match(/^\/api\/v1\/chat-sessions\/([^/]+)\/diary-draft$/);
    if (m) {
      assert.equal(url.searchParams.get('entryDate'), today);
      const id = uuid(++seq); diaries.set(id, { id, sourceSessionId: m[1], entryDate: today, title: 'AI가 쓴 제목', content: 'AI가 정리한 오늘의 일기', savedAt: null, emotionConfirmedAt: null });
      return json(ok(diaryView(diaries.get(id))));
    }
    if (path === '/api/v1/diaries' && method === 'POST') {
      const id = uuid(++seq); diaries.set(id, { id, sourceSessionId: null, entryDate: body.entryDate, title: body.title, content: body.content, savedAt: new Date().toISOString(), emotionConfirmedAt: null });
      return json(ok(diaryView(diaries.get(id))), 201);
    }
    if (path === '/api/v1/diaries' && method === 'GET') {
      const from = url.searchParams.get('from'), to = url.searchParams.get('to');
      const items = [...diaries.values()].filter(d => d.savedAt && (!from || d.entryDate >= from) && (!to || d.entryDate <= to)).reverse().map(diaryView);
      return json(ok({ items: items.slice(0, Number(url.searchParams.get('limit') ?? 20)), nextCursor: null }));
    }
    m = path.match(/^\/api\/v1\/diaries\/([^/]+)$/);
    if (m && method === 'GET') return json(ok(diaryView(diaries.get(m[1]))));
    if (m && method === 'PATCH') { const d = diaries.get(m[1]); Object.assign(d, { title: body.title ?? d.title, content: body.content ?? d.content }); if (body.save) d.savedAt = new Date().toISOString(); return json(ok(diaryView(d))); }
    if (path === '/api/v1/calendar') return json(ok({ month: url.searchParams.get('month'), days: [] }));
    if (path === '/api/v1/diaries/bulk-delete') { body.diaryIds.forEach(id => diaries.delete(id)); return json(ok()); }
    if (path === '/api/v1/me/records') { diaries.clear(); sessions.clear(); return json(ok()); }
    if (path === '/api/v1/auth/withdraw') return json(ok());
    return json({ isSuccess: false, message: 'not mocked', error: { code: 'NOT_FOUND', message: `${method} ${path}` } }, 404);
  });
  const open = async path => { await page.goto(base + path); await page.evaluate(() => document.fonts.ready); };

  // 1. Chat: 5 turns with the server, then an AI draft is saved.
  await open('/chat');
  const input = page.getByRole('textbox', { name: '메시지' });
  for (let i = 1; i <= 5; i++) {
    await input.fill(`메시지 ${i}`); await input.press('Enter');
    await page.getByText(`답변 ${i}`, { exact: true }).waitFor();
  }
  await page.waitForSelector('[data-node-id="30:3559"].is-ready');
  await page.reload(); await page.getByText('답변 5', { exact: true }).waitFor(); // restored from the server
  await page.getByRole('button', { name: '오늘 대화로 일기 자동 생성' }).click();
  await page.waitForURL('**/diary/write?id=*');
  const title = page.getByRole('textbox', { name: '일기 제목' });
  await assert.doesNotReject(title.filter({ hasText: 'AI가 쓴 제목' }).waitFor());
  const content = page.getByRole('textbox', { name: '일기 내용' });
  await content.click(); await page.keyboard.press('End'); await page.keyboard.type(' 덧붙임');
  await page.getByRole('button', { name: '일기 저장' }).click();
  await page.waitForURL('**/diary/detail?id=*', { timeout: 5000 });
  await page.locator('[data-node-id="113:2807"]', { hasText: 'AI가 쓴 제목' }).waitFor();
  await page.locator('[data-node-id="113:2809"]', { hasText: 'AI가 정리한 오늘의 일기 덧붙임' }).waitFor();
  assert.ok(calls.some(c => c.startsWith('PATCH /api/v1/chat-sessions/')), 'chat ends before the draft');
  await page.screenshot({ path: '.local/record-api/detail-393.png', fullPage: true });

  // 2. Direct write (POST) from "직접 작성하기".
  await open('/diary/new');
  await page.getByRole('button', { name: '직접 작성하기' }).click();
  await page.waitForURL('**/diary/write');
  await page.getByRole('button', { name: '일기 저장' }).click();
  await page.getByText('제목을 입력해 주세요.').waitFor();
  await page.getByRole('textbox', { name: '일기 제목' }).click(); await page.keyboard.type('직접 쓴 날');
  await page.getByRole('textbox', { name: '일기 내용' }).click(); await page.keyboard.type('직접 쓴 내용');
  await page.getByRole('button', { name: '일기 저장' }).click();
  await page.waitForURL('**/diary/detail?id=*', { timeout: 5000 });
  await page.locator('[data-node-id="113:2807"]', { hasText: '직접 쓴 날' }).waitFor();

  // 3. Diary list and calendar show both saved diaries.
  await open('/diary');
  await page.getByRole('button', { name: /직접 쓴 날/ }).waitFor();
  assert.equal(await page.locator('.diary-card').count(), 2);
  await page.screenshot({ path: '.local/record-api/diary-list-393.png', fullPage: true });
  await open('/calendar');
  const day = Number(today.slice(8));
  await page.getByRole('button', { name: `${Number(today.slice(5, 7))}월 ${day}일 기록 보기` }).click();
  await page.waitForURL('**/diary/detail?id=*');
  await open('/calendar'); await page.screenshot({ path: '.local/record-api/calendar-393.png', fullPage: true });

  // 4. Selected delete, then delete all.
  await open('/records/select');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: '선택된 기록 삭제하기' }).click();
  await page.waitForURL('**/records/deleted');
  assert.equal(diaries.size, 1);
  await open('/records/delete-all');
  await page.getByRole('button', { name: '모든 기록 삭제하기' }).click();
  await page.waitForURL('**/records/deleted');
  assert.equal(diaries.size, 0);
  assert.ok(calls.includes('DELETE /api/v1/me/records'));

  // 5. Withdrawal asks first, then signs out.
  await open('/me');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '계정 삭제' }).click();
  assert.ok(!calls.includes('DELETE /api/v1/auth/withdraw'), 'cancel must not withdraw');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '계정 삭제' }).click();
  await page.waitForURL(base + '/');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('mowoo.accessToken')), null);

  // 6. Logged-out preview still uses local data and never calls the API.
  const before = calls.length;
  await page.evaluate(() => sessionStorage.setItem('test.loggedOut', '1'));
  await open('/archive'); await page.getByText('제목 없음').first().waitFor();
  assert.equal(calls.length, before, 'preview must not call the API');

  assert.deepEqual(errors, []);
  console.log('PASS: live chat 5 turns + reload restore, AI draft edit/save, direct write, diary list, calendar day link, selected/all record delete, withdraw confirm, preview isolation (mock API).');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
