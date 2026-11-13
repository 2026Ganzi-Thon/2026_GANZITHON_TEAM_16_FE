import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:393,height:852}});
const base=process.env.VERIFY_BASE_URL||'http://127.0.0.1:3000';
try {
 await page.goto(base+'/home');
 await page.getByRole('button',{name:'마이페이지',exact:true}).click();
 await page.getByRole('button',{name:'내 정보',exact:true}).first().click();
 await page.getByRole('button',{name:'내 정보 수정',exact:true}).click();
 await page.getByRole('textbox',{name:'닉네임',exact:true}).fill('테스트 모우');
 await page.getByRole('button',{name:'저장하기',exact:true}).click();
 await page.waitForURL('**/me');
 assert.equal(await page.locator('[data-node-id="130:769"]').textContent(),'테스트 모우');
 await page.reload();assert.equal(await page.locator('[data-node-id="130:769"]').textContent(),'테스트 모우');
 await page.goto(base+'/mypage');
 const setting=page.getByRole('switch',{name:'저녁 모우 알림',exact:true});
 await setting.click();assert.equal(await setting.getAttribute('aria-checked'),'true');
 await setting.click();assert.equal(await setting.getAttribute('aria-checked'),'false');
 await page.goto(base+'/diary');
 await page.getByRole('button',{name:'오늘을 기록하러 가기',exact:true}).first().click();
 await page.getByRole('button',{name:'직접 작성하기',exact:true}).click();
 await page.getByRole('textbox',{name:'일기 내용',exact:true}).fill('오늘은 프론트엔드 화면을 확인했다.');
 await page.getByRole('textbox',{name:'일기 내용',exact:true}).blur();
 await page.getByRole('button',{name:'일기 저장',exact:true}).click();
 await page.waitForURL('**/diary/detail');
 assert.equal(await page.locator('[data-node-id="113:2809"]').textContent(),'오늘은 프론트엔드 화면을 확인했다.');
 await page.goto(base+'/mypage');
 await page.getByRole('button',{name:'모든 기록 삭제',exact:true}).click();
 await page.getByRole('button',{name:'취소',exact:true}).click();await page.waitForURL('**/mypage');
 await page.goto(base+'/characters');
 await page.getByRole('button',{name:'다정한 모우 상세보기',exact:true}).first().click();
 await page.getByRole('button',{name:'닫기',exact:true}).click();await page.waitForURL('**/characters');
 console.log('PASS: navigation, profile persistence, settings toggle, diary edit/save, delete cancel, character modal.');
} finally {await browser.close();}

