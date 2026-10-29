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
      const deck=document.querySelector('.stage-scroll');
      if(document.getElementById('v2-root').classList.contains('v2-docked')){
        deck.scrollTop=deck.scrollHeight;
        return {mode:'deck',value:deck.scrollTop};
      }
      window.scrollTo(0,document.body.scrollHeight);
      return {mode:'page',value:window.scrollY};
    });
    passed(amount.value>40,'hand content did not scroll: '+JSON.stringify(amount));
    await controlInFrame(frame,'.confirm','confirm dock '+width);
    const actions=await frameRef.evaluate(()=>{
      const reset=document.querySelector('footer [data-action=reset]').getBoundingClientRect();
      const confirm=document.querySelector('.confirm').getBoundingClientRect();
      const deck=document.querySelector('.stage-scroll').getBoundingClientRect();
      const dock=document.getElementById('v2-root').classList.contains('v2-docked');
      return {dock,resetTop:reset.top,resetBottom:reset.bottom,
        confirmTop:confirm.top,confirmBottom:confirm.bottom,deckBottom:deck.bottom};
    });
    passed(actions.dock?
        actions.deckBottom<=actions.confirmTop-3&&
        actions.resetTop>=actions.confirmBottom+2:
        actions.resetTop>=0&&actions.resetBottom<=actions.confirmTop-4,
      'footer or scroll pane overlaps confirmation: '+JSON.stringify(actions));
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

async function testShortHandDockTouch(base){
 for(const w of [390,1024]){
  const context=await browser.newContext({
   viewport:{width:w,height:844},screen:{width:w,height:844},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-J'
  });
  try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   await page.locator('#game-embed').evaluate(el=>{el.style.height='430px';});
   const frame=page.frameLocator('#game-embed');
   await frame.locator('[data-action=reveal]').tap();
   const metrics=await frame.locator('.stage-scroll').evaluate(deck=>{
     const bar=document.querySelector('.stage-docked .action-bar');
     const root=document.getElementById('v2-root');
     const r=deck.getBoundingClientRect(),b=bar.getBoundingClientRect();
     const footer=document.querySelector('footer').getBoundingClientRect();
     const style=getComputedStyle(deck);
     return {docked:root.classList.contains('v2-docked'),mode:style.overflowY,
       scrollHeight:deck.scrollHeight,clientHeight:deck.clientHeight,
       deckBottom:r.bottom,barTop:b.top,barBottom:b.bottom,footerTop:footer.top,
       barPosition:getComputedStyle(bar).position};
   });
   passed(metrics.docked&&metrics.mode==='auto'&&
      metrics.scrollHeight>metrics.clientHeight+80,
     'short embed uses an independently scrollable hand: '+JSON.stringify(metrics));
   passed(metrics.barPosition==='static' &&
     metrics.deckBottom<=metrics.barTop+1 &&
     metrics.footerTop>=metrics.barBottom-1,
     'short embed control bar never overlays hand or reset: '+JSON.stringify(metrics));
   const last=frame.locator('[data-card=hand]').last();
   await last.scrollIntoViewIfNeeded();
   const rect=await last.boundingBox();
   const dock=await frame.locator('.stage-scroll').boundingBox();
   const bar=await frame.locator('.stage-docked .action-bar').boundingBox();
   passed(Boolean(rect&&dock&&bar&&rect.y>=dock.y-2 &&
      rect.y+rect.height<=bar.y-3),
      'last card can be fully scrolled above the action bar: '+JSON.stringify({rect,dock,bar}));
   const previous=await frame.locator('.stage-scroll').evaluate(el=>el.scrollTop);
   await last.tap();
   const now=await frame.locator('.stage-scroll').evaluate(el=>el.scrollTop);
   passed(now>=previous-10,'selecting last hand card must retain scroll: '+JSON.stringify({previous,now}));
   passed(await frame.locator('.battle-card.picked').count()===1,
     'scrolled last card remains selected after render');
   const picked=await frame.locator('[data-card=hand]').last().boundingBox();
   const fixed=await frame.locator('.stage-docked .action-bar').boundingBox();
   passed(Boolean(picked&&fixed&&picked.y+picked.height<=fixed.y-3),
     'selected last card remains visible above the confirm dock');
   await screenshot('webkit-hand-dock-'+w);
   await last.tap();
   passed(await frame.locator('.battle-card.picked').count()===0,
     'scrolling back to unselect keeps actions functional');
  }catch(error){await screenshot('webkit-hand-dock-failure-'+w);throw error;}
  finally{page=null;await context.close();}
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

async function testSkyMoonTouch(base){
 for(const {cardName,mode} of [
  {cardName:'スカイヘルム',mode:'deflect'},
  {cardName:'月光のよろい',mode:'reflect'}
 ]){
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
   await frame.locator('[data-action=reveal]').tap();
   passed(await frame.locator('[data-card=hand]').filter({hasText:cardName}).count()===1,
     cardName+' must be available in the nine-card P2 hand');
   await frame.locator('[data-card=hand]').filter({hasText:cardName}).tap();
   passed((await frame.locator('.picks').textContent()).includes(cardName),
     cardName+' touch selection must be visible');
   await screenshot('webkit-'+mode+'-selected');
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P1'),
     cardName+' must redirect ice back to caster under lab seed');
   await frame.locator('[data-action=reveal]').tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
     cardName+' reflected attack must finish the original turn');
   await frame.locator('[data-action=reveal]').tap();
   const info=await frame.locator('.seat').allTextContents();
   passed(info[0].includes('36')&&info[1].includes('40'),
     cardName+' reflected water miracle must damage caster only');
   passed(info[0].includes('MP 8')&&info[1].includes('MP 10'),
     cardName+' redirect cannot double-charge source or spend armor MP');
   await screenshot('webkit-'+mode+'-complete');
  }catch(error){
   await screenshot('webkit-'+mode+'-failure');
   throw error;
  }finally{
   page=null;
   await context.close();
  }
 }
}

async function testMiracleDefenseSwitchTouch(base){
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
   await frame.locator('[data-action=reveal]').tap();
   const sky=frame.locator('[data-card=hand]').filter({hasText:'スカイヘルム'});
   const moon=frame.locator('[data-card=hand]').filter({hasText:'月光のよろい'});
   await sky.tap();
   await moon.tap();
   passed(!(await frame.locator('.picks').textContent()).includes('スカイヘルム'),
     'Sky is automatically deselected when Moonlight is tapped');
   passed((await frame.locator('.picks').textContent()).includes('月光のよろい'),
     'Moonlight replaces Sky in one tap');
   passed(!(await frame.locator('[role=status]').textContent()).includes('この検証版では'),
     'No unsupported-combination warning for switching defense methods');
   await screenshot('webkit-miracle-defense-switch-to-moonlight');
   await sky.tap();
   passed((await frame.locator('.picks').textContent()).includes('スカイヘルム')&&
     !(await frame.locator('.picks').textContent()).includes('月光のよろい'),
     'Switching back to Sky is a single tap');
   await moon.tap();
   passed((await frame.locator('.picks').textContent()).includes('月光のよろい'),
     'Switching Moonlight again does not require manual deselection');
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P1'),
     'Latest selected Moonlight correctly redirects the miracle');
 }catch(error){
   await screenshot('webkit-miracle-defense-switch-failure');
   throw error;
 }finally{
   page=null;await context.close();
 }
}


