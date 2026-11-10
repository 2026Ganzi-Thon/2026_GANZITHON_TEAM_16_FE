import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3100';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3100','--strictPort'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),15000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exit '+code));});server.stdout.on('data',data=>{if(data.toString().includes('3100')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:393,height:900},reducedMotion:'reduce'});
 let remote={id:'server-user',nickname:'서버닉네임',email:'server@example.com',birthDate:null,usePastDiaries:false,eveningReminderEnabled:false};
 let getCalls=0,patchCalls=0,failNext=false;
 await page.route('**/api/v1/auth/kakao',route=>route.fulfill({json:{accessToken:'profile-test-token'}}));
 await page.route('**/api/v1/me',async route=>{
  assert.equal(route.request().headers().authorization,'Bearer profile-test-token');
  if(route.request().method()==='PATCH'){
   patchCalls++;await new Promise(resolve=>setTimeout(resolve,150));
   if(failNext){failNext=false;return route.fulfill({status:500,json:{message:'프로필 저장 실패 테스트'}});}
   remote={...remote,...route.request().postDataJSON()};
  }else getCalls++;
  return route.fulfill({json:remote});
 });
 await page.goto(base+'/login/oauth2/code/kakao?code=profile-code');await page.waitForURL(base+'/home');
 await page.getByRole('button',{name:'마이페이지',exact:true}).click();await page.getByRole('button',{name:'내 정보',exact:true}).first().click();
 await page.waitForFunction(()=>document.querySelector('[data-node-id="130:769"]')?.textContent==='서버닉네임');
 await page.getByRole('button',{name:'내 정보 수정',exact:true}).click();
 await page.getByRole('textbox',{name:'닉네임',exact:true}).fill('변경닉네임');
 await page.getByRole('button',{name:'저장하기',exact:true}).click();await page.waitForURL(base+'/me');
 assert.equal(remote.nickname,'변경닉네임');assert.equal(remote.email,'server@example.com');
 await page.reload();await page.waitForFunction(()=>document.querySelector('[data-node-id="130:769"]')?.textContent==='변경닉네임');
 await page.getByRole('button',{name:'뒤로 가기',exact:true}).click();await page.waitForURL(base+'/mypage');
 const toggle=page.getByRole('switch',{name:'저녁 모우 알림',exact:true});
 await toggle.click();await page.waitForFunction(()=>!document.querySelector('[role="switch"]').disabled);assert.equal(remote.eveningReminderEnabled,true);
 failNext=true;await toggle.click();await page.waitForFunction(()=>!document.querySelector('[role="switch"]').disabled);
 assert.equal(await toggle.getAttribute('aria-checked'),'true');assert.equal(remote.eveningReminderEnabled,true);
 assert(getCalls>0&&patchCalls===3);
 console.log('PASS: login triggers server profile read; authenticated partial update persists after reload; settings save and failed-save rollback (mock API).');
}finally{await browser?.close();if(server.exitCode===null){server.kill();await once(server,'exit');}}
