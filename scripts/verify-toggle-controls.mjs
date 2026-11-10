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
 assert.deepEqual(errors,[]);
 console.log('PASS: local setting switches and record checkboxes at 320/393px.');
}finally{await browser?.close();if(server.exitCode===null){server.kill();await once(server,'exit');}}
