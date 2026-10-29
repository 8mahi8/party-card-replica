/**
 * Sourced vanilla weapon intake, 2026-10-29.
 * Piong AtWiki single/extra weapon table updated 2026-03-18:
 * https://w.atwiki.jp/piong/pages/15.html
 * Independent comparison: GFGA (2024-06-17):
 * https://w.atwiki.jp/gfplusa/pages/18.html
 *
 * Explicit independent per-card facts. These 22 cards have no documented
 * effects besides their ordinary attacks and source-listed elements.
 * Never silently convert lifesteal, status, multi-hit or random-target
 * weapons into vanilla attacks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS,findVerifiedBasicCard} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {compileBasicWeaponAttack} from '../v2/basic-resolution.mjs';
import {resolveBasicFixture} from '../v2/basic-resolution.mjs';
import {auditCatalog,createAuditedDraw} from '../src/catalog-audit.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
const MAIN=[
 ['w032','グラビティメイス',11,4,4,'none'],
 ['w033','もろぶっこみアクス',12,4,4,'none'],
 ['w034','絶景のヤリ',13,5,4,'none'],
 ['w035','暴れフレイル',14,5,3,'none'],
 ['w036','ドラゴンクロウ',15,5,3,'none'],
 ['w037','あちちナイフ',2,2,1,'fire'],
 ['w038','燃えムチ',3,3,1,'fire'],
 ['w039','ブレイズブレイド',5,5,1,'fire'],
 ['w040','火竜一角',8,10,1,'fire'],
 ['w041','氷結ハンマー',4,4,1,'water'],
 ['w042','水竜一角',8,10,1,'water'],
 ['w043','いばらのムチ',2,2,1,'wood'],
 ['w044','いがナッツ',3,3,1,'wood'],
 ['w045','ダイヤモンドソード',13,25,1,'earth'],
 ['w046','ジャスティスランス',5,5,1,'light'],
 ['w047','聖剣',9,15,1,'light']
];
const ADD=[
 ['a016','恐怖の車輪',11,10,1,'none'],
 ['a017','独楽コンバット',13,10,1,'none'],
 ['a018','葉っぱ手裏剣',2,3,1,'wood'],
 ['a019','熟成ゴムの弓',3,6,1,'wood'],
 ['a020','旧石器ジャベリン',5,4,1,'earth'],
 ['a021','新石器トマホーク',7,10,1,'earth']
];
function runOne(id){
 const state=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:[id]},
  {id:'B',handDefinitionIds:['d001']}
 ],firstSeatId:'A',rngSeed:55},catalog);
 const pre=JSON.stringify(state);
 const offered=state.players[0].hand[0].instanceId;
 const staged=applyStagingCommand(state,{
  commandId:'verified-simple-attack',actorId:'A',expectedRevision:state.revision,
  type:'playCards',targetId:'B',orderedInstanceIds:[offered]
 },catalog,{authorizedSeatId:'A'}).state;
 const defending=applyStagingCommand(staged,{
  commandId:'verified-no-defense',actorId:'B',expectedRevision:staged.revision,
  type:'defend',orderedInstanceIds:[]
 },catalog,{authorizedSeatId:'B'}).state;
 const plan=compileBasicWeaponAttack(defending,catalog);
 const resolved=resolveBasicFixture(defending,catalog,{
  labOnly:true,fixtureDrawDefinitionId:'d001'
 });
 assert.equal(JSON.stringify(state),pre,'physical source state remains unchanged');
 assert.equal(resolved.state.phase,'turn');
 assert.equal(resolved.state.activePlayerId,'B');
 assert.deepEqual(resolved.state.players[0].hand.map(c=>c.definitionId),['d001']);
 assert.deepEqual(resolved.state.players[1].hand.map(c=>c.definitionId),['d001']);
 return {plan,resolved};
}
for(const [id,name,attack,price,weight,element] of MAIN){
 test('source-matched normal weapon '+id+' '+name+' works end-to-end',()=>{
  const raw=findVerifiedBasicCard(id),def=catalog.get(id);
  assert.equal(raw.referenceName,name);
  assert.equal(raw.kind,'weapon');assert.equal(raw.slot,'main');
  assert.equal(raw.attack,attack);assert.equal(raw.price,price);
  assert.equal(raw.weight,weight);assert.equal(raw.element,element);
  assert.equal(def.family,'weapon');assert.deepEqual(def.playModes,['mainAttack']);
  assert.equal(def.stats.attack,attack);assert.equal(def.stats.price,price);
  assert.equal(def.drawWeight,weight);assert.equal(def.effects.length,0);
  const {plan,resolved}=runOne(id);
  assert.equal(plan.attack,attack);assert.equal(plan.element,element);
  assert.equal(resolved.state.players[1].hp,40-attack);
 });
}
for(const [id,name,attack,price,weight,element] of ADD){
 test('source-matched additive-only weapon '+id+' '+name+' works end-to-end',()=>{
  const raw=findVerifiedBasicCard(id),def=catalog.get(id);
  assert.equal(raw.referenceName,name);assert.equal(raw.slot,'addon');
  assert.equal(raw.kind,'weapon');assert.equal(raw.attack,attack);
  assert.equal(raw.price,price);assert.equal(raw.weight,weight);
  assert.equal(raw.element,element);
  assert.equal(def.family,'weapon');assert.deepEqual(def.playModes,['addAttack']);
  assert.equal(def.stats.attack,attack);assert.equal(def.drawWeight,weight);
  assert.equal(def.effects.length,0);
  const {plan,resolved}=runOne(id);
  assert.equal(plan.attack,attack);
  assert.equal(plan.element,element);
  assert.equal(resolved.state.players[1].hp,40-attack);
 });
}
test('mixed main and vanilla add-ons share one engine (no per-name branching)',()=>{
 const state=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['w033','a016','a017']},
  {id:'B',handDefinitionIds:['d001']}
 ],firstSeatId:'A',rngSeed:58},catalog);
 const staged=applyStagingCommand(state,{
  commandId:'new-mixed',actorId:'A',expectedRevision:0,type:'playCards',
  targetId:'B',orderedInstanceIds:state.players[0].hand.map(c=>c.instanceId)
 },catalog,{authorizedSeatId:'A'}).state;
 const defended=applyStagingCommand(staged,{
  commandId:'new-mixed-def',actorId:'B',expectedRevision:1,type:'defend',
  orderedInstanceIds:state.players[1].hand.map(c=>c.instanceId)
 },catalog,{authorizedSeatId:'B'}).state;
 const plan=compileBasicWeaponAttack(defended,catalog);
 assert.equal(plan.attack,36);
 assert.equal(plan.element,'none');
 const after=resolveBasicFixture(defended,catalog,{labOnly:true,fixtureDrawDefinitionId:'d001'});
 assert.equal(after.state.players[1].hp,5); // 12+11+13 - 1 guard
 assert.deepEqual(after.state.players[0].hand.map(c=>c.definitionId),['d001','d001','d001']);
});
test('22 new definitions preserve independent partial-contract snapshot and prevent real random draws',()=>{
 const all=[...MAIN,...ADD];
 assert.equal(all.length,22);
 assert.equal(new Set(all.map(x=>x[0])).size,22);
 assert.equal(all.reduce((n,row)=>n+row[4],0),35);
 assert.equal(VERIFIED_BASIC_CARDS.length,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
 assert.equal(RESEARCH_CATALOG_CONTRACT.complete,false);
 const audited=auditCatalog(VERIFIED_BASIC_CARDS);
 assert.equal(audited.unique,116);assert.equal(audited.slots,305);
 assert.equal(audited.complete,false);
 assert.throws(()=>createAuditedDraw(VERIFIED_BASIC_CARDS),/Catalog incomplete/);
});
