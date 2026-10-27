/** Real Chromium hotseat smoke test via Node 22's built-in WebSocket / CDP.
 * Run: node tests/v2-browser-smoke.browser.mjs
 * This is NOT Safari, school iPad, or Google Sites verification.
 */
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,existsSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html=path.join(root,'v2/demo/standalone.html');
const shots=path.join(root,'v2/demo/browser-evidence');
const binaries=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean);
const chrome=binaries.find(x=>x.includes('/')?existsSync(x):spawnSync('which',[x]).status===0);
if(!chrome)throw new Error('Chromium/Chrome is required: real browser smoke test cannot be replaced by mocks');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(fn,n=120) {
 let last=null;
 for(let i=0;i<n;i++){
  try{const result=await fn();if(result)return result;}catch(e){last=e;}
  await sleep(90);
 }
 throw last??new Error('Browser timeout');
}
let processChrome,ws,session,id=0,temp,localServer;
const queue=new Map();let checks=0;
function cdp(method,params={},sid=session){
 return new Promise((resolve,reject)=>{
  const key=++id;
  queue.set(key,{resolve,reject});
  ws.send(JSON.stringify({id:key,method,params,...(sid?{sessionId:sid}:{})}));
 });
}
async function evaluate(expr) {
 const value=await cdp('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true,userGesture:true});
 if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description??value.exceptionDetails.text);
 return value.result?.value;
}
function check(value,message){assert.ok(value,message);checks++;}
async function click(query,index=0) {
 const code='(()=>{const el=document.querySelectorAll('+JSON.stringify(query)+')['+index+'];'+
 'if(!el)throw Error("Button missing");el.scrollIntoView({block:"center"});'+
 'const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()';
 const r=await evaluate(code);
 await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x,y:r.y});
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1});
 return r;
}
async function wait(selector) {
 return poll(()=>evaluate('Boolean(document.querySelector('+JSON.stringify(selector)+'))'));
}
async function shot(name){
 if(!session)return;
 try{
  mkdirSync(shots,{recursive:true});
  const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(path.join(shots,name+'.png'),Buffer.from(r.data,'base64'));
 }catch(e){console.error('Screenshot unavailable: '+e.message);}
}
async function viewport(width,height){
 await cdp('Emulation.setDeviceMetricsOverride',{
  width,height,deviceScaleFactor:2,mobile:true,screenWidth:width,screenHeight:height
 });
 await sleep(120);
}
async function noOverflow(label) {
 const width=await evaluate('({content:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth})');
 check(width.content<=width.viewport+2,label+' has horizontal overflow: '+JSON.stringify(width));
}

/**
 * This frame harness reproduces viewport clipping and nested scrolling only.
 * Because the local frame shares its test origin with the parent, it does
 * NOT prove Google Sites sandbox or real iPad Safari compatibility.
 */