async function testAdditiveOnlyTouch(base){
 const context=await browser.newContext({
   viewport:{width:1024,height:768},screen:{width:1024,height:768},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP'
 });
 try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   const frame=page.frameLocator('#game-embed');
   await frame.locator('[data-action=reveal]').tap();
   const addon=frame.locator('[data-card=hand]').filter({hasText:'ブーメラン'});
   passed(await addon.count()===1,'Boomerang +ATK exists in the opening hand');
   passed((await addon.textContent()).includes('+攻3'),'Extra weapon must show printed +ATK, not ordinary ATK');
   passed((await frame.locator('.stage-heading').textContent()).includes('追加武器だけでも攻撃可'),
     'Attack UI must tell players standalone +ATK attacks are allowed');
   await addon.tap();
   passed((await frame.locator('.picks').textContent()).includes('ブーメラン'),
     'Additive-only selection is highlighted after one tap');
   await screenshot('webkit-additive-only-selected');
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
     'Additive-only attack must reach the defender');
   await frame.locator('[data-action=reveal]').tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   await frame.locator('[data-action=reveal]').tap();
   const info=await frame.locator('.seat').allTextContents();
   passed(info[1].includes('HP 37'),'Standalone +ATK3 deals three damage with no defense');
   passed(info[0].includes('MP 10'),'Standalone +ATK must not charge miracle MP');
   await screenshot('webkit-additive-only-complete');
 }catch(error){
   await screenshot('webkit-additive-only-failure');
   throw error;
 }finally{
   page=null;await context.close();
 }
}

async function testPlusMiracleFirstTouch(base){
 const context=await browser.newContext({
   viewport:{width:1024,height:768},screen:{width:1024,height:768},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP'
 });
 try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   const frame=page.frameLocator('#game-embed');
   await frame.locator('[data-action=reveal]').tap();
   const fireball=frame.locator('[data-card=hand]').filter({hasText:'火の玉'});
   const addon=frame.locator('[data-card=hand]').filter({hasText:'ブーメラン'});
   passed(await fireball.count()===1,'Fireball is present in test hand');
   passed((await fireball.textContent()).includes('+攻2'),
     'Fireball is labeled with its original printed +ATK2');
   await fireball.tap();
   passed((await frame.locator('.stage-heading').textContent()).includes('先頭に選ぶと単独奇跡'),
     'First selected plus miracle is explained as a solo miracle');
   await addon.tap();
   await frame.locator('[data-action=submit]').tap();
   passed((await frame.locator('[role=status]').textContent()).includes('Only spirit directly after miracle'),
     'First-miracle plus an extra weapon cannot be accepted as weapon attack');
   passed((await frame.locator('.picks').textContent()).includes('火の玉'),
     'Invalid attack leaves the original card selected so it can be corrected');
   await screenshot('webkit-fireball-first-invalid-additive');
   await addon.tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
     'Corrected Fireball-only attack reaches the defender');
   await frame.locator('[data-action=reveal]').tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   await frame.locator('[data-action=reveal]').tap();
   const info=await frame.locator('.seat').allTextContents();
   passed(info[0].includes('MP 8'),'Fireball-only spends exactly MP2');
   passed(info[1].includes('HP 38'),'Fireball-only deals 2 direct damage');
   await screenshot('webkit-fireball-first-resolved');
 }catch(error){
   await screenshot('webkit-fireball-first-failure');
   throw error;
 }finally{
   page=null;await context.close();
 }
}


async function testPlusMiracleMiddleTouch(base){
 const context=await browser.newContext({
   viewport:{width:1024,height:768},screen:{width:1024,height:768},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP'
 });
 try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   const frame=page.frameLocator('#game-embed');
   await frame.locator('[data-action=reveal]').tap();
   const weapon=frame.locator('[data-card=hand]').first();
   const fireball=frame.locator('[data-card=hand]').filter({hasText:'火の玉'});
   const addon=frame.locator('[data-card=hand]').filter({hasText:'ブーメラン'});
   await weapon.tap();
   await fireball.tap();
   await addon.tap();
   passed(await frame.locator('.battle-card.picked').count()===3,
     'All three cards display their selection before validation');
   const parentScrollBefore=await page.evaluate(()=>window.scrollY);
   await frame.locator('[data-action=submit]').tap();
   passed((await frame.locator('[role=status]').textContent()).includes('この選択順は原作で未確認です'),
     'Unverified later additive card is reported as unsupported, not submitted to defender');
   const feedbackBounds=await frame.locator('[role=status]').evaluate(el=>{
     const note=el.getBoundingClientRect();
     const confirm=document.querySelector('.confirm').getBoundingClientRect();
     return {top:note.top,bottom:note.bottom,confirmTop:confirm.top,
       viewportHeight:window.innerHeight,frameScrollY:window.scrollY};
   });
   passed(feedbackBounds.top>=0 && feedbackBounds.bottom<=feedbackBounds.confirmTop-8,
     'Rejected selection feedback must be visible above sticky submit: '+JSON.stringify(feedbackBounds));
   passed(await page.evaluate(()=>window.scrollY)===parentScrollBefore,
     'Rejected selection must scroll only iframe and never the parent page');
   passed((await frame.locator('.stage-heading h1').textContent()).includes('P1'),
     'Unverified sequence must not advance the original attacker');
   await screenshot('webkit-plus-miracle-middle-unverified');
   await addon.tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
     'Player can remove the unverified addon and submit the legal prefix');
   await frame.locator('[data-action=reveal]').tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   await frame.locator('[data-action=reveal]').tap();
   const scores=await frame.locator('.seat').allTextContents();
   passed(scores[0].includes('MP 8')&&scores[1].includes('HP 28'),
     'Corrected weapon plus Fireball causes attack12 and MP2 once');
   // The reverse order is a supported research case, so it must still work.
   await frame.locator('[data-action=reset]').tap();
   await frame.locator('[data-action=reset]').tap();
   await frame.locator('[data-action=reveal]').tap();
   await frame.locator('[data-card=hand]').first().tap();
   await frame.locator('[data-card=hand]').filter({hasText:'ブーメラン'}).tap();
   await frame.locator('[data-card=hand]').filter({hasText:'火の玉'}).tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
     'Weapon plus addon plus Fireball remains accepted');
   await frame.locator('[data-action=reveal]').tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   await frame.locator('[data-action=reveal]').tap();
   const secondScores=await frame.locator('.seat').allTextContents();
   passed(secondScores[1].includes('HP 25')&&secondScores[0].includes('MP 8'),
     'Supported reverse order causes attack15 and MP2');
   await screenshot('webkit-plus-miracle-middle-corrected');
 }catch(error){
   await screenshot('webkit-plus-miracle-middle-failure');
   throw error;
 }finally{
   page=null;await context.close();
 }
}


