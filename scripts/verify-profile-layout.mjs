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
    const timeout = setTimeout(() => reject(new Error('Temporary server did not start.')), 15000);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Temporary server exited: ${code}`)); });
    server.stdout.on('data', chunk => { if (chunk.toString().includes('3100')) { clearTimeout(timeout); resolve(); } });
    server.stderr.on('data', chunk => { if (chunk.toString().includes('Error:')) { clearTimeout(timeout); reject(new Error(chunk.toString())); } });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  fs.mkdirSync('.local/profile-layout', { recursive: true });
  const scenarios = [
    { name: 'reported', nickname: 'yuldo04-test', email: 'yuldo04@gmail.com', birthDate: null },
    { name: 'long', nickname: '아주긴닉네임입니다'.repeat(5), email: 'long.profile.name.for.layout.check@example.com', birthDate: '2004-02-27' },
  ];
  for (const width of [393, 320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scenario of scenarios) {
      await page.goto(base + '/me');
      await page.evaluate(profile => {
        localStorage.setItem('mowoo.previewProfile', JSON.stringify({ ...profile, usePastDiaries: false, eveningReminderEnabled: false }));
      }, scenario);
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      const card = await page.locator('[data-node-id="130:764"]').boundingBox();
      const image = await page.locator('[data-node-id="130:766"]').boundingBox();
      const texts = [];
      for (const id of ['130:769', '130:777', '130:776']) {
        const box = await page.locator(`[data-node-id="${id}"]`).boundingBox();
        assert(box && card && image);
        assert(box.x > image.x + image.width, `${width}/${scenario.name}: profile text overlaps avatar`);
        assert(box.x + box.width <= card.x + card.width, `${width}/${scenario.name}: profile text exceeds card`);
        texts.push(box);
      }
      assert(Math.abs(texts[0].x - texts[1].x) < 0.5, 'Nickname and email must share a left edge.');
      if (!scenario.birthDate) assert.equal(await page.locator('[data-node-id="130:776"]').textContent(), '');
      await page.screenshot({ path: `.local/profile-layout/profile-${scenario.name}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: '내 정보 수정', exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      for (const [inputId, pillId] of [['130:846', '130:837'], ['130:847', '130:838'], ['130:848', '130:839']]) {
        const input = await page.locator(`input[data-node-id="${inputId}"]`).boundingBox();
        const pill = await page.locator(`[data-node-id="${pillId}"]`).boundingBox();
        assert(input && pill);
        assert(input.x >= pill.x + 10 * Math.min(1, width / 393), `${width}/${scenario.name}: input starts outside padding`);
        assert(input.x + input.width < pill.x + pill.width, `${width}/${scenario.name}: input exceeds pill`);
        assert(Math.abs(input.y - pill.y) < 0.5 && Math.abs(input.height - pill.height) < 0.5, 'Input must align vertically with pill.');
      }
      const nickname = page.getByRole('textbox', { name: '닉네임', exact: true });
      await nickname.fill('정렬확인');
      await page.getByLabel('이메일', { exact: true }).fill('layout@example.com');
      await page.getByLabel('생년월일', { exact: true }).fill('2004-02-27');
      await page.screenshot({ path: `.local/profile-layout/edit-${scenario.name}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: '저장하기', exact: true }).click();
      await page.waitForURL('**/me');
      assert.equal(await page.locator('[data-node-id="130:769"]').textContent(), '정렬확인');
      assert.equal(await page.locator('[data-node-id="130:777"]').textContent(), 'layout@example.com');
      assert((await page.locator('[data-node-id="130:776"]').textContent()).includes('2004'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.goto(base + '/mypage');
      await page.evaluate(profile => localStorage.setItem('mowoo.previewProfile', JSON.stringify({ ...profile, usePastDiaries: false, eveningReminderEnabled: false })), scenario);
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      const myName = await page.locator('[data-node-id="33:3972"]').boundingBox();
      const myAvatar = await page.locator('[data-node-id="33:3969"]').boundingBox();
      const myDescription = await page.locator('[data-node-id="33:3973"]').boundingBox();
      const myArrow = await page.locator('[data-node-id="33:4039"]').boundingBox();
      assert(myName && myAvatar && myDescription && myArrow);
      assert(myName.x > myAvatar.x + myAvatar.width, 'MyPage nickname must not overlap avatar.');
      assert(myName.x + myName.width < myArrow.x, 'MyPage nickname must not overlap arrow.');
      assert(Math.abs(myName.x - myDescription.x) < 0.5, 'MyPage nickname and description must share a left edge.');
      assert.equal(await page.locator('[data-node-id="33:3972"]').textContent(), scenario.nickname);
      await page.screenshot({ path: `.local/profile-layout/mypage-${scenario.name}-${width}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: MyPage, profile and edit alignment at 393px, 320px and desktop; long text, empty birth date and saving preserved.');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
