/**
 * Read-only external HTTPS preview smoke. Does NOT create a Firebase room.
 * It verifies the GitHub-hosted module tree is executable from raw.githack.com,
 * not just fetchable by curl. Not an iOS Safari or school network guarantee.
 */
import assert from 'node:assert/strict';
import {webkit} from 'playwright';

const URL='https://raw.githack.com/8mahi8/party-card-replica/refactor/v2-foundation-review-20261027/v2/demo/firebase-online-standalone.html';
let browser,page;
const errors=[],requestFailures=[],consoleErrors=[];
try{
 browser=await webkit.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},
  isMobile:true,hasTouch:true,locale:'ja-JP'});
 page=await context.newPage();
 page.on('pageerror',err=>errors.push(err.message));
 page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
 page.on('requestfailed',req=>requestFailures.push({url:req.url(),failure:req.failure()?.errorText}));
 await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>{
  const status=document.getElementById('status')?.textContent||'';
  return status.includes('ルームを作るか、5桁の番号で参加してください');
 },null,{timeout:30000});
 assert.equal(errors.length,0,'JS errors: '+errors.join(' | '));
 assert.equal(await page.locator('#create').isEnabled(),true);
 assert.equal(await page.locator('#join').isEnabled(),true);
 assert.equal(await page.locator('script[type="module"]').count(),0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=
  document.documentElement.clientWidth+2));
 // Do not press Create or Join. This proof does not touch RTDB data.
 console.log('G6_EXTERNAL_HTTPS_PREVIEW_SUCCESS source=raw.githack.com inline-bundle=ok width=390');
 await context.close();
}catch(error){
 console.error('G6_EXTERNAL_HTTPS_PREVIEW_FAILURE',String(error?.stack||error));
 try{
  console.error('G6_EXTERNAL_HTTPS_PREVIEW_DIAGNOSTICS',JSON.stringify({
   url:page?.url(),status:await page?.locator('#status').textContent(),
   body:(await page?.locator('body').innerText())?.slice(0,450),
   errors,requestFailures,consoleErrors,
  }));
 }catch(e){console.error('G6_EXTERNAL_DIAGNOSTICS_UNAVAILABLE',String(e))}
 process.exitCode=1;
}finally{
 await browser?.close();
}
