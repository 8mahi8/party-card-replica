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
 // Source-backed ordinary HP/MP restoratives also accept an explicit
 // opponent as target, with the same mirror/pass response as risky items.
 async function supportRecoveryTrial(mirror){
  const hostPage=await context.newPage(),guestPage=await context.newPage();
  for(const page of [hostPage,guestPage])
   page.on('pageerror',e=>errors.push(e.message));
  try{
   await hostPage.goto(target);
   await hostPage.locator('#labPreset').selectOption('support');
   await hostPage.locator('#create').tap();
   await hostPage.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const roomCode=(await hostPage.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await guestPage.goto(target);
   await guestPage.locator('#joinCode').fill(roomCode);
   await guestPage.locator('#join').tap();
   await guestPage.locator('#hand button').first().waitFor();
   check((await guestPage.locator('#hand button').first().textContent()).includes('スーパーミラー'),
    'source-backed support set contains a usable Super Mirror');
   await hostPage.locator('#hand button').first().tap();
   check(await hostPage.locator('#itemTarget').isVisible(),
    'ordinary HP restorative exposes other-target switch');
   await hostPage.locator('#itemTarget').tap();
   await hostPage.locator('#useItem').tap();
   await guestPage.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('雑貨への対応'));
   check((await guestPage.locator('#incomingAttack').textContent()).includes('スマイルのしずく'),
    'ordinary HP item announcement arrives before its response');
   if(mirror)await guestPage.locator('#hand button').first().tap();
   await guestPage.locator('#defend').tap();
   await Promise.all([hostPage,guestPage].map(page=>page.waitForFunction(({mirror})=>{
    const scores=document.querySelectorAll('.score');
    return scores[0]?.textContent?.includes(mirror?'HP 45':'HP 40')&&
     scores[1]?.textContent?.includes(mirror?'HP 40':'HP 45');
   },{mirror},{timeout:15000})));
   check((await hostPage.locator('#phase').textContent()).includes('あなたの攻撃'),
    'using HP item on opponent still preserves original attack turn');
   await hostPage.locator('#hand button').first().tap();
   check((await hostPage.locator('#selectionTotal').textContent()).includes('MP+5'),
    'next source-backed support item remains playable');
   check(await hostPage.locator('#itemTarget').isVisible(),
    'ordinary MP item also exposes target switch');
   await hostPage.locator('#itemTarget').tap();
   await hostPage.locator('#useItem').tap();
   await guestPage.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('雑貨への対応'));
   check((await guestPage.locator('#incomingAttack').textContent()).includes('スマイルの花'),
    'MP restorative is publicly declared to receiving seat');
   await guestPage.locator('#defend').tap();
   await Promise.all([hostPage,guestPage].map(page=>page.waitForFunction(()=>
    document.querySelectorAll('.score')[1]?.textContent?.includes('MP 15'),
    null,{timeout:15000})));
   check((await hostPage.locator('#phase').textContent()).includes('あなたの攻撃'),
    'two remote restoratives do not consume the follow-up attack');
   check(await guestPage.evaluate(()=>document.documentElement.scrollWidth<=
    document.documentElement.clientWidth+2),
    'support and mirror UI fit narrow iframe width');
  }finally{await hostPage.close();await guestPage.close();}
 }
 await supportRecoveryTrial(false);
 await supportRecoveryTrial(true);
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
 // Night Sky Broom: a forced hand sweep is NOT a voluntary discard.
 // The two browser seats see only public counts, and Mirror acts first.
 async function broomTrial({mirror}){
  const attacker=await context.newPage(),defender=await context.newPage();
  for(const page of [attacker,defender])
   page.on('pageerror',error=>errors.push(error.message));
  try{
   await attacker.goto(target);
   await attacker.locator('#labPreset').selectOption('broom');
   await attacker.locator('#create').tap();
   await attacker.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const room=(await attacker.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await defender.goto(target);
   await defender.locator('#joinCode').fill(room);
   await defender.locator('#join').tap();
   await defender.locator('#hand button').first().waitFor();
   check((await attacker.locator('#hand button').first().textContent()).includes('夜空のホウキ'),
    'Broom is available as a source-backed card in the research preset');
   await attacker.locator('#hand button').first().tap();
   check((await attacker.locator('#selectionTotal').textContent()).includes('最大3枚除去'),
    'Broom preview describes random physical-card removal');
   check((await attacker.locator('#itemTarget').textContent()).includes('相手'),
    'Broom defaults to opponent target but permits self target');
   await attacker.locator('#useItem').tap();
   await defender.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('雑貨への対応'));
   check((await defender.locator('#incomingAttack').textContent()).includes('夜空のホウキ'),
    'Broom announcement arrives before the Mirror/pass decision');
   check((await defender.locator('#hand button').count())===4,
    'defending seat has not lost cards before responding');
   if(mirror){
    await defender.locator('#hand button').first().tap();
    check((await defender.locator('#defend').textContent()).includes('スーパーミラー'),
     'defender may reflect Broom before any random sweep');
   }
   await defender.locator('#defend').tap();
   await Promise.all([attacker,defender].map(page=>page.waitForFunction(({mirror})=>{
    const scores=document.querySelectorAll('.score');
    return scores[0]?.textContent?.includes('手札 '+(mirror?1:4))&&
     scores[1]?.textContent?.includes('手札 '+(mirror?4:1));
   },{mirror},{timeout:15000})));
   check((await attacker.locator('#phase').textContent()).includes('あなたの攻撃'),
    'Broom resolution returns the attack turn to its original owner');
   check((await defender.locator('#hand button').count())===(mirror?4:1),
    'swept physical cards are not replenished to the affected target');
   check(await defender.evaluate(()=>document.documentElement.scrollWidth<=
     document.documentElement.clientWidth+2),
    'Broom response fits narrow embedded frame');
  }finally{await attacker.close();await defender.close();}
 }
 await broomTrial({mirror:false});
 await broomTrial({mirror:true});
 // Goddess Soap is directed at already learned miracles. Hand miracles
 // and all ordinary physical slots must remain intact on both devices.
 async function goddessSoapTrial(mirror){
  const attacker=await context.newPage(),defender=await context.newPage();
  for(const page of [attacker,defender])
   page.on('pageerror',e=>errors.push(e.message));
  try{
   await attacker.goto(target);
   await attacker.locator('#labPreset').selectOption('soap');
   await attacker.locator('#create').tap();
   await attacker.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const room=(await attacker.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await defender.goto(target);
   await defender.locator('#joinCode').fill(room);
   await defender.locator('#join').tap();
   await defender.locator('#hand button').first().waitFor();
   check((await attacker.locator('#learnedMiracles .learned-choice').count())===3,
    'Soap trial starts with 3 already learned A miracles');
   check((await defender.locator('#learnedMiracles .learned-choice').count())===3,
    'Soap trial starts with 3 already learned B miracles');
   await attacker.locator('#hand button').first().tap();
   check((await attacker.locator('#itemTarget').textContent()).includes('相手'),
    'Goddess Soap defaults to opponent and may be self-targeted');
   check((await attacker.locator('#selectionTotal').textContent()).includes('習得済み奇跡'),
    'Soap preview states that only learned miracles are targeted');
   await attacker.locator('#useItem').tap();
   await defender.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('雑貨への対応'));
   check((await defender.locator('#incomingAttack').textContent()).includes('女神の石けん'),
    'Goddess Soap is announced before response');
   check((await defender.locator('#learnedMiracles .learned-choice').count())===3,
    'learned miracles are unchanged until Mirror/pass');
   if(mirror)await defender.locator('#hand button').first().tap();
   await defender.locator('#defend').tap();
   await Promise.all([attacker,defender].map((page,i)=>page.waitForFunction(
    ({mirror,i})=>{
     const buttons=document.querySelectorAll('#learnedMiracles .learned-choice');
     const wanted=(i===0 ? (mirror?1:3) : (mirror?3:1));
     return buttons.length===wanted&&
      document.querySelectorAll('.score')[0]?.textContent?.includes('手札 4')&&
      document.querySelectorAll('.score')[1]?.textContent?.includes('手札 4');
    },{mirror,i},{timeout:15000})));
   check((await attacker.locator('#phase').textContent()).includes('あなたの攻撃'),
    'Soap does not consume the original attack opportunity');
   check((await defender.locator('#hand button').count())===4,
    'Soap never discards physical hand cards (Mirror gets one replacement)');
  }finally{await attacker.close();await defender.close();}
 }
 await goddessSoapTrial(false);
 await goddessSoapTrial(true);
 // Heaven Grass proves illness persists across the item and ticks on turn END.
 // The one-time PRNG seed for this fixture is chosen to avoid a 5% random
 // fatal fit on the very first attack, unlike the dedicated seed=71 test.
 async function heavenTrial(mirror){
  const attacker=await context.newPage(),defender=await context.newPage();
  for(const p of [attacker,defender])p.on('pageerror',e=>errors.push(e.message));
  try{
   await attacker.goto(target);
   await attacker.locator('#labPreset').selectOption('heaven');
   await attacker.locator('#create').tap();
   await attacker.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const room=(await attacker.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await defender.goto(target);
   await defender.locator('#joinCode').fill(room);
   await defender.locator('#join').tap();
   await defender.locator('#hand button').first().waitFor();
   await attacker.locator('#hand button').first().tap();
   check((await attacker.locator('#selectionTotal').textContent()).includes('天国病'),
    'Heaven Grass preview reveals MP+20 and Heaven Disease risk');
   check((await attacker.locator('#itemTarget').textContent()).includes('相手'),
    'Heaven Grass defaults to opponent when selected');
   await attacker.locator('#useItem').tap();
   await defender.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('雑貨への対応'));
   check((await defender.locator('#incomingAttack').textContent()).includes('天国草'),
    'Heaven Grass is publicly announced before Mirror decision');
   if(mirror)await defender.locator('#hand button').first().tap();
   await defender.locator('#defend').tap();
   await Promise.all([attacker,defender].map(page=>page.waitForFunction(({mirror})=>{
    const scores=document.querySelectorAll('.score');
    const holder=mirror?0:1,other=mirror?1:0;
    return scores[holder]?.textContent?.includes('MP 30')&&
     scores[holder]?.textContent?.includes('天国病')&&
     scores[other]?.textContent?.includes('MP 10')&&
     !scores[other]?.textContent?.includes('天国病');
   },{mirror},{timeout:15000})));
   check((await attacker.locator('#phase').textContent()).includes('あなたの攻撃'),
    'Herb uses no attack opportunity');
   await attacker.locator('#hand button').first().tap();
   await attacker.locator('#attack').tap();
   await defender.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('あなたの防御'));
   await defender.locator('#defend').tap();
   await attacker.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('相手の攻撃待ち'));
   check((await attacker.locator('.score').first().textContent()).includes(mirror?'HP 45':'HP 40'),
    'only the acting player gets Heaven Disease HP+5 at their own turn end');
   check((await attacker.locator('#battleHint').textContent()).length>0,
    'the G7 turn-end illness remains in a responsive battle view');
  }finally{await attacker.close();await defender.close();}
 }
 await heavenTrial(false);
 await heavenTrial(true);
 // Shells cure only the original's authorized status families. In this
 // lab only diseases are implemented; no imaginary mist/dream behavior.
 async function shellCureTrial({heart,mirror}){
  const attacker=await context.newPage(),defender=await context.newPage();
  for(const p of [attacker,defender])p.on('pageerror',e=>errors.push(e.message));
  try{
   await attacker.goto(target);
   await attacker.locator('#labPreset').selectOption('shells');
   await attacker.locator('#create').tap();
   await attacker.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const room=(await attacker.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await defender.goto(target);
   await defender.locator('#joinCode').fill(room);
   await defender.locator('#join').tap();
   await defender.locator('#hand button').first().waitFor();
   check((await attacker.locator('.score').first().textContent()).includes('天国病'),
    'Shell trial host starts with uncurable-by-Smile heaven disease');
   check((await defender.locator('.score').nth(1).textContent()).includes('熱病'),
    'Shell trial guest starts with curable fever');
   await attacker.locator('#hand button').nth(heart?1:0).tap();
   check((await attacker.locator('#selectionTotal').textContent()).includes(heart?'病系の災いをすべて治す':'風邪・熱病を治す'),
    'Shell preview has precise minor/all disease scope');
   await attacker.locator('#itemTarget').tap();
   await attacker.locator('#useItem').tap();
   await defender.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('雑貨への対応'));
   check((await defender.locator('#incomingAttack').textContent()).includes(heart?'ハートの貝がら':'スマイルの貝がら'),
    'Shell announcement arrives before Mirror/pass');
   if(mirror)await defender.locator('#hand button').first().tap();
   await defender.locator('#defend').tap();
   await Promise.all([attacker,defender].map(page=>page.waitForFunction(({heart,mirror})=>{
    if(document.querySelector('#phase')?.textContent?.includes('雑貨への対応'))return false;
    const scores=document.querySelectorAll('.score');
    const aDisease=scores[0]?.textContent?.includes('天国病');
    const bDisease=scores[1]?.textContent?.includes('熱病');
    return aDisease===!(heart&&mirror)&&bDisease===mirror&&
      scores[0]?.textContent?.includes('手札 4')&&
      scores[1]?.textContent?.includes('手札 4');
   },{heart,mirror},{timeout:15000})));
   check((await attacker.locator('#phase').textContent()).includes('あなたの攻撃'),
    'Shell use preserves original attack opportunity');
   check(await defender.evaluate(()=>document.documentElement.scrollWidth<=
    document.documentElement.clientWidth+2),
    'Shell UI remains within a narrow embedded Safari iframe');
  }finally{await attacker.close();await defender.close();}
 }
 for(const heart of [false,true])
  for(const mirror of [false,true])
   await shellCureTrial({heart,mirror});
 // Authentic on-hit weapon status: misses never infect; redirected hits
 // attach illness to the eventual victim, not to the original defender.
 async function diseaseWeaponTrial(mode){
  const a=await context.newPage(),b=await context.newPage();
  for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
  try{
   await a.goto(target);
   await a.locator('#labPreset').selectOption('illnessAttack');
   await a.locator('#create').tap();
   await a.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const code=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await b.goto(target);
   await b.locator('#joinCode').fill(code);
   await b.locator('#join').tap();
   await b.locator('#hand button').first().waitFor();
   await a.locator('#hand button').nth(mode==='hell'?1:0).tap();
   await a.locator('#attack').tap();
   await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('あなたの防御'));
   check((await b.locator('#incomingAttack').textContent()).length>0,
    'on-hit disease weapon is announced before defense');
   if(mode==='blocked')await b.locator('#hand button').nth(1).tap();
   if(mode==='reflect')await b.locator('#hand button').first().tap();
   await b.locator('#defend').tap();
   if(mode==='reflect'){
    await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
     .includes('あなたの防御'));
    await a.locator('#defend').tap();
   }
   await Promise.all([a,b].map(page=>page.waitForFunction(({mode})=>{
    const scores=document.querySelectorAll('.score');
    const aCold=scores[0]?.textContent?.includes('風邪');
    const bCold=scores[1]?.textContent?.includes('風邪');
    const bHell=scores[1]?.textContent?.includes('地獄病');
    if(mode==='blocked')return !aCold&&!bCold&&!bHell&&
      scores[1]?.textContent?.includes('HP 40');
    if(mode==='reflect')return aCold&&!bCold&&
      scores[0]?.textContent?.includes('HP 30');
    if(mode==='hell')return bHell&&!aCold&&
      scores[1]?.textContent?.includes('HP 32');
    return bCold&&!aCold&&scores[1]?.textContent?.includes('HP 31');
   },{mode},{timeout:15000})));
   check((await a.locator('#phase').textContent()).includes('相手の攻撃待ち'),
    'disease weapon finishes with the ordinary next player turn');
   check(await b.evaluate(()=>document.documentElement.scrollWidth<=
    document.documentElement.clientWidth+2),
    'disease weapon UI fits small iPad embed viewport');
  }finally{await a.close();await b.close();}
 }
 for(const mode of ['cold','blocked','reflect','hell'])await diseaseWeaponTrial(mode);
 // Non-damaging Wind and Heaven Wind MUST retain miracle-specific
 // MP, learned, Mirror and anti-miracle defense rules on touch WebKit.
 async function windMiracleTrial(mode){
  const a=await context.newPage(),b=await context.newPage();
  for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
  try{
   await a.goto(target);
   await a.locator('#labPreset').selectOption('windMiracles');
   await a.locator('#create').tap();
   await a.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const code=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await b.goto(target);
   await b.locator('#joinCode').fill(code);
   await b.locator('#join').tap();
   await b.locator('#hand button').first().waitFor();
   check((await a.locator('.score').first().textContent()).includes('MP 25'),
    'Wind miracle research preset starts with enough MP for Heaven Wind');
   await a.locator('#hand button').nth(mode==='heaven'?1:0).tap();
   await a.locator('#attack').tap();
   await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('あなたの防御'));
   check((await b.locator('#incomingAttack').textContent()).includes(
    mode==='heaven'?'天国風':'風'),
    'Wind/Heaven Wind is declared as a miracle before defender response');
   if(mode==='angel')await b.locator('#hand button').nth(1).tap();
   if(mode==='mirror')await b.locator('#hand button').first().tap();
   await b.locator('#defend').tap();
   if(mode==='mirror'){
    await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
     .includes('あなたの防御'));
    await a.locator('#defend').tap();
   }
   await Promise.all([a,b].map(page=>page.waitForFunction(({mode})=>{
    const cards=document.querySelectorAll('.score');
    const ac=cards[0]?.textContent||'',bc=cards[1]?.textContent||'';
    if(!document.querySelector('#phase')?.textContent?.includes('相手の攻撃待ち')&&
       !document.querySelector('#phase')?.textContent?.includes('あなたの攻撃'))return false;
    return mode==='wind'?bc.includes('風邪')&&bc.includes('HP 40')&&ac.includes('MP 19'):
     mode==='heaven'?bc.includes('天国病')&&bc.includes('HP 40')&&ac.includes('MP 10'):
     mode==='angel'?!bc.includes('風邪')&&ac.includes('MP 19'):
       ac.includes('風邪')&&ac.includes('HP 39')&&ac.includes('MP 19');
   },{mode},{timeout:15000})));
   check((await a.locator('#learnedMiracles').textContent()).includes(mode==='heaven'?'天国風':'風'),
    'the cast affliction miracle becomes learned for the caster');
   check(await b.evaluate(()=>document.documentElement.scrollWidth<=
    document.documentElement.clientWidth+2),
    'Wind magic remains usable inside narrow Safari iframe');
  }finally{await a.close();await b.close();}
 }
 for(const mode of ['wind','heaven','angel','mirror'])await windMiracleTrial(mode);
 // G7: two seeded Turbulence destinations using a real touch response.
 // On self-deflection the defender cannot defend a second time.
 async function turbulenceTrial(mode){
  const a=await context.newPage(),b=await context.newPage();
  for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
  try{
   await a.goto(target);
   await a.locator('#labPreset').selectOption(mode==='self'?'turbulenceSelf':'turbulenceBack');
   await a.locator('#create').tap();
   await a.waitForFunction(()=>/\b\d{5}\b/.test(document.querySelector('#roomLabel')?.textContent||''));
   const room=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await b.goto(target);
   await b.locator('#joinCode').fill(room);
   await b.locator('#join').tap();
   await b.locator('#hand button').first().waitFor();
   await a.locator('#hand button').first().tap();
   await a.locator('#attack').tap();
   await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
     .includes('あなたの防御'));
   await b.locator('#hand button').first().tap();
   await b.locator('#defend').tap();
   if(mode!=='self'){
    await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
      .includes('あなたの防御'));
    check((await a.locator('#incomingAttack').textContent()).includes('風'),
      'Turbulence rebounds Wind to attacker with defense allowed');
    if(mode==='angel')await a.locator('#hand button').filter({hasText:'エンゼルの小手'}).tap();
    await a.locator('#defend').tap();
   }
   await Promise.all([a,b].map(p=>p.waitForFunction(({mode})=>{
    const cards=document.querySelectorAll('.score');
    const ac=cards[0]?.textContent||'',bc=cards[1]?.textContent||'';
    return document.querySelector('#phase')?.textContent?.includes('あなたの攻撃')||
     document.querySelector('#phase')?.textContent?.includes('相手の攻撃待ち')
     ?ac.includes('MP 19')&&bc.includes('MP 5')&&
       (mode==='self'?bc.includes('風邪')&&bc.includes('HP 40')&&!ac.includes('風邪'):
        mode==='angel'?!ac.includes('風邪')&&!bc.includes('風邪'):
         ac.includes('風邪')&&ac.includes('HP 39')&&!bc.includes('風邪'))
     :false;
   },{mode},{timeout:15000})));
   check((await b.locator('#learnedMiracles').textContent()).includes('乱気流'),
    'defending Turbulence miracle becomes learned and can be cast again');
   check((await b.locator('#phase').textContent()).includes('あなたの攻撃'),
    'Turbulence response never leaves the original next turn stuck');
  }finally{await a.close();await b.close();}
 }
 for(const mode of ['self','angel','accept'])await turbulenceTrial(mode);
 // Learned miracles must be actionable from the ONLINE touch view, not
 // just displayed as passive text. Test solo Wind, learned Turbulence defense,
 // and a weapon followed by learned Aura in the real ordered command path.
 async function learnedTouchTrial(){
  const a=await context.newPage(),b=await context.newPage();
  for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
  try{
   await a.goto(target);
   await a.locator('#labPreset').selectOption('learnedTrial');
   await a.locator('#create').tap();
   await a.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const room=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await b.goto(target);
   await b.locator('#joinCode').fill(room);
   await b.locator('#join').tap();
   await b.locator('#hand button').first().waitFor();
   check(await a.locator('#learnedMiracles .learned-choice').count()===2,
    'learned offensive miracles appear as actual touch buttons');
   check(await b.locator('#learnedMiracles .learned-choice').count()===1,
    'defender learns only their own Turbulence, not opponent private miracles');
   check(await b.locator('#learnedMiracles .learned-choice').first().isDisabled(),
    'waiting remote player cannot trigger learned defense prematurely');
   await a.locator('#learnedMiracles .learned-choice').filter({hasText:'風'}).tap();
   check((await a.locator('#selectionPreview').textContent()).includes('風'),
    'learned spell appears in ordered selection preview');
   check((await a.locator('#selectionTotal').textContent()).includes('MP 6'),
    'learned spell cost appears in attack preview');
   await a.locator('#attack').tap();
   await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('あなたの防御'));
   check(await b.locator('#learnedMiracles .learned-choice').first().isEnabled(),
    'learned Turbulence is enabled as a defensive spell');
   await b.locator('#learnedMiracles .learned-choice').first().tap();
   check((await b.locator('#selectionPreview').textContent()).includes('乱気流'),
    'learned defense is shown before confirmation');
   await b.locator('#defend').tap();
   await Promise.all([a,b].map(p=>p.waitForFunction(()=>{
    const scores=document.querySelectorAll('.score');
    return scores[0]?.textContent?.includes('MP 19')&&
     scores[1]?.textContent?.includes('MP 5')&&
     scores[1]?.textContent?.includes('風邪');
   },null,{timeout:15000})));
   check((await b.locator('#phase').textContent()).includes('あなたの攻撃'),
    'learned defensive miracle returns the turn without freezing');
   // Complete a normal second turn; the first seat can then use learned
   // Aura after a weapon in the same ordered attack, via playSequence.
   await b.locator('#hand button').nth(1).tap();
   await b.locator('#attack').tap();
   await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('あなたの防御'));
   await a.locator('#defend').tap();
   await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('あなたの攻撃'));
   await a.locator('#hand button').first().tap();
   await a.locator('#learnedMiracles .learned-choice').filter({hasText:'オーラ'}).tap();
   const order=await a.locator('#selectionPreview').textContent();
   check(order.indexOf('ワンダーソード')<order.indexOf('オーラ')&&
    order.includes('オーラ'),'weapon and learned Aura preserve tap order');
   check(await a.locator('#attack').isEnabled(),
    'mixed hand and learned offensive sequence is submittable');
   await a.locator('#attack').tap();
   await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('あなたの防御'));
   await b.locator('#defend').tap();
   await a.waitForFunction(()=>document.querySelector('#status')?.textContent
    .includes('操作を反映しました'),null,{timeout:15000});
   check((await a.locator('.score').first().textContent()).includes('MP 13'),
    'learned Aura MP cost is deducted once after mixed attack');
   check(await a.evaluate(()=>document.documentElement.scrollWidth<=
    document.documentElement.clientWidth+2),
    'learned button strip fits 390px Google Sites-style iframe');
  }finally{await a.close();await b.close();}
 }
 await learnedTouchTrial();

 // Online G4 Sell: the host sends only an ordered Sell/item declaration,
 // and the other seat gets the public name and price before deciding.
 // Reuse the same lab G4 engine that offline trade touch tests validate.
 async function sellTouchTrial(mirror){
  const seller=await context.newPage(),buyer=await context.newPage();
  for(const p of [seller,buyer])p.on('pageerror',err=>errors.push(err.message));
  try{
   await seller.goto(target);
   await seller.locator('#labPreset').selectOption('sale');
   await seller.locator('#create').tap();
   await seller.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const room=(await seller.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await buyer.goto(target);
   await buyer.locator('#joinCode').fill(room);
   await buyer.locator('#join').tap();
   await buyer.locator('#hand button').first().waitFor();
   check(await seller.locator('#sell').isDisabled(),
    'online Sell is not submitted without its actual trade card and item');
   await seller.locator('#hand button').first().tap();
   check(await seller.locator('#sell').isDisabled(),
    'Sell alone does not declare an incomplete trade');
   check(await seller.locator('#attack').isDisabled(),
    'Sell cannot be mistaken for a normal weapon attack');
   await seller.locator('#hand button').nth(1).tap();
   check(await seller.locator('#sell').isEnabled(),
    'Sell then gold club enables one valid ordered trade declaration');
   check((await seller.locator('#selectionPreview').textContent())
    .indexOf('売る')<(await seller.locator('#selectionPreview').textContent()).indexOf('金のこん棒'),
    'selected trade order shows Sell first then the item');
   check((await seller.locator('#selectionTotal').textContent()).includes('¥25'),
    'source-backed trade price is shown before confirmation');
   await seller.locator('#sell').tap();
   await buyer.waitForFunction(()=>document.querySelector('#phase')?.textContent
    .includes('売買への対応'),null,{timeout:15000});
   check((await buyer.locator('#incomingAttack').textContent()).includes('金のこん棒')&&
     (await buyer.locator('#incomingAttack').textContent()).includes('¥25'),
    'buyer sees the exact public sold item and price before choosing');
   check(await buyer.locator('#hand button').nth(1).isDisabled(),
    'ordinary defense cards cannot stop a forced sale');
   check((await buyer.locator('#defend').textContent()).includes('売買を受け入れる'),
    'no selected Mirror means accepting trade');
   if(mirror){
    await buyer.locator('#hand button').first().tap();
    check((await buyer.locator('#defend').textContent()).includes('スーパーミラーで反射'),
     'real Super Mirror is the only enabled trade response');
   }
   await buyer.locator('#defend').tap();
   await Promise.all([seller,buyer].map(p=>p.waitForFunction(({mirror})=>{
    const cards=document.querySelectorAll('.score');
    const a=cards[0]?.textContent||'',b=cards[1]?.textContent||'';
    const state=document.querySelector('#phase')?.textContent||'';
    return (state.includes('あなたの攻撃')||state.includes('相手の攻撃待ち'))&&
      (mirror?
       a.includes('¥ 0')&&a.includes('MP 5')&&b.includes('¥ 45'):
       a.includes('¥ 45')&&b.includes('¥ 0')&&b.includes('MP 5'));
   },{mirror},{timeout:15000})));
   check((await seller.locator('#hand').textContent()).includes('金のこん棒')===mirror,
    'reflected sale retains original item; accepted sale removes it');
   check((await buyer.locator('#hand').textContent()).includes('金のこん棒')===!mirror,
    'only an accepted sale transfers the item to the recipient');
   check((await seller.locator('#phase').textContent()).includes('相手の攻撃待ち'),
    'sale resolution advances to next seat without freezing host view');
   check(await buyer.evaluate(()=>document.documentElement.scrollWidth<=
      document.documentElement.clientWidth+2),
    'sale response and public price fit 390px narrow iPad iframe');
  }finally{await seller.close();await buyer.close();}
 }
 await sellTouchTrial(false);
 await sellTouchTrial(true);
 // G6: the staged Buy is source-backed only on the no-Mirror path.
 // Host A receives the offer privately after guest B allows the request.
 async function buyTouchTrial(accept){
  const a=await context.newPage(),b=await context.newPage();
  for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
  try{
   await a.goto(target);
   await a.locator('#labPreset').selectOption('buy');
   await a.locator('#create').tap();
   await a.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const room=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await b.goto(target);
   await b.locator('#joinCode').fill(room);
   await b.locator('#join').tap();
   await b.locator('#hand button').first().waitFor();
   check(await a.locator('#buy').isDisabled(),
    'Buy button requires the Buy artifact in hand');
   await a.locator('#hand button').first().tap();
   check(await a.locator('#buy').isEnabled()&&await a.locator('#attack').isDisabled(),
    'Buy is submitted by trade command, not physical attack command');
   await a.locator('#buy').tap();
   await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
     .includes('購入依頼への対応'),null,{timeout:15000});
   check(await b.locator('#hand button').first().isDisabled(),
    'unverified Super Mirror response is not silently simulated');
   check((await b.locator('#battleHint').textContent()).includes('反射は研究中'),
    'Buy mirror limitation is clearly visible on opponent device');
   check(await a.locator('#buyDecision').isHidden(),
    'offer is not revealed to original buyer before response');
   await b.locator('#defend').tap();
   await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
     .includes('買うかどうか選択'),null,{timeout:15000});
   const offer=await a.locator('#incomingAttack').textContent();
   const price=Number((offer.match(/価格 ¥(\d+)/)||[])[1]);
   check(Number.isSafeInteger(price)&&price>=0&&price<=20,
    'one genuine source-backed Buy offer is made at affordable price');
   check(await a.locator('#buyDecision').isVisible(),
    'buyer can accept or decline after the offer appears');
   check(await b.locator('#buyDecision').isHidden()&&
     !(await b.locator('#incomingAttack').textContent()).includes('購入候補：'),
    'opponent cannot see private buy decision projection');
   if(accept)await a.locator('#buyAccept').tap();
   else await a.locator('#buyDecline').tap();
   await Promise.all([a,b].map(p=>p.waitForFunction(({accept,price})=>{
    const scores=document.querySelectorAll('.score');
    const a=scores[0]?.textContent||'',b=scores[1]?.textContent||'';
    const phase=document.querySelector('#phase')?.textContent||'';
    const expectedA=accept?'¥ '+(20-price):'¥ 20';
    const expectedB=accept?'¥ '+(20+price):'¥ 20';
    return (phase.includes('あなたの攻撃')||phase.includes('相手の攻撃待ち'))&&
     a.includes(expectedA)&&b.includes(expectedB)&&
     a.includes('手札 '+(accept?5:4))&&b.includes('手札 '+(accept?3:4));
   },{accept,price},{timeout:15000})));
   check((await b.locator('#phase').textContent()).includes('あなたの攻撃'),
    'Buy completes and advances to next player without freezing');
   check(await a.evaluate(()=>document.documentElement.scrollWidth<=
    document.documentElement.clientWidth+2),
    'Buy offer and decision fit narrow Safari embed');
  }finally{await a.close();await b.close();}
 }
 await buyTouchTrial(true);
 await buyTouchTrial(false);
 // Exchange is a turn action. The allocation is not valid until its
 // three integer pools conserve HP+MP+money with HP positive.
 async function exchangeTouchTrial(){
  const a=await context.newPage(),b=await context.newPage();
  for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
  try{
   await a.goto(target);
   await a.locator('#labPreset').selectOption('exchange');
   await a.locator('#create').tap();
   await a.waitForFunction(()=>/\b\d{5}\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const room=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
   await b.goto(target);
   await b.locator('#joinCode').fill(room);
   await b.locator('#join').tap();
   await b.locator('#hand button').first().waitFor();
   await a.locator('#hand button').first().tap();
   check(await a.locator('#exchangePanel').isVisible()&&
     await a.locator('#attack').isDisabled(),
    'Exchange selection reveals resource fields and never invokes an attack');
   await a.locator('#exchangeHp').fill('35');
   check(await a.locator('#exchange').isDisabled(),
    'reallocation cannot be confirmed with a changed total');
   await a.locator('#exchangeMp').fill('20');
   await a.locator('#exchangeMoney').fill('15');
   check((await a.locator('#exchangeTotal').textContent()).includes('70 / 70')&&
     await a.locator('#exchange').isEnabled(),
    'resource sum 35+20+15 equals original 40+10+20');
   await a.locator('#exchange').tap();
   await Promise.all([a,b].map(p=>p.waitForFunction(()=>{
    const scores=document.querySelectorAll('.score');
    const s=scores[0]?.textContent||'';
    return s.includes('HP 35')&&s.includes('MP 20')&&s.includes('¥ 15')&&
     (document.querySelector('#phase')?.textContent||'').includes('攻撃');
   },null,{timeout:15000})));
   check(await a.locator('#exchangePanel').isHidden(),
    'Exchange form disappears after committed action');
   check((await b.locator('#phase').textContent()).includes('あなたの攻撃'),
    'Exchange passes the turn to other seat');
   check(await a.evaluate(()=>document.documentElement.scrollWidth<=
    document.documentElement.clientWidth+2),
    'resource allocation fields fit 390px Safari embed');
  }finally{await a.close();await b.close();}
 }
 await exchangeTouchTrial();
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
