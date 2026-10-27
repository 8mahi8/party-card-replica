/**
 * WebKit (Safari-engine family) touch smoke on the offline V2 test HTML.
 * Requires Playwright only in CI, not in the game or its standalone build.
 *
 * Linux WebKit is NOT iOS Safari / a school iPad / Google Sites.
 * If a check fails, record its image and fail the job.
 *
 * CI: node tests/v2-webkit-smoke.browser.mjs
 */
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {webkit} from 'playwright';

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ART=path.join(ROOT,'v2/demo/webkit-evidence');
const files=new Map([
  ['/embed-harness.html','v2/demo/embed-harness.html'],
  ['/standalone.html','v2/demo/standalone.html']
]);
const host='127.0.0.1';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let checks=0,server=null,browser=null,page=null;
const passed=(condition,label)=>{
  assert.ok(condition,label);checks++;
};
async function serverStart(){
  server=createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=files.get(pathname);
    if(!file){res.writeHead(404);res.end('Not found');return;}
    try{
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      res.end(readFileSync(path.join(ROOT,file)));
    }catch(e){res.writeHead(500);res.end('Local test fixture unavailable');}
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,host,resolve);
  });
  return 'http://'+host+':'+server.address().port;
}
async function screenshot(name){
  if(!page)return;
  try{mkdirSync(ART,{recursive:true});await page.screenshot({
    path:path.join(ART,name+'.png'),fullPage:false
  });}catch(e){console.error('Screenshot not available:',e.message);}
}
async function horizontalFit(where,label){
  const m=await where.evaluate(()=>({
    scroll:document.documentElement.scrollWidth,
    width:document.documentElement.clientWidth
  }));
  passed(m.scroll<=m.width+2,label+' overflow: '+JSON.stringify(m));
}
async function controlInFrame(frame,selector,description){
  const r=await frame.locator(selector).evaluate(el=>{
    const x=el.getBoundingClientRect();
    return {top:x.top,bottom:x.bottom,height:x.height,
      width:x.width,screenHeight:window.innerHeight};
  });
  passed(r.top>=-1&&r.bottom<=r.screenHeight+2&&r.height>=44,
    description+' must be immediately visible and tappable: '+JSON.stringify(r));
}
async function testScenario(base,{
 width,height,embedHeight,shotPrefix
}){
  const context=await browser.newContext({
    viewport:{width,height},screen:{width,height},
    deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP',
    reducedMotion:'reduce'
  });
  try{
    page=await context.newPage();
    const scriptErrors=[];
    page.on('pageerror',err=>scriptErrors.push(err.message));
    await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
    await page.locator('#game-embed').evaluate((el,h)=>{el.style.height=h+'px';},embedHeight);
    const frame=page.frameLocator('#game-embed');
    await frame.locator('.pass-screen').waitFor();
    const frameRef=page.frames().find(f=>f!==page.mainFrame());
    if(!frameRef)throw new Error('Inner frame not created');
    await horizontalFit(page,'parent '+width);
    await horizontalFit(frameRef,'frame '+width);
    passed(await frame.locator('[data-card]').count()===0,'initial hand exposed');
    passed((await frame.locator('.pass-screen h1').textContent()).includes('P1'),
      'initial player not P1');
    await controlInFrame(frame,'[data-action=reveal]','initial reveal '+width);
    await screenshot(shotPrefix+'-before-reveal');

    await frame.locator('[data-action=reveal]').tap();
    passed(await frame.locator('[data-card=hand]').count()===9,'initial hand is not nine cards');
    const card=frame.locator('[data-card=hand]').first();
    const firstCard=await card.boundingBox();
    passed(firstCard?.height>=44,'card tap size below 44px');
    await card.tap();
    passed(await frame.locator('.battle-card.picked').count()===1,
      'tapped card not selected');

    const amount=await frameRef.evaluate(()=>{
      window.scrollTo(0,document.body.scrollHeight);
      return window.scrollY;
    });
    passed(amount>40,'frame did not scroll: '+amount);
    await controlInFrame(frame,'.confirm','fixed confirm '+width);
    const actions=await frameRef.evaluate(()=>{
      const reset=document.querySelector('footer [data-action=reset]').getBoundingClientRect();
      const confirm=document.querySelector('.confirm').getBoundingClientRect();
      return {resetTop:reset.top,resetBottom:reset.bottom,confirmTop:confirm.top};
    });
    passed(actions.resetTop>=0&&actions.resetBottom<=actions.confirmTop-4,
      'footer reset overlaps sticky confirm in WebKit: '+JSON.stringify(actions));
    await screenshot(shotPrefix+'-scrolled');
    await frame.locator('[data-action=submit]').tap();
    await frame.locator('.compact-pass').waitFor();
    passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
      'handoff to P2 failed');
    passed(await frame.locator('[data-card]').count()===0,'opponent hand leaked');
    passed((await frameRef.evaluate(()=>window.scrollY))===0,
      'handoff did not reset iframe internal scroll');
    await controlInFrame(frame,'[data-action=reveal]','defender handoff '+width);
    passed((await frame.locator('.compact-pass').textContent()).includes('防御するプレイヤー'),
      'defender-facing guidance not shown');
    await screenshot(shotPrefix+'-handoff');

    await frame.locator('[data-action=reveal]').tap();
    await frame.locator('[data-action=submit]').tap(); // no defense
    await frame.locator('.compact-pass').waitFor();
    passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
      'next turn should be player 2');
    passed(await frame.locator('[data-card]').count()===0,'next turn hand leaked');

    await frame.locator('[data-action=reset]').tap();
    await frame.locator('[data-action=reset]').tap();
    await frame.locator('.compact-pass').waitFor();
    passed((await frame.locator('.compact-pass h1').textContent()).includes('P1'),
      'double-reset failed');

    // An illegal Aura+Fireball combo must reject without moving to P2.
    await frame.locator('[data-action=reveal]').tap();
    await frame.locator('[data-card=hand]').nth(0).tap();  // weapon
    await frame.locator('[data-card=hand]').nth(2).tap();  // Aura
    await frame.locator('[data-card=hand]').nth(3).tap();  // Fireball
    await frame.locator('[data-action=submit]').tap();
    passed((await frame.locator('.stage-heading h1').textContent()).includes('P1'),
      'invalid combo advanced another seat');
    passed((await frame.locator('[role=status]').textContent()).includes('Aura stacked'),
      'invalid combo error not visible');
    await frame.locator('[data-card=hand]').nth(3).tap();
    await frame.locator('[data-card=hand]').nth(2).tap();
    await frame.locator('[data-action=submit]').tap();
    await frame.locator('.compact-pass').waitFor();
    passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
      'failed combination was not recoverable by deselecting cards');
    passed(scriptErrors.length===0,'WebKit JavaScript errors: '+scriptErrors.join('; '));
    console.log('WEBKIT_VIEWPORT_PASS '+JSON.stringify({width,height,embedHeight,checks}));
  }catch(e){
    await screenshot(shotPrefix+'-failure');throw e;
  }finally{
    page=null;
    await context.close();
  }
}
async function testTurbulenceTouch(base){
 const context=await browser.newContext({
  viewport:{width:1024,height:768},screen:{width:1024,height:768},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP'
 });
 try{
  page=await context.newPage();
  await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
  const frame=page.frameLocator('#game-embed');
  await frame.locator('[data-action=reveal]').tap();
  await frame.locator('[data-card=hand]').filter({hasText:'氷'}).tap();
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
    'ice attack must hand off to P2 defense');
  await frame.locator('[data-action=reveal]').tap();
  passed(await frame.locator('[data-card=hand]').filter({hasText:'乱気流'}).count()===1,
    'Turbulence missing from fixed P2 hand');
  await frame.locator('[data-card=hand]').filter({hasText:'乱気流'}).tap();
  await frame.locator('[data-card=hand]').filter({hasText:'精霊のぬいぐるみ'}).tap();
  passed((await frame.locator('.picks').textContent()).includes('乱気流'),
    'deflection selection not displayed');
  await screenshot('webkit-turbulence-spirit-selected');
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P1'),
    'deflection must redirect to original caster with deterministic seed');
  await frame.locator('[data-action=reveal]').tap();
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
    'the attacker defending a redirected miracle must complete the turn');
  await frame.locator('[data-action=reveal]').tap();
  const scores=await frame.locator('.seat').allTextContents();
  passed(scores[0].includes('36')&&scores[1].includes('10'),
    'after ice deflection caster should lose HP4, defender keeps MP10');
  passed(await frame.locator('[data-card=learned]').filter({hasText:'乱気流'}).count()===1,
    'first Turbulence defense must appear among learned miracles');
  await screenshot('webkit-turbulence-complete');
 }catch(e){
  await screenshot('webkit-turbulence-failure');throw e;
 }finally{
  page=null;await context.close();
 }
}

try{
  if(!existsSync(path.join(ROOT,'v2/demo/standalone.html')))
    throw new Error('Missing checked-in standalone HTML');
  const base=await serverStart();
  browser=await webkit.launch({headless:true});
  await testScenario(base,{width:1024,height:768,embedHeight:460,shotPrefix:'webkit-ipad'});
  await testScenario(base,{width:390,height:844,embedHeight:430,shotPrefix:'webkit-narrow'});
  await testTurbulenceTouch(base);
  console.log('WEBKIT_SMOKE_SUCCESS checks='+checks+' engine=Playwright WebKit'+
    ' fixed-height frames=1024x460,390x430');
}catch(error){
  console.error('WEBKIT_SMOKE_FAILURE',error?.stack??String(error));
  process.exitCode=1;
}finally{
  try{await browser?.close();}catch{}
  if(server)await new Promise(resolve=>server.close(resolve));
}