async function testPrayerTouch(base){
 const context=await browser.newContext({
   viewport:{width:1024,height:768},screen:{width:1024,height:768},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP'
 });
 try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   const frame=page.frameLocator('#game-embed');
   const frameRef=page.frames().find(f=>f!==page.mainFrame());
   if(!frameRef)throw new Error('Prayer test frame missing');
   // A test-only replacement of the controller in the already-bundled app.
   // No test-card hook or alternate hand is shipped in the Google Sites HTML.
   await frameRef.evaluate(()=>{
     const old=document.getElementById('v2-root');
     const fresh=document.createElement('div');
     fresh.id='v2-root';
     old.replaceWith(fresh); // remove original controller's event listeners
     __v2_lab_test_ui.mountV2Lab(fresh,
       __v2_lab_test_controller.createV2LabController({hands:{A:['d014'],B:['w016']}}));
   });
   await frame.locator('[data-action=reveal]').tap();
   passed((await frame.locator('.stage-heading').textContent()).includes('武器がないとき'),
     'Weaponless attack turn must explain how to pray');
   passed((await frame.locator('[data-action=submit]').textContent()).includes('祈る'),
     'Prayer appears as the main submit button when no weapons are held');
   passed(await frame.locator('[data-card=hand]').count()===1,
     'Fixed prayer fixture starts with one non-weapon armor card');
   await screenshot('webkit-prayer-available');
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
     'Praying ends the turn without opening a defense response');
   passed(await frame.locator('[data-card]').count()===0,
     'Praying does not reveal the next player hand');
   await frame.locator('[data-action=reveal]').tap();
   const stats=await frame.locator('.seat').allTextContents();
   passed(stats[0].includes('手札2枚')&&stats[1].includes('手札1枚'),
     'Prayer draws one card for first seat, preserving second seat');
   passed(stats[0].includes('HP 40')&&stats[0].includes('MP 10'),
     'Prayer changes neither HP nor MP');
   await screenshot('webkit-prayer-finished');
 }catch(error){
   await screenshot('webkit-prayer-failure');throw error;
 }finally{
   page=null;await context.close();
 }
}


async function testStrengthPowderTouch(base){
 const context=await browser.newContext({
   viewport:{width:1024,height:768},screen:{width:1024,height:768},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP'
 });
 try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   const frame=page.frameLocator('#game-embed');
   const frameRef=page.frames().find(f=>f!==page.mainFrame());
   if(!frameRef)throw new Error('Strength Powder frame missing');
   await frameRef.evaluate(()=>{
     const old=document.getElementById('v2-root');
     const fresh=document.createElement('div');fresh.id='v2-root';
     old.replaceWith(fresh);
     __v2_lab_test_ui.mountV2Lab(fresh,
       __v2_lab_test_controller.createV2LabController({hands:{A:['w016','i004'],B:[]}}));
   });
   await frame.locator('[data-action=reveal]').tap();
   const weapon=frame.locator('[data-card=hand]').filter({hasText:'ワンダーソード'});
   const powder=frame.locator('[data-card=hand]').filter({hasText:'ちからの粉'});
   passed(await powder.count()===1,'Strength Powder appears in the actual drawn hand');
   passed((await powder.textContent()).includes('+攻10'),
     'Strength Powder presents the sourced +10 attack value');
   await powder.tap();
   await frame.locator('[data-action=submit]').tap();
   passed((await frame.locator('[role=status]').textContent()).includes('雑貨は単独で攻撃できません'),
     'Powder alone cannot be played as a weapon');
   passed((await frame.locator('.stage-heading').textContent()).includes('P1'),
     'Rejected Powder-alone action cannot advance a turn');
   await screenshot('webkit-strength-powder-invalid-alone');
   await powder.tap();
   await weapon.tap();
   await powder.tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
     'Weapon then Powder is a legal two-card attack');
   passed(await frame.locator('[data-card]').count()===0,
     'Defense hand stays concealed after Powder attack');
   await frame.locator('[data-action=reveal]').tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   await frame.locator('[data-action=reveal]').tap();
   const info=await frame.locator('.seat').allTextContents();
   passed(info[1].includes('HP 20') && info[0].includes('MP 10'),
     'Weapon10 + Powder10 hits for 20 with no miracle MP');
   passed(info[0].includes('手札2枚'),
     'Both used physical cards are replenished after the attack');
   await screenshot('webkit-strength-powder-attack-resolved');
 }catch(error){
   await screenshot('webkit-strength-powder-failure');throw error;
 }finally{
   page=null;await context.close();
 }
}


async function testAuraNeutralTouch(base){
 for(const scenario of [
   {cards:['w025','m004'],guard:[],hp:38,kind:'dark'},
   {cards:['w024','m004'],guard:['d001'],hp:35,kind:'light'}
 ]){
  const context=await browser.newContext({
    viewport:{width:1024,height:768},screen:{width:1024,height:768},
    deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP'
  });
  try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   const frame=page.frameLocator('#game-embed');
   const frameRef=page.frames().find(f=>f!==page.mainFrame());
   if(!frameRef)throw new Error('Aura neutral test frame missing');
   await frameRef.evaluate(({cards,guard})=>{
     const old=document.getElementById('v2-root'),fresh=document.createElement('div');
     fresh.id='v2-root';old.replaceWith(fresh);
     __v2_lab_test_ui.mountV2Lab(fresh,
       __v2_lab_test_controller.createV2LabController({hands:{A:cards,B:guard}}));
   },{cards:scenario.cards,guard:scenario.guard});
   await frame.locator('[data-action=reveal]').tap();
   await frame.locator('[data-card=hand]').nth(0).tap();
   await frame.locator('[data-card=hand]').nth(1).tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
      scenario.kind+' + Aura must hand off to defender');
   await frame.locator('[data-action=reveal]').tap();
   if(scenario.guard.length){
     await frame.locator('[data-card=hand]').first().tap();
     passed((await frame.locator('.picks').textContent()).includes('革の帽子'),
       'Neutral armor can be selected against light+Aura');
   }
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   await frame.locator('[data-action=reveal]').tap();
   const scores=await frame.locator('.seat').allTextContents();
   passed(scores[1].includes('HP '+scenario.hp),
     scenario.kind+' + Aura should be a neutral attack, not innate elemental: '+JSON.stringify(scores));
   passed(scores[0].includes('MP 4'),'Aura pays MP6 exactly once');
   passed((await frame.locator('.stage-heading').textContent()).includes('P2'),
     'Aura neutral attack finishes in a regular next turn');
   await screenshot('webkit-aura-neutral-'+scenario.kind+'-resolved');
  }catch(error){
   await screenshot('webkit-aura-neutral-'+scenario.kind+'-failure');throw error;
  }finally{
   page=null;await context.close();
  }
 }
}


