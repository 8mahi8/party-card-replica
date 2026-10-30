import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {CATEGORY_DISTRIBUTION,ELEMENTS} from '../src/rules.mjs';
import {auditCatalog} from '../src/catalog-audit.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

// Independently transcribed, cross-checked reference snapshot.
// Piong / GFGA armor tables + 2026 Macaron artifact list.
// Exclude contradictory card labels/elements and effect-bearing armors.
const reviewed=[
  [
    "d030",
    "はがねのよろい",
    "none",
    9,
    9,
    6
  ],
  [
    "d031",
    "エナジーヘルム",
    "none",
    10,
    10,
    4
  ],
  [
    "d032",
    "エナジーアーマー",
    "none",
    11,
    10,
    4
  ],
  [
    "d033",
    "コアバリヤー",
    "none",
    12,
    10,
    2
  ],
  [
    "d034",
    "コアプロテクター",
    "none",
    13,
    10,
    2
  ],
  [
    "d035",
    "フレイムシールド",
    "fire",
    5,
    10,
    1
  ],
  [
    "d036",
    "バーニングシールド",
    "fire",
    7,
    10,
    1
  ],
  [
    "d037",
    "バーニングジャケット",
    "fire",
    8,
    10,
    1
  ],
  [
    "d038",
    "陽炎のよろい",
    "fire",
    12,
    15,
    1
  ],
  [
    "d039",
    "アクアシューズ",
    "water",
    1,
    2,
    1
  ],
  [
    "d040",
    "アクアグローブ",
    "water",
    2,
    4,
    1
  ],
  [
    "d041",
    "アイスヘルム",
    "water",
    4,
    8,
    1
  ],
  [
    "d042",
    "アイスシールド",
    "water",
    5,
    10,
    1
  ],
  [
    "d043",
    "アイスアーマー",
    "water",
    6,
    10,
    1
  ],
  [
    "d044",
    "スノーミトン",
    "water",
    7,
    10,
    1
  ],
  [
    "d045",
    "スノーマスク",
    "water",
    8,
    10,
    1
  ],
  [
    "d046",
    "草かんむり",
    "wood",
    1,
    2,
    1
  ],
  [
    "d047",
    "木の盾",
    "wood",
    2,
    4,
    1
  ],
  [
    "d048",
    "御神木の小手",
    "wood",
    3,
    6,
    1
  ],
  [
    "d049",
    "林の盾",
    "wood",
    4,
    8,
    1
  ],
  [
    "d050",
    "樹脂で編んだ法衣",
    "wood",
    5,
    10,
    1
  ],
  [
    "d051",
    "コハクの胸当て",
    "wood",
    8,
    10,
    1
  ],
  [
    "d052",
    "岩盤",
    "earth",
    2,
    4,
    1
  ],
  [
    "d053",
    "結晶板",
    "earth",
    3,
    6,
    1
  ],
  [
    "d054",
    "大地のくつ",
    "earth",
    4,
    8,
    1
  ],
  [
    "d055",
    "大地の小手",
    "earth",
    5,
    10,
    1
  ],
  [
    "d056",
    "大地のかぶと",
    "earth",
    6,
    10,
    1
  ],
  [
    "d057",
    "大地のよろい",
    "earth",
    8,
    10,
    1
  ],
  [
    "d058",
    "ぴかぴかハイヒール",
    "light",
    6,
    15,
    1
  ],
  [
    "d059",
    "きらきらドレス",
    "light",
    10,
    15,
    1
  ]
];
const {byId:catalog,summary}=migrateLegacyCatalog();
function battle(attackDefinitionId,armorDefinitionId){
 const state=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:[attackDefinitionId]},
  {id:'B',handDefinitionIds:[armorDefinitionId]}
 ],firstSeatId:'A',rngSeed:71,rulesetId:'partial-reference-v2-lab'},catalog);
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 const A=host.connectSeatFixture('A'),B=host.connectSeatFixture('B');
 const first=A.read();
 A.submit({commandId:'a-1',expectedRevision:first.revision,type:'playCards',actorId:'A',targetId:'B',orderedInstanceIds:[first.players[0].hand[0].instanceId]});
 const pending=B.read();
 const reply={commandId:'b-1',expectedRevision:pending.revision,type:'defend',actorId:'B',
  orderedInstanceIds:[pending.players[1].hand[0].instanceId]};
 return {A,B,pending,reply};
}
test('all 30 reference-reviewed plain armors retain exact guard, price, element and source slot count',()=>{
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[155,357,false]);
 assert.equal(reviewed.length,30);
 const ids=new Set();
 for(const [id,name,element,guard,price,weight] of reviewed){
  assert(!ids.has(id));ids.add(id);
  const physical=VERIFIED_BASIC_CARDS.find(c=>c.id===id),def=catalog.get(id);
  assert(physical,id);
  assert.equal(physical.referenceName,name,id);
  assert.equal(physical.kind,'armor',id);
  assert.equal(physical.category,'armor_normal',id);
  assert.equal(physical.element,element,id);
  assert.equal(physical.guard,guard,id);
  assert.equal(physical.price,price,id);
  assert.equal(physical.weight,weight,id);
  assert.deepEqual(def.playModes,['defend'],id);
  assert.equal(def.element,element,id);
  assert.equal(def.stats.guard,guard,id);
  assert.equal(def.stats.price,price,id);
  assert.equal(def.drawWeight,weight,id);
  assert.deepEqual(def.effects,[],id);
 }
});
test('partial deck still fails full 353/500 draw audit and never overfills a known armor attribute cell',()=>{
 const subset=VERIFIED_BASIC_CARDS.map(c=>({
  id:c.id,category:c.category,element:c.element,weight:c.weight
 }));
 const report=auditCatalog(subset);
 assert.equal(report.complete,false);
 assert.equal(report.unique,155);
 assert.equal(report.slots,357);
 for(const m of report.mismatches)
  assert(m.delta<=0,`Exceeded source category cell: ${m.category}/${m.element}`);
 const sums=new Map(ELEMENTS.map(x=>[x,0]));
 for(const [id,,, , ,weight] of reviewed){
  const def=catalog.get(id);sums.set(def.element,sums.get(def.element)+weight);
 }
 assert.equal(sums.get('none'),18);
 assert.equal(sums.get('fire'),4);
 assert.equal(sums.get('water'),7);
 assert.equal(sums.get('wood'),6);
 assert.equal(sums.get('earth'),6);
 assert.equal(sums.get('light'),2);
});
test('neutral high-grade armor blocks non-elemental weapon using shared defense resolution',()=>{
 const {A,B,reply}=battle('w016','d034');
 B.submit(reply);
 const result=A.read();
 assert.equal(result.players[1].hp,40);
 assert.equal(result.activePlayerId,'B');
});
test('water armor blocks fire and fire armor blocks water in actual two-seat engine',()=>{
 for(const [weapon,shield] of [['w018','d043'],['w021','d035']]){
  const {A,B,reply}=battle(weapon,shield);
  B.submit(reply);
  assert.equal(A.read().players[1].hp,40,`${weapon} v ${shield}`);
 }
});
test('wood armor blocks earth and earth armor blocks wood in actual two-seat engine',()=>{
 for(const [weapon,shield] of [['w023','d051'],['w022','d057']]){
  const {A,B,reply}=battle(weapon,shield);
  B.submit(reply);
  assert.equal(A.read().players[1].hp,40,`${weapon} v ${shield}`);
 }
});
test('light armor blocks elemental attacks but does not falsely stop a light attack',()=>{
 const {A,B,reply}=battle('w018','d059');
 B.submit(reply);
 assert.equal(A.read().players[1].hp,40);
 const other=battle('w024','d058');
 const before=other.B.read();
 assert.throws(()=>other.B.submit(other.reply),/incompatible|Illegal shield/);
 assert.deepEqual(other.B.read(),before,'invalid shield must not consume cards or move turn');
});
test('new neutral armor can fully protect against dark-element instant defeat',()=>{
 const {A,B,reply}=battle('w051','d030');
 B.submit(reply);
 const v=A.read();
 assert.equal(v.players[1].hp,40);
 assert.equal(v.phase,'turn');
});
