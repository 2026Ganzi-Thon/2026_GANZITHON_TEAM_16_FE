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
  const month = today.slice(0, 7);
  const shift = offset => { const [year, index] = month.split('-').map(Number); const date = new Date(year, index - 1 + offset, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; };
  const types = [{ id: 'calm', code: 'CALM', name: '평온한 날', colorHex: '#3CE892', iconUrl: null }, { id: 'happy', code: 'HAPPY', name: '즐거운 날', colorHex: '#FFE88A', iconUrl: null }];
  let owner = 'owner-a', recapMode = 'success', typeFail = false, saveFail = false;
  const recapCalls = [], typeCalls = [];
  let drillDown = false, listFail = false, cursorLoop = false;
  const listCalls = [];
  let diary = { id: 'diary-a', sourceSessionId: null, entryDate: today, title: '처음 제목', content: '처음 내용', savedAt: today, emotionConfirmedAt: today, emotions: [{ ...types[0], isPrimary: true }], attachments: [] };
  const ok = extra => ({ isSuccess: true, code: 'SUCCESS', message: '성공', ...extra });
  await page.addInitScript(() => { if (!sessionStorage.getItem('test.preview')) sessionStorage.setItem('mowoo.accessToken', 'monthly-test'); });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    const data = req.postData() ? JSON.parse(req.postData()) : null;
    const json = extra => route.fulfill({ json: ok(extra) });
    const failure = message => route.fulfill({ status: 503, json: { error: { code: 'AI_UNAVAILABLE', message } } });
    if (path === '/api/v1/me') return json({ id: owner, nickname: '검증 사용자', usePastDiaries: true });
    if (path === '/api/v1/emotion-types') { typeCalls.push(path); return typeFail ? failure('감정 정보 실패') : json({ items: types }); }
    if (path === '/api/v1/calendar/recap') {
      const requested = url.searchParams.get('month'); recapCalls.push(requested);
      const mode = recapMode;
      if (mode === 'delay') await new Promise(resolve => setTimeout(resolve, 400));
      if (mode === 'fail') return failure('AI 회고를 잠시 후 다시 요청해 주세요.');
      if (mode === 'mismatch') return json({ month: '1000-01', emotionCounts: [], concernSummary: '잘못된 월' });
      return json({ month: requested, emotionCounts: mode === 'empty' ? [] : mode === 'no-emotions' ? [] : [{ emotionTypeId: 'happy', count: 2 }, { emotionTypeId: 'calm', count: 3 }, { emotionTypeId: 'unknown', count: 1 }], concernSummary: mode === 'empty' ? null : `${requested} 회고 ${mode === 'delay' ? '이전 요청' : '완료'}\n${'일기를 쓰며 마음을 돌아봤어요. '.repeat(25)}` });
    }
    if (path === '/api/v1/calendar') return json({ month: url.searchParams.get('month'), days: [] });
    if (path === '/api/v1/diaries') {
      if (!drillDown) return json({ items: [diary], nextCursor: null });
      const from = url.searchParams.get('from') ?? today, selectedMonth = from.slice(0, 7), cursor = url.searchParams.get('cursor');
      listCalls.push({ month: selectedMonth, cursor });
      if (listFail) return failure('일기 목록 조회 실패');
      const first = { ...diary, entryDate: `${selectedMonth}-17`, emotions: [{ ...types[0], isPrimary: true }, { ...types[1], isPrimary: false }] };
      return json(cursor ? { items: [first, { ...diary, id: 'second-page-diary', entryDate: `${selectedMonth}-02` }], nextCursor: cursorLoop ? 'next-page' : null }
        : { items: [first, { ...first, id: 'unconfirmed', emotionConfirmedAt: null }, { ...first, id: 'other-month', entryDate: '1000-01-01' }], nextCursor: 'next-page' });
    }
    if (path === `/api/v1/diaries/${diary.id}` && method === 'GET') return json(diary);
    if (path === `/api/v1/diaries/${diary.id}` && method === 'PATCH') {
      if (saveFail) return failure('일기 저장 실패');
      if (data.content !== undefined && data.content !== diary.content) diary = { ...diary, emotionConfirmedAt: null, emotions: [] };
      diary = { ...diary, ...data }; return json(diary);
    }
    if (path.endsWith('/emotions') && method === 'PUT') {
      diary = { ...diary, emotionConfirmedAt: today, emotions: data.emotionIds.map(id => ({ ...types.find(type => type.id === id), isPrimary: id === data.primaryEmotionId })) };
      return json(diary);
    }
    if (path === '/api/v1/characters' || path === '/api/v1/chat-sessions') return json({ items: [], nextCursor: null });
    return route.fulfill({ status: 404, json: { error: { message: `Not mocked: ${method} ${path}` } } });
  });
  const modal = page.getByRole('dialog', { name: '월간 마음 회고' });
  const openRecap = async () => { await page.locator('.monthly-recap-entry').click(); await modal.waitFor(); };
  const closeRecap = async () => { await modal.getByRole('button', { name: '월간 회고 닫기' }).click(); await modal.waitFor({ state: 'detached' }); };
  await page.goto(base + '/calendar'); await page.locator('.monthly-recap-entry').waitFor();
  assert.equal(recapCalls.length, 0, 'No automatic AI request on calendar entry');
  await openRecap(); await modal.locator('.recap-summary-text').waitFor();
  await modal.getByText('평온한 날', { exact: true }).waitFor();
  assert.equal(await modal.getByText('3회', { exact: true }).count(), 1);
  assert.equal(await modal.getByText('등록 정보가 없는 감정', { exact: true }).count(), 1);
  assert(await modal.getByRole('button', { name: '회고 다음 달' }).isDisabled());
  await closeRecap(); await openRecap(); await modal.locator('.recap-summary-text').waitFor();
  assert.equal(recapCalls.length, 1, 'Reopening reuses the same calendar-visit result');
  // Empty month and count-less saved diaries are different from a failed response.
  recapMode = 'empty'; await modal.getByRole('button', { name: '회고 이전 달' }).click();
  await modal.getByText(/이달에는 저장한 일기가 없어 회고가 없어요/).waitFor();
  assert.equal(await modal.getByRole('alert').count(), 0);
  recapMode = 'no-emotions'; await modal.getByRole('button', { name: '회고 이전 달' }).click();
  await modal.locator('.recap-summary-text').filter({ hasText: shift(-2) }).waitFor();
  await modal.getByText('아직 확정한 감정이 없어요.').waitFor();
  recapMode = 'fail'; await modal.getByRole('button', { name: '회고 이전 달' }).click();
  await modal.getByRole('alert').filter({ hasText: 'AI 회고' }).waitFor();
  assert.equal(await modal.locator('.recap-emotions').count(), 0);
  assert.equal(await modal.getByText('아직 확정한 감정이 없어요.').count(), 0);
  recapMode = 'success'; await modal.getByRole('button', { name: '회고 다시 불러오기' }).click();
  await modal.locator('.recap-summary-text').filter({ hasText: shift(-3) }).waitFor();
  // A request for an older month cannot replace a newer selected month.
  recapMode = 'delay';
  const delayedRequest = page.waitForRequest(request => request.url().includes('/calendar/recap') && request.url().includes(`month=${shift(-4)}`));
  await modal.getByRole('button', { name: '회고 이전 달' }).click(); await delayedRequest;
  recapMode = 'success'; await modal.getByRole('button', { name: '회고 이전 달' }).click();
  await modal.locator('.recap-summary-text').filter({ hasText: shift(-5) }).waitFor();
  await page.waitForTimeout(500);
  assert.match(await modal.locator('.recap-summary-text').innerText(), new RegExp(shift(-5)));
  // Month input supports year boundaries, and unknown/mismatched responses fail explicitly.
  recapMode = 'mismatch';
  await modal.getByLabel('회고할 월', { exact: true }).fill('2025-12');
  await modal.getByRole('alert').filter({ hasText: '요청한 월' }).waitFor();
  recapMode = 'success'; await modal.getByRole('button', { name: '회고 다시 불러오기' }).click();
  await modal.locator('.recap-summary-text').filter({ hasText: '2025-12' }).waitFor();
  await closeRecap();
  // Metadata retry must not invoke the paid recap again.
  typeFail = true; await openRecap(); await modal.getByRole('alert').filter({ hasText: '감정 이름' }).waitFor();
  await modal.locator('.recap-summary-text').waitFor();
  const beforeMetadataRetry = recapCalls.length; typeFail = false;
  await modal.getByRole('button', { name: '감정 이름 다시 불러오기' }).click();
  await modal.getByText('평온한 날', { exact: true }).waitFor(); assert.equal(recapCalls.length, beforeMetadataRetry);
  fs.mkdirSync('.local/monthly-recap', { recursive: true });
  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 600 });
    await modal.getByRole('button', { name: '캘린더로 돌아가기' }).scrollIntoViewIfNeeded();
    const box = await modal.boundingBox(); assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 600);
    await page.screenshot({ path: `.local/monthly-recap/recap-${width}.png` });
  }
  await closeRecap();
  const beforeNewVisit = recapCalls.length;
  await page.goto(base + '/calendar'); await openRecap(); await modal.locator('.recap-summary-text').waitFor();
  assert.equal(recapCalls.length, beforeNewVisit + 1, 'New calendar visit invalidates old recap');
  await closeRecap();
  // Emotion drill-down uses every month page, includes non-primary matches and shows dates only.
  drillDown = true; listFail = true;
  await openRecap(); await modal.locator('.recap-summary-text').waitFor();
  const calmToggle = () => modal.getByRole('button', { name: '평온한 날 일기 목록', exact: true });
  const calmRegion = () => modal.getByRole('region', { name: '평온한 날 일기 목록', exact: true });
  const happyToggle = () => modal.getByRole('button', { name: '즐거운 날 일기 목록', exact: true });
  const happyRegion = () => modal.getByRole('region', { name: '즐거운 날 일기 목록', exact: true });
  const aiBeforeList = recapCalls.length;
  await calmToggle().click(); await calmRegion().getByRole('alert').filter({ hasText: '일기 목록 조회 실패' }).waitFor();
  listFail = false; await calmRegion().getByRole('button', { name: '일기 목록 다시 불러오기' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.recap-emotion-diaries time').length === 2);
  assert.equal(await calmRegion().getByRole('button').count(), 2, 'Deduplicate pages and exclude other-month/unconfirmed diaries');
  assert(listCalls.some(call => call.cursor === 'next-page'));
  for (const label of await calmRegion().getByRole('button').allTextContents()) assert.match(label, /^\d{4}-\d{2}-\d{2}›$/);
  const listCount = listCalls.length;
  await happyToggle().click(); await happyRegion().getByRole('button').waitFor();
  assert.equal(await happyRegion().getByRole('button').count(), 1, 'A non-primary happy emotion must be included');
  assert.equal(listCalls.length, listCount, 'Switching emotions reuses the month list');
  await happyToggle().click(); assert.equal(await happyToggle().getAttribute('aria-expanded'), 'false');
  await modal.getByRole('button', { name: '등록 정보가 없는 감정 일기 목록' }).click();
  await modal.getByText('해당 감정으로 확정한 일기가 없어요.').waitFor();
  assert.equal(recapCalls.length, aiBeforeList, 'Accordion operations do not regenerate AI recap');
  await calmToggle().click();
  await page.setViewportSize({ width: 320, height: 600 });
  await calmRegion().getByRole('button').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/monthly-recap/emotion-diaries-320.png' });
  await calmRegion().getByRole('button').first().click();
  await page.waitForURL('**/diary/detail?id=diary-a'); assert.equal(await modal.count(), 0);
  await page.goBack(); await openRecap(); await calmToggle().waitFor();
  assert.equal(await calmToggle().getAttribute('aria-expanded'), 'false');
  cursorLoop = true; await modal.getByLabel('회고할 월', { exact: true }).fill(shift(-6));
  await modal.locator('.recap-summary-text').filter({ hasText: shift(-6) }).waitFor();
  await calmToggle().click();
  await calmRegion().getByRole('alert').filter({ hasText: '끝까지 불러오지 못했어요' }).waitFor();
  cursorLoop = false; await calmRegion().getByRole('button', { name: '일기 목록 다시 불러오기' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.recap-emotion-diaries time').length === 2);
  await closeRecap(); drillDown = false;
  // Only changed content of an already-confirmed diary needs reconfirmation.
  const editorNotice = page.locator('.emotion-reset-editor-notice');
  const save = () => page.getByRole('button', { name: '일기 저장', exact: true });
  const body = () => page.getByRole('textbox', { name: '일기 내용', exact: true });
  const title = () => page.getByRole('textbox', { name: '일기 제목', exact: true });
  const reminder = page.getByRole('dialog', { name: '바뀐 이야기의 마음은 어떤가요?' });
  await page.goto(base + '/diary/write?id=diary-a'); await body().filter({ hasText: '처음 내용' }).waitFor();
  await title().fill('제목만 변경'); assert.equal(await editorNotice.count(), 0);
  await save().click(); await page.waitForURL('**/diary/detail?id=diary-a');
  await page.getByRole('button', { name: '평온한 날 · 변경' }).waitFor(); assert.equal(await reminder.count(), 0);
  await page.getByRole('button', { name: '수정하기', exact: true }).click();
  await body().fill('바뀐 본문'); await editorNotice.waitFor();
  await body().fill('처음 내용'); assert.equal(await editorNotice.count(), 0);
  await body().fill('처음 내용  '); assert.equal(await editorNotice.count(), 0);
  await body().fill('바뀐 본문'); saveFail = true; await save().click();
  await page.getByRole('status').filter({ hasText: '일기 저장 실패' }).waitFor();
  assert.equal(await reminder.count(), 0); assert.equal(diary.emotionConfirmedAt, today);
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('mowoo.emotion-reconfirmation.owner-a') ?? '[]').length), 0);
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 600 });
    await page.waitForFunction(() => document.querySelector('main').getBoundingClientRect().width <= innerWidth);
    const noticeBox = await editorNotice.boundingBox(), saveBox = await save().boundingBox();
    assert(noticeBox.y + noticeBox.height <= saveBox.y);
    await page.screenshot({ path: `.local/monthly-recap/editor-notice-${width}.png` });
  }
  saveFail = false; await save().click(); await reminder.waitFor();
  assert.equal(diary.emotionConfirmedAt, null);
  await reminder.getByRole('button', { name: '나중에', exact: true }).click();
  await page.getByRole('button', { name: '감정 다시 선택하기', exact: true }).waitFor();
  await page.reload(); await reminder.waitFor();
  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 600 });
    const box = await reminder.boundingBox(); assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 600);
    await page.screenshot({ path: `.local/monthly-recap/reconfirmation-${width}.png` });
  }
  await reminder.getByRole('button', { name: '감정 다시 선택하기' }).click();
  const picker = page.getByRole('dialog', { name: '오늘의 마음' });
  await picker.getByRole('checkbox', { name: '평온한 날' }).check();
  await picker.getByRole('button', { name: '감정 확정하기' }).click();
  await picker.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '평온한 날 · 변경' }).waitFor();
  await page.reload(); await page.getByRole('button', { name: '평온한 날 · 변경' }).waitFor();
  assert.equal(await reminder.count(), 0);
  // New/unconfirmed diaries don't get a false "reset" notice, nor does another owner.
  diary = { ...diary, emotionConfirmedAt: null, emotions: [] };
  await page.goto(base + '/diary/write?id=diary-a'); await body().filter({ hasText: '바뀐 본문' }).waitFor();
  await body().fill('미확정 일기 본문 수정'); assert.equal(await editorNotice.count(), 0);
  await save().click(); await page.waitForURL('**/diary/detail?id=diary-a'); assert.equal(await reminder.count(), 0);
  await page.evaluate(() => sessionStorage.setItem('mowoo.emotion-reconfirmation.owner-a', JSON.stringify(['diary-a'])));
  owner = 'owner-b'; await page.reload(); await page.getByRole('button', { name: '감정 기록하기', exact: true }).waitFor();
  assert.equal(await reminder.count(), 0);
  await page.evaluate(() => { sessionStorage.removeItem('mowoo.accessToken'); sessionStorage.setItem('test.preview', 'yes'); });
  const beforePreview = recapCalls.length;
  await page.goto(base + '/calendar'); await page.locator('.live-calendar').waitFor();
  assert.equal(await page.locator('.monthly-recap-entry').count(), 0); assert.equal(recapCalls.length, beforePreview);
  assert.deepEqual(errors, []);
  console.log('PASS: monthly recap, cache, month races, errors/retry; emotion accordion with all-page filtering, non-primary matches, date-only links and pagination recovery; changed-content reconfirmation notice, failed-save preservation, owner isolation and responsive layout (mock API).');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