async function testNewSoloMiraclesTouch(base){
 for(const scenario of [
  {kind:'fire',A:['m008'],B:['d015'],expectedHP:33,expectedMP:5,guard:true},
  {kind:'waterfall-spirit',A:['m011','i003'],B:[],expectedHP:15,expectedMP:10,guard:false}
 ]){
  const context=await browser.newContext({
    viewport:{width:1024,height:768},screen:{width:1024,height:768},
    deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP'
  });
  try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   const frame=page.frameLocator('#game-embed');
   const embedded=page.frames().find(f=>f!==page.mainFrame());
   if(!embedded)throw new Error('Solo miracle test frame missing');
   await embedded.evaluate(({A,B})=>{
     const original=document.getElementById('v2-root'),fresh=document.createElement('div');
     fresh.id='v2-root';original.replaceWith(fresh);
     __v2_lab_test_ui.mountV2Lab(fresh,
       __v2_lab_test_controller.createV2LabController({hands:{A,B}}));
   },{A:scenario.A,B:scenario.B});
   await frame.locator('[data-action=reveal]').tap();
   passed(await frame.locator('[data-card=hand]').count()===scenario.A.length,
      scenario.kind+': new miracle cards appear in hand');
   const cards=frame.locator('[data-card=hand]');
   for(let i=0;i<scenario.A.length;i++)await cards.nth(i).tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
      scenario.kind+': solo miracle moves immediately to defender');
   passed(await frame.locator('[data-card]').count()===0,
      scenario.kind+': defender hand remains hidden on handoff');
   await frame.locator('[data-action=reveal]').tap();
   if(scenario.guard){
     await frame.locator('[data-card=hand]').first().tap();
   }
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   await frame.locator('[data-action=reveal]').tap();
   const scores=await frame.locator('.seat').allTextContents();
   passed(scores[1].includes('HP '+scenario.expectedHP),
      scenario.kind+': grounded elemental hit/guard result '+JSON.stringify(scores));
   passed(scores[0].includes('MP '+scenario.expectedMP),
      scenario.kind+': the correct cost is paid or Spirit waived');
   passed(scores[0].includes('手札'+scenario.A.length+'枚'),
      scenario.kind+': spent cards are refilled without leaking');
   await screenshot('webkit-solo-miracle-'+scenario.kind+'-resolved');
  }catch(error){
   await screenshot('webkit-solo-miracle-'+scenario.kind+'-failure');
   throw error;
  }finally{
   page=null;await context.close();
  }
 }
}


async function testRainbowDefenseTouch(base){
 for(const scenario of [
  {kind:'light',handA:['m006'],handB:['i001','d005'],mp:3,hp:35},
  {kind:'dark',handA:['m003'],handB:['i001'],mp:5,hp:35}
 ]){
  const context=await browser.newContext({
   viewport:{width:1024,height:768},screen:{width:1024,height:768},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP'
  });
  try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   const frame=page.frameLocator('#game-embed');
   const embedded=page.frames().find(f=>f!==page.mainFrame());
   if(!embedded)throw new Error('Rainbow test frame missing');
   await embedded.evaluate(({A,B})=>{
    const previous=document.getElementById('v2-root');
    const fresh=document.createElement('div');fresh.id='v2-root';
    previous.replaceWith(fresh);
    __v2_lab_test_ui.mountV2Lab(fresh,
      __v2_lab_test_controller.createV2LabController({hands:{A,B}}));
   },{A:scenario.handA,B:scenario.handB});
   await frame.locator('[data-action=reveal]').tap();
   await frame.locator('[data-card=hand]').first().tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
     scenario.kind+': handoff to defender after elemental miracle');
   await frame.locator('[data-action=reveal]').tap();
   const choices=frame.locator('[data-card=hand]');
   passed(await choices.count()===scenario.handB.length,
     scenario.kind+': both defensive cards render in original order');
   for(let i=0;i<scenario.handB.length;i++)await choices.nth(i).tap();
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   await frame.locator('[data-action=reveal]').tap();
   const scores=await frame.locator('.seat').allTextContents();
   passed(scores[1].includes('HP '+scenario.hp),
     scenario.kind+': Rainbow removes attribute, expected HP '+scenario.hp);
   passed(scores[0].includes('MP '+scenario.mp),
     scenario.kind+': attacker pays miracle cost once');
   passed((await frame.locator('.stage-heading').textContent()).includes('P2'),
     scenario.kind+': no instant KO and normal next turn');
   await screenshot('webkit-rainbow-'+scenario.kind+'-resolved');
  }catch(error){
   await screenshot('webkit-rainbow-'+scenario.kind+'-failure');throw error;
  }finally{
   page=null;await context.close();
  }
 }
}


async function testDiscardTouch(base){
 for(const scenario of [
   {width:1024,height:768,embedHeight:460,tag:'ipad'},
   {width:390,height:844,embedHeight:430,tag:'narrow'}
 ]){
  const context=await browser.newContext({
   viewport:{width:scenario.width,height:scenario.height},
   screen:{width:scenario.width,height:scenario.height},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP'
  });
  try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   await page.locator('#game-embed').evaluate((el,h)=>{el.style.height=h+'px';},
    scenario.embedHeight);
   const frame=page.frameLocator('#game-embed');
   const embedded=page.frames().find(f=>f!==page.mainFrame());
   if(!embedded)throw new Error('No discard embedded frame');
   await embedded.evaluate(()=>{
    const old=document.getElementById('v2-root'),fresh=document.createElement('div');
    fresh.id='v2-root';old.replaceWith(fresh);
    __v2_lab_test_ui.mountV2Lab(fresh,
      __v2_lab_test_controller.createV2LabController({
       hands:{A:['w016','d005','m002'],B:['d001']}
      }));
   });
   await frame.locator('[data-action=reveal]').tap();
   passed(await frame.locator('[data-action=discard]').count()===0,
      'discard button is unavailable before selecting hand cards');
   await frame.locator('[data-card=hand]').nth(0).tap(); // physical weapon
   passed(await frame.locator('[data-action=discard]').count()===0,
     'weapon cannot reveal discard command');
   await frame.locator('[data-card=hand]').nth(0).tap(); // cancel weapon
   await frame.locator('[data-card=hand]').nth(1).tap(); // ordinary armor
   await frame.locator('[data-card=hand]').nth(2).tap(); // miracle
   const discard=frame.locator('[data-action=discard]');
   passed(await discard.count()===1,'discard action appears after selected cards');
   passed((await discard.textContent()).includes('補充なし・ターン終了'),
      'discard action clearly states its turn cost and no draw');
   const discardBox=await discard.boundingBox();
   const attackBox=await frame.locator('.confirm').boundingBox();
   passed(Boolean(discardBox&&attackBox&&discardBox.height>=44&&
      discardBox.x+discardBox.width<=attackBox.x+2&&
      Math.abs(discardBox.y-attackBox.y)<=12),
      'discard and attack must remain side by side as visible touch controls');
   await screenshot('webkit-discard-'+scenario.tag+'-selected');
   await discard.tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
      'discard ends A turn and transfers hidden seat');
   passed(await frame.locator('[data-card]').count()===0,
      'discard handoff must not expose any private cards');
   await frame.locator('[data-action=reveal]').tap();
   const seats=await frame.locator('.seat').allTextContents();
   passed(seats[0].includes('手札1枚'),
      'discarded two of three without a replacement: '+JSON.stringify(seats));
   passed(seats[1].includes('手札1枚'),
      'uninvolved opponent hand preserved: '+JSON.stringify(seats));
   passed((await frame.locator('.stage-heading').textContent()).includes('P2'),
      'discard advances exactly one turn');
   await screenshot('webkit-discard-'+scenario.tag+'-complete');
  }catch(error){
   await screenshot('webkit-discard-'+scenario.tag+'-failure');
   throw error;
  }finally{
   page=null;await context.close();
  }
 }
}