async function startEmbedServer(){
 const whitelist=new Set(['/v2/demo/embed-harness.html','/v2/demo/standalone.html']);
 localServer=createServer((request,response)=>{
   const pathname=new URL(request.url,'http://127.0.0.1').pathname;
   if(!whitelist.has(pathname)){
     response.writeHead(404);response.end('Missing lab fixture');return;
   }
   try{
     const html=readFileSync(path.join(root,pathname.slice(1)));
     response.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
       'Cache-Control':'no-store'});
     response.end(html);
   }catch(error){
     response.writeHead(500);response.end('Fixture read failed');
   }
 });
 await new Promise((resolve,reject)=>{
   localServer.once('error',reject);
   localServer.listen(0,'127.0.0.1',resolve);
 });
 return 'http://127.0.0.1:'+localServer.address().port+'/v2/demo/embed-harness.html';
}
const frameValue=expr=>evaluate(
 '(()=>{const f=document.getElementById("game-embed");'+
 'if(!f||!f.contentDocument)return false;const d=f.contentDocument;'+
 'return ('+expr+');})()'
);
async function frameClick(selector,index=0) {
 const bounds=await evaluate('(()=>{'+
   'const f=document.getElementById("game-embed");'+
   'const d=f.contentDocument;const el=d.querySelectorAll('+JSON.stringify(selector)+')['+index+'];'+
   'if(!el)throw Error("Missing frame control");'+
   'el.scrollIntoView({block:"center",inline:"center"});'+
   'const fr=f.getBoundingClientRect(),r=el.getBoundingClientRect();'+
   'return {x:fr.left+f.clientLeft+r.left+r.width/2,'+
   'y:fr.top+f.clientTop+r.top+r.height/2,w:r.width,h:r.height};})()');
 await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:bounds.x,y:bounds.y});
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:bounds.x,y:bounds.y,button:'left',clickCount:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:bounds.x,y:bounds.y,button:'left',clickCount:1});
 return bounds;
}
async function frameFits(label) {
 const metrics=await frameValue(
  '({scroll:d.documentElement.scrollWidth,width:d.documentElement.clientWidth})');
 check(metrics.scroll<=metrics.width+2,label+' frame overflow: '+JSON.stringify(metrics));
}
async function testFixedHeightEmbed(){
 const url=await startEmbedServer();
 await viewport(1024,768);
 await cdp('Page.navigate',{url});
 await poll(()=>frameValue('Boolean(d.querySelector(".pass-screen"))'));
 await noOverflow('fixed-height embed parent');
 await frameFits('embedded iPad');
 check(await frameValue('d.querySelectorAll("[data-card]").length===0'),
  'embedded initial state must conceal cards');
 await shot('embed-ipad-pass');
 await frameClick('[data-action="reveal"]');
 await poll(()=>frameValue('Boolean(d.querySelector("[data-card=hand]"))'));
 await frameClick('[data-card="hand"]',0);
 const scroll=await frameValue(
  '(f.contentWindow.scrollTo(0,d.body.scrollHeight),f.contentWindow.scrollY)');
 check(scroll>50,'embed iframe was not scrolled before submit: '+scroll);
 const confirm=await frameValue(
  '(()=>{const r=d.querySelector(".confirm").getBoundingClientRect();'+
  'return {y:r.y,bottom:r.bottom,h:r.height,viewport:f.contentWindow.innerHeight};})()');
 check(confirm.y>=0&&confirm.bottom<=confirm.viewport+2&&confirm.h>=44,
  'fixed confirm should remain inside the embedded viewport '+JSON.stringify(confirm));
 await frameClick('[data-action="submit"]');
 await poll(()=>frameValue('Boolean(d.querySelector(".pass-screen"))'));
 check(await frameValue('d.querySelector(".pass-screen h1").textContent.includes("P2")'),
  'embedded handoff did not show next player');
 check(await frameValue('f.contentWindow.scrollY===0'),
  'embedded handoff must reset its own scroll position');
 check(await frameValue('d.querySelectorAll("[data-card]").length===0'),
  'embedded opponent hand must remain hidden');
 await shot('embed-ipad-handoff');
 await viewport(390,844);
 await evaluate('document.getElementById("game-embed").style.height="430px"');
 await frameFits('embedded narrow');
 await noOverflow('embedded narrow parent');
 await frameClick('[data-action="reveal"]');
 await poll(()=>frameValue('Boolean(d.querySelector("[data-card=hand]"))'));
 const mobileConfirm=await frameValue(
  '(()=>{const r=d.querySelector(".confirm").getBoundingClientRect();'+
  'return {top:r.top,bottom:r.bottom,h:r.height,viewport:f.contentWindow.innerHeight};})()');
 check(mobileConfirm.top>=0&&mobileConfirm.bottom<=mobileConfirm.viewport+2&&mobileConfirm.h>=44,
  'narrow embedded confirm not visible '+JSON.stringify(mobileConfirm));
 await frameClick('[data-action="submit"]');
 await poll(()=>frameValue('Boolean(d.querySelector(".pass-screen"))'));
 check(await frameValue('f.contentWindow.scrollY===0'),
  'narrow iframe pass must reset scroll');
 await shot('embed-mobile-handoff');
}

