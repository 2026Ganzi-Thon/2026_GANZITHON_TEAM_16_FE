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
    const timer = setTimeout(() => reject(new Error('Server timeout')), 15000);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exit ${code}`)); });
    server.stdout.on('data', data => { if (data.toString().includes('3100')) { clearTimeout(timer); resolve(); } });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 393, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const types = [
    { id: 'calm-id', code: 'CALM', name: '평온한 날', colorHex: '#3CE892', iconUrl: null },
    { id: 'happy-id', code: 'HAPPY', name: '즐거운 날', colorHex: '#FFE88A', iconUrl: null },
    { id: 'sad-id', code: 'SAD', name: '우울한 날', colorHex: '#67B3FF', iconUrl: null },
  ];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let diary = { id: 'test-diary', title: '마음 검증', content: '산책한 하루', sourceSessionId: null, entryDate: today, savedAt: today + 'T01:00:00Z', emotionConfirmedAt: null, emotions: [], attachments: [] };
  let suggestCalls = 0, confirms = [], suggestionFail = false, saveFail = false, typeFail = false, empty = false;
  await page.addInitScript(() => sessionStorage.setItem('mowoo.accessToken', 'emotion-test-token'));
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    assert.equal(req.headers().authorization, 'Bearer emotion-test-token');
    if (path === '/api/v1/me') return route.fulfill({ json: { id: 'owner', nickname: '테스트', email: null, birthDate: null, usePastDiaries: true, eveningReminderEnabled: false } });
    if (path === '/api/v1/emotion-types') return route.fulfill(typeFail ? { status: 503, json: { error: { message: '목록 오류' } } } : { json: { items: empty ? [] : types } });
    if (path.endsWith('/emotion-suggestions')) {
      suggestCalls++;
      return route.fulfill(suggestionFail ? { status: 503, json: { error: { code: 'AI_UNAVAILABLE', message: '추천 실패 테스트' } } } : { json: { suggestedEmotionIds: ['calm-id', 'happy-id'], primaryEmotionId: 'calm-id' } });
    }
    if (path.endsWith('/emotions')) {
      assert.equal(req.method(), 'PUT'); const body = req.postDataJSON(); confirms.push(body);
      if (saveFail) return route.fulfill({ status: 400, json: { error: { message: '저장 실패 테스트' } } });
      assert(body.emotionIds.includes(body.primaryEmotionId));
      diary = { ...diary, emotionConfirmedAt: new Date().toISOString(), emotions: types.filter(type => body.emotionIds.includes(type.id)).map(type => ({ ...type, isPrimary: type.id === body.primaryEmotionId })) };
      await new Promise(resolve => setTimeout(resolve, 100));
      return route.fulfill({ json: diary });
    }
    if (path === '/api/v1/diaries/test-diary') return route.fulfill({ json: diary });
    if (path === '/api/v1/diaries') return route.fulfill({ json: { items: diary.savedAt ? [diary] : [], nextCursor: null } });
    if (path === '/api/v1/calendar') return route.fulfill({ json: { month: today.slice(0, 7), days: diary.emotionConfirmedAt ? [{ date: today, primaryEmotion: diary.emotions.find(emotion => emotion.isPrimary), diaryIds: [diary.id] }] : [] } });
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  const open = async () => {
    await page.goto(base + '/diary/detail?id=test-diary');
    await page.getByRole('button', { name: /감정 기록하기| · 변경/ }).click();
    await page.getByRole('checkbox', { name: '평온한 날' }).waitFor();
  };
  await open();
  assert.equal(suggestCalls, 0, 'AI must be explicitly requested');
  assert(await page.getByRole('button', { name: '감정 확정하기' }).isDisabled());
  await page.getByRole('button', { name: 'AI 감정 추천받기' }).click();
  await page.getByText('추천 감정을 반영했어요. 수정하거나 확정해 주세요.', { exact: true }).waitFor();
  await page.getByRole('checkbox', { name: '평온한 날' }).check();
  await page.getByRole('radio', { name: '평온한 날' }).waitFor();
  assert.equal(confirms.length, 0, 'recommendations are not confirmation');
  await page.getByRole('radio', { name: '즐거운 날' }).check();
  await page.getByRole('checkbox', { name: '즐거운 날' }).uncheck();
  assert(await page.getByRole('radio', { name: '평온한 날' }).isChecked());
  await page.getByRole('checkbox', { name: '우울한 날' }).check();
  await page.getByRole('radio', { name: '우울한 날' }).check();
  fs.mkdirSync('.local/diary-emotions', { recursive: true });
  await page.screenshot({ path: '.local/diary-emotions/picker-393.png', fullPage: true });
  await page.getByRole('button', { name: '감정 확정하기' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(confirms[0], { emotionIds: ['calm-id', 'sad-id'], primaryEmotionId: 'sad-id' });
  await page.getByRole('button', { name: '우울한 날 · 변경' }).waitFor();
  await page.reload(); await page.getByRole('button', { name: '우울한 날 · 변경' }).waitFor();
  await page.goto(base + '/calendar');
  await page.getByRole('button', { name: `${Number(today.slice(5, 7))}월 ${Number(today.slice(8))}일 기록 보기` }).waitFor();
  assert.equal(await page.locator('.live-calendar-day.has-diary .diary-blob path').getAttribute('fill'), '#67B3FF');

  await open(); suggestionFail = true;
  await page.getByRole('button', { name: 'AI 감정 추천받기' }).click();
  await page.getByRole('alert').filter({ hasText: '추천 실패 테스트' }).waitFor();
  assert(await page.getByRole('checkbox', { name: '우울한 날' }).isChecked());
  await page.getByRole('checkbox', { name: '즐거운 날' }).check();
  saveFail = true;
  await page.getByRole('button', { name: '감정 확정하기' }).click();
  await page.getByRole('alert').filter({ hasText: '저장 실패 테스트' }).waitFor();
  assert.equal(diary.emotions.length, 2);
  saveFail = false;
  await page.getByRole('button', { name: '감정 확정하기' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(diary.emotions.length, 3);
  await open();
  await page.getByRole('checkbox', { name: '평온한 날' }).uncheck();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(diary.emotions.length, 3, 'closing must discard edits');

  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 600 }); await open();
    const rect = await page.getByRole('dialog').boundingBox();
    assert(rect.x >= 0 && rect.x + rect.width <= width + 1 && rect.y >= 0 && rect.y + rect.height <= 601);
    await page.getByRole('button', { name: '감정 선택 닫기' }).click();
  }
  typeFail = true;
  await page.getByRole('button', { name: '우울한 날 · 변경' }).click();
  await page.getByText('목록 오류', { exact: true }).waitFor();
  typeFail = false;
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await page.getByRole('checkbox', { name: '평온한 날' }).waitFor();
  await page.getByRole('button', { name: '감정 선택 닫기' }).click();
  empty = true;
  await page.getByRole('button', { name: '우울한 날 · 변경' }).click();
  await page.getByText('등록된 감정이 없어요. 관리자에게 문의해 주세요.').waitFor();
  assert.equal(await page.getByRole('button', { name: '감정 확정하기' }).count(), 0);
  await page.getByRole('button', { name: '감정 선택 닫기' }).click();
  diary = { ...diary, savedAt: null };
  await page.reload(); assert.equal(await page.getByRole('button', { name: /감정 기록하기| · 변경/ }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: manual/multiple emotions and primary, explicit AI suggestion without auto-save, persisted confirmation/reload/calendar, failed suggestion/save recovery, cancel discard, empty/error retry, draft exclusion and responsive dialog (mock API).');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
