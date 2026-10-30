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
   await hostPage.waitForFunction(()=>/\\b\\d{5}\\b/.test(
    document.querySelector('#roomLabel')?.textContent||''));
   const trialCode=(await hostPage.locator('#roomLabel').textContent()).match(/\\d{5}/)[0];
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
