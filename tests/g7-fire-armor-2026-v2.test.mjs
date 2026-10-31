import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {compareHistoricalDeckClaims} from '../src/catalog-source-compare.mjs';
import {auditCatalog,createAuditedDraw} from '../src/catalog-audit.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
const SOURCE=Object.freeze([
 ['d060','火花の手袋',2,4,1],
 ['d061','フレイムメイル',4,8,1],
 ['d062','フレイムアーマー',6,10,1]
]);
function duel({attack='w041',defense=['d060','d061','d062','w016']}={}){
 const room=createStagingRoom({firstSeatId:'A',rngSeed:71,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:[attack,'d035','w016','i006']},
         {id:'B',handDefinitionIds:defense}]},catalog);
 const host=createLocalRoomHostFixture({initialState:room,catalog});
 const A=host.connectSeatFixture('A'),B=host.connectSeatFixture('B');
 const attackId=A.read().players[0].hand[0].instanceId;
 A.submit({actorId:'A',type:'playCards',commandId:'fire-a-1',
  expectedRevision:A.read().revision,targetId:'B',orderedInstanceIds:[attackId]});
 const defend=ids=>{
  const v=B.read(),own=v.players[1];
  return B.submit({actorId:'B',type:'defend',commandId:'fire-b-1',
   expectedRevision:v.revision,orderedInstanceIds:ids.map(id=>
    own.hand.find(c=>c.definitionId===id).instanceId)});
 };
 return {A,B,defend};
}
test('2026 labels and source-agreed numeric fire armor data are three distinct plain definitions',()=>{
 for(const [id,name,guard,price,weight]of SOURCE){
  const raw=VERIFIED_BASIC_CARDS.find(c=>c.id===id);
  const def=catalog.get(id);
  assert.deepEqual(
   [raw?.referenceName,raw?.kind,raw?.element,raw?.guard,raw?.price,raw?.weight],
   [name,'armor','fire',guard,price,weight]);
  assert.deepEqual(def.playModes,['defend']);
  assert.equal(def.stats.guard,guard);
  assert.equal(def.stats.price,price);
  assert.equal(def.drawWeight,1);
  assert.deepEqual(def.effects,[]);
 }
 assert.equal(new Set(SOURCE.map(x=>x[0])).size,3);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[179,440,false]);
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
});
test('one sourced fire shield reduces water-element attack, using common defense rules',()=>{
 const {A,B,defend}=duel();
 defend(['d060']);
 const state=A.read();
 assert.equal(state.players[1].hp,38,'water attack 4 - guard 2 = 2 damage');
 assert.equal(B.read().players[1].hand.length,4,'one played shield replenished once');
 assert.equal(state.activePlayerId,'B');
 assert.equal(B.read().players[0].hand,undefined);
});
test('another fire shield fully blocks and two new fire shields stack, without special cases',()=>{
 for(const names of [['d061'],['d062'],['d060','d061']]){
  const {A,B,defend}=duel();
  defend(names);
  const state=A.read();
  assert.equal(state.players[1].hp,40,names.join('+'));
  assert.equal(B.read().players[1].hand.length,4,'spent shield cards must refill');
  assert.equal(state.activePlayerId,'B');
 }
});
test('fire shields cannot block fire-element attacks; rejected defense keeps room unchanged',()=>{
 const {A,B,defend}=duel({attack:'w039'});
 const prior=JSON.stringify(A.read());
 assert.throws(()=>defend(['d060']),/incompatible|Illegal shield/);
 assert.equal(JSON.stringify(A.read()),prior);
});
test('sourced additions increase the diagnostic armor count but never authorize a fake full deck',()=>{
 const report=compareHistoricalDeckClaims(VERIFIED_BASIC_CARDS);
 assert.equal(report.unique,179);
 assert.equal(report.slots,440);
 assert.deepEqual(report.actualGroups,{trade:60,weapon:154,armor:133,miracle:16,item:77});
 const a=report.comparisons.find(x=>x.key==='wiki-2025-09-19');
 const b=report.comparisons.find(x=>x.key==='player-study-2024-11-06');
 assert.deepEqual([a.missingKinds,a.remainingSlots,a.kindCountPossible],[174,60,false]);
 assert.deepEqual([b.missingKinds,b.remainingSlots,b.kindCountPossible],[58,60,true]);
 assert.equal(report.categoryCells.armor_normal.fire,8);
 assert.equal(report.categoryCells.weapon_single.none,122,'unrelated source mismatch untouched');
 assert.equal(a.typedCellOverflows.length,1);
 assert.equal(auditCatalog(VERIFIED_BASIC_CARDS).complete,false);
 assert.throws(()=>createAuditedDraw(VERIFIED_BASIC_CARDS),/Catalog incomplete/);
});