async function testTradeTrialTouch(base){
 for(const item of [
  {width:390,height:844,embedHeight:430,mirror:false,tag:'accept'},
  {width:1024,height:768,embedHeight:460,mirror:true,tag:'mirror'}
 ]){
  const context=await browser.newContext({
   viewport:{width:item.width,height:item.height},
   screen:{width:item.width,height:item.height},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-J'
  });
  try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   await page.locator('#game-embed').evaluate((el,h)=>{el.style.height=h+'px';},item.embedHeight);
   const frame=page.frameLocator('#game-embed');
   await frame.locator('[data-action=trade-demo]').tap();
   await frame.locator('[data-action=reveal]').tap();
   const firstHand=frame.locator('[data-card=hand]');
   passed(await firstHand.count()===3,'trade lab seeds 3 seller cards');
   passed((await firstHand.nth(0).textContent()).includes('売る'),
    'trade starts with verified Sell card');
   await firstHand.nth(0).tap();
   await firstHand.nth(1).tap();
   await screenshot('webkit-trade-'+item.tag+'-offer-selection');
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
    'trade seller hands over a concealed screen');
   passed(await frame.locator('[data-card=hand]').count()===0,
    'no buyer hand visible during handoff');
   await frame.locator('[data-action=reveal]').tap();
   const offer=frame.locator('.trade-offer');
   passed(await offer.count()===1 &&
     (await offer.textContent()).includes('金のこん棒') &&
     (await offer.textContent()).includes('¥25'),
    'buyer sees source-backed offered item and price');
   const offerRect=await offer.boundingBox();
   const actionRect=await frame.locator('[data-action=submit]').boundingBox();
   passed(Boolean(offerRect&&actionRect&&
      offerRect.y+offerRect.height<=actionRect.y-5),
    'offer and price remain fully above sticky action bar in fixed iframe');
   passed(await frame.locator('[data-card=hand]:disabled').count()===1,
    'non-mirror armor is disabled for sale reaction');
   if(item.mirror){
    await frame.locator('[data-card=hand]').first().tap();
    passed((await frame.locator('[data-action=submit]').textContent()).includes('スーパーミラー'),
     'mirror choice is shown explicitly');
   }else{
    passed((await frame.locator('[data-action=submit]').textContent()).includes('売買を受け入れる'),
     'trade can be accepted without a card');
   }
   await screenshot('webkit-trade-'+item.tag+'-response');
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
    'trade settles and returns a concealed next turn');
   await frame.locator('[data-action=reveal]').tap();
   const stats=await frame.locator('.seat').allTextContents();
   passed(stats[0].includes(item.mirror?'MP 5':'¥ 45') &&
     stats[1].includes(item.mirror?'¥ 45':'MP 5'),
    'mirror vs accept resource flow '+JSON.stringify(stats));
   passed(stats[0].includes('手札'+(item.mirror?'3':'2')+'枚') &&
     stats[1].includes('手札'+(item.mirror?'2':'3')+'枚'),
    'spent card refills without duplicating item '+JSON.stringify(stats));
   passed((await frame.locator('.stage-heading').textContent()).includes('P2'),
    'trade completes exactly one turn');
   await screenshot('webkit-trade-'+item.tag+'-settled');
  }catch(error){
   await screenshot('webkit-trade-'+item.tag+'-failure');throw error;
  }finally{
   page=null;await context.close();
  }
 }
}


async function testSellingTradeCardTouch(base){
 const context=await browser.newContext({
  viewport:{width:390,height:844},screen:{width:390,height:844},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-J'
 });
 try{
  page=await context.newPage();
  await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
  await page.locator('#game-embed').evaluate(el=>{el.style.height='430px';});
  const frame=page.frameLocator('#game-embed');
  const embedded=page.frames().find(f=>f!==page.mainFrame());
  if(!embedded)throw new Error('Missing Sell-of-Sell iframe');
  await embedded.evaluate(()=>{
   const old=document.getElementById('v2-root'),fresh=document.createElement('div');
   fresh.id='v2-root';old.replaceWith(fresh);
   __v2_lab_test_ui.mountV2Lab(fresh,
     __v2_lab_test_controller.createV2LabController({
      hands:{A:['t001','t001','d001'],B:['i002','d005']}
     }));
  });
  await frame.locator('[data-action=reveal]').tap();
  const cards=frame.locator('[data-card=hand]');
  passed(await cards.count()===3,'seller starts with two separate Sell artifacts');
  await cards.nth(0).tap();await cards.nth(1).tap();
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
   'Sell-of-Sell prompts buyer on private handoff');
  await frame.locator('[data-action=reveal]').tap();
  const offer=await frame.locator('.trade-offer').textContent();
  passed(offer.includes('売り付けられた神器：売る')&&offer.includes('¥5'),
   'a second Sell can be offered for its sourced price of ¥5');
  await screenshot('webkit-sell-of-sell-offer');
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  await frame.locator('[data-action=reveal]').tap();
  const received=frame.locator('[data-card=hand]');
  passed(await received.count()===3,'buyer gains the real Sell item');
  passed((await received.nth(2).textContent()).includes('売る'),
   'buyer has a newly transferable Sell in its hand');
  await received.nth(2).tap();
  await received.nth(1).tap();
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P1'),
   'buyer may use purchased Sell on next turn');
  await frame.locator('[data-action=reveal]').tap();
  passed((await frame.locator('.trade-offer').textContent()).includes('アイアンアーマー'),
   'purchased Sell creates a fresh authenticated offer of d005');
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  await frame.locator('[data-action=reveal]').tap();
  const summary=await frame.locator('.seat').allTextContents();
  passed(summary[0].includes('手札3枚')&&summary[1].includes('手札2枚'),
   'two consecutive trades transfer items and refill only action cards: '+JSON.stringify(summary));
  await screenshot('webkit-sell-of-sell-resold-complete');
 }catch(error){
  await screenshot('webkit-sell-of-sell-failure');throw error;
 }finally{
  page=null;await context.close();
 }
}



