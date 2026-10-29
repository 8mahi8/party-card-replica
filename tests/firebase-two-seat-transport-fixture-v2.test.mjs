import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseTwoSeatHostFixture,joinFirebaseTwoSeatGuestFixture,LAB_ROOT}
 from '../v2/firebase-two-seat-transport-fixture.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function createFakeDb({beforeUpdate=async()=>{}}={}){
 let data={},watchers=[];
 function pathGet(path){
  let cur=data;
  for(const s of path.split('/').filter(Boolean))cur=cur?.[s];
  return clone(cur??null);
 }
 function pathSet(path,value){
  let seg=path.split('/').filter(Boolean),cur=data;
  for(const s of seg.slice(0,-1))cur=cur[s]??={};
  cur[seg.at(-1)]=clone(value);
 }
 function notify(changed){
  for(const w of [...watchers]){
   if(w.event!=='value')continue;
   if(changed.some(p=>p===w.path||p.startsWith(w.path+'/')||w.path.startsWith(p+'/')))
    w.fn({val:()=>pathGet(w.path)});
  }
 }
 function makeRef(path){
  return {
   child(child){return makeRef(path+'/'+child);},
   async once(){return {val:()=>pathGet(path)};},
   on(event,fn){watchers.push({path,event,fn});if(event==='value')fn({val:()=>pathGet(path)});},
   off(event,fn){watchers=watchers.filter(w=>w.path!==path||w.event!==event||w.fn!==fn);},
   async set(value){if(JSON.stringify(pathGet(path))===JSON.stringify(value))return;
    pathSet(path,value);notify([path]);},
   async update(patch){
    await beforeUpdate(path,patch);
    for(const [key,value] of Object.entries(patch))pathSet(path+'/'+key,value);
    notify(Object.keys(patch).map(key=>path+'/'+key));
   },
   async transaction(fn){
    const before=pathGet(path),after=fn(before);
    if(after===undefined)return {committed:false,snapshot:{val:()=>before}};
    pathSet(path,after);notify([path]);
    return {committed:true,snapshot:{val:()=>clone(after)}};
   }
  };
 }
 return {ref:makeRef,at:pathGet};
}
function initial(){
 return createStagingRoom({firstSeatId:'A',rngSeed:71,rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:['w016','d001']},
   {id:'B',handDefinitionIds:['w027','d003']}]},catalog);
}
const code='35719';
const makeHost=(db,overrides={})=>createFirebaseTwoSeatHostFixture({
 db,code,hostId:'host-tab',initialState:initial(),catalog,...overrides
});
const join=(db,overrides={})=>joinFirebaseTwoSeatGuestFixture({
 db,code,guestId:'guest-tab',...overrides
});
function command(view,actorId,type,ids=[]){
 return {commandId:'c-'+actorId+'-'+view.revision,
   expectedRevision:view.revision,actorId,type,
   ...(type==='playCards'?{targetId:actorId==='A'?'B':'A'}:{}),
   orderedInstanceIds:ids};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(predicate){
 for(let i=0;i<50;i++){if(predicate())return;await tick();}
 throw Error('Expected Firebase guest ack/view did not arrive');
}
test('creates a dedicated room with two projections, without a canonical state in RTDB',async()=>{
 const db=createFakeDb(),host=await makeHost(db);
 const root=db.at(LAB_ROOT+'/'+code);
 assert.equal(root.meta.hostId,'host-tab');
 assert.equal(root.meta.guestId,null);
 assert.equal(root.views.A.players[0].hand.length,2);
 assert.equal(root.views.A.players[1].hand,undefined);
 assert.equal(root.views.B.players[0].hand,undefined);
 assert.equal(root.views.B.players[1].hand.length,2);
 assert.equal(root.state,undefined);
 assert.equal(root.rngSeed,undefined);
 assert.equal(root.views.A.rngSeed,undefined);
 host.close();
});
test('host A attacks, remote B defends, both receive same revision and HP',async()=>{
 const db=createFakeDb(),viewsA=[],viewsB=[],acks=[];
 const host=await makeHost(db,{onView:v=>viewsA.push(v)});
 const guest=await join(db,{onView:v=>viewsB.push(v),onReceipt:r=>acks.push(r)});
 const a=host.read(),attackId=a.players[0].hand[0].instanceId;
 await host.submit(command(a,'A','playCards',[attackId]));
 await until(()=>viewsB.at(-1)?.phase==='defense');
 const b=viewsB.at(-1);
 assert.equal(b.activePlayerId,'B');
 const sent=await guest.submit(command(b,'B','defend'));
 assert.equal(sent.sent,true);
 await until(()=>acks.some(x=>x.id===sent.id&&x.ok===true));
 assert.equal(viewsB.at(-1).phase,'turn');
 assert.equal(viewsB.at(-1).players[1].hp,30);
 assert.equal(viewsA.at(-1).players[1].hp,30);
 assert.equal(viewsB.at(-1).revision,viewsA.at(-1).revision);
 assert.equal(viewsA.at(-1).players[1].hand,undefined);
 assert.equal(viewsB.at(-1).players[0].hand,undefined);
 guest.close();host.close();
});
test('duplicate guest delivery cannot deal damage twice',async()=>{
 const db=createFakeDb(),acks=[],host=await makeHost(db);
 const guest=await join(db,{onReceipt:r=>acks.push(r)});
 const v=host.read();await host.submit(command(v,'A','playCards',[v.players[0].hand[0].instanceId]));
 const b=db.at(LAB_ROOT+'/'+code+'/views/B');
 const c=command(b,'B','defend');
 await guest.submit(c);
 await until(()=>acks.some(x=>x.id===c.commandId&&x.ok));
 const original=db.at(LAB_ROOT+'/'+code+'/views/A');
 await guest.submit(c);
 await until(()=>acks.at(-1)?.duplicate===true);
 assert.deepEqual(db.at(LAB_ROOT+'/'+code+'/views/A'),original);
 guest.close();host.close();
});
test('guest cannot overwrite occupied slot; duplicate room code cannot replace match',async()=>{
 const db=createFakeDb(),host=await makeHost(db);
 await assert.rejects(()=>makeHost(db),/使用中/);
 const guest=await join(db);
 await assert.rejects(()=>join(db,{guestId:'another-tab'}),/既に参加者/);
 assert.equal(db.at(LAB_ROOT+'/'+code+'/meta/guestId'),'guest-tab');
 guest.close();host.close();
});
test('invalid guest action returns error ack but does not strand both players',async()=>{
 const db=createFakeDb(),acks=[],host=await makeHost(db);
 const guest=await join(db,{onReceipt:r=>acks.push(r)});
 const a=host.read();
 await host.submit(command(a,'A','playCards',[a.players[0].hand[0].instanceId]));
 const before=db.at(LAB_ROOT+'/'+code+'/views/B');
 const wrong={...command(before,'B','defend'),actorId:'A'};
 await db.ref(LAB_ROOT+'/'+code+'/commands/B').set({senderId:'guest-tab',command:wrong});
 await until(()=>acks.some(x=>x.id===wrong.commandId&&x.ok===false));
 assert.deepEqual(db.at(LAB_ROOT+'/'+code+'/views/B'),before);
 const corrected=command(before,'B','defend');
 await guest.submit({...corrected,commandId:'retry-corrected'});
 await until(()=>acks.some(x=>x.id==='retry-corrected'&&x.ok===true));
 assert.equal(db.at(LAB_ROOT+'/'+code+'/views/B').phase,'turn');
 guest.close();host.close();
});
test('all transport writes are confined to godfieldV2LabRooms and no rules are touched',async()=>{
 const db=createFakeDb(),host=await makeHost(db);
 const guest=await join(db);
 assert.deepEqual(Object.keys(db.at('')),[LAB_ROOT]);
 assert.equal(db.at('shokokuRooms1v1'),null);
 guest.close();host.close();
});

test('host and guest updates publish in command order even when first DB write is delayed',async()=>{
 let release,started=0;
 const gate=new Promise(resolve=>{release=resolve});
 const db=createFakeDb({beforeUpdate:async path=>{
  if(path!==LAB_ROOT+'/'+code)return;
  started++;
  if(started===1)await gate;
 }});
 const host=await makeHost(db),guest=await join(db);
 const a=host.read();
 const hostWrite=host.submit(command(a,'A','playCards',[a.players[0].hand[0].instanceId]));
 await until(()=>started===1);
 // The defender acts after the host has applied the attack locally, while
 // the host's first Firebase publication is still pending.
 await db.ref(LAB_ROOT+'/'+code+'/commands/B').set({
  senderId:'guest-tab',
  command:{commandId:'race-defense',expectedRevision:1,actorId:'B',
   type:'defend',orderedInstanceIds:[]}
 });
 await tick();await tick();await tick();
 assert.equal(started,1,'newer revision must not overtake a pending publish');
 release();
 await hostWrite;
 await until(()=>db.at(LAB_ROOT+'/'+code+'/acks/B')?.id==='race-defense');
 const out=db.at(LAB_ROOT+'/'+code);
 assert.equal(out.views.A.revision,3);
 assert.equal(out.views.B.revision,3);
 assert.equal(out.views.B.players[1].hp,30);
 assert.equal(out.acks.B.ok,true);
 guest.close();host.close();
});
test('failed guest Firebase publish is not a false negative command receipt; same-ID retry restores view',async()=>{
 let failNext=false;
 const errors=[];
 const db=createFakeDb({beforeUpdate:async path=>{
  if(path===LAB_ROOT+'/'+code && failNext){
   failNext=false;
   throw Error('temporary DB failure');
  }
 }});
 const host=await makeHost(db,{onError:e=>errors.push(String(e.message))});
 const a=host.read();
 await host.submit(command(a,'A','playCards',[a.players[0].hand[0].instanceId]));
 const guest=await join(db);
 const b=db.at(LAB_ROOT+'/'+code+'/views/B');
 const cmd=command(b,'B','defend');
 failNext=true;
 await guest.submit(cmd);
 await until(()=>errors.length>0);
 assert.equal(host.read().revision,3,'defense was committed in host memory');
 assert.equal(db.at(LAB_ROOT+'/'+code+'/views/B').revision,1,'DB view is still old');
 assert.equal(db.at(LAB_ROOT+'/'+code+'/acks/B'),null,'do not claim the committed defense failed');
 await guest.submit(cmd);
 await until(()=>db.at(LAB_ROOT+'/'+code+'/acks/B')?.duplicate===true);
 assert.equal(db.at(LAB_ROOT+'/'+code+'/acks/B').ok,true);
 assert.equal(db.at(LAB_ROOT+'/'+code+'/views/B').revision,3);
 assert.equal(db.at(LAB_ROOT+'/'+code+'/views/B').players[1].hp,30);
 guest.close();host.close();
});

test('guest no-card defense survives the Firebase wire as an explicit empty array',async()=>{
 const db=createFakeDb(),host=await makeHost(db),guest=await join(db);
 const start=host.read();
 await host.submit(command(start,'A','playCards',[start.players[0].hand[0].instanceId]));
 const view=db.at(LAB_ROOT+'/'+code+'/views/B');
 const defense=command(view,'B','defend',[]);
 await guest.submit(defense);
 const mailbox=db.at(LAB_ROOT+'/'+code+'/commands/B');
 assert.equal(typeof mailbox.commandJson,'string');
 assert.equal(mailbox.command,undefined);
 assert.deepEqual(JSON.parse(mailbox.commandJson).orderedInstanceIds,[]);
 assert.equal(typeof mailbox.deliveryId,'string');
 await until(()=>db.at(LAB_ROOT+'/'+code+'/acks/B')?.ok===true);
 assert.equal(db.at(LAB_ROOT+'/'+code+'/views/B').phase,'turn');
 assert.equal(db.at(LAB_ROOT+'/'+code+'/views/B').players[1].hp,30);
 guest.close();host.close();
});

test('same commandId retry updates mailbox even when RTDB ignores identical writes',async()=>{
 const db=createFakeDb(),host=await makeHost(db),guest=await join(db);
 const a=host.read();
 await host.submit(command(a,'A','playCards',[a.players[0].hand[0].instanceId]));
 const before=db.at(LAB_ROOT+'/'+code+'/views/B');
 const defend=command(before,'B','defend');
 await guest.submit(defend);
 await until(()=>db.at(LAB_ROOT+'/'+code+'/acks/B')?.ok===true);
 const first=db.at(LAB_ROOT+'/'+code+'/commands/B');
 await guest.submit(defend);
 await until(()=>db.at(LAB_ROOT+'/'+code+'/acks/B')?.duplicate===true);
 const second=db.at(LAB_ROOT+'/'+code+'/commands/B');
 assert.equal(second.commandJson,first.commandJson,'stable game command ID and payload');
 assert.notEqual(second.deliveryId,first.deliveryId,'unique transport delivery on retry');
 assert.equal(db.at(LAB_ROOT+'/'+code+'/views/B').players[1].hp,30);
 guest.close();host.close();
});

test('host rejects an invalid card choice without trapping the UI in a network retry',async()=>{
 const db=createFakeDb(),host=await makeHost(db);
 const v=host.read();
 const nonAttackId=v.players[0].hand[1].instanceId;
 await assert.rejects(
  ()=>host.submit(command(v,'A','playCards',[nonAttackId])),
  error=>error.commandRejected===true
 );
 assert.equal(host.read().revision,0);
 assert.equal(db.at(LAB_ROOT+'/'+code+'/views/A').revision,0);
 const swordId=v.players[0].hand[0].instanceId;
 const ok=await host.submit(command(v,'A','playCards',[swordId]));
 assert.equal(ok.ok,true);
 assert.equal(host.read().phase,'defense');
 host.close();
});
