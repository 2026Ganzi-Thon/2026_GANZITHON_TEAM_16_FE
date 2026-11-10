import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.VERIFY_BASE_URL||'http://127.0.0.1:3000';
const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const screens=['Login','Home','MyPage','Profile','EditProfile','Characters','CharacterDetail','Chat','ChatReady','Diary','DiaryEditor','Calendar','Archive','DeleteAll','DeleteSelected','Deleted','DiaryChoice','DiarySaved','DiaryDetail','ChatProgress'];
fs.mkdirSync('.local/screenshots',{recursive:true});
const result=[];
for(const name of screens){
 await page.goto(base+'/design/'+name);
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode().catch(()=>{}))));
 const issues=await page.locator('img').evaluateAll(images=>images.filter(image=>!image.complete||image.naturalWidth===0).map(image=>image.getAttribute('src')));
 // The original Chat frame explicitly contains a zero-height vector (17:280).
 // Preserve that source geometry rather than inventing a visible underline.
 const rects=await page.locator('img').evaluateAll(images=>images.map(image=>{const rect=image.getBoundingClientRect();return {src:image.getAttribute('src'),width:rect.width,height:rect.height};}).filter(image=>(image.width<=0||image.height<=0)&&image.src!=='/assets/90185.svg'));
 await page.screenshot({path:'.local/screenshots/'+name+'.png',fullPage:true});
 result.push({name,brokenImages:issues,zeroGeometry:rects});
}
await page.setViewportSize({width:320,height:852});await page.goto(base+'/design/Home');
const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
const assetNames=new Set(fs.readdirSync('src/design').filter(file=>file.endsWith('.tsx')).flatMap(file=>[...fs.readFileSync('src/design/'+file,'utf8').matchAll(/["']\/assets\/([^"']+)["']/g)].map(match=>match[1])));
const missingAssets=[...assetNames].filter(file=>!fs.existsSync('public/assets/'+file)||fs.statSync('public/assets/'+file).size===0);
const report={screens:result,errors,horizontalOverflow,missingAssets};
fs.writeFileSync('.local/verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));await browser.close();
if(errors.length||horizontalOverflow||missingAssets.length||result.some(r=>r.brokenImages.length||r.zeroGeometry.length))process.exitCode=1;

