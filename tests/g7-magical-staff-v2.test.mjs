import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {convertLegacyCard,migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {defineCard} from '../v2/foundation.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
let seq=0;
function match({a=['w062','w016','d003','i006'],b=['d003','d001','i002','w016'],mpA=8}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:71,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]},catalog);
 state.players[0].mp=mpA;
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function send(c,who,type,params={}){
 return c.submit({actorId:who,type,commandId:'g7-magic-staff-'+(++seq),
  expectedRevision:c.read().revision,...params});
}
function id(c,who,definitionId){
 const hit=c.read().players.find(x=>x.id===who).hand.find(x=>x.definitionId===definitionId);
 assert(hit,'Missing physical artifact '+definitionId);
 return hit.instanceId;
}
function attack(A,instanceIds=[id(A,'A','w062')]){
 return send(A,'A','playCards',{targetId:'B',orderedInstanceIds:instanceIds});
}
function defend(B,ids=[]){
 return send(B,'B','defend',{orderedInstanceIds:ids.map(x=>id(B,'B',x))});
}
test('Piong/Macaron 2026 Magical Staff: neutral ¥10, 0.2% and all-MP x2 only',()=>{
 const raw=VERIFIED_BASIC_CARDS.find(c=>c.id==='w062');
 assert.deepEqual([raw.referenceName,raw.slot,raw.attack,raw.price,raw.weight,
  raw.element,raw.mpAttack],['マジカルステッキ','main',0,10,1,'none',true]);
 const def=catalog.get('w062');
 assert.deepEqual(def.effects,[{when:'onDeclare',type:'spendMpForAttack',params:{multiplier:2}}]);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[186,447,false]);
 assert.deepEqual([summary.unique,summary.slots],[RESEARCH_CATALOG_CONTRACT.unique,RESEARCH_CATALOG_CONTRACT.slots]);
 for(const bad of [{mpAttack:false},{attack:3},{element:'fire'},
   {slot:'addon'},{repeatHits:2}]){
  assert.throws(()=>convertLegacyCard({...raw,...bad}),/Unverified MP-powered weapon/);
 }
 for(const params of [{multiplier:3},{multiplier:2,extra:1},{}])
  assert.throws(()=>defineCard({id:'bad',family:'weapon',element:'none',drawWeight:1,
   stats:{attack:0,price:10},playModes:['mainAttack'],
   effects:[{when:'onDeclare',type:'spendMpForAttack',params}],
   source:{ruleset:'test',confidence:'test'}}),/Invalid MP-powered weapon/);
});
test('MP8 generates neutral attack16 and spends exactly eight MP before damage',()=>{
 const {A,B}=match();attack(A);
 assert.equal(A.read().phase,'defense');
 assert.equal(A.read().players[0].mp,8,'MP is not spent merely by declaration');
 assert.equal(B.read().pending.declaredAttack?.cards?.[0]?.definitionId,'w062');
 defend(B);
 assert.equal(A.read().players[1].hp,24);
 assert.equal(A.read().players[0].mp,0);
 assert.equal(A.read().activePlayerId,'B');
 assert.equal(A.read().players[0].hand.length,4);
});
test('MP-powered attack passes through shared neutral shield reduction and costs once',()=>{
 const {A,B}=match();attack(A);defend(B,['d003']);
 assert.equal(A.read().players[1].hp,27,'attack16 less guard3');
 assert.equal(A.read().players[0].mp,0);
 assert.equal(B.read().players[0].mp,0);
});
test('Super Mirror reflects immutable attack16 and never charges MP twice',()=>{
 const {A,B}=match();
 attack(A);defend(B,['i002']);
 assert.equal(A.read().phase,'defense');
 send(A,'A','defend',{orderedInstanceIds:[]});
 assert.equal(A.read().players[0].hp,24);
 assert.equal(A.read().players[1].hp,40);
 assert.equal(A.read().players[0].mp,0);
 assert.equal(B.read().activePlayerId,'B');
});
test('unverified combo with another weapon or miracle fails without state mutation',()=>{
 for(const combo of [['w062','w016'],['w062','m004']]){
  const {A}=match({a:['w062',combo[1],'d003','i006']});
  const before=JSON.stringify(A.read());
  assert.throws(()=>attack(A,combo.map(x=>id(A,'A',x))),/MP-powered wand combinations|Not a structural attack selection/);
  assert.equal(JSON.stringify(A.read()),before);
 }
});
test('unknown zero MP timing is declined atomically, rather than invented',()=>{
 const {A}=match({mpA:0});const before=JSON.stringify(A.read());
 assert.throws(()=>attack(A),/Zero-MP wand attack is not yet verified/);
 assert.equal(JSON.stringify(A.read()),before);
});
test('old plain main weapon keeps its printed power and does not spend MP',()=>{
 const {A,B}=match();attack(A,[id(A,'A','w016')]);defend(B);
 assert.equal(A.read().players[1].hp,30);
 assert.equal(A.read().players[0].mp,8);
});
