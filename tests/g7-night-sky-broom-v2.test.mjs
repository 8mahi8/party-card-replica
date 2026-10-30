import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {defineCard,drawRandom32} from '../v2/foundation.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
function room({a=['i014','w016','d003','i006'],b=['i002','w027','d003','i005'],seed=71,learned=[]}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:seed,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]
 },catalog);
 state.players[1].learned=[...learned];
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function declare(A,{target='B',id='broom-a'}={}){
 const v=A.read(),broom=v.players[0].hand.find(c=>c.definitionId==='i014');
 const cmd={actorId:'A',type:'useItem',commandId:id,
  expectedRevision:v.revision,instanceId:broom.instanceId,targetId:target};
 const result=A.submit(cmd);return {cmd,result};
}
function respond(B,{mirror=false,id='broom-b'}={}){
 const v=B.read(),held=v.players[1].hand.find(c=>c.definitionId==='i002');
 const cmd={actorId:'B',type:'respondItem',commandId:id,
  expectedRevision:v.revision,...(mirror?{mirrorInstanceId:held.instanceId}:{})};
 const result=B.submit(cmd);return {cmd,result};
}
test('Night Sky Broom is source-verified 10 yen / 1 of 500 and strictly typed',()=>{
 const src=VERIFIED_BASIC_CARDS.find(c=>c.id==='i014');
 assert.deepEqual([src.referenceName,src.price,src.weight,src.effect],
  ['夜空のホウキ',10,1,'sweep_hand']);
 const def=catalog.get('i014');
 assert.deepEqual(def.playModes,['use']);
 assert.deepEqual(def.effects,[{when:'onDeclare',type:'sweepHand',params:{count:3}}]);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],
  [174,435,false]);
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
 const bad={...src,weight:2};
 assert.throws(()=>convertLegacyCard(bad),/Invalid source-backed broom/);
 for(const params of [{count:1},{count:4},{count:3,extra:true},{count:'3'}])
  assert.throws(()=>defineCard({id:'invalid-sweep',family:'item',element:'none',
    drawWeight:1,playModes:['use'],stats:{price:10},
    effects:[{type:'sweepHand',when:'onDeclare',params}],
    source:{ruleset:'test',confidence:'test'}}),/Invalid sweepHand/);
});
test('before a pass/Mirror response, Broom announces its card but removes NOTHING',()=>{
 const {A,B}=room();
 const before=A.read();const {cmd}=declare(A);
 const a=A.read(),b=B.read();
 assert.equal(a.phase,'itemDefense');
 assert.equal(a.activePlayerId,'B');
 assert.equal(b.pending?.declaredItem?.definitionId,'i014');
 assert.equal(a.pending?.targetId,'B');
 assert.equal(a.players[1].handCount,4);
 assert.equal(b.players[1].hand.length,4);
 assert.equal(b.players[0].hand,undefined);
 assert.equal(a.players[1].hand,undefined);
 assert.equal(A.submit(cmd).duplicate,true);
 assert.deepEqual(A.read(),a);
 assert.throws(()=>A.submit({...cmd,targetId:'A'}),/Conflicting commandId reuse/);
 assert.equal(before.players[0].hand.length,a.players[0].hand.length);
});
test('passing Broom permanently sweeps 3 physical cards, even forbidden discard charm',()=>{
 const {A,B}=room({b:['i005','w027','d003']});
 declare(A);
 const {cmd}=respond(B);
 const v=A.read(),other=B.read();
 assert.equal(v.phase,'turn');assert.equal(v.activePlayerId,'A');
 assert.equal(v.players[1].handCount,0);
 assert.equal(other.players[1].hand.length,0);
 assert.equal(v.players[0].hand.length,4,'one spent Broom gets only one replacement');
 assert.equal(v.players[0].hand.some(c=>c.definitionId==='i014'),false);
 assert.equal(v.players[0].hand.filter(c=>c.definitionId==='d001').length,1);
 assert.equal(B.submit(cmd).duplicate,true,'same response cannot draw more randomness');
 assert.deepEqual(A.read(),v);
});
test('4-card target retains only one card: RNG samples uniformly without replacement',()=>{
 const seed=71;
 const b=['i002','w027','d003','i005'];
 const {A,B}=room({seed,b});
 const before=B.read().players[1].hand;
 const expected=[...before],drawn=[];
 let nextSeed=seed;
 for(let n=0;n<3;n++){
  const sample=drawRandom32(nextSeed);
  nextSeed=sample.nextSeed;
  drawn.push(expected.splice(Math.floor(sample.value*expected.length),1)[0].instanceId);
 }
 declare(A);respond(B);
 const after=B.read();
 assert.equal(after.players[1].hand.length,1);
 assert.equal(after.players[1].hand[0].instanceId,expected[0].instanceId);
 assert.equal(after.players[1].handCount,1);
 assert.equal(A.read().players[1].handCount,1);
});
test('Super Mirror consumes one physical Mirror and redirects the 3-card sweep',()=>{
 const {A,B}=room();
 declare(A);const {cmd}=respond(B,{mirror:true});
 const a=A.read(),b=B.read();
 assert.equal(a.activePlayerId,'A');
 assert.equal(a.players[0].hand.length,1,'three remaining cards are swept after Broom is spent');
 assert.equal(a.players[0].hand[0].definitionId,'d001','only Broom replacement survives');
 assert.equal(b.players[1].hand.length,4,'Mirror is replaced, not swept');
 assert.equal(b.players[1].hand.some(c=>c.definitionId==='i002'),false);
 assert.equal(b.players[1].hand.filter(c=>c.definitionId==='d001').length,1);
 assert.equal(B.submit(cmd).duplicate,true);
 assert.deepEqual(B.read(),b);
});
test('self-targeting Broom can discard its own remaining artifacts, never sweeps itself twice',()=>{
 const {A}=room();
 declare(A,{target:'A'});
 const a=A.read();
 assert.equal(a.phase,'turn');
 assert.equal(a.activePlayerId,'A');
 assert.equal(a.players[0].hand.length,1);
 assert.equal(a.players[0].hand[0].definitionId,'d001');
});
test('swept cards do not touch learned miracles, even when the hand is empty',()=>{
 const {A,B}=room({b:['w027','d003'],learned:['m008']});
 declare(A);respond(B);
 const b=B.read();
 assert.equal(b.players[1].hand.length,0);
 assert.deepEqual(b.players[1].learned,['m008']);
 assert.equal(A.read().players[1].handCount,0);
});
test('empty target hand is a valid zero-card sweep with no extra hand draw',()=>{
 const {A,B}=room({b:[]});
 declare(A);respond(B);
 assert.equal(B.read().players[1].hand.length,0);
 assert.equal(A.read().players[0].hand.length,4);
});
test('Broom effect does not end the turn: attacker may still attack next',()=>{
 const {A,B}=room();
 declare(A);respond(B);
 const a=A.read(),sword=a.players[0].hand.find(c=>c.definitionId==='w016');
 assert(sword,'the 4 original A cards include the weapon before playing Broom');
 A.submit({commandId:'broom-attack',expectedRevision:a.revision,
  actorId:'A',type:'playCards',targetId:'B',orderedInstanceIds:[sword.instanceId]});
 assert.equal(B.read().phase,'defense');
});
test('forged foreign Mirror or swapped instance ID is rejected without changing the room',()=>{
 const {A,B}=room();
 const before=A.read();
 assert.throws(()=>A.submit({actorId:'A',type:'useItem',commandId:'fake-broom',
  expectedRevision:before.revision,instanceId:before.players[0].hand[1].instanceId,
  targetId:'B'}),/Only a plain owned recovery item/);
 assert.deepEqual(A.read(),before);
 declare(A);
 const staged=B.read();
 const wrong=staged.players[1].hand.find(c=>c.definitionId==='d003');
 assert.throws(()=>B.submit({actorId:'B',type:'respondItem',commandId:'bad-mirror',
  expectedRevision:staged.revision,mirrorInstanceId:wrong.instanceId}),/Only Super Mirror/);
 assert.deepEqual(B.read(),staged);
});