async function testBuyTrialTouch(base){
 for(const item of [
  {width:390,height:844,embedHeight:430,accept:true,tag:'purchase'},
  {width:1024,height:768,embedHeight:460,accept:false,tag:'decline'}
 ]){
  const context=await browser.newContext({
   viewport:{width:item.width,height:item.height},
   screen:{width:item.width,height:item.height},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-J'
  });
  try{
   page=await context.newPage();
   await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
   await page.locator('#game-embed').evaluate((el,h)=>{el.style.height=h+'px';},item.embedHeight);
   const frame=page.frameLocator('#game-embed');
   const embedded=page.frames().find(f=>f!==page.mainFrame());
   if(!embedded)throw new Error('Missing Buy iframe');
   await frame.locator('[data-action=buy-demo]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed(await frame.locator('[data-card]').count()===0,
      'buy trial launcher conceals the P1 hand');
   await frame.locator('[data-action=reveal]').tap();
   const hand=frame.locator('[data-card=hand]');
   passed((await hand.first().textContent()).includes('買う'),
      'P1 has the registered source-backed Buy card');
   await hand.first().tap();
   passed((await frame.locator('[data-action=submit]').textContent()).includes('取引を申し込む'),
      'Buy selection changes the primary action from attack to trade');
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2') &&
      await frame.locator('[data-card]').count()===0,
      'P2 takes a private handoff before deciding defense');
   await frame.locator('[data-action=reveal]').tap();
   passed((await frame.locator('.trade-reply h2').textContent()).includes('買うへの応答'),
      'P2 sees Buy defense stage');
   passed(await frame.locator('.trade-offer').count()===0,
      'item and price remain hidden until P2 accepts the Buy');
   passed(await frame.locator('[data-card=hand]:disabled').count()===1,
      'only Super Mirror is an available defensive option');
   await screenshot('webkit-buy-'+item.tag+'-defense');
   await frame.locator('[data-action=submit]').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P1') &&
      await frame.locator('[data-card]').count()===0,
      'only P1 sees the pending random item after another private handoff');
   await frame.locator('[data-action=reveal]').tap();
   const offer=frame.locator('.buy-offer');
   passed(await offer.count()===1 &&
     (await offer.textContent()).includes('アイアンアーマー') &&
     (await offer.textContent()).includes('¥5'),
     'P1 sees researched item and correct catalog price');
   passed(await frame.locator('[data-card=hand]').count()===0,
     'purchase decision does not display another player hand');
   const box=await offer.boundingBox();
   const accept=await frame.locator('[data-action=buy-accept]').boundingBox();
   const decline=await frame.locator('[data-action=buy-decline]').boundingBox();
   passed(Boolean(box&&accept&&decline&&
      box.y+box.height<=Math.min(accept.y,decline.y)-4 &&
      accept.height>=44&&decline.height>=44 &&
      accept.x>=decline.x+decline.width-3),
      'offer and two large choice buttons fit without overlap in iframe');
   await screenshot('webkit-buy-'+item.tag+'-choice');
   await frame.locator('[data-action='+(item.accept?'buy-accept':'buy-decline')+']').tap();
   await frame.locator('.compact-pass').waitFor();
   passed((await frame.locator('.compact-pass h1').textContent()).includes('P2') &&
      await frame.locator('[data-card]').count()===0,
      'after Buy choice the next turn is handed to P2 in private');
   const state=await embedded.evaluate(()=>{
     const lab=window.__v2BuyTestLab;
     return lab?.labSnapshot?.()??null;
   });
   // The default mounted controller is not stored globally: verify
   // consequences from rendered public stats and the next owner's cards.
   await frame.locator('[data-action=reveal]').tap();
   const scores=await frame.locator('.seat').allTextContents();
   passed(scores[0].includes('¥ '+(item.accept?'15':'20')) &&
      scores[1].includes('¥ '+(item.accept?'25':'20')),
      'Buy charges ¥5 on accept and charges nothing on decline: '+JSON.stringify(scores));
   passed(scores[0].includes('手札'+(item.accept?'3':'2')+'枚') &&
      scores[1].includes('手札'+(item.accept?'1':'2')+'枚'),
      'Buy transfers only purchased artifact while refilling Buy action: '+JSON.stringify(scores));
   await screenshot('webkit-buy-'+item.tag+'-settled');
  }catch(error){
   await screenshot('webkit-buy-'+item.tag+'-failure');
   throw error;
  }finally{page=null;await context.close();}
 }
}


async function testExchangeTrialTouch(base){
 const context=await browser.newContext({
  viewport:{width:390,height:844},screen:{width:390,height:844},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-J'
 });
 try{
  page=await context.newPage();
  await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
  await page.locator('#game-embed').evaluate(el=>{el.style.height='430px';});
  const frame=page.frameLocator('#game-embed');
  await frame.locator('[data-action=exchange-demo]').tap();
  passed(await frame.locator('[data-card]').count()===0,
    'Exchange lab conceals initial cards during hotseat handoff');
  await frame.locator('[data-action=reveal]').tap();
  const first=frame.locator('[data-card=hand]').first();
  passed((await first.textContent()).includes('両替'),
    'Exchange artifact appears as a source-backed trade card');
  await first.tap();
  const fields=frame.locator('[data-exchange-field]');
  passed(await fields.count()===3,
    'HP MP money all have editable numeric fields');
  const original=await fields.evaluateAll(xs=>xs.map(x=>x.value));
  passed(JSON.stringify(original)===JSON.stringify(['40','10','20']),
    'Exchange editor prepopulates current public resources: '+JSON.stringify(original));
  const editor=await frame.locator('.exchange-editor').boundingBox();
  const button=await frame.locator('[data-action=submit]').boundingBox();
  passed(Boolean(editor&&button&&editor.y+editor.height<button.y-3),
    'Exchange editor stays above fixed submit bar in short iframe');
  await screenshot('webkit-exchange-editor');
  await frame.locator('[data-exchange-field=hp]').fill('51');
  await frame.locator('[data-exchange-field=money]').fill('10');
  await frame.locator('[data-action=submit]').tap();
  passed(await frame.locator('.compact-pass').count()===0,
    'invalid Exchange sum must not end turn');
  const warning=await frame.locator('[role=status]').textContent();
  passed(warning.includes('conserve total'),
    'invalid allocation reports conservation error, not silent resolution');
  await screenshot('webkit-exchange-invalid');
  await frame.locator('[data-exchange-field=hp]').fill('50');
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P2') &&
     await frame.locator('[data-card]').count()===0,
    'valid Exchange passes hidden turn to P2');
  await frame.locator('[data-action=reveal]').tap();
  const scores=await frame.locator('.seat').allTextContents();
  passed(scores[0].includes('HP 50')&&scores[0].includes('MP 10')&&
     scores[0].includes('¥ 10'),
    'P1 values are reallocated 1:1 with total 70: '+JSON.stringify(scores));
  passed(scores[1].includes('HP 40')&&scores[1].includes('¥ 20'),
    'P2 stats untouched by Exchange');
  passed(scores[0].includes('手札2枚'),
    'Exchange action refills exactly one artifact');
  await screenshot('webkit-exchange-complete');
 }catch(error){
  await screenshot('webkit-exchange-failure');throw error;
 }finally{page=null;await context.close();}
}