async function run(){
 temp=mkdtempSync(path.join(tmpdir(),'v2-browser-'));
 processChrome=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--no-first-run','--remote-debugging-port=0',
  '--user-data-dir='+temp,'about:blank'],{stdio:'ignore'});
 const port=await poll(()=>{
  const f=path.join(temp,'DevToolsActivePort');
  if(!existsSync(f))return null;
  return Number(readFileSync(f,'utf8').split('\n')[0]);
 },160);
 const meta=await (await fetch('http://127.0.0.1:'+port+'/json/version')).json();
 ws=new WebSocket(meta.webSocketDebuggerUrl);
 ws.addEventListener('message',event=>{
  const value=JSON.parse(String(event.data)),target=queue.get(value.id);
  if(!target)return;
  queue.delete(value.id);
  value.error?target.reject(Error(value.error.message)):target.resolve(value.result);
 });
 await new Promise((resolve,reject)=>{
  ws.addEventListener('open',resolve,{once:true});
  ws.addEventListener('error',reject,{once:true});
 });
 const created=await cdp('Target.createTarget',{url:'about:blank'});
 const linked=await cdp('Target.attachToTarget',{targetId:created.targetId,flatten:true});
 session=linked.sessionId;
 await cdp('Runtime.enable');
 await cdp('Page.enable');
 await viewport(1024,768);
 await cdp('Page.navigate',{url:pathToFileURL(html).href});
 await wait('.pass-screen');
 check(await evaluate('document.querySelectorAll("[data-card]").length===0'),'cards shown before reveal');
 await noOverflow('iPad 1024x768');
 await shot('ipad-pass-initial');
 await click('[data-action="reveal"]');
 await wait('[data-card="hand"]');
 check(await evaluate('document.querySelectorAll("[data-card=hand]").length===9'),'nine starting cards expected');
 const card=await click('[data-card="hand"]',0);
 check(card.h>=44,'tablet card tap region too small');
 check(await evaluate('document.querySelectorAll(".battle-card.picked").length===1'),'selected card not highlighted');
 await click('[data-action="submit"]');
 await wait('.pass-screen');
 check(await evaluate('document.querySelector(".pass-screen h1").textContent.includes("P2")'),'wrong defender');
 check(await evaluate('document.querySelectorAll("[data-card]").length===0'),'opponent hand exposed on pass');
 await shot('ipad-pass-defense');
 await click('[data-action="reveal"]');
 await wait('[data-card="hand"]');
 await click('[data-action="submit"]');
 await wait('.pass-screen');
 check(await evaluate('document.querySelector(".pass-screen h1").textContent.includes("P2")'),'wrong next turn');
 check(await evaluate('document.querySelectorAll("[data-card]").length===0'),'hand revealed on next turn');
 await click('[data-action="reset"]');await click('[data-action="reset"]');
 await wait('.pass-screen');
 check(await evaluate('document.querySelector(".pass-screen h1").textContent.includes("P1")'),'reset failed');
 await viewport(390,844);
 await noOverflow('mobile pass');
 await click('[data-action="reveal"]');
 await wait('[data-card="hand"]');
 await noOverflow('mobile hand');
 const touch=await click('[data-card="hand"]',0);
 check(touch.w>=85&&touch.h>=44,'mobile tap target too small');
 const confirm=await evaluate('(()=>{const r=document.querySelector(".confirm").getBoundingClientRect();return {top:r.top,bottom:r.bottom,h:r.height};})()');
 check(confirm.top>=0&&confirm.bottom<=844&&confirm.h>=44,'confirm button not visible during card selection');
 await shot('mobile-card-selected');
 await testFixedHeightEmbed();
 console.log('BROWSER_SMOKE_SUCCESS checks='+checks+' chrome='+chrome+
  ' viewports=1024x768,390x844 plus 1024x460/390x430 nested iframe');
}
try{await run();}
catch(e){console.error('BROWSER_SMOKE_FAILURE '+e.stack);await shot('failure');process.exitCode=1;}
finally{
 try{ws?.close();}catch{}
 try{processChrome?.kill();}catch{}
 try{localServer?.close();}catch{}
 await sleep(100);
 if(temp)rmSync(temp,{recursive:true,force:true});
}
