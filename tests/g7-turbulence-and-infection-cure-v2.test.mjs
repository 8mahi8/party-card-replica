import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {drawRandom32} from '../v2/foundation.mjs';
const {byId:catalog}=migrateLegacyCatalog();
function match({seed=12345,a=['m013','m014','d018','d003'],
  b=['m007','i018','w016','d003'],mpA=35,mpB=10,
  diseaseA=null,diseaseB=null,bLearned=[]}={}){
 const room=createStagingRoom({firstSeatId:'A',rngSeed:seed,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]},catalog);
 room.players[0].mp=mpA;room.players[1].mp=mpB;
 room.players[0].disease=diseaseA;room.players[1].disease=diseaseB;
 room.players[1].learned=[...bLearned];
 const h=createLocalRoomHostFixture({initialState:room,catalog});
 return {A:h.connectSeatFixture('A'),B:h.connectSeatFixture('B')};
}
function send(c,who,type,extra,key){
 return c.submit({type,actorId:who,commandId:key,
  expectedRevision:c.read().revision,...extra});
}
function play(c,who,id,target,key){
 const p=c.read().players.find(x=>x.id===who);
 const instance=p.hand.find(x=>x.definitionId===id);
 assert(instance,'physical '+id+' missing');
 return send(c,who,'playCards',{orderedInstanceIds:[instance.instanceId],targetId:target},key);
}
function defend(c,who,ids,key){
 const p=c.read().players.find(x=>x.id===who);
 return send(c,who,'defend',{orderedInstanceIds:ids.map(id=>{
  const instance=p.hand.find(x=>x.definitionId===id);
  assert(instance,'defensive '+id+' missing');
  return instance.instanceId;
 })},key);
}
test('seed 12345 maps 2-seat deflect to defender; Wind applies without second defense',()=>{
 const {A,B}=match({seed:12345});
 assert(drawRandom32(12345).value>=0.5);
 play(A,'A','m013','B','wind-declared');
 const pending=B.read();
 assert.equal(pending.players[1].disease,null);
 defend(B,'B',['m007'],'turbulence');
 const a=A.read(),b=B.read();
 assert.equal(a.phase,'turn');
 assert.equal(a.activePlayerId,'B');
 assert.equal(a.players[0].disease,null);
 assert.equal(b.players[1].disease,'cold','deflected wind hits its own defender immediately');
 assert.equal(b.players[1].hp,40,'no B end-turn disease tick yet');
 assert.equal(a.players[0].mp,29,'Wind paid only once');
 assert.equal(b.players[1].mp,5,'Turbulence costs MP5');
 assert.equal(b.players[1].learned.includes('m007'),true);
 assert.equal(b.players[1].hand.length,4,'one miracle used and one drawn');
});
test('seed 71 maps deflection to attacker; attacker can then defend with Angel',()=>{
 const {A,B}=match({seed:71});
 assert(drawRandom32(71).value<0.5);
 play(A,'A','m014','B','heaven-init');
 defend(B,'B',['m007'],'heaven-deflect');
 const bounced=A.read();
 assert.equal(bounced.phase,'defense');
 assert.equal(bounced.activePlayerId,'A');
 assert.equal(bounced.players[1].disease,null);
 assert.equal(bounced.pending.declaredAttack?.cards?.[0]?.definitionId,'m014',
  'already spent Heaven Wind stays publicly visible after Turbulence');
 assert.equal(bounced.pending.declaredAttack?.printedAttackTotal,0);
 assert.equal(B.read().players[0].hand,undefined,'public return does not leak hand');
 defend(A,'A',['d018'],'angel-after-deflect');
 const end=A.read();
 assert.equal(end.phase,'turn');
 assert.equal(end.activePlayerId,'B');
 assert.equal(end.players[0].disease,null,'Angel stops redirected Heaven Wind');
 assert.equal(end.players[1].disease,null);
 assert.equal(end.players[0].mp,20,'Heaven Wind pays once');
 assert.equal(B.read().players[1].mp,5);
});
test('attacker accepting deflected Wind gets cold and own-turn HP -1',()=>{
 const {A,B}=match({seed:71});
 play(A,'A','m013','B','wind-to-b');
 defend(B,'B',['m007'],'deflect-to-a');
 const incoming=A.read();
 assert.equal(incoming.players[0].disease,null);
 defend(A,'A',[],'accept-own-wind');
 const end=A.read();
 assert.equal(end.players[0].disease,'cold');
 assert.equal(end.players[0].hp,39);
 assert.equal(end.activePlayerId,'B');
 assert.equal(end.players[1].disease,null);
});
test('learned Turbulence costs MP5 and draws once, with no extra physical spend',()=>{
 const {A,B}=match({seed:12345,bLearned:['m007'],b:['i018','w016','d003'],mpB:5});
 play(A,'A','m013','B','wind-to-learned');
 const handBefore=B.read().players[1].hand.length;
 const beforeResponse=B.read();
 const responseCommand={type:'defend',actorId:'B',commandId:'learned-deflect',
  expectedRevision:beforeResponse.revision,orderedInstanceIds:[],learnedDefinitionId:'m007'};
 const response=B.submit(responseCommand);
 const v=B.read();
 assert.equal(v.players[1].mp,0);
 assert.equal(v.players[1].disease,'cold');
 assert.equal(v.players[1].learned.filter(x=>x==='m007').length,1);
 assert.equal(v.players[1].hand.length,handBefore+1);
 assert.equal(B.submit(responseCommand).duplicate,true);
});
test('Turbulence with MP4 fails atomically and keeps original pending defense',()=>{
 const {A,B}=match({mpB:4});
 play(A,'A','m013','B','mp-check-start');
 const before=B.read();
 assert.throws(()=>defend(B,'B',['m007'],'mp-too-low'),/Not enough MP/);
 assert.deepEqual(B.read(),before);
});
test('Wind infection is fully cured by Smile Shell on next turn',()=>{
 const {A,B}=match({b:['i017','w016','d003','m007'],seed:12345});
 play(A,'A','m013','B','wind-infect');
 defend(B,'B',[],'accept-wind');
 assert.equal(B.read().players[1].disease,'cold');
 const shell=B.read().players[1].hand.find(c=>c.definitionId==='i017');
 send(B,'B','useItem',{instanceId:shell.instanceId,targetId:'B'},'smile-cure');
 assert.equal(B.read().players[1].disease,null);
 play(B,'B','w016','A','counterattack');
 defend(A,'A',[],'counter-accept');
 const v=B.read();
 assert.equal(v.players[1].hp,40);
 assert.equal(v.players[1].disease,null);
 assert.equal(v.activePlayerId,'A');
});
test('Heaven Wind infection is cured by Heart Shell, preventing own-turn healing',()=>{
 const {A,B}=match();
 play(A,'A','m014','B','heaven-infect');
 defend(B,'B',[],'accept-heaven');
 assert.equal(B.read().players[1].disease,'heaven');
 const shell=B.read().players[1].hand.find(c=>c.definitionId==='i018');
 send(B,'B','useItem',{instanceId:shell.instanceId,targetId:'B'},'heart-cure');
 assert.equal(B.read().players[1].disease,null);
 play(B,'B','w016','A','heaven-counterattack');
 defend(A,'A',[],'heaven-counter-accept');
 assert.equal(B.read().players[1].hp,40,'cured Heaven Disease does not heal +5');
});
test('second learned Heaven Wind hits preexisting Heaven Disease and ends match',()=>{
 const {A,B}=match({a:['m014','d003','i003'],b:['w016','d003','i017'],mpA:35});
 play(A,'A','m014','B','heaven-first');
 defend(B,'B',[],'first-accept');
 assert.equal(B.read().players[1].disease,'heaven');
 play(B,'B','w016','A','b-response');
 defend(A,'A',[],'b-response-accept');
 assert.equal(A.read().activePlayerId,'A');
 send(A,'A','castLearned',{learnedDefinitionId:'m014',targetId:'B'},'heaven-second');
 assert.equal(B.read().phase,'defense');
 defend(B,'B',[],'second-accept');
 const v=A.read();
 assert.equal(v.players[1].hp,0);
 assert.equal(v.phase,'finished');
 assert.equal(v.players[0].mp,5);
});
