import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
const dark=[
 ['w051','コブラ',3,10],
 ['w052','さよならの剣',4,10],
 ['w053','キラーフォーク',5,10],
 ['w054','死神のカマ',10,20]
];
function room(a,b){
 const initialState=createStagingRoom({
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}],
  firstSeatId:'A',rulesetId:'partial-reference-v2-lab',rngSeed:71
 },catalog);
 const host=createLocalRoomHostFixture({initialState,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function play(endpoint,type,index=0){
 const v=endpoint.read(),seat=v.activePlayerId;
 const command={
  commandId:'g7-'+seat+'-'+type+'-'+v.revision,
  expectedRevision:v.revision,actorId:seat,type,
  orderedInstanceIds:index===null?[]:[v.players.find(p=>p.id===seat).hand[index].instanceId]
 };
 if(type==='playCards')command.targetId=seat==='A'?'B':'A';
 return endpoint.submit(command);
}
test('five sourced definitions add exactly five partial reference slots, not a full 500 deck',()=>{
 assert.equal(summary.unique,125);
 assert.equal(summary.slots,314);
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
 assert.equal(summary.complete,false);
 for(const [id,name,attack,price] of dark){
  const src=VERIFIED_BASIC_CARDS.find(c=>c.id===id),def=catalog.get(id);
  assert.equal(src.referenceName,name);
  assert.equal(src.category,'weapon_single');
  assert.equal(src.weight,1);
  assert.equal(def.element,'dark');
  assert.equal(def.stats.attack,attack);
  assert.equal(def.stats.price,price);
  assert.deepEqual(def.effects,[]);
  assert.deepEqual(def.playModes,['mainAttack']);
 }
 const sheath=catalog.get('w055');
 assert.equal(sheath.element,'none');
 assert.equal(sheath.stats.attack,13);
 assert.equal(sheath.stats.guard,1);
 assert.equal(sheath.stats.price,3);
 assert.equal(sheath.drawWeight,1);
 assert.deepEqual(sheath.playModes,['mainAttack','defend']);
});
test('every new dark main weapon instant defeats on an unblocked positive hit',()=>{
 for(const [id] of dark){
  const {A,B}=room([id],['d001']);
  play(A,'playCards');
  const reveal=B.read().pending.declaredAttack;
  assert.equal(reveal.cards[0].definitionId,id);
  assert.equal(reveal.cards[0].element,'dark');
  play(B,'defend',null);
  const end=A.read();
  assert.equal(end.phase,'finished',id);
  assert.equal(end.winnerId,'A',id);
  assert.equal(end.players[1].hp,0,id);
 }
});
test('matching neutral shield can block all dark damage and prevent instant defeat',()=>{
 const {A,B}=room(['w051'],['d003']);
 play(A,'playCards');
 play(B,'defend',0);
 const v=A.read();
 assert.equal(v.players[1].hp,40);
 assert.equal(v.phase,'turn');
 assert.equal(v.activePlayerId,'B');
});
test('partial defense against dark damage does not suppress fatal dark attribute',()=>{
 const {A,B}=room(['w054'],['d003']);
 play(A,'playCards');
 play(B,'defend',0);
 assert.equal(B.read().players[1].hp,0);
 assert.equal(B.read().winnerId,'A');
});
test('ordinary dual-use sheath works for attack and defense without bespoke name conditions',()=>{
 {
  const {A,B}=room(['w055'],['d001']);
  play(A,'playCards');
  play(B,'defend',null);
  assert.equal(B.read().players[1].hp,27);
 }
 {
  const {A,B}=room(['w016'],['w055']);
  play(A,'playCards');
  play(B,'defend',0);
  assert.equal(A.read().players[1].hp,31);
 }
});