async function testSunCharmRevivalTouch(base){
 const context=await browser.newContext({
  viewport:{width:390,height:844},screen:{width:390,height:844},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-J'
 });
 try{
  page=await context.newPage();
  await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
  await page.locator('#game-embed').evaluate(el=>{el.style.height='430px';});
  const frame=page.frameLocator('#game-embed');
  await frame.locator('[data-action=revival-demo]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed(await frame.locator('[data-card]').count()===0,
    'Sun Charm trial begins without leaking either hand');
  await frame.locator('[data-action=reveal]').tap();
  passed((await frame.locator('[data-card=hand]').first().textContent()).includes('ワンダーソード'),
    'P1 sees the neutral research attack');
  await frame.locator('[data-card=hand]').first().tap();
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
    'fatal attack hands the iPad privately to P2 defense');
  await frame.locator('[data-action=reveal]').tap();
  const charm=frame.locator('[data-card=hand]').first();
  passed((await charm.textContent()).includes('太陽のお守り') &&
    (await charm.textContent()).includes('自動発動'),
    'P2 sees the documented passive Sun Charm');
  passed(await charm.isDisabled(),
    'passive Sun Charm cannot be manually selected');
  const box=await charm.boundingBox();
  const submit=await frame.locator('[data-action=submit]').boundingBox();
  passed(Boolean(box&&submit&&box.height>=70&&submit.height>=44),
    'passive card and defense confirmation have sufficient touch areas');
  passed(Boolean(box&&submit&&box.y+box.height+4<submit.y),
    'passive Sun Charm card is entirely visible above the fixed confirmation button');
  await screenshot('webkit-sun-charm-before-revival');
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
    'a Sun Charm revives P2 instead of ending a two-player match');
  await frame.locator('[data-action=reveal]').tap();
  const scores=await frame.locator('.seat').allTextContents();
  passed(scores[1].includes('HP 10')&&scores[1].includes('手札2枚'),
    'revived P2 has HP10 and one fixture refill: '+JSON.stringify(scores));
  passed(await frame.locator('[data-card=hand]').filter({
    hasText:'太陽のお守り'
  }).count()===0,'consumed passive charm is absent after revival');
  await screenshot('webkit-sun-charm-after-revival');
 }catch(error){
  await screenshot('webkit-sun-charm-failure');throw error;
 }finally{page=null;await context.close();}
}


async function testSelfSaleTouch(base){
 const context=await browser.newContext({
  viewport:{width:390,height:844},screen:{width:390,height:844},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-J'
 });
 try{
  page=await context.newPage();
  await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
  await page.locator('#game-embed').evaluate(el=>{el.style.height='430px';});
  const frame=page.frameLocator('#game-embed');
  await frame.locator('[data-action=self-sale-demo]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed(await frame.locator('[data-card]').count()===0,
    'self-Sell fixture begins with all physical cards hidden');
  await frame.locator('[data-action=reveal]').tap();
  const hands=frame.locator('[data-card=hand]');
  passed(await hands.count()===3 &&
    (await hands.first().textContent()).includes('売る'),
    'self-Sell trial includes real Sell and offered item');
  await hands.nth(0).tap();
  await hands.nth(1).tap();
  passed((await frame.locator('.stage-heading').textContent()).includes('自分にも売れます'),
    'UI explains researched self-target Sell');
  passed(await frame.locator('[data-target=A]').count()===1,
    'current acting seat can be selected as trade target');
  await frame.locator('[data-target=A]').tap();
  const chosen=await frame.locator('[data-target=A]').getAttribute('aria-pressed');
  passed(chosen==='true','self-target selection is visibly active');
  const action=frame.locator('[data-action=submit]');
  const rect=await action.boundingBox();
  passed(Boolean(rect&&rect.height>=44),'self-Sell submit button remains tappable');
  await screenshot('webkit-self-sale-before');
  await action.tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P2') &&
    await frame.locator('[data-card]').count()===0,
    'self-Sell resolves instantly without a fake opponent defense');
  await frame.locator('[data-action=reveal]').tap();
  const scores=await frame.locator('.seat').allTextContents();
  passed(scores[0].includes('HP 40')&&scores[0].includes('MP 5')&&
    scores[0].includes('¥ 25'),
    'self-Sell redistributes deficits into earned money with conserved total: '+
      JSON.stringify(scores));
  passed(scores[0].includes('手札3枚') &&
    scores[1].includes('HP 40')&&scores[1].includes('¥ 20'),
    'offered item remains with P1 and P2 is untouched after refill');
  await screenshot('webkit-self-sale-after');
 }catch(error){
  await screenshot('webkit-self-sale-failure');
  throw error;
 }finally{page=null;await context.close();}
}


async function testDreamAppearanceTouch(base){
 const context=await browser.newContext({
  viewport:{width:390,height:844},screen:{width:390,height:844},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-J'
 });
 try{
  page=await context.newPage();
  await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
  await page.locator('#game-embed').evaluate(el=>{el.style.height='430px';});
  const frame=page.frameLocator('#game-embed');
  await frame.locator('[data-action=dream-demo]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed(await frame.locator('[data-card]').count()===0,
    'Dream research scenario does not reveal any private hand at handoff');
  await frame.locator('[data-action=reveal]').tap();
  const hand=frame.locator('[data-card=hand]');
  passed((await hand.nth(0).textContent()).includes('売る'),
    'Dream trial keeps trade card real and untwisted');
  passed((await hand.nth(1).textContent()).includes('ワンダーソード') &&
    !(await hand.nth(1).textContent()).includes('金のこん棒'),
    'Dream owner sees a false ordinary weapon name without leaking its identity');
  await hand.first().tap();
  await hand.nth(1).tap();
  await frame.locator('[data-target=A]').tap();
  passed((await frame.locator('[data-target=A]').getAttribute('aria-pressed'))==='true',
    'Dream-disguised physical card can be self-Sold by instance ID');
  await screenshot('webkit-dream-false-card');
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P2'),
    'self-Sell of Dream card resolves without phantom defense prompt');
  await frame.locator('[data-action=reveal]').tap();
  const scores=await frame.locator('.seat').allTextContents();
  passed(scores[0].includes('HP 40')&&scores[0].includes('MP 5')&&
    scores[0].includes('¥ 25'),
    'actual 25-yen artifact price, not fake 4-yen appearance, is settled');
  passed(scores[1].includes('HP 40')&&scores[1].includes('¥ 20'),
    'opponent remains untouched by private self Sell');
  await screenshot('webkit-dream-self-sold');
 }catch(error){await screenshot('webkit-dream-failure');throw error;}
 finally{page=null;await context.close();}
}


