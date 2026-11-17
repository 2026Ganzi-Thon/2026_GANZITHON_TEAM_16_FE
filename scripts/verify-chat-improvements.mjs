import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3100';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3100', '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exit ${code}`)); });
    server.stdout.on('data', data => { if (data.toString().includes('3100')) { clearTimeout(timeout); resolve(); } });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const diary = { id: 'past-diary', sourceSessionId: null, entryDate: today, title: '지난 시험의 기억', content: '지난번 시험도 걱정했지만 잘 마쳤다.', savedAt: today, emotionConfirmedAt: null, emotions: [], attachments: [] };
  const draft = { ...diary, id: 'generated-diary', title: '생성된 일기', savedAt: null };
  const character = { id: 'kind', code: 'KIND', name: '다정한 모우', description: '소개', imageUrl: null, isOwned: true, isPremium: false };
  const makeSession = (id, turns = 5, closed = false) => ({ id, characterId: 'kind', title: id, summary: '대화 요약', startedAt: today, endedAt: closed ? today : null, completedTurns: turns, canGenerateDiary: turns >= 5 });
  const sessions = { retry: makeSession('retry'), reference: makeSession('reference', 4), short: makeSession('short', 2, true) };
  const messages = Object.fromEntries(Object.entries(sessions).map(([id, session]) => [id, Array.from({ length: session.completedTurns * 2 }, (_, i) => ({ id: `${id}-${i}`, sequenceNo: i + 1, senderRole: i % 2 ? 'ASSISTANT' : 'USER', characterId: i % 2 ? 'kind' : null, content: i % 2 ? `기존 답변 ${i}` : `시험이 걱정돼요 ${i}`, createdAt: today, editedAt: null, diaryReferences: [] }))]));
  let endCalls = 0, draftCalls = 0, draftFail = true, suggestionCalls = 0, compareCalls = 0;
  let suggestMode = 'success', compareFail = false, enabled = true;
  let holdComparison = false, releaseComparison;
  const ok = extra => ({ isSuccess: true, code: 'SUCCESS', message: '성공', ...extra });
  await page.addInitScript(() => { if (!sessionStorage.getItem('preview-test')) sessionStorage.setItem('mowoo.accessToken', 'chat-test'); });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const json = data => route.fulfill({ json: ok(data) });
    const error = (status, code, message) => route.fulfill({ status, json: { isSuccess: false, error: { code, message } } });
    if (path === '/api/v1/me') return json({ id: 'owner', nickname: '검증 사용자', usePastDiaries: enabled, eveningReminderEnabled: false });
    if (path === '/api/v1/characters') return json({ items: [character] });
    if (path === '/api/v1/chat-sessions') return json({ items: Object.values(sessions), nextCursor: null });
    const match = path.match(/^\/api\/v1\/chat-sessions\/([^/]+)(.*)$/);
    if (match) {
      const [, id, action] = match;
      if (!action && method === 'GET') return json({ session: sessions[id], messages: { items: messages[id], nextCursor: null } });
      if (!action && method === 'PATCH') { endCalls++; sessions[id].endedAt = today; return json(sessions[id]); }
      if (action === '/diary-draft') {
        draftCalls++;
        assert.equal(url.searchParams.get('entryDate'), today);
        if (draftFail) return error(503, 'AI_UNAVAILABLE', '일기 생성 실패');
        return json(draft);
      }
      if (action === '/diary-suggestions') {
        suggestionCalls++; assert.equal(url.searchParams.get('messageId'), 'reference-6');
        if (suggestMode === 'fail') return error(503, 'AI_UNAVAILABLE', '추천 요청 실패');
        if (suggestMode === 'disabled') return error(403, 'PAST_DIARY_DISABLED', '과거 일기 활용 설정이 꺼져 있어요.');
        return json({ items: suggestMode === 'empty' ? [] : [{ diaryId: diary.id, entryDate: today, title: diary.title }] });
      }
      if (action === '/diary-references') {
        compareCalls++; assert.deepEqual(body, { messageId: 'reference-6', diaryId: diary.id });
        if (holdComparison) await new Promise(resolve => { releaseComparison = resolve; });
        await new Promise(resolve => setTimeout(resolve, 350));
        if (compareFail) return error(503, 'AI_UNAVAILABLE', '비교 답변 실패');
        const reply = { id: 'comparison', sequenceNo: 9, senderRole: 'ASSISTANT', characterId: 'kind', content: '지난 시험과 비교한 답변이에요.', createdAt: today, editedAt: null, diaryReferences: [{ diaryId: diary.id, entryDate: today, title: diary.title, acceptedAt: today }] };
        messages[id].push(reply); return json({ assistantMessage: reply });
      }
      if (action === '/messages/reference-6' && method === 'PATCH') {
        messages[id][6] = { ...messages[id][6], content: body.content, editedAt: 'edited-now' };
        return json({ userMessage: messages[id][6], assistantMessage: messages[id][7] });
      }
    }
    if (path === '/api/v1/diaries') return json({ items: [diary], nextCursor: null });
    if (path.startsWith('/api/v1/diaries/')) return json(path.endsWith('/generated-diary') ? draft : diary);
    if (path === '/api/v1/calendar') return json({ month: today.slice(0, 7), days: [] });
    return error(404, 'UNMOCKED', `${method} ${path}`);
  });
  const open = async path => { await page.goto(base + path); await page.getByRole('textbox', { name: '메시지' }).waitFor(); await page.locator('.chat-bubble-assistant').first().waitFor(); };
  const generate = () => page.locator('[data-node-id="30:3559"]');
  // Draft generation failure preserves an ended session through refresh and archive.
  await open('/chat?session=retry');
  await generate().click();
  await page.getByRole('alert').filter({ hasText: '일기 생성 실패' }).waitFor();
  assert.equal(endCalls, 1); assert.equal(draftCalls, 1);
  assert(page.url().endsWith('/chat?session=retry'));
  assert(await page.getByRole('textbox', { name: '메시지' }).isDisabled());
  await page.reload(); await generate().waitFor();
  await generate().click();
  await page.getByRole('alert').filter({ hasText: '일기 생성 실패' }).waitFor();
  assert.equal(endCalls, 1); assert.equal(draftCalls, 2);
  draftFail = false;
  await generate().click();
  await page.waitForURL('**/diary/write?id=generated-diary');
  await page.getByRole('textbox', { name: '일기 제목' }).filter({ hasText: '생성된 일기' }).waitFor();
  draft.savedAt = today;
  await page.goto(base + '/archive'); await page.locator('.archive-card').filter({ hasText: 'retry' }).click();
  await generate().click(); await page.waitForURL('**/diary/detail?id=generated-diary');
  assert.equal(endCalls, 1);
  await page.goto(base + '/chat?session=short');
  await page.getByText('기존 답변 3', { exact: true }).waitFor();
  assert.equal(await generate().count(), 0);
  // Explicit suggestions and consent, with no automatic calls or automatic links.
  await open('/chat?session=reference'); assert.equal(suggestionCalls, 0);
  const suggest = () => page.getByRole('button', { name: '과거 일기 추천받기' });
  const modal = page.getByRole('dialog', { name: '지난 마음 돌아보기' });
  const compare = () => modal.getByRole('button', { name: '선택한 일기로 비교하기' });
  await suggest().click(); await modal.getByText(diary.title, { exact: true }).waitFor();
  assert(await compare().isDisabled()); assert.equal(compareCalls, 0);
  await modal.getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(compareCalls, 0);
  suggestMode = 'fail'; await suggest().click(); await modal.getByRole('alert').waitFor();
  suggestMode = 'empty'; await modal.getByRole('button', { name: '추천 다시 받기' }).click();
  await modal.getByText(/지금 추천할 일기가 없어요/).waitFor();
  suggestMode = 'success'; await modal.getByRole('button', { name: '추천 다시 받기' }).click();
  await modal.getByRole('radio').check(); compareFail = true;
  await compare().click(); await modal.getByRole('alert').filter({ hasText: '비교 답변 실패' }).waitFor();
  assert(await modal.getByRole('radio').isChecked());
  compareFail = false; await compare().click();
  await modal.getByRole('button', { name: '비교하는 중…' }).waitFor();
  assert(await modal.getByRole('button', { name: '취소', exact: true }).isDisabled());
  await page.keyboard.press('Escape'); assert(await modal.isVisible());
  await modal.waitFor({ state: 'detached' });
  await page.getByText('지난 시험과 비교한 답변이에요.', { exact: true }).waitFor();
  assert.equal(compareCalls, 2); assert.equal(sessions.reference.completedTurns, 4);
  assert.equal(await generate().getAttribute('aria-label'), '오늘 대화로 일기 자동 생성 (대화 4/5회)');
  assert.equal(await generate().evaluate(node => node.classList.contains('is-ready')), false);
  assert.equal(await page.locator('.chat-diary-reference').count(), 1);
  // Latest user edits keep the separately saved comparison message and reference.
  await page.getByRole('button', { name: '내용 수정' }).click();
  await page.getByRole('textbox', { name: '메시지 수정' }).fill('시험 준비가 걱정돼요');
  await page.getByRole('button', { name: '수정 완료' }).click();
  await page.getByText('시험 준비가 걱정돼요', { exact: true }).waitFor();
  assert.equal(await page.locator('.chat-diary-reference').count(), 1);
  await page.reload(); await page.locator('.chat-diary-reference').waitFor();
  assert.equal(compareCalls, 2);
  await page.locator('.chat-diary-reference').click(); await page.waitForURL('**/diary/detail?id=past-diary');
  await page.locator('[data-node-id="113:2809"]').filter({ hasText: diary.content }).waitFor();
  await page.goBack(); await page.locator('.chat-diary-reference').waitFor();
  // Candidate preview navigates without consent or a comparison call.
  await suggest().click(); await modal.getByRole('button', { name: '일기 읽기' }).click();
  await page.waitForURL('**/diary/detail?id=past-diary'); assert.equal(compareCalls, 2);
  await page.goBack(); await suggest().waitFor();
  suggestMode = 'disabled'; await suggest().click(); await modal.getByRole('alert').filter({ hasText: '과거 일기 활용 설정' }).waitFor();
  await modal.getByRole('button', { name: '취소', exact: true }).click();
  enabled = false; await page.reload(); await page.locator('.chat-diary-reference').waitFor();
  assert.equal(await suggest().count(), 0); // Existing references remain readable with the setting off.
  enabled = true; suggestMode = 'success'; diary.title = '긴 일기 제목 '.repeat(16);
  fs.mkdirSync('.local/chat-improvements', { recursive: true });
  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 600 });
    await page.reload(); await suggest().click(); await modal.getByRole('radio').waitFor();
    const box = await modal.boundingBox(); assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 600);
    await modal.getByRole('radio').check();
    await compare().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.local/chat-improvements/suggestions-${width}.png` });
    await modal.getByRole('button', { name: '취소', exact: true }).click();
  }
  // A late comparison response must not reopen or mutate a different screen.
  await page.goto(base + '/archive');
  await page.locator('.archive-card').filter({ hasText: 'reference' }).click();
  await suggest().click(); await modal.getByRole('radio').check();
  holdComparison = true; await compare().click();
  await modal.getByRole('button', { name: '비교하는 중…' }).waitFor();
  await page.goBack(); await page.locator('.archive-list').waitFor();
  assert.equal(typeof releaseComparison, 'function'); releaseComparison();
  await page.waitForResponse(response => response.url().endsWith('/diary-references'));
  assert(page.url().endsWith('/archive')); assert.equal(await modal.count(), 0);
  // Logged-out preview does not expose real recommendation controls.
  await page.evaluate(() => { sessionStorage.setItem('preview-test', 'true'); sessionStorage.removeItem('mowoo.accessToken'); });
  await page.goto(base + '/chat');
  await page.getByRole('textbox', { name: '메시지' }).waitFor();
  assert.equal(await suggest().count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: failed draft retry after end/reload/archive, saved-diary opening and turn gate; explicit suggestions, empty/error/settings, consent, failed comparison retry, turn preservation, reference restore/open, message edit and responsive modal (mock API).');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
