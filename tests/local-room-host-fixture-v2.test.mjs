import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';

const {byId:catalog}=migrateLegacyCatalog();
function setup(hands={A:['w016','d001'],B:['d003','w027']},rulesetId='partial-reference-v2-lab'){
 const initialState=createStagingRoom({seats:Object.entries(hands).map(([id,handDefinitionIds])=>({id,handDefinitionIds})),firstSeatId:'A',rulesetId,rngSeed:71},catalog);
 return {initialState,host:createLocalRoomHostFixture({initialState,catalog})};
}
function attack(A,ids=null){
 const v=A.read();
 return {commandId:'attack-1',expectedRevision:v.revision,type:'playCards',actorId:'A',targetId:'B',orderedInstanceIds:ids??[v.players[0].hand[0].instanceId]};
}
function defend(P,id='defense-1'){
 const v=P.read();
 return {commandId:id,expectedRevision:v.revision,type:'defend',actorId:v.activePlayerId,orderedInstanceIds:[]};
}
function checkPrivate(v,self){
 assert.equal(Object.hasOwn(v,'rngSeed'),false);
 assert.equal(Object.hasOwn(v,'processedCommands'),false);
 assert.equal(Object.hasOwn(v,'nextInstanceSerial'),false);
 for(const p of v.players){
  assert.equal(Object.hasOwn(p,'hand'),p.id===self);
  assert.equal(Object.hasOwn(p,'learned'),p.id===self);
 }
}
test('two seat-scoped endpoints run an attack/defense with private hands',()=>{
 const {host}=setup(),A=host.connectSeatFixture('A'),B=host.connectSeatFixture('B');
 checkPrivate(A.read(),'A');checkPrivate(B.read(),'B');
 const out=A.submit(attack(A));
 assert.equal(out.applied,true);assert.equal(out.revision,1);
 assert.equal(Object.hasOwn(out,'state'),false);
 assert.equal(Object.hasOwn(out,'events'),false);
 checkPrivate(out.view,'A');
 assert.equal(B.read().activePlayerId,'B');
 const response=B.submit(defend(B));
 assert.equal(response.view.phase,'turn');
 assert.equal(response.view.activePlayerId,'B');
 assert.equal(response.view.players[1].hp,30);
 assert.equal(A.read().revision,response.revision);
 assert.equal(A.read().players[1].hand,undefined);
});
test('duplicate delivery and reconnect do not replay damage or hand refills',()=>{
 const {host}=setup(),A=host.connectSeatFixture('A'),B=host.connectSeatFixture('B');
 const a=attack(A);A.submit(a);
 assert.equal(A.submit(a).duplicate,true);
 const b=defend(B);B.submit(b);
 const before=A.read();
 assert.equal(host.connectSeatFixture('B').submit(b).duplicate,true);
 assert.deepEqual(A.read(),before);
});
test('forged actor, stale revision and conflicting command ID are rejected without changes',()=>{
 const {host}=setup(),A=host.connectSeatFixture('A'),B=host.connectSeatFixture('B');
 const c=attack(A),original=A.read();
 assert.throws(()=>host.connectSeatFixture('X'),/Unknown test seat/);
 assert.throws(()=>A.submit({...c,actorId:'B'}),/not authenticated/);
 assert.deepEqual(A.read(),original);
 A.submit(c);const after=B.read();
 assert.throws(()=>B.submit({...defend(B),expectedRevision:0}),/Stale room revision/);
 assert.throws(()=>A.submit({...c,commandId:'new-id'}),/Stale room revision/);
 assert.throws(()=>A.submit({...c,targetId:'A'}),/Conflicting commandId reuse/);
 assert.deepEqual(B.read(),after);
});
test('invalid attack does not strand a guest in defense',()=>{
 const {host}=setup({A:['w016','w016'],B:['d001']});
 const A=host.connectSeatFixture('A'),B=host.connectSeatFixture('B');
 const original=B.read();
 const ids=A.read().players[0].hand.map(x=>x.instanceId);
 assert.throws(()=>A.submit(attack(A,ids)),/Not a structural attack selection/);
 assert.deepEqual(B.read(),original);
 assert.equal(A.read().phase,'turn');
});
test('initial room and player views are defensive snapshots',()=>{
 const {host,initialState}=setup(),A=host.connectSeatFixture('A');
 initialState.players[0].hp=0;
 assert.equal(A.read().players[0].hp,40);
 const view=A.read();view.players[0].hp=999;view.players[0].hand.length=0;
 assert.equal(A.read().players[0].hp,40);
 assert.equal(A.read().players[0].hand.length,2);
});
test('three-seat Mirage fixture passes through two remote-like defenders',()=>{
 const {host}=setup({A:['w016','m012'],B:['d003'],C:['d001']},'mirage-multiplayer-research-fixture-v2');
 const A=host.connectSeatFixture('A'),B=host.connectSeatFixture('B'),C=host.connectSeatFixture('C');
 const ids=A.read().players[0].hand.map(x=>x.instanceId);
 A.submit(attack(A,ids));assert.equal(B.read().activePlayerId,'B');
 B.submit(defend(B));assert.equal(C.read().activePlayerId,'C');
 C.submit(defend(C,'defense-C'));
 const v=A.read();
 assert.equal(v.phase,'turn');assert.equal(v.activePlayerId,'B');
 assert.equal(v.players[1].hp,30);assert.equal(v.players[2].hp,30);
 assert.equal(v.players[0].mp,5);
 checkPrivate(v,'A');checkPrivate(B.read(),'B');checkPrivate(C.read(),'C');
});
