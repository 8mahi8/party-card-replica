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
let code=null,contextA=null,contextB=null,browser=null,server=null;
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
 if(!room?.meta?.hostId || room.meta.version!==1)
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
 const a=await contextA.newPage(),b=await contextB.newPage();
 const errors=[];
 for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port+
  '/v2/demo/firebase-online-lab.html';
 await a.goto(url,{waitUntil:'load',timeout:20000});
 await a.locator('#create').tap();
 await a.waitForFunction(()=>/ルーム \d{5}/.test(
  document.querySelector('#roomLabel')?.textContent||''),null,{timeout:20000});
 code=(await a.locator('#roomLabel').textContent()).match(/\d{5}/)[0];
 console.log('G6_LIVE_HOST_CREATED');
 const created=await dbRead(code);
 if(!created?.meta?.hostId||created?.meta?.guestId!=null)
  throw Error('Live RTDB room was not created correctly');
 await b.goto(url,{waitUntil:'load',timeout:20000});
 await b.locator('#joinCode').fill(code);
 await b.locator('#join').tap();
 await b.locator('#hand button').first().waitFor({timeout:20000});
 await a.locator('#hand button').first().tap();
 await a.waitForFunction(()=>document.querySelector('#attack')?.disabled===false,
  null,{timeout:20000});
 await a.locator('#attack').tap();
 await b.waitForFunction(()=>document.querySelector('#phase')?.textContent
  .includes('防御待ち'),null,{timeout:20000});
 await b.locator('#defend').tap();
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>{
  const t=document.querySelector('#phase')?.textContent||'';
  const score=document.querySelectorAll('.score')[1]?.textContent||'';
  return t.includes('攻撃手番 P2')&&score.includes('HP 30');
 },null,{timeout:20000})));
 const persisted=await dbRead(code);
 if(persisted.views.A.revision!==3||persisted.views.B.revision!==3)
  throw Error('Live RTDB revision mismatch');
 if(persisted.views.A.players[1].hand!==undefined||
    persisted.views.B.players[0].hand!==undefined)
  throw Error('Seat view contained opponents hidden hand');
 if(errors.length)throw Error('Browser error: '+errors.join(' | '));
 console.log('G6_LIVE_TWO_BROWSER_SUCCESS: room, join, attack, defend, revision3, HP30');
}catch(error){
 console.error('G6_LIVE_TEST_FAILURE',String(error?.stack||error));
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
