/**
 * Real Firebase G7 cleansing integration, NOT a school iPad test.
 * Uses exactly one temporary room for each original source miracle,
 * isolates seat browsers, and refuses cleanup without creator identity.
 * Does not change Firebase Rules, authentication, or school HTML.
 */
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {webkit} from 'playwright';

if(process.env.G7_LIVE_CLEANSING!=='1')
 throw Error('Explicit G7_LIVE_CLEANSING=1 opt-in required for real Firebase');

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB='https://mygame-df915-default-rtdb.firebaseio.com';
const KEY='godfieldV2LabRooms';
const wait={timeout:25000};
let server,browser,a,b,currentCode=null,currentHostId=null,checks=0;
const check=(ok,msg)=>{if(!ok)throw Error(msg);checks++};
const clone=x=>JSON.parse(JSON.stringify(x));
async function room(code){
 const response=await fetch(DB+'/'+KEY+'/'+code+'.json',{
  cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('RTDB GET failed '+response.status);
 return response.json();
}
async function cleanup(){
 if(!currentCode)return;
 const live=await room(currentCode);
 if(live!==null){
  check(!!currentHostId&&live?.meta?.hostId===currentHostId&&
   live.meta.version===1,'refuse cleanup for foreign RTDB room');
  const response=await fetch(DB+'/'+KEY+'/'+currentCode+'.json',{
   method:'DELETE',signal:AbortSignal.timeout(15000)});
  check(response.ok,'only this newly created test room was cleaned');
 }
 currentCode=null;currentHostId=null;
}
async function waitNextTurn(id){
 await Promise.all([a,b].map(p=>p.waitForFunction(id=>{
  const phase=document.querySelector('#phase')?.textContent||'';
  const expected=id===window.__g7Seat?'あなたの攻撃':'相手の攻撃待ち';
  // If labels differ between host and guest, server state is definitive.
  return phase.includes('攻撃')&&!phase.includes('防御');
 },id,wait)));
 const live=await room(currentCode);
 check(live.views.A.activePlayerId===id&&live.views.B.activePlayerId===id,
  'real Firebase projections agree on whose turn it is');
 return live;
}
async function trial(miracleId,mpCost){
 try{
  await a.goto('http://127.0.0.1:'+server.address().port+
   '/v2/demo/firebase-online-standalone.html',{waitUntil:'load'});
  await a.locator('#labPreset').selectOption('cleansingMiracles');
  await a.locator('#create').tap();
  await a.waitForFunction(()=>/ルーム \d{5}/.test(
   document.querySelector('#roomLabel')?.textContent||''),null,wait);
  currentCode=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
  const created=await room(currentCode);
  if(!created?.meta?.hostId||created?.meta?.version!==1)
   throw Error('Cannot establish original room creator identity');
  currentHostId=created.meta.hostId;
  check(created.meta.guestId==null,'isolated room has no guest before join');
  console.log('G7_LIVE_CLEANSING_ROOM_CREATED '+currentCode);
  await b.goto('http://127.0.0.1:'+server.address().port+
   '/v2/demo/firebase-online-standalone.html',{waitUntil:'load'});
  await b.locator('#joinCode').fill(currentCode);
  await b.locator('#join').tap();
  await b.locator('#hand button').first().waitFor(wait);
  const joined=await room(currentCode);
  check(!!joined.meta.guestId&&
   joined.views.A.players[1].hand===undefined&&
   joined.views.B.players[0].hand===undefined,
   'two real Firebase seats connected; both hands remain private');
  check(joined.views.A.players[0].disease==='fever'&&
   joined.views.B.players[0].disease==='fever',
   'both projections start with the same initial fever');
  check(joined.views.A.players[0].mp===25,
   'fixture has required 25 initial MP');

  const index=miracleId==='m017'?0:1;
  await a.locator('#hand button').nth(index).tap();
  check(await a.locator('#attack').isEnabled()&&
   (await a.locator('#attack').textContent()).includes('奇跡を使う')&&
   await a.locator('#useItem').isDisabled(),
   'cleansing is a miracle cast, never a forged support-item action');
  await a.locator('#attack').tap();
  await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('あなたの攻撃'),null,wait);
  const first=await room(currentCode);
  check(first.views.A.activePlayerId==='B'&&first.views.B.activePlayerId==='B',
   'cure finishes its turn without a defense request');
  const host=first.views.A.players[0],other=first.views.B.players[0];
  check(host.disease===null&&other.disease===null&&host.hp===40&&other.hp===40,
   'cure removes fever without inflicting end-of-turn damage');
  check(host.mp===25-mpCost&&other.mp===25-mpCost,
   'both peers publish original 2/5 MP payment');
  check(host.hand.length===4&&host.learned.includes(miracleId)&&
   other.hand===undefined&&other.learned===undefined,
   'physical miracle refills; learned spell never leaks to other seat');

  await b.locator('#hand button').nth(1).tap(); // w016: 10 attack
  await b.locator('#attack').tap();
  await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('あなたの防御'),null,wait);
  await a.locator('#defend').tap();
  await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('あなたの攻撃'),null,wait);
  const second=await room(currentCode);
  check(second.views.A.players[0].hp===30&&
   second.views.B.players[0].hp===30&&
   second.views.A.players[0].disease===null,
   'another player hits for ten; cured fever remains clear');
  await a.locator('.learned-choice').first().tap();
  check(await a.locator('#attack').isEnabled()&&
   (await a.locator('#attack').textContent()).includes('奇跡を使う'),
   'learned cure can be recast via real Firebase UI');
  await a.locator('#attack').tap();
  await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('あなたの攻撃'),null,wait);
  const final=await room(currentCode);
  const p=final.views.A.players[0],q=final.views.B.players[0];
  check(final.views.A.activePlayerId==='B'&&
   final.views.A.revision===final.views.B.revision,
   'final real Firebase revisions and active turns stay synchronized');
  check(p.mp===25-2*mpCost&&q.mp===p.mp&&p.hp===30,
   'learned cure takes the second MP payment without changing HP');
  check(p.hand.length===5&&p.learned.includes(miracleId)&&
   final.views.B.players[0].hand===undefined,
   'learned cast draws one extra physical card without revealing it');
  console.log('G7_LIVE_CLEANSING_'+miracleId.toUpperCase()+
   '_SUCCESS checks='+checks);
 }finally{
  try{await a.goto('about:blank')}catch{}
  try{await b.goto('about:blank')}catch{}
  await cleanup();
 }
}
try{
 server=createServer((req,res)=>{
  const file=path.resolve(ROOT,'.'+decodeURIComponent(
   new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(ROOT+path.sep)||!/\.(mjs|js|html)$/.test(file)){
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
  server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 browser=await webkit.launch({headless:true});
 const config={viewport:{width:390,height:430},screen:{width:390,height:844},
  isMobile:true,hasTouch:true,locale:'ja-JP'};
 const contextA=await browser.newContext(config);
 const contextB=await browser.newContext(config);
 a=await contextA.newPage();b=await contextB.newPage();
 const errors=[];for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
 await trial('m017',2);
 await trial('m018',5);
 check(errors.length===0,'no JS page error in either real Firebase browser');
 console.log('G7_LIVE_CLEANSING_ALL_SUCCESS checks='+checks);
}catch(error){
 console.error('G7_LIVE_CLEANSING_FAILURE',error.stack||String(error));
 process.exitCode=1;
}finally{
 try{if(currentCode)await cleanup()}catch(e){
  console.error('G7_LIVE_CLEANSING_CLEANUP_FAILURE',String(e));process.exitCode=1;
 }
 try{await a?.context().close()}catch{}
 try{await b?.context().close()}catch{}
 try{await browser?.close()}catch{}
 if(server)await new Promise(resolve=>server.close(resolve));
}
