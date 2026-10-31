import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {drawRandom32} from '../v2/foundation.mjs';

const {byId:catalog}=migrateLegacyCatalog();
function room(seed=1,{aHand=['i013','w016'],bHand=['i002','d003'],aHp=30,bHp=30}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:seed,
  rulesetId:'partial-reference-v2-lab',seats:[
   {id:'A',handDefinitionIds:aHand},{id:'B',handDefinitionIds:bHand}
  ]},catalog);
 state.players[0].hp=aHp;state.players[1].hp=bHp;
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function declare(A,targetId='B',commandId='risky-a'){
 const a=A.read(),item=a.players[0].hand.find(x=>x.definitionId==='i013');
 const cmd={type:'useItem',actorId:'A',commandId,
  expectedRevision:a.revision,instanceId:item.instanceId,targetId};
 const result=A.submit(cmd);
 return {cmd,result};
}
function respond(B,{mirror=false,id='risky-b'}={}){
 const v=B.read(),item=v.players[1].hand.find(x=>x.definitionId==='i002');
 const cmd={type:'respondItem',actorId:'B',commandId:id,
  expectedRevision:v.revision,
  ...(mirror?{mirrorInstanceId:item?.instanceId}:{})};
 const result=B.submit(cmd);
 return {cmd,result};
}
test('opponent DokiDoki is announced before sampling and hides private hands',()=>{
 const {A,B}=room(1);
 const initial=A.read();
 const {cmd}=declare(A);
 const after=A.read(),other=B.read();
 assert.equal(after.phase,'itemDefense');
 assert.equal(after.activePlayerId,'B');
 assert.equal(after.pending?.type,'useItem');
 assert.equal(after.pending?.declaredItem?.definitionId,'i013');
 assert.equal(other.pending?.declaredItem?.definitionId,'i013');
 assert.equal(other.pending.targetId,'B');
 assert.equal(other.players[0].hand,undefined);
 assert.equal(after.players[1].hand,undefined);
 assert.equal(other.players[0].hp,30);
 assert.equal(other.players[1].hp,30);
 assert.equal(A.submit(cmd).duplicate,true,'same-ID retry cannot redraw');
 assert.deepEqual(A.read(),after);
 assert.throws(()=>A.submit({...cmd,targetId:'A'}),/Conflicting commandId reuse/,
  'a retry must not change selected target');
 assert.equal(initial.players[0].hand.length,after.players[0].hand.length);
});
test('defender accepts: heal branch applies +10 to opponent, retains original attacker turn',()=>{
 const {A,B}=room(1);
 declare(A); const {cmd}=respond(B);
 const a=A.read(),b=B.read();
 assert.equal(a.players[0].hp,30);
 assert.equal(a.players[1].hp,40);
 assert.equal(b.players[1].hp,40);
 assert.equal(a.phase,'turn');
 assert.equal(a.activePlayerId,'A');
 assert.equal(a.players[0].hand[0].definitionId,'w016');
 assert.equal(a.players[0].hand[1].definitionId,'d001');
 assert.equal(b.players[1].hand.some(c=>c.definitionId==='i002'),true);
 assert.equal(B.submit(cmd).duplicate,true);
 assert.deepEqual(B.read(),b);
});
test('defender accepts: damage branch hits opponent and allows follow-up attack',()=>{
 assert(drawRandom32(12345).value>=0.5);
 const {A,B}=room(12345);
 declare(A); respond(B);
 const result=A.read();
 assert.deepEqual(result.players.map(p=>p.hp),[30,20]);
 assert.equal(result.activePlayerId,'A');
 const sword=result.players[0].hand.find(c=>c.definitionId==='w016');
 A.submit({type:'playCards',actorId:'A',commandId:'next-attack',
  expectedRevision:result.revision,targetId:'B',
  orderedInstanceIds:[sword.instanceId]});
 assert.equal(B.read().phase,'defense');
});
test('Super Mirror redirects before the random heal and consumes only one mirror',()=>{
 const {A,B}=room(1);
 declare(A);
 const {cmd}=respond(B,{mirror:true});
 const av=A.read(),bv=B.read();
 assert.deepEqual(av.players.map(p=>p.hp),[40,30]);
 assert.equal(av.phase,'turn');
 assert.equal(av.activePlayerId,'A');
 assert.equal(bv.players[1].hand.some(c=>c.definitionId==='i002'),false);
 assert.equal(bv.players[1].hand.filter(c=>c.definitionId==='d001').length,1);
 assert.equal(bv.players[1].hand.length,2);
 assert.equal(B.submit(cmd).duplicate,true);
 assert.deepEqual(B.read(),bv);
});
test('Super Mirror redirects damage, and the RNG is sampled exactly once',()=>{
 const {A,B}=room(12345);
 declare(A);
 const {cmd}=respond(B,{mirror:true});
 const av=A.read();
 assert.deepEqual(av.players.map(p=>p.hp),[20,30]);
 assert.equal(av.activePlayerId,'A');
 assert.equal(av.pending,null);
 assert.equal(av.phase,'turn');
 assert.throws(()=>B.submit({...cmd,mirrorInstanceId:undefined}),
  /Conflicting commandId reuse/);
 assert.equal(A.read().players[0].hp,20);
});
test('lethal hit to opponent ends match; their Sun Charm instead revives at HP10',()=>{
 {
  const {A,B}=room(12345,{bHp:5,bHand:['d003']});
  declare(A);respond(B);
  const a=A.read();
  assert.equal(a.players[1].hp,0);
  assert.equal(a.phase,'finished');
  assert.equal(a.activePlayerId,null);
 }
 {
  const {A,B}=room(12345,{bHp:5,bHand:['i005','d003']});
  declare(A);respond(B);
  const a=A.read(),b=B.read();
  assert.equal(a.phase,'turn');
  assert.equal(a.activePlayerId,'A');
  assert.equal(a.players[1].hp,10);
  assert.equal(b.players[1].hand.some(c=>c.definitionId==='i005'),false);
  assert.equal(b.players[1].hand.filter(c=>c.definitionId==='d001').length,1);
 }
});
test('reflected lethal hit defeats original user, or consumes their Sun Charm',()=>{
 {
  const {A,B}=room(12345,{aHp:5});
  declare(A);respond(B,{mirror:true});
  assert.equal(A.read().phase,'finished');
  assert.deepEqual(A.read().players.map(p=>p.hp),[0,30]);
 }
 {
  const {A,B}=room(12345,{aHp:5,aHand:['i013','i005','w016']});
  declare(A);respond(B,{mirror:true});
  const a=A.read();
  assert.equal(a.phase,'turn');
  assert.equal(a.activePlayerId,'A');
  assert.equal(a.players[0].hp,10);
  assert.equal(a.players[0].hand.some(c=>c.definitionId==='i005'),false);
  assert.equal(a.players[0].hand.filter(c=>c.definitionId==='d001').length,2);
 }
});
test('targeted ordinary recovery is legal; mismatched item response rejects atomically',()=>{
 const {A,B}=room(1,{aHand:['i006','i013'],bHand:['d003','i002']});
 const initial=A.read();
 const targeted={type:'useItem',actorId:'A',commandId:'heal-other',
  expectedRevision:initial.revision,instanceId:initial.players[0].hand[0].instanceId,
  targetId:'B'};
 A.submit(targeted);
 assert.equal(B.read().phase,'itemDefense');
 assert.equal(A.submit(targeted).duplicate,true);
 const old=B.read();
 assert.throws(()=>B.submit({type:'respondItem',actorId:'B',
  commandId:'wrong-mirror',expectedRevision:old.revision,
  mirrorInstanceId:old.players[1].hand[0].instanceId}),/Only Super Mirror/);
 assert.deepEqual(B.read(),old);
 assert.throws(()=>A.submit({type:'respondItem',actorId:'A',
  commandId:'spoof',expectedRevision:old.revision}),/Not the active seat/);
 assert.equal(A.read().players[0].hp,30);
});
