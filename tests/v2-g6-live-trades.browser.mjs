/**
 * G6 live Firebase trade integration: one isolated RTDB room per scenario.
 * This is NOT a school iPad run. No changes to Firebase Security Rules.
 * Only delete a room when its authenticated creation identity matches.
 */
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {webkit} from 'playwright';

if(process.env.G6_LIVE_FIREBASE!=='1')
 throw Error('Explicit G6_LIVE_FIREBASE=1 opt-in required for real RTDB');

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB='https://mygame-df915-default-rtdb.firebaseio.com';
const ROOT_KEY='godfieldV2LabRooms';
const waitOpts={timeout:25000};
let currentCode=null,currentHostId=null,server=null,browser=null,a=null,b=null;
let checks=0;
function check(ok,msg){if(!ok)throw Error(msg);checks++;}
async function readRoom(code){
 const r=await fetch(DB+'/'+ROOT_KEY+'/'+code+'.json',{
  signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!r.ok)throw Error('RTDB read failed '+r.status);
 return r.json();
}
async function cleanup(){
 if(!currentCode)return;
 const room=await readRoom(currentCode);
 if(room!==null){
  check(!!currentHostId&&room?.meta?.hostId===currentHostId&&
   room.meta.version===1,'cleanup refuses unknown room owner/version');
  const response=await fetch(DB+'/'+ROOT_KEY+'/'+currentCode+'.json',{
   method:'DELETE',signal:AbortSignal.timeout(15000)});
  check(response.ok,'only this isolated test room was deleted: '+response.status);
 }
 currentCode=null;currentHostId=null;
}
async function waitTurn(activeId){
 await Promise.all([a,b].map(p=>p.waitForFunction(id=>
  [...document.querySelectorAll('.score')].some(e=>e.textContent.includes(id==='B'?'P2':'P1'))&&
  document.querySelector('#phase')?.textContent?.includes('攻撃'),null,waitOpts)));
 const room=await readRoom(currentCode);
 check(room?.views?.A?.activePlayerId===activeId&&
  room.views.B.activePlayerId===activeId,'both seat projections agree on next turn');
 return room;
}
async function withRoom(preset,fn){
 try{
  await a.goto('http://127.0.0.1:'+server.address().port+
   '/v2/demo/firebase-online-standalone.html',{waitUntil:'load'});
  await a.locator('#labPreset').selectOption(preset);
  await a.locator('#create').tap();
  await a.waitForFunction(()=>/ルーム \d{5}/.test(
   document.querySelector('#roomLabel')?.textContent||''),null,waitOpts);
  currentCode=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
  const room=await readRoom(currentCode);
  if(!room?.meta?.hostId||room?.meta?.version!==1)
   throw Error('Missing new live Firebase room identity');
  currentHostId=room.meta.hostId;
  check(room.meta.guestId==null,'new real Firebase room has no guest yet');
  console.log('G6_LIVE_TRADES_ROOM_CREATED '+currentCode);
  await b.goto('http://127.0.0.1:'+server.address().port+
   '/v2/demo/firebase-online-standalone.html',{waitUntil:'load'});
  await b.locator('#joinCode').fill(currentCode);
  await b.locator('#join').tap();
  await b.locator('#hand button').first().waitFor(waitOpts);
  await a.waitForFunction(()=>document.querySelector('#attack')?.disabled===true||
   document.querySelector('#hand button')?.disabled===false,null,waitOpts);
  const joined=await readRoom(currentCode);
  check(!!joined.meta.guestId&&
   joined.views.A.players[1].hand===undefined&&
   joined.views.B.players[0].hand===undefined,
   'real Firebase connected guest without revealing opposing hands');
  await fn();
  const finalRoom=await readRoom(currentCode);
  check(finalRoom.views.A.revision===finalRoom.views.B.revision,
   'both seat revisions match after trade');
  check(finalRoom.views.A.players[1].hand===undefined&&
   finalRoom.views.B.players[0].hand===undefined,
   'both published views still hide opposite hands');
  console.log('G6_LIVE_TRADE_'+preset.toUpperCase()+'_SUCCESS checks='+checks);
 }finally{
  try{await a.goto('about:blank')}catch{}
  try{await b.goto('about:blank')}catch{}
  await cleanup();
 }
}
async function sell(mirror){
 await withRoom('sale',async()=>{
  await a.locator('#hand button').first().tap();
  await a.locator('#hand button').nth(1).tap();
  check(await a.locator('#sell').isEnabled(),'Sell then item enables trade');
  await a.locator('#sell').tap();
  await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('売買への対応'),null,waitOpts);
  check((await b.locator('#incomingAttack').textContent()).includes('金のこん棒')&&
   (await b.locator('#incomingAttack').textContent()).includes('¥25'),
   'public sale offer includes exactly one item and price');
  if(mirror)await b.locator('#hand button').first().tap();
  await b.locator('#defend').tap();
  const room=await waitTurn('B');
  const ps=room.views.A.players;
  if(mirror){
   check(ps[0].money===0&&ps[0].mp===5&&ps[1].money===45,
    'single-mirror real Firebase reverse settlement');
   check(room.views.A.players[0].hand.some(x=>x.definitionId==='w003')&&
    room.views.B.players[1].hand.every(x=>x.definitionId!=='w003'),
    'seller retains mirrored item');
  }else{
   check(ps[0].money===45&&ps[1].money===0&&ps[1].mp===5,
    'accepted real Firebase sale collects money then MP');
   check(room.views.B.players[1].hand.some(x=>x.definitionId==='w003')&&
    room.views.A.players[0].hand.every(x=>x.definitionId!=='w003'),
    'original item moves to the accepting buyer');
  }
 });
 console.log(mirror?'G6_LIVE_TRADE_SELL_MIRROR_SUCCESS':
  'G6_LIVE_TRADE_SELL_ACCEPT_SUCCESS');
}
async function buy(accept){
 await withRoom('buy',async()=>{
  await a.locator('#hand button').first().tap();
  await a.locator('#buy').tap();
  await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('購入依頼への対応'),null,waitOpts);
  const before=await readRoom(currentCode);
  check(!before.views.A.pending.offer&&!before.views.B.pending.offer,
   'Buy offer is not sampled before the target has a chance to respond');
  check(await b.locator('#hand button').first().isDisabled(),
   'unverified Buy Mirror path is clearly unavailable in trial UI');
  await b.locator('#defend').tap();
  await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('買うかどうか選択'),null,waitOpts);
  const decision=await readRoom(currentCode);
  const offer=decision.views.A.pending?.offer;
  check(!!offer&&Number.isSafeInteger(offer.price)&&offer.price<=20,
   'buyer sees priced source-backed random artifact');
  check(!decision.views.B.pending?.offer,'private Buy offer never exposed to seller');
  if(accept)await a.locator('#buyAccept').tap();
  else await a.locator('#buyDecline').tap();
  const room=await waitTurn('B');
  check(room.views.A.players[0].money===(accept?20-offer.price:20)&&
   room.views.B.players[1].money===(accept?20+offer.price:20),
   'Buy accept/decline transfers correct amounts in real Firebase');
  check(room.views.A.players[0].hand.length===(accept?5:4)&&
   room.views.B.players[1].hand.length===(accept?3:4),
   'buy choice changes only expected hand counts');
 });
 console.log('G6_LIVE_TRADE_BUY_'+(accept?'ACCEPT':'DECLINE')+'_SUCCESS');
}
async function exchange(){
 await withRoom('exchange',async()=>{
  await a.locator('#hand button').first().tap();
  await a.locator('#exchangeHp').fill('35');
  check(await a.locator('#exchange').isDisabled(),
   'invalid sum cannot submit Exchange');
  await a.locator('#exchangeMp').fill('20');
  await a.locator('#exchangeMoney').fill('15');
  check(await a.locator('#exchange').isEnabled(),
   'exactly conserved Exchange allocation can submit');
  await a.locator('#exchange').tap();
  const room=await waitTurn('B');
  const p=room.views.A.players[0];
  check(p.hp===35&&p.mp===20&&p.money===15,
   'real Firebase publishes exact HP35 MP20 money15 on both screens');
  const q=room.views.B.players[0];
  check(q.hp===35&&q.mp===20&&q.money===15,
   'guest sees the same confirmed Exchange resources');
 });
 console.log('G6_LIVE_TRADE_EXCHANGE_SUCCESS');
}
try{
 server=createServer((req,res)=>{
  const filename=path.resolve(ROOT,'.'+decodeURIComponent(
   new URL(req.url,'http://localhost').pathname));
  if(!filename.startsWith(ROOT+path.sep)||!/\.((m)?js|html)$/.test(filename)){
   res.writeHead(404);res.end('Not found');return;
  }
  try{
   res.writeHead(200,{'Content-Type':filename.endsWith('.html')?
    'text/html; charset=utf-8':'text/javascript; charset=utf-8',
    'Cache-Control':'no-store'});
   res.end(readFileSync(filename));
  }catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 browser=await webkit.launch({headless:true});
 const cfg={viewport:{width:390,height:430},screen:{width:390,height:844},
  hasTouch:true,isMobile:true,locale:'ja-JP'};
 const ca=await browser.newContext(cfg),cb=await browser.newContext(cfg);
 a=await ca.newPage();b=await cb.newPage();
 const browserErrors=[];
 for(const p of [a,b])p.on('pageerror',e=>browserErrors.push(e.message));
 await sell(false);
 await sell(true);
 await buy(true);
 await buy(false);
 await exchange();
 check(browserErrors.length===0,'no JavaScript error in live Firebase trade UI');
 console.log('G6_LIVE_TRADES_ALL_SUCCESS checks='+checks);
}catch(e){
 console.error('G6_LIVE_TRADES_FAILURE',e.stack||String(e));
 process.exitCode=1;
}finally{
 try{if(currentCode)await cleanup()}catch(e){
  console.error('G6_LIVE_TRADES_CLEANUP_FAILURE',String(e));process.exitCode=1;
 }
 try{await a?.context().close()}catch{}
 try{await b?.context().close()}catch{}
 try{await browser?.close()}catch{}
 if(server)await new Promise(resolve=>server.close(resolve));
}
