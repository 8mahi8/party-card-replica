import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {defineCard,drawRandom32} from '../v2/foundation.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
function setup(seed,hand=['i013','w016'],hp=30){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:seed,
   rulesetId:'partial-reference-v2-lab',seats:[
     {id:'A',handDefinitionIds:hand},{id:'B',handDefinitionIds:['d003']}
   ]},catalog);
 state.players[0].hp=hp;
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function use(A,commandId='tear-use'){
 const before=A.read(),item=before.players[0].hand.find(x=>x.definitionId==='i013');
 const command={commandId,expectedRevision:before.revision,actorId:'A',
   type:'useItem',instanceId:item.instanceId};
 return {before,command,result:A.submit(command)};
}
test('DokiDoki tear has strictly sourced 50/50 outcome definition and 2/500 weight',()=>{
 const card=VERIFIED_BASIC_CARDS.find(x=>x.id==='i013');
 assert.deepEqual([card.referenceName,card.restoreAmount,card.price,card.weight,
   card.effect,card.element],['ドキドキ涙',10,1,2,'coin_flip_hp','none']);
 const def=catalog.get('i013');
 assert.deepEqual(def.effects,[{when:'onDeclare',type:'flipHpRisk',
   params:{heal:10,damage:10,healChance:0.5}}]);
 assert.deepEqual(def.playModes,['use']);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],
   [RESEARCH_CATALOG_CONTRACT.unique,RESEARCH_CATALOG_CONTRACT.slots,false]);
 assert.deepEqual([summary.unique,summary.slots],[164,409]);
});
test('seeded heal branch restores 10 HP, refills used item and retains attack turn',()=>{
 assert(drawRandom32(1).value<0.5);
 const {A,B}=setup(1);
 const {before,command}=use(A);
 const v=A.read();
 assert.equal(v.players[0].hp,40);
 assert.equal(B.read().players[0].hp,40);
 assert.equal(v.phase,'turn');
 assert.equal(v.activePlayerId,'A');
 assert.equal(v.turnCount,before.turnCount);
 assert.equal(v.players[0].hand.length,2);
 assert.equal(v.players[0].hand[1].definitionId,'d001');
 assert.equal(B.read().players[0].hand,undefined);
 assert.equal(A.submit(command).duplicate,true);
 assert.deepEqual(A.read(),v);
});
test('seeded damage branch deals 10 self damage and still permits attack',()=>{
 assert(drawRandom32(12345).value>=0.5);
 const {A,B}=setup(12345);
 use(A);
 const v=A.read();
 assert.equal(v.players[0].hp,20);
 assert.equal(v.phase,'turn');
 assert.equal(v.activePlayerId,'A');
 const weapon=v.players[0].hand.find(x=>x.definitionId==='w016');
 A.submit({commandId:'attack',expectedRevision:v.revision,actorId:'A',type:'playCards',
  targetId:'B',orderedInstanceIds:[weapon.instanceId]});
 assert.equal(B.read().phase,'defense');
});
test('fatal damage from tear ends two-seat match without an invalid resumed turn',()=>{
 const {A,B}=setup(12345,['i013','w016'],5);
 use(A);
 const v=A.read();
 assert.equal(v.players[0].hp,0);
 assert.equal(v.phase,'finished');
 assert.equal(v.winnerId,undefined); // winner is part of authoritative state, not viewer
 assert.equal(v.activePlayerId,null);
 assert.equal(B.read().players[0].hp,0);
});
test('Sun Charm intercepts 0HP from tear, consumes one charm and preserves turn',()=>{
 const {A}=setup(12345,['i013','i005','w016'],5);
 use(A);
 const v=A.read();
 assert.equal(v.phase,'turn');
 assert.equal(v.activePlayerId,'A');
 assert.equal(v.players[0].hp,10);
 assert.equal(v.players[0].hand.some(c=>c.definitionId==='i005'),false);
 assert.equal(v.players[0].hand.filter(c=>c.definitionId==='d001').length,2);
 assert.equal(v.players[0].hand.some(c=>c.definitionId==='w016'),true);
});
test('risky item cannot be re-used, spoofed or assigned malformed odds',()=>{
 const {A,B}=setup(12345);
 const {command}=use(A);
 const after=A.read();
 assert.equal(A.submit(command).duplicate,true);
 assert.deepEqual(A.read(),after);
 assert.throws(()=>A.submit({...command,commandId:'another-id',
   expectedRevision:after.revision}),/Only a plain owned recovery item/);
 const guest=B.read();
 const item=guest.players[1].hand[0];
 assert.throws(()=>B.submit({commandId:'wrong-turn',expectedRevision:guest.revision,
   actorId:'B',type:'useItem',instanceId:item.instanceId}),/Not the active seat/);
 const src=VERIFIED_BASIC_CARDS.find(c=>c.id==='i013');
 assert.throws(()=>convertLegacyCard({...src,restoreAmount:9}),/Invalid source-backed coin-flip HP item/);
 for(const params of [
  {heal:10,damage:10,healChance:0.6},
  {heal:10,damage:9,healChance:0.5},
  {heal:10,damage:10,healChance:0.5,unknown:true}
 ]){
  assert.throws(()=>defineCard({id:'bad',family:'item',element:'none',
   drawWeight:1,playModes:['use'],stats:{price:1},
   effects:[{when:'onDeclare',type:'flipHpRisk',params}],
   source:{ruleset:'test',confidence:'test'}}),/Invalid flipHpRisk/);
 }
});
