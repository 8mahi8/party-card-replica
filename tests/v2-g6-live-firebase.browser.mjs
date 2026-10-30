/**
 * Optional, deliberately isolated G6 live Firebase smoke.
 * Creates one random 5-digit lab room through the actual browser UI,
 * completes a 2-client attack/defense, and deletes only that room.
 *
 * This is NOT run by the regular regression suite. The GitHub workflow
 * is a manual live probe after the initial diagnostic PR run.
 * No Firebase Rules or other games' nodes are changed.
 */
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {webkit} from 'playwright';

if(process.env.G6_LIVE_FIREBASE!=='1')
  throw Error('Live database test requires an explicit G6_LIVE_FIREBASE=1 opt-in');

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB='https://mygame-df915-default-rtdb.firebaseio.com';
const ROOT_KEY='godfieldV2LabRooms';
let code=null,roomHostId=null,contextA=null,contextB=null,browser=null,server=null,a=null,b=null;
const errors=[];
const time=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function dbRead(code){
 const r=await fetch(DB+'/'+ROOT_KEY+'/'+code+'.json',{signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!r.ok)throw Error('Live RTDB read denied: HTTP '+r.status);
 return r.json();
}
async function cleanup(){
 if(!code)return;
 // Safety: delete only the room this run created, and only when it still
 // carries the host identity from the test. Never delete an unknown room.
 const room=await dbRead(code);
 if(room===null)return;
 if(!roomHostId||room?.meta?.hostId!==roomHostId||room.meta.version!==1)
  throw Error('Cleanup refused: unexpected room identity');
 const result=await fetch(DB+'/'+ROOT_KEY+'/'+code+'.json',{
  method:'DELETE',signal:AbortSignal.timeout(15000)
 });
 if(!result.ok)throw Error('Test room cleanup denied: HTTP '+result.status);
 console.log('G6_LIVE_CLEANUP_SUCCESS');
}
try{
 server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(ROOT,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(ROOT+path.sep)||!/\.(mjs|html|js)$/.test(file)){
   res.writeHead(404);res.end('Not found');return;
  }
  try{
   res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':
    'text/javascript; charset=utf-8','Cache-Control':'no-store'});
   res.end(readFileSync(file));
  }catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 browser=await webkit.launch({headless:true});
 // Separate contexts = separate browser storage: two independent devices,
 // but still on the same CI machine, not school iPad hardware.
 contextA=await browser.newContext({viewport:{width:390,height:430},
  screen:{width:390,height:844},isMobile:true,hasTouch:true});
 contextB=await browser.newContext({viewport:{width:390,height:430},
  screen:{width:390,height:844},isMobile:true,hasTouch:true});
 a=await contextA.newPage();b=await contextB.newPage();
 for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port+
  '/v2/demo/firebase-online-standalone.html';
 await a.goto(url,{waitUntil:'load',timeout:20000});
 await a.locator('#create').tap();
 await a.waitForFunction(()=>/ルーム \d{5}/.test(
  document.querySelector('#roomLabel')?.textContent||''),null,{timeout:20000});
 code=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
 console.log('G6_LIVE_HOST_CREATED');
 const created=await dbRead(code);
 if(!created?.meta?.hostId||created?.meta?.guestId!=null)
  throw Error('Live RTDB room was not created correctly');
 roomHostId=created.meta.hostId;
 await b.goto(url,{waitUntil:'load',timeout:20000});
 await b.locator('#joinCode').fill(code);
 await b.locator('#join').tap();
 await b.locator('#hand button').first().waitFor({timeout:20000});
 await a.locator('#hand button').first().tap();
 await a.waitForFunction(()=>document.querySelector('#attack')?.disabled===false,
  null,{timeout:20000});
 await a.locator('#attack').tap();
 await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
  .includes('あなたの防御'),null,{timeout:20000});
 await b.waitForFunction(()=>document.querySelector('#incomingAttack')?.textContent
  .includes('ワンダーソード'),null,{timeout:20000});
 if(!(await b.locator('#incomingAttack').textContent()).includes('攻10'))
  throw Error('Live Firebase defense HUD lost announced printed attack strength');
 const defenseRoom=await dbRead(code);
 if(defenseRoom?.views?.B?.pending?.declaredAttack?.cards?.[0]?.definitionId!=='w016')
  throw Error('Live RTDB does not contain the defender announced attack');
 if(defenseRoom.views.B.players[0].hand!==undefined)
  throw Error('Live RTDB exposed hidden opponent hand during defense');
 await b.locator('#defend').tap();
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>{
  const t=document.querySelector('#phase')?.textContent||'';
  const score=document.querySelectorAll('.score')[1]?.textContent||'';
  return score.includes('HP 30')&&
   (t.includes('相手の攻撃待ち')||t.includes('あなたの攻撃'));
 },null,{timeout:20000})));
 const persisted=await dbRead(code);
 if(persisted.views.A.revision!==3||persisted.views.B.revision!==3)
  throw Error('Live RTDB revision mismatch');
 if(persisted.views.A.pending?.declaredAttack!==undefined||
    persisted.views.B.pending?.declaredAttack!==undefined)
  throw Error('Defense HUD announcement persisted after attack resolution');
 // Full reverse-direction turn on the same Firebase room.
 await b.locator('#hand button').first().tap();
 await b.locator('#attack').tap();
 await a.waitForFunction(()=>document.querySelector('#phase')?.textContent
  .includes('あなたの防御'),null,{timeout:20000});
 await a.waitForFunction(()=>document.querySelector('#incomingAttack')?.textContent
  .includes('攻'),null,{timeout:20000});
 await a.locator('#defend').tap();
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>{
  const scores=[...document.querySelectorAll('.score')].map(e=>e.textContent||'');
  return scores[0]?.includes('HP ')&&
    (document.querySelector('#phase')?.textContent||'').includes('攻撃');
 },null,{timeout:20000})));
 const reverse=await dbRead(code);
 if(reverse.views.A.revision!==6||reverse.views.B.revision!==6)
  throw Error('Live RTDB reverse turn did not reach revision 6');
 if(reverse.views.A.players[0].hp>=40||
    reverse.views.A.players[1].hp!==30)
  throw Error('Reverse attack/defense damage or previous HP was not preserved');
 if(reverse.views.A.players[1].hand!==undefined||
    reverse.views.B.players[0].hand!==undefined)
  throw Error('Seat view leaked private hand in reverse turn');
 if(persisted.views.A.players[1].hand!==undefined||
    persisted.views.B.players[0].hand!==undefined)
  throw Error('Seat view contained opponents hidden hand');
 if(errors.length)throw Error('Browser error: '+errors.join(' | '));
 console.log('G6_LIVE_TWO_BROWSER_SUCCESS: portable HTML, real RTDB, A-to-B and B-to-A, revision6, public attack HUD, private hands');

 // G7 extension: use the CURRENT portable build with the G7 research loadout.
 // Keep the older two-way G6 check intact; release its temporary room before
 // creating the second test. No other database nodes are read or deleted.
 await a.goto('about:blank');await b.goto('about:blank');
 await cleanup();code=null;roomHostId=null;
 await a.goto(url,{waitUntil:'load',timeout:20000});
 await a.locator('#labPreset').selectOption('recovery');
 await a.locator('#create').tap();
 await a.waitForFunction(()=>/ルーム \d{5}/.test(
  document.querySelector('#roomLabel')?.textContent||''),null,{timeout:20000});
 code=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
 const g7Created=await dbRead(code);
 if(!g7Created?.meta?.hostId||g7Created?.meta?.guestId!=null)
  throw Error('G7 recovery test room creation failed');
 roomHostId=g7Created.meta.hostId;
 await b.goto(url,{waitUntil:'load',timeout:20000});
 await b.locator('#joinCode').fill(code);
 await b.locator('#join').tap();
 await b.locator('#hand button').first().waitFor({timeout:20000});
 if(!(await a.locator('#hand button').first().textContent()).includes('スマイルのしずく')||
    !(await b.locator('#hand button').first().textContent()).includes('ハートのしずく'))
  throw Error('G7 real RTDB preset did not distribute expected source cards');
 // Host HP recovery; both viewers must see the new HP without seeing the
 // opponent's unrevealed hand. The same player retains the attacking turn.
 await a.locator('#hand button').first().tap();
 await a.locator('#useItem').tap();
 await a.waitForFunction(()=>document.querySelector('.score')?.textContent?.includes('HP 45')&&
  document.querySelector('#phase')?.textContent?.includes('あなたの攻撃'),
  null,{timeout:20000});
 await b.waitForFunction(()=>document.querySelector('.score')?.textContent?.includes('HP 45'),
  null,{timeout:20000});
 const g7Hp=await dbRead(code);
 if(g7Hp.views?.A?.players?.[0]?.hp!==45||
    g7Hp.views?.B?.players?.[0]?.hp!==45||
    g7Hp.views.B.players[0].hand!==undefined)
  throw Error('G7 host HP recovery or hidden hand projection failed in RTDB');
 // Host MP recovery then a real attack in the SAME turn.
 await a.locator('#hand button').first().tap();
 await a.locator('#useItem').tap();
 await a.waitForFunction(()=>document.querySelector('.score')?.textContent?.includes('MP 15')&&
  document.querySelector('#phase')?.textContent?.includes('あなたの攻撃'),
  null,{timeout:20000});
 await a.locator('#hand button').first().tap();
 await a.locator('#attack').tap();
 await b.waitForFunction(()=>document.querySelector('#incomingAttack')?.textContent
  .includes('ワンダーソード'),null,{timeout:20000});
 await b.locator('#defend').tap();
 await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
  .includes('あなたの攻撃'),null,{timeout:20000});
 await b.waitForFunction(()=>document.querySelectorAll('.score')[1]?.textContent
  .includes('HP 30'),null,{timeout:20000});
 // Repeat from the GUEST side: guest commands must be resolved by the
 // authoritative host even when they are recovery rather than attack.
 await b.locator('#hand button').first().tap();
 await b.locator('#useItem').tap();
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>
   document.querySelectorAll('.score')[1]?.textContent?.includes('HP 40'),
  null,{timeout:20000})));
 await b.locator('#hand button').first().tap();
 await b.locator('#useItem').tap();
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>
   document.querySelectorAll('.score')[1]?.textContent?.includes('MP 20'),
  null,{timeout:20000})));
 await b.locator('#hand button').first().tap();
 await b.locator('#attack').tap();
 await a.waitForFunction(()=>document.querySelector('#incomingAttack')?.textContent
  .includes('反射剣'),null,{timeout:20000});
 await a.locator('#defend').tap();
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>
   document.querySelectorAll('.score')[0]?.textContent?.includes('HP 35'),
  null,{timeout:20000})));
 const g7End=await dbRead(code);
 const g7A=g7End.views?.A,g7B=g7End.views?.B;
 if(g7A?.revision!==14||g7B?.revision!==14||
    g7A.players[0].hp!==35||g7A.players[0].mp!==15||
    g7B.players[1].hp!==40||g7B.players[1].mp!==20||
    g7A.players[1].hand!==undefined||g7B.players[0].hand!==undefined)
  throw Error('G7 live recovery/attack synchronization, revision or hand privacy failed');
 if(errors.length)throw Error('G7 browser errors: '+errors.join(' | '));
 console.log('G7_LIVE_RECOVERY_SUCCESS: portable HTML, real RTDB, both seats recover HP/MP and attack within same turn, revision14, private hands');

 // Independent live RTDB session for the G7 opponent-target and mirror path.
 // Close both contexts' pages before deleting the previously created room;
 // never touch any room unless it matches the stored host identity.
 await a.goto('about:blank');await b.goto('about:blank');
 await cleanup();code=null;roomHostId=null;
 await a.goto(url,{waitUntil:'load',timeout:20000});
 await a.locator('#labPreset').selectOption('tear');
 await a.locator('#create').tap();
 await a.waitForFunction(()=>/ルーム \d{5}/.test(
  document.querySelector('#roomLabel')?.textContent||''),null,{timeout:20000});
 code=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
 const tearCreated=await dbRead(code);
 if(!tearCreated?.meta?.hostId||tearCreated?.meta?.guestId!=null)
  throw Error('G7 target/mirror room creation failed');
 roomHostId=tearCreated.meta.hostId;
 await b.goto(url,{waitUntil:'load',timeout:20000});
 await b.locator('#joinCode').fill(code);
 await b.locator('#join').tap();
 await b.locator('#hand button').nth(3).waitFor({timeout:20000});
 if(!(await b.locator('#hand button').nth(3).textContent()).includes('スーパーミラー'))
  throw Error('G7 mirror card missing in source-backed lab hand');
 await a.locator('#hand button').first().tap();
 await a.locator('#itemTarget').tap();
 await a.locator('#useItem').tap();
 await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
  .includes('雑貨への対応'),null,{timeout:20000});
 const pendingTear=await dbRead(code);
 if(pendingTear.views.B.pending?.declaredItem?.definitionId!=='i013'||
    pendingTear.views.B.players[0].hand!==undefined||
    pendingTear.views.A.players[1].hp!==40)
  throw Error('G7 risky tear was prematurely resolved or private hand leaked');
 await b.locator('#hand button').nth(3).tap();
 await b.locator('#defend').tap();
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>{
  const score=document.querySelectorAll('.score');
  return score[0]?.textContent?.includes('HP 50')&&
    score[1]?.textContent?.includes('HP 40');
 },null,{timeout:20000})));
 const mirrored=await dbRead(code);
 if(mirrored.views?.A?.revision!==3||mirrored.views?.B?.revision!==3||
    mirrored.views.A.players[0].hp!==50||
    mirrored.views.B.players[1].hp!==40||
    mirrored.views.B.players[1].hand.some(c=>c.definitionId==='i002')||
    mirrored.views.B.players[0].hand!==undefined||
    mirrored.views.A.players[1].hand!==undefined)
  throw Error('G7 real RTDB targeted item mirror did not settle once with private views');
 if(errors.length)throw Error('G7 item mirror browser errors: '+errors.join(' | '));
 console.log('G7_LIVE_TARGET_MIRROR_SUCCESS: real RTDB, source-backed tear target, Super Mirror before RNG, revision3, private hands');

 // Live proof for ordinary restoratives: HP+5 may be reflected, MP+5
 // accepted by the other seat. Earlier scenarios and safe room cleanup stay.
 await a.goto('about:blank');await b.goto('about:blank');
 await cleanup();code=null;roomHostId=null;
 await a.goto(url,{waitUntil:'load',timeout:20000});
 await a.locator('#labPreset').selectOption('support');
 await a.locator('#create').tap();
 await a.waitForFunction(()=>/ルーム \d{5}/.test(
  document.querySelector('#roomLabel')?.textContent||''),null,{timeout:20000});
 code=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
 const supportCreated=await dbRead(code);
 if(!supportCreated?.meta?.hostId||supportCreated?.meta?.guestId!=null)
  throw Error('G7 support room creation failed');
 roomHostId=supportCreated.meta.hostId;
 await b.goto(url,{waitUntil:'load',timeout:20000});
 await b.locator('#joinCode').fill(code);
 await b.locator('#join').tap();
 await b.locator('#hand button').first().waitFor({timeout:20000});
 if(!(await b.locator('#hand button').first().textContent()).includes('スーパーミラー'))
  throw Error('G7 support preset lacks Super Mirror');
 await a.locator('#hand button').first().tap();
 await a.locator('#itemTarget').tap();
 await a.locator('#useItem').tap();
 await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
  .includes('雑貨への対応'),null,{timeout:20000});
 const pendingSupport=await dbRead(code);
 if(pendingSupport.views?.B?.pending?.declaredItem?.definitionId!=='i006'||
    pendingSupport.views?.B?.players?.[0]?.hand!==undefined||
    pendingSupport.views?.B?.players?.[1]?.hp!==40)
  throw Error('G7 HP support resolved before mirror response');
 await b.locator('#hand button').first().tap();
 await b.locator('#defend').tap();
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>{
  const scores=document.querySelectorAll('.score');
  return scores[0]?.textContent?.includes('HP 45')&&
    scores[1]?.textContent?.includes('HP 40');
 },null,{timeout:20000})));
 await a.locator('#hand button').first().tap();
 await a.locator('#itemTarget').tap();
 await a.locator('#useItem').tap();
 await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
  .includes('雑貨への対応'),null,{timeout:20000});
 await b.locator('#defend').tap();
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>{
  const scores=document.querySelectorAll('.score');
  return scores[1]?.textContent?.includes('MP 15')&&
    document.querySelector('#incomingAttack')?.hidden;
 },null,{timeout:20000})));
 const supportEnd=await dbRead(code);
 if(supportEnd.views?.A?.revision!==6||supportEnd.views?.B?.revision!==6||
    supportEnd.views.A.players[0].hp!==45||
    supportEnd.views.A.players[1].hp!==40||
    supportEnd.views.B.players[1].mp!==15||
    supportEnd.views.B.players[1].hand.some(c=>c.definitionId==='i002')||
    supportEnd.views.B.players[0].hand!==undefined||
    supportEnd.views.A.players[1].hand!==undefined)
  throw Error('G7 real RTDB source-backed HP/MP support, mirror or secrecy failed');
 if(errors.length)throw Error('G7 support browser errors: '+errors.join(' | '));
 console.log('G7_LIVE_SUPPORT_RECOVERY_SUCCESS: real RTDB, HP+5 mirrored, MP+5 accepted, revision6, private hands');

 // Prove both Broom defense decisions against real Firebase in isolated,
 // newly allocated 5-digit lab rooms. No unrelated nodes are touched.
 async function liveBroomTrial(mirror){
  await a.goto('about:blank');await b.goto('about:blank');
  await cleanup();code=null;roomHostId=null;
  await a.goto(url,{waitUntil:'load',timeout:20000});
  await a.locator('#labPreset').selectOption('broom');
  await a.locator('#create').tap();
  await a.waitForFunction(()=>/ルーム \d{5}/.test(
   document.querySelector('#roomLabel')?.textContent||''),null,{timeout:20000});
  code=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
  const created=await dbRead(code);
  if(!created?.meta?.hostId||created?.meta?.guestId!=null)
   throw Error('G7 real Broom room creation failed');
  roomHostId=created.meta.hostId;
  await b.goto(url,{waitUntil:'load',timeout:20000});
  await b.locator('#joinCode').fill(code);
  await b.locator('#join').tap();
  await b.locator('#hand button').first().waitFor({timeout:20000});
  await a.locator('#hand button').first().tap();
  if(!(await a.locator('#itemTarget').textContent()).includes('相手'))
   throw Error('Broom did not default to opponent');
  await a.locator('#useItem').tap();
  await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
   .includes('雑貨への対応'),null,{timeout:20000});
  const waiting=await dbRead(code);
  if(waiting.views?.B?.pending?.declaredItem?.definitionId!=='i014'||
     waiting.views?.B?.players?.[1]?.handCount!==4||
     waiting.views?.B?.players?.[0]?.hand!==undefined)
   throw Error('Broom was resolved before Mirror/pass or leaked opponent cards');
  if(mirror)await b.locator('#hand button').first().tap();
  await b.locator('#defend').tap();
  await Promise.all([a,b].map(page=>page.waitForFunction(({mirror})=>{
   const scores=document.querySelectorAll('.score');
   return scores[0]?.textContent?.includes('手札 '+(mirror?1:4))&&
    scores[1]?.textContent?.includes('手札 '+(mirror?4:1));
  },{mirror},{timeout:20000})));
  const end=await dbRead(code);
  if(end.views?.A?.revision!==3||end.views?.B?.revision!==3||
     end.views.A.players[0].handCount!==(mirror?1:4)||
     end.views.A.players[1].handCount!==(mirror?4:1)||
     end.views.A.activePlayerId!=='A'||end.views.B.activePlayerId!=='A'||
     end.views.B.players[0].hand!==undefined||
     end.views.A.players[1].hand!==undefined)
   throw Error('G7 live Broom settlement, 3-card loss, turn or secrecy failed');
  if(errors.length)throw Error('G7 Broom browser error: '+errors.join(' | '));
  console.log(mirror?'G7_LIVE_BROOM_MIRROR_SUCCESS':'G7_LIVE_BROOM_PASS_SUCCESS');
 }
 await liveBroomTrial(false);
 await liveBroomTrial(true);




}catch(error){
 console.error('G6_LIVE_TEST_FAILURE',String(error?.stack||error));
 const snapshots=[];
 for(const [seat,p] of [['A',a],['B',b]]){
  try{
   if(!p)continue;
   const state=await p.evaluate(()=>({
    room:document.querySelector('#roomLabel')?.textContent,
    status:document.querySelector('#status')?.textContent,
    phase:document.querySelector('#phase')?.textContent,
    scores:[...document.querySelectorAll('.score')].map(x=>x.textContent),
    handCount:document.querySelectorAll('#hand button').length,
    defendDisabled:document.querySelector('#defend')?.disabled,
    lobbyHidden:document.querySelector('#lobby')?.hidden
   }));
   snapshots.push({seat,...state});
  }catch(x){snapshots.push({seat,error:String(x)})}
 }
 console.error('G6_LIVE_PAGE_DIAGNOSTICS',JSON.stringify({snapshots,errors}));
 try{
  if(code){
   const room=await dbRead(code);
   console.error('G6_LIVE_DB_DIAGNOSTICS',JSON.stringify({
    joined:!!room?.meta?.guestId,
    views:Object.fromEntries(Object.entries(room?.views||{}).map(
     ([k,v])=>[k,{revision:v.revision,phase:v.phase,
      activePlayerId:v.activePlayerId,hp:v.players?.map(p=>p.hp)}])),
    command:{senderMatch:!!room?.commands?.B?.senderId,
      actorId:room?.commands?.B?.command?.actorId,
      expectedRevision:room?.commands?.B?.command?.expectedRevision,
      type:room?.commands?.B?.command?.type},
    ack:room?.acks?.B
   }));
  }
 }catch(x){console.error('G6_LIVE_DB_DIAGNOSTIC_ERROR',String(x))}
 process.exitCode=1;
}finally{
 try{await contextA?.close()}catch{}
 try{await contextB?.close()}catch{}
 try{await browser?.close()}catch{}
 try{if(code)await cleanup()}catch(error){
  console.error('G6_LIVE_TEST_CLEANUP_FAILURE',String(error));process.exitCode=1;
 }
 if(server)await new Promise(resolve=>server.close(resolve));
}
