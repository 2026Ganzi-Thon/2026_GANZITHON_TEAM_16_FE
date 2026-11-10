import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:3100';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3100','--strictPort'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),15000);server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exit ${code}`));});server.stdout.on('data',data=>{if(data.toString().includes('3100')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 fs.mkdirSync('.local/toggle-controls',{recursive:true});
 for(const width of [393,320]){
  await page.setViewportSize({width,height:1000});
  await page.goto(base+'/mypage');
  for(const label of ['과거 일기를 대화에 사용','저녁 모우 알림']){
   const toggle=page.getByRole('switch',{name:label,exact:true});
   const initial=await toggle.getAttribute('aria-checked');
   for(let count=0;count<4;count++){
    const previous=await toggle.getAttribute('aria-checked');await toggle.click();
    assert.equal(await toggle.getAttribute('aria-checked'),String(previous!=='true'));
    const track=await toggle.boundingBox(),thumb=await toggle.locator('span').boundingBox();
    assert(track&&thumb);
    const on=await toggle.getAttribute('aria-checked')==='true';
    const padding=on?track.x+track.width-thumb.x-thumb.width:thumb.x-track.x;
    assert(Math.abs(padding-5*width/393)<1,'Thumb must return to the correct edge.');
   }
   assert.equal(await toggle.getAttribute('aria-checked'),initial);
   await toggle.focus();await page.keyboard.press('Space');await page.keyboard.press('Space');
   assert.equal(await toggle.getAttribute('aria-checked'),initial);
  }
  await page.reload();
  await page.getByRole('button',{name:'기록 선택 삭제',exact:true}).click();
  for(const checkbox of await page.getByRole('checkbox').all()){
   const initial=await checkbox.getAttribute('aria-checked');
   await checkbox.click();
   assert.equal(await checkbox.getAttribute('aria-checked'),String(initial!=='true'));
   assert.equal(await checkbox.locator('img').getAttribute('src'),initial==='true'?'/assets/5f4ae.svg':'/assets/5c577.svg');
   await checkbox.click();assert.equal(await checkbox.getAttribute('aria-checked'),initial);
   await checkbox.focus();await page.keyboard.press('Space');
   assert.equal(await checkbox.getAttribute('aria-checked'),String(initial!=='true'));
   await page.keyboard.press('Enter');assert.equal(await checkbox.getAttribute('aria-checked'),initial);
  }
  await page.screenshot({path:`.local/toggle-controls/checkboxes-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'취소',exact:true}).click();
  await page.screenshot({path:`.local/toggle-controls/switches-${width}.png`,fullPage:true});
 }
 let profile={nickname:'테스트',email:'test@example.com',birthDate:null,usePastDiaries:false,eveningReminderEnabled:false};
 let failNext=false,patches=0;
 await page.route('**/api/v1/me',async route=>{
  if(route.request().method()==='PATCH'){
   patches++;await new Promise(resolve=>setTimeout(resolve,200));
   if(failNext){failNext=false;return route.fulfill({status:500,json:{message:'저장 실패 테스트'}});}
   profile={...profile,...route.request().postDataJSON()};
  }
  return route.fulfill({json:profile});
 });
 await page.goto(base+'/mypage');await page.evaluate(()=>sessionStorage.setItem('mowoo.accessToken','mock-token'));await page.reload();
 await page.waitForResponse(response=>response.url().endsWith('/api/v1/me'));
 const toggle=page.getByRole('switch',{name:'저녁 모우 알림',exact:true});
 for(const expected of [true,false]){
  await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),String(expected));
  assert(await toggle.isDisabled(),'Prevent overlapping saves.');
  await page.waitForFunction(()=>!document.querySelector('[role="switch"]').disabled);
  assert.equal(profile.eveningReminderEnabled,expected);
 }
 assert.equal(patches,2);
 failNext=true;await toggle.click();
 await page.waitForFunction(()=>!document.querySelector('[role="switch"]').disabled);
 assert.equal(await toggle.getAttribute('aria-checked'),'false','Roll back failed saves.');
 assert.equal(profile.eveningReminderEnabled,false);
 assert.deepEqual(errors,[]);
 console.log('PASS: repeated switch on/off and thumb positions; checkbox icons and click/keyboard toggles at 320/393px; mocked API persistence, pending lock and failure rollback.');
}finally{await browser?.close();if(server.exitCode===null){server.kill();await once(server,'exit');}}
