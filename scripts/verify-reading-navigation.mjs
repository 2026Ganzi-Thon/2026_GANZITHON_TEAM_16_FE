import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3100';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3100', '--strictPort'], { windowsHide:true, stdio:['ignore','pipe','pipe'] });
let browser;
try {
  await new Promise((resolve,reject) => {
    const timeout=setTimeout(()=>reject(new Error('Temporary server did not start.')),15000);
    server.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Server exited: ${code}`));});
    server.stdout.on('data',data=>{if(data.toString().includes('3100')){clearTimeout(timeout);resolve();}});
  });
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  fs.mkdirSync('.local/reading-navigation',{recursive:true});
  async function open(path){await page.goto(base+path);await page.evaluate(()=>document.fonts.ready);}
  async function back(path){await page.getByRole('button',{name:'뒤로 가기',exact:true}).click();await page.waitForURL(base+path);}
  async function checkScroll(selector){
    const region=page.locator(selector);
    assert(await region.evaluate(node=>node.scrollHeight>node.clientHeight),'Text must be scrollable.');
    await region.hover();await page.mouse.wheel(0,400);
    await page.waitForFunction(selector=>document.querySelector(selector).scrollTop>0,selector);
    await region.focus();await page.keyboard.press('Control+End');
    await region.evaluate(node=>node.scrollTop=node.scrollHeight);
    assert(await region.evaluate(node=>node.scrollHeight-node.clientHeight-node.scrollTop<2),'Last line must be reachable.');
  }
  for(const width of [393,320,1280]){
    await page.setViewportSize({width,height:900});
    await open('/home');
    await page.getByRole('button',{name:'마음 캘린더',exact:true}).first().click();
    await page.waitForURL('**/calendar');
    const calendar=page.locator('[data-scroll-key="Calendar"]');
    await calendar.evaluate(node=>node.scrollTop=node.scrollHeight);
    const previousScroll=await calendar.evaluate(node=>node.scrollTop);
    await page.getByRole('button',{name:'일기 보기',exact:true}).click();
    await page.waitForURL('**/diary/detail');
    await checkScroll('[data-node-id="113:2809"]');
    await page.screenshot({path:`.local/reading-navigation/diary-bottom-${width}.png`,fullPage:true});
    await page.reload();
    await back('/calendar');
    assert(Math.abs(await calendar.evaluate(node=>node.scrollTop)-previousScroll)<2,'Restore calendar scroll on back, including after reload.');
    await back('/home');
    await page.getByRole('button',{name:'오늘의 기록',exact:true}).click();
    await page.waitForURL('**/diary');
    await checkScroll('[data-scroll-key="Diary"]');
    await page.getByRole('button',{name:'지난 일기 보기',exact:true}).first().click();
    await back('/diary');
    await open('/home');
    // The archive lists stored chats, so seed one ended session in the local chat store.
    await page.evaluate(()=>{
      const id='00000000-0000-4000-8000-000000000001',at='2026-11-06T09:00:00.000Z';
      const message=(n,role,content)=>({id:`${id.slice(0,-1)}${n+1}`,sequenceNo:n,senderRole:role,characterId:role==='USER'?null:'local-mowoo-kind',content,createdAt:at,editedAt:null,diaryReferences:[]});
      localStorage.setItem('mowoo.chat.v1',JSON.stringify({sessions:[{id,characterId:'local-mowoo-kind',title:null,summary:null,startedAt:at,endedAt:at,completedTurns:1,canGenerateDiary:false}],messages:{[id]:[message(1,'USER','면접이 걱정돼'),message(2,'ASSISTANT','다정한 모우가 듣고 있어요.')]}}));
    });
    await page.getByRole('button',{name:'대화 보관함',exact:true}).click();
    await page.locator('.archive-card').first().click();
    await page.waitForURL('**/chat?session=*');
    assert.equal(await page.locator('.chat-bubble-user').first().textContent(),'면접이 걱정돼');
    assert(await page.getByRole('textbox',{name:'메시지'}).isDisabled(),'Ended chats must not accept new messages.');
    await back('/archive');await back('/home');
    await page.getByRole('button',{name:'캐릭터 선택',exact:true}).click();
    await page.getByRole('button',{name:'다정한 모우 상세보기',exact:true}).first().click();
    await checkScroll('[data-node-id="120:460"]');
    await page.screenshot({path:`.local/reading-navigation/character-bottom-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'닫기',exact:true}).click();await page.waitForURL('**/characters');
    await back('/home');
    await page.getByRole('button',{name:'마음 캘린더',exact:true}).first().click();
    await page.goBack();await page.waitForURL('**/home');
    await page.goForward();await page.waitForURL('**/calendar');
    await open('/diary/detail');await back('/diary');
    for(const [path,panel,close,target] of [
      ['/characters/detail','120:332','120:394','/characters'],
      ['/records/deleted','113:1891','120:396','/mypage'],
      ['/diary/new','33:3573','227:138','/diary'],
    ]){
      await open(path);
      const panelBox=await page.locator(`[data-node-id="${panel}"]`).boundingBox();
      const closeButton=page.locator(`[data-node-id="${close}"]`);
      const closeBox=await closeButton.boundingBox();
      const scale=Math.min(1,width/393);
      assert(panelBox&&closeBox);
      assert(Math.abs((closeBox.y-panelBox.y)/scale-16)<0.5,'Modal close button top inset must be 16px.');
      assert(Math.abs((panelBox.x+panelBox.width-closeBox.x-closeBox.width)/scale-16)<0.5,'Modal close button right inset must be 16px.');
      assert(Math.abs(closeBox.width/scale-30)<0.5&&Math.abs(closeBox.height/scale-30)<0.5,'Modal close buttons must share one size.');
      await page.screenshot({path:`.local/reading-navigation/close-${close.replace(':','-')}-${width}.png`,fullPage:true});
      await closeButton.click();await page.waitForURL(base+target);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: full text scrolling, navigation history and scroll restoration; all three modal close controls share 16px insets and 30px size and close correctly at 320/393/1280px.');
} finally {
  await browser?.close();
  if(server.exitCode===null){server.kill();await once(server,'exit');}
}
