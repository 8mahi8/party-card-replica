import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {assertOtherAfflictions,planOtherAfflictionCure} from '../v2/disease-rules.mjs';

const {byId:catalog}=migrateLegacyCatalog();
let serial=0;
function room({a=['w016','w016','d003','i006'],
 b=['d001','d003','i017','w016'],flashSeat='B',learnedB=[]}={}){
 const initial=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}
 ],firstSeatId:'A',rngSeed:71,rulesetId:'partial-reference-v2-lab'},catalog);
 initial.players.find(p=>p.id===flashSeat).afflictions=['flash'];
 initial.players[1].learned=[...learnedB];
 const host=createLocalRoomHostFixture({initialState:initial,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function submit(seat,actorId,type,fields={}){
 return seat.submit({commandId:'flash-g7-'+(++serial),
  expectedRevision:seat.read().revision,actorId,type,...fields});
}
function held(seat,index,id){
 return seat.read().players[index].hand.find(c=>c.definitionId===id).instanceId;
}
function attack(A,id='w016'){
 submit(A,'A','playCards',{targetId:'B',orderedInstanceIds:[held(A,0,id)]});
}
test('Flash is a separate non-disease affliction, minor and all cures clear it',()=>{
 assert.deepEqual(assertOtherAfflictions(undefined),[]);
 assert.deepEqual(planOtherAfflictionCure(['flash'],'minor'),{
  before:['flash'],after:[],cured:true
 });
 assert.deepEqual(planOtherAfflictionCure(['flash'],'all').after,[]);
 assert.deepEqual(planOtherAfflictionCure([],'minor').after,[]);
 assert.throws(()=>assertOtherAfflictions(['dream']),/Unknown non-disease affliction/);
 assert.throws(()=>assertOtherAfflictions(['flash','flash']),/Unknown non-disease affliction/);
 assert.throws(()=>planOtherAfflictionCure(['flash'],'neither'),/Invalid affliction cure scope/);
});
test('Flash limits defender to a single physical artifact; failure is atomic',()=>{
 const {A,B}=room();
 attack(A);
 const before=JSON.stringify(B.read());
 const two=[held(B,1,'d001'),held(B,1,'d003')];
 assert.throws(()=>submit(B,'B','defend',{orderedInstanceIds:two}),
  /Flash affliction allows only one defense artifact/);
 assert.equal(JSON.stringify(B.read()),before);
 assert.equal(A.read().phase,'defense');
 submit(B,'B','defend',{orderedInstanceIds:[two[0]]});
 assert.equal(B.read().phase,'turn');
 assert.equal(B.read().activePlayerId,'B');
 assert.deepEqual(B.read().players[1].afflictions,['flash']);
 assert.deepEqual(A.read().players[1].afflictions,['flash']);
 assert.equal(A.read().players[1].hand,undefined);
});
test('Flash also counts learned defensive miracles; learned-only defense remains legal',()=>{
 const {A,B}=room({learnedB:['m001']});
 attack(A);
 const before=JSON.stringify(B.read());
 assert.throws(()=>submit(B,'B','defendSequence',{orderedPlays:[
  {instanceId:held(B,1,'d003')},{learnedDefinitionId:'m001'}]}),
  /Flash affliction allows only one defense artifact/);
 assert.equal(JSON.stringify(B.read()),before);
 submit(B,'B','defendSequence',{orderedPlays:[{learnedDefinitionId:'m001'}]});
 assert.equal(B.read().activePlayerId,'B');
 assert.deepEqual(B.read().players[1].afflictions,['flash']);
});
test('Smile Shell clears Flash during the user turn and restores ordinary defense next attack',()=>{
 const {A,B}=room();
 attack(A);
 submit(B,'B','defend',{orderedInstanceIds:[]});
 assert.deepEqual(B.read().players[1].afflictions,['flash']);
 submit(B,'B','useItem',{instanceId:held(B,1,'i017'),targetId:'B'});
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.deepEqual(A.read().players[1].afflictions,[]);
 assert.equal(B.read().activePlayerId,'B','self Shell does not end the turn');
 submit(B,'B','playCards',{targetId:'A',orderedInstanceIds:[held(B,1,'w016')]});
 submit(A,'A','defend',{orderedInstanceIds:[]});
 attack(A);
 submit(B,'B','defend',{orderedInstanceIds:[
  held(B,1,'d001'),held(B,1,'d003')]});
 assert.equal(B.read().activePlayerId,'B');
});
test('Melody and Song cure Flash without making up an additional illness',()=>{
 for(const id of ['m017','m018']){
  const {A,B}=room({a:[id,'w016','d003','i003'],
   b:['d001','d003','i017','w016'],flashSeat:'A'});
  const before=A.read().players[0];
  assert.equal(before.disease,null);
  assert.deepEqual(before.afflictions,['flash']);
  submit(A,'A','playCards',{targetId:'A',
   orderedInstanceIds:[held(A,0,id)]});
  const after=A.read().players[0];
  assert.equal(after.disease,null);
  assert.deepEqual(after.afflictions,[]);
  assert.equal(A.read().activePlayerId,'B');
  assert.deepEqual(B.read().players[0].afflictions,[]);
 }
});
