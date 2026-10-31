import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {convertLegacyCard,migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';
const {byId:catalog,summary}=migrateLegacyCatalog();

function room({a=['m015','m016','i003','w016'],b=['w016','d003','d018','i002'],
 mp=25,hp=40,money=20,learned=[]}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:71,
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}],
  rulesetId:'partial-reference-v2-lab'},catalog);
 state.players[0].hp=hp;state.players[0].money=money;
 state.players[0].mp=mp;state.players[0].learned=[...learned];
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
let serial=0;
function send(seat,actorId,type,fields={}){
 return seat.submit({commandId:'resource-'+(++serial),expectedRevision:seat.read().revision,
  actorId,type,...fields});
}
function castPhysical(A,id,{targetId='A',spirit=false}={}){
 const own=A.read().players[0];
 const card=own.hand.find(c=>c.definitionId===id);
 const orderedInstanceIds=[card.instanceId];
 if(spirit)orderedInstanceIds.push(own.hand.find(c=>c.definitionId==='i003').instanceId);
 return send(A,'A','playCards',{orderedInstanceIds,targetId});
}
test('Fountain and Treasure are source-backed self-resource miracles, not fictional damage',()=>{
 for(const [id,name,mp,resource] of [
  ['m015','泉',7,'hp'],['m016','財宝',5,'money']]){
  const src=VERIFIED_BASIC_CARDS.find(c=>c.id===id);
  assert.deepEqual([src.referenceName,src.role,src.element,src.mpCost,
    src.restoreAmount,src.resourceGain,src.weight],
    [name,'resource','none',mp,10,resource,1]);
  const def=catalog.get(id);
  assert.equal(def.stats.attack,0);
  assert.deepEqual(def.playModes,['cast']);
  assert.deepEqual(def.effects,[{when:'onDeclare',type:'restoreResource',
    params:{resource,amount:10}}]);
  assert.throws(()=>convertLegacyCard({...src,mpCost:1}),
   /Unverified resource miracle/);
  assert.throws(()=>convertLegacyCard({...src,restoreAmount:99}),
   /Unverified resource miracle/);
 }
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[179,440,false]);
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
});
test('Fountain is a self cast: HP+10, MP-7, learn, refill, pass turn',()=>{
 const {A,B}=room();
 castPhysical(A,'m015');
 const x=A.read(),p=x.players[0];
 assert.equal(p.hp,50);
 assert.equal(p.mp,18);
 assert.equal(p.money,20);
 assert.equal(p.hand.length,4);
 assert.deepEqual(p.learned,['m015']);
 assert.equal(x.activePlayerId,'B');
 assert.equal(B.read().players[0].hp,50);
 assert.equal(B.read().players[0].learned,undefined);
 assert.equal(x.pending,null);
});
test('Treasure is a self cast: money+10, MP-5, learn, refill, pass turn',()=>{
 const {A,B}=room();
 castPhysical(A,'m016');
 const x=A.read(),p=x.players[0];
 assert.equal(p.money,30);
 assert.equal(p.mp,20);
 assert.equal(p.hp,40);
 assert.equal(p.hand.length,4);
 assert.deepEqual(p.learned,['m016']);
 assert.equal(x.activePlayerId,'B');
 assert.equal(B.read().players[0].money,30);
});
test('learned Fountain recasts after another player takes a turn; grants one card',()=>{
 const {A,B}=room();
 castPhysical(A,'m015');
 const weapon=B.read().players[1].hand.find(c=>c.definitionId==='w016');
 send(B,'B','playCards',{orderedInstanceIds:[weapon.instanceId],targetId:'A'});
 send(A,'A','defend',{orderedInstanceIds:[]});
 assert.equal(A.read().activePlayerId,'A');
 assert.equal(A.read().players[0].hp,40);
 send(A,'A','castLearned',{learnedDefinitionId:'m015',targetId:'A'});
 const p=A.read().players[0];
 assert.equal(p.hp,50);
 assert.equal(p.mp,11);
 assert.equal(p.hand.length,5);
 assert.deepEqual(p.learned,['m015']);
 assert.equal(A.read().activePlayerId,'B');
});
test('learned Treasure keeps its original money effect and costs MP5',()=>{
 const {A}=room({learned:['m016'],money:95});
 send(A,'A','castLearned',{learnedDefinitionId:'m016',targetId:'A'});
 const p=A.read().players[0];
 assert.equal(p.money,99);
 assert.equal(p.mp,20);
 assert.equal(p.hand.length,5);
 assert.deepEqual(p.learned,['m016']);
});
test('not enough MP refuses declaration without advancing state',()=>{
 const {A}=room({mp:0});
 const original=JSON.stringify(A.read());
 assert.throws(()=>castPhysical(A,'m015'),/Not enough MP/);
 assert.equal(JSON.stringify(A.read()),original);
});
test('a resource miracle with an immediate Spirit costs no MP and consumes two cards',()=>{
 const {A}=room({mp:0});
 castPhysical(A,'m015',{spirit:true});
 const p=A.read().players[0];
 assert.equal(p.mp,0);
 assert.equal(p.hp,50);
 assert.equal(p.hand.length,4);
 assert.deepEqual(p.learned,['m015']);
});
test('resource miracles cannot be directed at the opponent or forged as an attack',()=>{
 const {A}=room();
 const original=JSON.stringify(A.read());
 assert.throws(()=>castPhysical(A,'m016',{targetId:'B'}),
  /Resource miracle must be cast on its owner/);
 assert.equal(JSON.stringify(A.read()),original);
});
test('learned resource miracle rejected on wrong target or insufficient MP',()=>{
 const {A}=room({learned:['m015'],mp:6});
 const original=JSON.stringify(A.read());
 assert.throws(()=>send(A,'A','castLearned',{learnedDefinitionId:'m015',targetId:'A'}),
   /Not enough MP/);
 assert.equal(JSON.stringify(A.read()),original);
 const {A:ready}=room({learned:['m015'],mp:7});
 const before=JSON.stringify(ready.read());
 assert.throws(()=>send(ready,'A','castLearned',{learnedDefinitionId:'m015',targetId:'B'}),
   /Resource miracle must be cast on its owner/);
 assert.equal(JSON.stringify(ready.read()),before);
});