async function testDreamOutgoingSaleTouch(base){
 const context=await browser.newContext({viewport:{width:390,height:844},
  screen:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-J'});
 try{
  page=await context.newPage();
  await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
  await page.locator('#game-embed').evaluate(el=>{el.style.height='430px';});
  const frame=page.frameLocator('#game-embed');
  await frame.locator('[data-action=dream-demo]').tap();
  await frame.locator('[data-action=reveal]').tap();
  const cards=frame.locator('[data-card=hand]');
  passed((await cards.nth(1).textContent()).includes('ワンダーソード'),
    'Dream sender originally sees false name');
  await cards.first().tap();await cards.nth(1).tap();
  await frame.locator('[data-target=B]').tap();
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed((await frame.locator('.compact-pass h1').textContent()).includes('P2') &&
     await frame.locator('[data-card=hand]').count()===0,
    'Dream Sell hides buyer hand before opponent defense');
  await frame.locator('[data-action=reveal]').tap();
  const offer=frame.locator('.trade-offer');
  passed((await offer.textContent()).includes('金のこん棒') &&
     (await offer.textContent()).includes('¥25'),
    'defender sees authentic offered artifact and price');
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed(await frame.locator('[data-card]').count()===0,
    'accepted Dream transfer conceals next hand');
  await frame.locator('[data-action=reveal]').tap();
  passed(await frame.locator('[data-card=hand]').filter({hasText:'金のこん棒'}).count()===1,
    'recipient hand has authentic artifact');
  passed(await frame.locator('[data-card=hand]').filter({hasText:'ワンダーソード'}).count()===0,
    'recipient cannot inherit sender-only false appearance');
  const scores=await frame.locator('.seat').allTextContents();
  passed(scores[1].includes('MP 5')&&scores[1].includes('¥ 0'),
    'true ¥25 price is paid from money then MP');
  await screenshot('webkit-dream-outgoing-sale');
 }catch(error){await screenshot('webkit-dream-outgoing-failure');throw error;}
 finally{page=null;await context.close();}
}

async function testFullHandSaleTouch(base){
 const context=await browser.newContext({
  viewport:{width:390,height:844},screen:{width:390,height:844},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-J'
 });
 try{
  page=await context.newPage();
  await page.goto(base+'/embed-harness.html',{waitUntil:'load'});
  await page.locator('#game-embed').evaluate(el=>{el.style.height='430px';});
  const frame=page.frameLocator('#game-embed');
  const embedded=page.frames().find(f=>f!==page.mainFrame());
  if(!embedded)throw new Error('Missing overflow test iframe');
  await embedded.evaluate(()=>{
   const previous=document.getElementById('v2-root');
   const fresh=document.createElement('div');fresh.id='v2-root';
   previous.replaceWith(fresh);
   const lab=__v2_lab_test_controller.createV2LabController({
    hands:{A:['t001','w003','d005'],B:Array(18).fill('d001')}
   });
   window.__overflowTestLab=lab;
   window.__overflowOldIds=lab.labSnapshot().players[1].hand.map(c=>c.instanceId);
   window.__overflowSeed=lab.labSnapshot().rngSeed;
   __v2_lab_test_ui.mountV2Lab(fresh,lab);
  });
  await frame.locator('[data-action=reveal]').tap();
  await frame.locator('[data-card=hand]').nth(0).tap();
  await frame.locator('[data-card=hand]').nth(1).tap();
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  passed(await frame.locator('[data-card=hand]').count()===0,
   'full-hand trade hides buyer cards on physical handoff');
  await frame.locator('[data-action=reveal]').tap();
  passed(await frame.locator('[data-card=hand]').count()===18,
   'buyer has exactly 18 old cards before the trade');
  passed((await frame.locator('.trade-offer').textContent()).includes('¥25'),
   'full-hand buyer still sees sale price');
  const offer=await frame.locator('.trade-offer').boundingBox();
  const action=await frame.locator('[data-action=submit]').boundingBox();
  passed(Boolean(offer&&action&&offer.y+offer.height<action.y),
   'full-hand buyer sees the price above the fixed acceptance button');
  await screenshot('webkit-trade-full-hand-offer');
  await frame.locator('[data-action=submit]').tap();
  await frame.locator('.compact-pass').waitFor();
  await frame.locator('[data-action=reveal]').tap();
  const seats=await frame.locator('.seat').allTextContents();
  passed(seats[1].includes('手札18枚'),
   'receiver keeps exactly 18 cards even after a 19th card: '+JSON.stringify(seats));
  passed(await frame.locator('[data-card=hand]').count()===18,
   'full receiver has 18 rendered individual cards after sale');
  passed((await frame.locator('[data-card=hand]').last().textContent()).includes('金のこん棒'),
   'sold item survives overflow and is found in buyer hand');
  const detail=await embedded.evaluate(()=>{
   const now=window.__overflowTestLab.labSnapshot();
   const before=window.__overflowOldIds;
   const after=now.players[1].hand.map(c=>c.instanceId);
   return {
    newCount:after.length,oldRemaining:after.filter(id=>before.includes(id)).length,
    incomingStillOwned:now.players[1].hand.at(-1).definitionId==='w003',
    seedAdvanced:now.rngSeed!==window.__overflowSeed
   };
  });
  passed(detail.newCount===18&&detail.oldRemaining===17&&
    detail.incomingStillOwned&&detail.seedAdvanced,
    'one old item randomly replaced and RNG advanced once: '+JSON.stringify(detail));
  await screenshot('webkit-trade-full-hand-settled');
 }catch(error){
  await screenshot('webkit-trade-full-hand-failure');throw error;
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
  await testShortHandDockTouch(base);
  await testTurbulenceTouch(base);
  await testSkyMoonTouch(base);
  await testMiracleDefenseSwitchTouch(base);
  await testAdditiveOnlyTouch(base);
  await testPlusMiracleFirstTouch(base);
  await testPlusMiracleMiddleTouch(base);
  await testPrayerTouch(base);
  await testStrengthPowderTouch(base);
  await testAuraNeutralTouch(base);
  await testNewSoloMiraclesTouch(base);
  await testRainbowDefenseTouch(base);
  await testDiscardTouch(base);
  await testTradeTrialTouch(base);
  await testSellingTradeCardTouch(base);
  await testFullHandSaleTouch(base);
  await testBuyTrialTouch(base);
  await testExchangeTrialTouch(base);
  await testSunCharmRevivalTouch(base);
  await testSelfSaleTouch(base);
  await testDreamAppearanceTouch(base);
  await testDreamOutgoingSaleTouch(base);
  console.log('WEBKIT_SMOKE_SUCCESS checks='+checks+' engine=Playwright WebKit'+
    ' fixed-height frames=1024x460,390x430');
}catch(error){
  console.error('WEBKIT_SMOKE_FAILURE',error?.stack??String(error));
  process.exitCode=1;
}finally{
  try{await browser?.close();}catch{}
  if(server)await new Promise(resolve=>server.close(resolve));
}
