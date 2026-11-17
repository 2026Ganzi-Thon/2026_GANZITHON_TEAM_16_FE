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
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mX8AAAAASUVORK5CYII=', 'base64');
  const photo = n => ({ id: `photo-${n}`, mimeType: 'image/png', url: `data:image/png;base64,${png.toString('base64')}`, sortOrder: n });
  const upload = { name: 'photo.png', mimeType: 'image/png', buffer: png };
  let diary = { id: 'diary', entryDate: '2026-11-17', title: '사진 일기', content: '사진이 있는 하루', savedAt: '2026-11-17', emotionConfirmedAt: null, emotions: [], attachments: [] };
  const session = { id: 'session', characterId: 'kind', title: '사진 대화', startedAt: '2026-11-17', endedAt: null, completedTurns: 0, canGenerateDiary: false };
  const messages = [];
  let fail = false, refresh = false, sends = 0, saves = 0;
  await page.addInitScript(() => sessionStorage.setItem('mowoo.accessToken', 'photo-test'));
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
    const json = data => route.fulfill({ json: { isSuccess: true, ...data } });
    if (path === '/api/v1/me') return json({ id: 'owner', nickname: '사진 사용자', usePastDiaries: false });
    if (path === '/api/v1/characters') return json({ items: [{ id: 'kind', code: 'KIND', name: '다정한 모우', isOwned: true }] });
    if (path === '/api/v1/auth/reissue') return json({ accessToken: 'renewed' });
    if (path === '/api/v1/emotion-types') return json({ items: [] });
    if (path === '/api/v1/chat-sessions' && method === 'POST') return json(session);
    if (path === '/api/v1/chat-sessions/session' && method === 'GET') return json({ session, messages: { items: messages, nextCursor: null } });
    if ((path === '/api/v1/diaries' && method === 'POST') || (path === '/api/v1/diaries/diary' && method === 'PATCH') || path.endsWith('/messages')) {
      const multipart = req.headers()['content-type']?.includes('multipart/form-data');
      let payload, files = [];
      if (multipart) {
        const form = await new Response(req.postDataBuffer(), { headers: { 'Content-Type': req.headers()['content-type'] } }).formData();
        payload = JSON.parse(form.get('payload')); files = form.getAll('files');
        assert(files.every(file => file.type === 'image/png' && file.size === png.length));
      } else payload = req.postDataJSON();
      if (fail) return route.fulfill({ status: 503, json: { error: { code: 'STORAGE_UNAVAILABLE', message: '사진 저장 실패' } } });
      if (refresh) { refresh = false; return route.fulfill({ status: 401, json: {} }); }
      if (path.endsWith('/messages')) {
        sends++; assert.equal(files.length, 1); assert.equal(payload.content, '');
        const user = { id: 'user', senderRole: 'USER', content: '', sequenceNo: 1, attachments: [photo(1)], diaryReferences: [] };
        const assistant = { id: 'assistant', senderRole: 'ASSISTANT', content: '사진을 첨부했구나', sequenceNo: 2, characterId: 'kind', diaryReferences: [] };
        messages.push(user, assistant); return json({ userMessage: user, assistantMessage: assistant, completedTurns: 1, canGenerateDiary: false });
      }
      saves++;
      diary = { ...diary, ...payload, attachments: [...diary.attachments.filter(p => !(payload.removeAttachmentIds ?? []).includes(p.id)), ...files.map((_, i) => photo(i + saves))] };
      return json(diary);
    }
    if (path === '/api/v1/diaries/diary') return json(diary);
    return json({ items: [], days: [], nextCursor: null });
  });
  await page.goto(base + '/diary/write');
  await page.getByRole('textbox', { name: '일기 제목', exact: true }).fill('사진 일기');
  await page.getByRole('textbox', { name: '일기 내용', exact: true }).fill('사진이 있는 하루');
  const input = () => page.getByLabel('사진 파일 선택', { exact: true });
  await input().setInputFiles({ ...upload, name: 'bad.gif', mimeType: 'image/gif' });
  await page.getByRole('status').filter({ hasText: 'JPEG 또는 PNG' }).waitFor();
  await input().setInputFiles([upload, upload, upload, upload]);
  await page.getByRole('status').filter({ hasText: '최대 3장' }).waitFor();
  await input().setInputFiles(upload); await page.getByAltText('선택한 사진 1', { exact: true }).waitFor();
  fail = true; await page.getByRole('button', { name: '일기 저장', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '사진 저장 실패' }).waitFor();
  assert.equal(await page.getByAltText('선택한 사진 1', { exact: true }).count(), 1);
  fail = false; refresh = true; await page.getByRole('button', { name: '일기 저장', exact: true }).click();
  await page.waitForURL('**/diary/saved?id=diary'); assert.equal(saves, 1);
  await page.goto(base + '/diary/detail?id=diary'); await page.getByAltText('첨부 사진 1', { exact: true }).waitFor();
  await page.getByRole('button', { name: '첨부 사진 1 크게 보기', exact: true }).click();
  await page.getByRole('dialog', { name: '첨부 사진 크게 보기', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.goto(base + '/diary/write?id=diary'); await page.getByRole('button', { name: '첨부 사진 1 삭제', exact: true }).click();
  await page.getByRole('button', { name: '일기 저장', exact: true }).click(); await page.waitForURL('**/diary/saved?id=diary');
  assert.equal(diary.attachments.length, 0);
  await page.goto(base + '/chat');
  await input().setInputFiles(upload);
  await page.getByAltText('선택한 사진 1', { exact: true }).waitFor();
  await page.getByRole('button', { name: '메시지 보내기', exact: true }).click();
  await page.getByAltText('첨부 사진 1', { exact: true }).waitFor(); assert.equal(sends, 1);
  await page.reload(); await page.getByAltText('첨부 사진 1', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: photo multipart bytes, validation, failed-save retention, refresh retry, diary deletion, photo-only chat and reload (mock API).');
} finally { await browser?.close(); server.kill(); }
