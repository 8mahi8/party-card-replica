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
