/**
 * WebKit touch smoke for G6 online lab, two pages with shared fake RTDB.
 * No external Firebase writes or credentials. Not an actual iPad test.
 * Existing production and offline demo remain untouched.
 */
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {webkit} from 'playwright';
import {execFileSync} from 'node:child_process';

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Verify the same one-file HTML that friends will use for development trials.
execFileSync(process.execPath,['v2/demo/build-online.mjs'],{cwd:ROOT,stdio:'inherit'});
const ART=path.join(ROOT,'v2/demo/webkit-evidence');
let checks=0;
function check(condition,description){assert.ok(condition,description);checks++;}
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(ROOT,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(ROOT+path.sep)||
    !/\.(mjs|html|js)$/.test(file)){
  res.writeHead(404);res.end('Not found');return;
 }
 try{
  res.writeHead(200,{'Content-Type':file.endsWith('.html')?
    'text/html; charset=utf-8':'text/javascript; charset=utf-8',
    'Cache-Control':'no-store'});
  res.end(readFileSync(file));
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise((resolve,reject)=>{
 server.once('error',reject);
 server.listen(0,'127.0.0.1',resolve);
});
let browser,context;
try{
 browser=await webkit.launch({headless:true});
 context=await browser.newContext({viewport:{width:390,height:430},
   screen:{width:390,height:844},deviceScaleFactor:2,
   isMobile:true,hasTouch:true,locale:'ja-JP'});
 // The HTML keeps its real Firebase SDK tag, but this test intercepts it and
 // provides a deterministic shared fake in both WebKit pages.
 await context.route(/firebase-(app|database)-compat\.js/,route=>route.fulfill({
  status:200,contentType:'text/javascript',body:'// CI local mock loaded through addInitScript'
 }));
 await context.addInitScript(()=>{
  const key='__godfield_ci_rtdb';
  const watchers=[];
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  function data(){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}}
  function read(path){
   let node=data();
   for(const segment of path.split('/').filter(Boolean))node=node?.[segment];
   return clone(node??null);
  }
  function writeInto(tree,path,value){
   const seg=path.split('/').filter(Boolean);
   let node=tree;
   for(const p of seg.slice(0,-1))node=node[p]??={};
   node[seg.at(-1)]=clone(value);
  }
  function notify(changed){
   for(const sub of [...watchers]){
    if(changed.some(p=>p===sub.path||p.startsWith(sub.path+'/')||
       sub.path.startsWith(p+'/'))){
     sub.fn({val:()=>read(sub.path)});
    }
   }
  }
  function write(changes){
   // Simulate a successful defense whose one-time ack publication is lost.
   // The next same-ID command must restore the receipt without another hit.
   if(window.__g6DropNextAck){
    const key=Object.keys(changes).find(p=>p.endsWith('/acks/B'));
    if(key){delete changes[key];window.__g6DropNextAck=false;}
   }
   const tree=data();
   for(const [p,val] of Object.entries(changes))writeInto(tree,p,val);
   localStorage.setItem(key,JSON.stringify(tree));
   notify(Object.keys(changes));
  }
  window.addEventListener('storage',event=>{
   if(event.key===key)notify(['godfieldV2LabRooms']);
  });
  const database={
   ref(path=''){
    return {
     child(part){return database.ref(path+'/'+part);},
     async once(){return {val:()=>read(path)};},
     on(event,fn){if(event==='value'){watchers.push({path,fn});fn({val:()=>read(path)});}},
     off(event,fn){
      const index=watchers.findIndex(w=>w.path===path&&w.fn===fn);
      if(index>=0)watchers.splice(index,1);
     },
     async set(value){write({[path]:value})},
     async update(patch){
      write(Object.fromEntries(Object.entries(patch).map(([p,v])=>[path+'/'+p,v])));
     },
     async transaction(handler){
      const current=read(path),next=handler(current);
      if(next===undefined)return {committed:false,snapshot:{val:()=>current}};
      write({[path]:next});
      return {committed:true,snapshot:{val:()=>clone(next)}};
     }
    };
   }
  };
  let app;
  window.firebase={
   database:()=>database,
   app(){if(!app)throw Error('not initialized');return app;},
   initializeApp(){
    app={database:()=>database};return app;
   }
  };
 });
 const target='http://127.0.0.1:'+server.address().port+
  '/v2/demo/firebase-online-standalone.html';
 const a=await context.newPage(),b=await context.newPage();
 // Simulate an embedded Google Sites iframe denying sessionStorage access.
 // Joining must still work using a new per-session random guest ID.
 await b.addInitScript(()=>{
  Object.defineProperty(window,'sessionStorage',{
   configurable:true,
   get(){throw new DOMException('Iframe storage unavailable','SecurityError');}
  });
 });
 const errors=[];
 for(const p of [a,b])p.on('pageerror',err=>errors.push(err.message));
 await a.goto(target);
 await a.locator('#create').tap();
 await a.waitForFunction(()=>/\b\d{5}\b/.test(
  document.querySelector('#roomLabel')?.textContent||''));
 const room=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
 check(/^\d{5}$/.test(room),'5-digit host code');
 await b.goto(target);
 await b.locator('#joinCode').fill(room);
 await b.locator('#join').tap();
 await b.locator('#hand button').first().waitFor();
 // Wrong card selection should show a rule error and let the host reselect.
 await a.locator('#hand button').nth(1).tap();
 await a.locator('#hand button').first().tap();
 check((await a.locator('#selectionPreview .picked').allTextContents())[0].includes('革の帽子') &&
  (await a.locator('#selectionPreview .picked').allTextContents())[1].includes('ワンダーソード'),
  'selected preview respects tap order rather than the original hand order');
 check((await a.locator('#selectionTotal').textContent()).includes('攻 10'),
  'printed attack subtotal is visible but labeled as reference');
 await a.locator('#hand button').first().tap();
 await a.waitForFunction(()=>document.querySelector('#attack')?.disabled===false);
 await a.locator('#attack').tap();
 await a.waitForFunction(()=>document.querySelector('#status')?.textContent
   .includes('操作エラー'));
 check(await a.locator('#retryPanel').isHidden(),
  'rejected host card choice must not require network retry');
 check(await a.locator('#hand button').nth(1).isEnabled(),
  'host can choose another card after invalid selection');
 await a.locator('#hand button').nth(1).tap();
 await a.locator('#hand button').first().tap();
 try{
  await a.waitForFunction(()=>document.querySelector('#attack')?.disabled===false,
   null,{timeout:6500});
 }catch(e){
  const info=await Promise.all([a,b].map(p=>p.evaluate(()=>({
   room:document.querySelector('#roomLabel')?.textContent,
   role:document.querySelector('#roleLabel')?.textContent,
   status:document.querySelector('#status')?.textContent,
   phase:document.querySelector('#phase')?.textContent,
   attackDisabled:document.querySelector('#attack')?.disabled,
   db:localStorage.getItem('__godfield_ci_rtdb')?.slice(0,450)
  }))));
  console.error('G6_JOIN_DEBUG '+JSON.stringify({info,errors}));
  throw e;
 }
 check(await a.locator('#hand button').count()===4,'host has own 4 cards');
 check(await a.locator('#selectionPreview .picked').count()===1,
  'selected artifact name appears in the field tray');
 check(await a.locator('#hand button.selected').count()===1,
  'selected hand artifact highlights independently');
 check((await a.locator('.score').first().innerText()).includes('HP 40'),
  'reference-style player panel shows HP');
 check(await a.evaluate(()=>{
  const hand=getComputedStyle(document.querySelector('#hand'));
  const cards=getComputedStyle(document.querySelector('#hand button'));
  return hand.display==='flex'&&hand.overflowX==='auto'&&
    cards.flexBasis!=='auto';
 }),'artifact row uses compact horizontal scrolling rather than full-width card list');
 check(await b.locator('#hand button').count()===4,'guest has own 4 cards');
 check(await a.evaluate(()=>document.documentElement.scrollWidth<=
   document.documentElement.clientWidth+2),'host fits narrow viewport');
 check(await b.evaluate(()=>document.documentElement.scrollWidth<=
   document.documentElement.clientWidth+2),'guest fits narrow viewport');
 await a.locator('#attack').tap();
 await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('あなたの防御'));
 check((await b.locator('#combatRoute').textContent()).includes('P1') &&
  (await b.locator('#combatRoute').textContent()).includes('P2'),
  'defender sees the attacker-to-target context');
 check(await b.locator('#incomingAttack').isVisible(),
  'incoming attack detail is visible to defending seat');
 check((await b.locator('#incomingAttack').textContent()).includes('ワンダーソード') &&
  (await b.locator('#incomingAttack').textContent()).includes('攻10'),
  'defender sees declared attacking artifact and printed attack strength');
 check(await a.locator('#incomingAttack').isVisible(),
  'host sees the same public attack announcement during defense');
 await b.locator('#hand button').nth(1).tap();
 check((await b.locator('#selectionTotal').textContent()).includes('守 3'),
  'defender can preview printed defense before choosing');
 check(await b.locator('#defend').textContent()==='防御する',
  'selected defense has an explicit confirmation label');
 await b.locator('#hand button').nth(1).tap();
  check(await b.locator('#defend').textContent()==='許す（防御なし）',
  'unselected defense reads 許す in reference-style interface');
 check((await b.locator('#phase').textContent()).includes('あなたの防御'),
  'guest sees its defense window');
 // Drop the initial acknowledgement while keeping the updated seat views.
 await a.evaluate(()=>{window.__g6DropNextAck=true;});
 await b.locator('#defend').tap();
 await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('相手の攻撃待ち'));
 await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('あなたの攻撃'));
 check(await b.locator('#retryPanel').isVisible(),
  'guest can manually resend same command if the ack is lost');
 check(await b.locator('#retry').isEnabled(),
  'retry control enabled while waiting for acknowledgement');
 await b.locator('#retry').tap();
 await b.locator('#retryPanel').waitFor({state:'hidden'});
 check(await b.locator('#retryPanel').isHidden(),
  'guest receives duplicate acknowledgement and exits waiting state');
 check(await b.locator('#incomingAttack').isHidden(),
  'attack announcement is cleared after the defending response');
 const scores=await a.locator('.score').allTextContents();
 check(scores[1].includes('HP 30'),'host sees resolved damage after guest defense');
 check((await b.locator('.score').allTextContents())[1].includes('HP 30'),
  'guest sees same resolved HP');
 check(errors.length===0,'browser script errors: '+errors.join(' | '));
 mkdirSync(ART,{recursive:true});
 await a.screenshot({path:path.join(ART,'firebase-online-webkit-host.png')});
 await b.screenshot({path:path.join(ART,'firebase-online-webkit-guest.png')});
 // A host can choose a lab preset, and that selected hand must reach
 // both separate guest/host browser views without leaking any hidden cards.
 async function trialPreset(preset,weaponName,armorName){
  const hostPage=await context.newPage(),guestPage=await context.newPage();
  for(const p of [hostPage,guestPage])
   p.on('pageerror',error=>errors.push(error.message));
  try{
   await hostPage.goto(target);
   await hostPage.locator('#labPreset').selectOption(preset);
   check(await hostPage.locator('#labPreset').inputValue()===preset,
    'host can select fixture '+preset);
   await hostPage.locator('#create').tap();
   await hostPage.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const trialCode=(await hostPage.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await guestPage.goto(target);
   await guestPage.locator('#joinCode').fill(trialCode);
   await guestPage.locator('#join').tap();
   await guestPage.locator('#hand button').first().waitFor();
   check((await hostPage.locator('#hand button').first().textContent()).includes(weaponName),
    preset+' has its expected attacking hand');
   check((await guestPage.locator('#hand button').nth(2).textContent()).includes(armorName),
    preset+' has its expected defending hand');
   await hostPage.locator('#hand button').first().tap();
   await hostPage.waitForFunction(()=>!document.querySelector('#attack')?.disabled);
   await hostPage.locator('#attack').tap();
   await guestPage.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('あなたの防御'));
   check((await guestPage.locator('#incomingAttack').textContent()).includes(weaponName),
    preset+' publishes its declared attack to the defending player');
   await guestPage.locator('#hand button').nth(2).tap();
   await guestPage.locator('#defend').tap();
   await guestPage.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('あなたの攻撃'));
   check((await guestPage.locator('.score').allTextContents())[1].includes('HP 40'),
    preset+' matching defense preserves 40 HP');
   check(await guestPage.evaluate(()=>document.documentElement.scrollWidth<=
    document.documentElement.clientWidth+2),
    preset+' still fits the narrow iframe viewport');
  }finally{
   await hostPage.close();
   await guestPage.close();
  }
 }
 await trialPreset('elements','たいまつ','アイスアーマー');
 await trialPreset('dark','コブラ','はがねのよろい');
 // Recovery items are neither weapons nor a substitute for an attack:
 // consuming two items must leave A's turn open, then allow A to attack B.
 const ha=await context.newPage(),gb=await context.newPage();
 for(const p of [ha,gb])p.on('pageerror',error=>errors.push(error.message));
 try{
  await ha.goto(target);
  await ha.locator('#labPreset').selectOption('recovery');
  await ha.locator('#create').tap();
  await ha.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
  const roomNumber=(await ha.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
  await gb.goto(target);
  await gb.locator('#joinCode').fill(roomNumber);
  await gb.locator('#join').tap();
  await gb.locator('#hand button').first().waitFor();
  check(await ha.locator('#hand button').first().textContent().then(s=>s.includes('スマイルのしずく')),
   'recovery fixture begins with source-backed HP consumable');
  await ha.locator('#hand button').first().tap();
  check(await ha.locator('#selectionTotal').textContent().then(s=>s.includes('HP+5')),
   'HP restorative selection shows printed +5');
  check(await ha.locator('#useItem').isEnabled(),
   'recovery action available to active player');
  await ha.locator('#useItem').tap();
  await ha.waitForFunction(()=>document.querySelector('.score')?.textContent?.includes('HP 45')&&
    document.querySelector('#phase')?.textContent?.includes('あなたの攻撃'));
  check(await gb.locator('.score').first().textContent().then(s=>s.includes('HP 45')),
   'guest sees HP recovery without private hand disclosure');
  await ha.locator('#hand button').first().tap();
  check(await ha.locator('#selectionTotal').textContent().then(s=>s.includes('MP+5')),
   'MP restorative selection shows printed +5');
  await ha.locator('#useItem').tap();
  await ha.waitForFunction(()=>document.querySelector('.score')?.textContent?.includes('MP 15')&&
    document.querySelector('#phase')?.textContent?.includes('あなたの攻撃'));
  check(await ha.locator('#hand button').first().textContent().then(s=>s.includes('ワンダーソード')),
   'after two restoratives original attack weapon stays playable');
  await ha.locator('#hand button').first().tap();
  check(await ha.locator('#attack').isEnabled(),'same player may attack after both restoratives');
  await ha.locator('#attack').tap();
  await gb.waitForFunction(()=>document.querySelector('#phase')?.textContent?.includes('あなたの防御'));
  await gb.locator('#hand button').nth(3).tap();
  await gb.locator('#defend').tap();
  await gb.waitForFunction(()=>document.querySelector('.score')?.textContent?.includes('HP 45')&&
    document.querySelector('#phase')?.textContent?.includes('あなたの攻撃'));
  check(await gb.locator('.score').nth(1).textContent().then(s=>s.includes('HP 33')),
   'recovery and attack then armor defense resolve without stalled turn');
 }finally{await ha.close();await gb.close();}
 // Test the actual G7 coin-flip item through two separate touch pages,
 // with the lab's fixed RNG seed (71: first roll deterministically heals).
 const tearHost=await context.newPage(),tearGuest=await context.newPage();
 for(const p of [tearHost,tearGuest])p.on('pageerror',error=>errors.push(error.message));
 try{
  await tearHost.goto(target);
  await tearHost.locator('#labPreset').selectOption('tear');
  await tearHost.locator('#create').tap();
  await tearHost.waitForFunction(()=>/\b\d{5}\b/.test(
   document.querySelector('#roomLabel')?.textContent||''));
  const tearCode=(await tearHost.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
  await tearGuest.goto(target);
  await tearGuest.locator('#joinCode').fill(tearCode);
  await tearGuest.locator('#join').tap();
  await tearGuest.locator('#hand button').first().waitFor();
  check((await tearHost.locator('#hand button').first().textContent()).includes('ドキドキ涙'),
   'risky tear lab preset distributes source-backed item');
  await tearHost.locator('#hand button').first().tap();
  check((await tearHost.locator('#selectionTotal').textContent()).includes('各50%'),
   'UI reveals both risky tear outcomes before confirmation');
  check(await tearHost.locator('#useItem').isEnabled(),
   'host can use the typed tear through shared use-item action');
  await tearHost.locator('#useItem').tap();
  await Promise.all([tearHost,tearGuest].map(page=>page.waitForFunction(()=>
   document.querySelectorAll('.score')[0]?.textContent?.includes('HP 50'),
   null,{timeout:15000})));
  check((await tearHost.locator('#phase').textContent()).includes('あなたの攻撃'),
   'healing outcome preserves the same attacker turn');
  check(await tearGuest.evaluate(()=>document.documentElement.scrollWidth<=
   document.documentElement.clientWidth+2),
   'new risky tear preset fits narrow iframe');
 }finally{await tearHost.close();await tearGuest.close();}
 // Source-verified correction: the tear can target an opponent, whose
 // single Super Mirror response is chosen BEFORE the host coin flip.
 async function riskyOpponentTrial({mirror}){
  const attacker=await context.newPage(),defender=await context.newPage();
  for(const page of [attacker,defender])
   page.on('pageerror',error=>errors.push(error.message));
  try{
   await attacker.goto(target);
   await attacker.locator('#labPreset').selectOption('tear');
   await attacker.locator('#create').tap();
   await attacker.waitForFunction(()=>/\b\d{5}\b/.test(
     document.querySelector('#roomLabel')?.textContent||''));
   const room=(await attacker.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await defender.goto(target);
   await defender.locator('#joinCode').fill(room);
   await defender.locator('#join').tap();
   await defender.locator('#hand button').first().waitFor();
   await attacker.locator('#hand button').first().tap();
   check(await attacker.locator('#itemTarget').isVisible(),
     'source-backed risky item exposes target choice');
   await attacker.locator('#itemTarget').tap();
   check((await attacker.locator('#itemTarget').textContent()).includes('相手'),
     'attacker can select the other seat');
   await attacker.locator('#useItem').tap();
   await defender.waitForFunction(()=>document.querySelector('#phase')?.textContent
     .includes('雑貨への対応'));
   check((await defender.locator('#incomingAttack').textContent()).includes('ドキドキ涙'),
     'defender sees declared item BEFORE random resolution');
   check((await defender.locator('.score').allTextContents()).every(s=>s.includes('HP 40')),
     'opponent HP remains unchanged while mirror decision is pending');
   if(mirror){
    await defender.locator('#hand button').nth(3).tap();
    check((await defender.locator('#defend').textContent()).includes('スーパーミラー'),
      'defender can elect actual Super Mirror');
   }else{
    check((await defender.locator('#defend').textContent()).includes('許す'),
      'defender can accept without spending a defense card');
   }
   await defender.locator('#defend').tap();
   const expectedHp=mirror?50:40,expectedOther=mirror?40:50;
   await Promise.all([attacker,defender].map(page=>page.waitForFunction(
    ({expectedHp,expectedOther})=>{
     const score=document.querySelectorAll('.score');
     return score[0]?.textContent?.includes('HP '+expectedHp)&&
       score[1]?.textContent?.includes('HP '+expectedOther);
    },{expectedHp,expectedOther},{timeout:15000})));
   check((await attacker.locator('#phase').textContent()).includes('あなたの攻撃'),
    'original user still has the turn after remote item resolution');
   check((await defender.locator('#phase').textContent()).includes('相手の攻撃待ち'),
    'remote defender returns to waiting state');
   if(mirror){
    check(!(await defender.locator('#hand').textContent()).includes('スーパーミラー'),
     'used mirror was consumed before replenishment');
   }
  }finally{await attacker.close();await defender.close();}
 }
 await riskyOpponentTrial({mirror:false});
 await riskyOpponentTrial({mirror:true});
 check(errors.length===0,'all preset trials have no script errors');
 console.log('FIREBASE_ONLINE_WEBKIT_SUCCESS checks='+checks+
  ' two tabs with mock RTDB, viewport=390x430');
}catch(error){
 console.error('FIREBASE_ONLINE_WEBKIT_FAILURE',error.stack||String(error));
 process.exitCode=1;
}finally{
 try{await context?.close();}catch{}
 try{await browser?.close();}catch{}
 await new Promise(resolve=>server.close(resolve));
}
