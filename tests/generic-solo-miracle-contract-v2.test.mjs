/**
 * G3/G4 contract: every plain offensive miracle in the CURRENT partial catalog
 * automatically receives end-to-end attack, recast and MP-failure coverage.
 * When another card of the same schema is registered, no new test code is
 * required. Explicit special effects need dedicated sourced golden cases.
 *
 * Original rules: https://w.atwiki.jp/gfplusa/pages/19.html
 * - Using a miracle teaches it; learned miracles can be recast for MP
 * - A recast grants one replacement card
 * - Learned limit is six, oldest is evicted when a seventh is acquired
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {MAX_LEARNED_MIRACLES} from '../src/rules.mjs';

const {byId:catalog,definitions}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001'};

// This intentionally selects by EFFECT SHAPE, never by particular card ID.
// A miracle with probability/status/redirect effects must be tested separately.
const plainSolo=definitions.filter(d=>d.family==='miracle'&&
 d.playModes.includes('cast')&&d.stats.attack>0&&d.effects.length===0);
function room({hand=['d001'],learned=[],mp=10}={}){
 const s=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:hand},{id:'B',handDefinitionIds:[]}
 ],firstSeatId:'A'},catalog);
 s.players[0].learned=[...learned];
 s.players[0].mp=mp;
 return s;
}
function command(state,actorId,type,more={}){
 const actor=state.players.find(p=>p.id===actorId);
 return submitAndResolveFixture(state,{
  commandId:'generic-'+actorId+'-'+state.revision,
  actorId,type,expectedRevision:state.revision,
  ...(type==='playCards'?{targetId:'B',orderedInstanceIds:[actor.hand[0].instanceId]}:{}),
  ...(type==='castLearned'?{targetId:'B',learnedDefinitionId:more.learnedDefinitionId}:{}),
  ...(type==='defend'?{orderedInstanceIds:[]}: {})
 },catalog,{...fixture,authorizedSeatId:actorId});
}
function hpAfter(def){
 // Darkness is an original game instant defeat at positive damage.
 return def.element==='dark'?0:Math.max(0,40-def.stats.attack);
}
test('all known generic solo miracles are covered by the effect-shape suite',()=>{
 for(const id of ['m002','m003','m008','m009','m010','m011']){
  assert.ok(plainSolo.some(d=>d.id===id),'Missing coverage of '+id);
 }
 assert.equal(plainSolo.length,new Set(plainSolo.map(d=>d.id)).size);
});
for(const def of plainSolo){
 test(def.id+': first hand cast learns, pays MP and refills atomically',()=>{
  const input=room({hand:[def.id],mp:def.stats.mpCost+3});
  const frozen=JSON.stringify(input);
  const intent=command(input,'A','playCards');
  assert.equal(intent.state.phase,'defense');
  const settled=command(intent.state,'B','defend').state;
  assert.equal(settled.players[1].hp,hpAfter(def));
  assert.equal(settled.players[0].mp,3);
  assert.deepEqual(settled.players[0].learned,[def.id]);
  assert.deepEqual(settled.players[0].hand.map(c=>c.definitionId),['d001']);
  assert.equal(settled.phase,hpAfter(def)===0?'finished':'turn');
  assert.equal(JSON.stringify(input),frozen);
 });
 test(def.id+': learned cast costs MP, draws one and retains the initial hand',()=>{
  const input=room({hand:['d001'],learned:[def.id],mp:def.stats.mpCost+3});
  const firstCardId=input.players[0].hand[0].instanceId;
  const intent=command(input,'A','castLearned',{learnedDefinitionId:def.id});
  const settled=command(intent.state,'B','defend').state;
  assert.equal(settled.players[1].hp,hpAfter(def));
  assert.equal(settled.players[0].mp,3);
  assert.deepEqual(settled.players[0].learned,[def.id]);
  assert.equal(settled.players[0].hand.length,2);
  assert.equal(settled.players[0].hand[0].instanceId,firstCardId);
 });
 test(def.id+': insufficient MP fails without spending a card or mutating state',()=>{
  const input=room({hand:[def.id],mp:def.stats.mpCost-1});
  const snapshot=JSON.stringify(input);
  assert.throws(()=>command(input,'A','playCards'),/Not enough MP/);
  assert.equal(JSON.stringify(input),snapshot);
 });
}
test('seventh learned miracle forgets earliest, retains latest six in order',()=>{
 const six=['m001','m002','m003','m004','m005','m006'];
 assert.equal(six.length,MAX_LEARNED_MIRACLES);
 const input=room({hand:['m008'],learned:six,mp:10});
 const stage=command(input,'A','playCards');
 const completed=command(stage.state,'B','defend').state;
 assert.equal(completed.players[0].learned.length,MAX_LEARNED_MIRACLES);
 assert.deepEqual(completed.players[0].learned,[...six.slice(1),'m008']);
 assert.equal(input.players[0].learned[0],'m001',
   'the prior snapshot must remain unchanged');
});
test('recasting an already learned miracle does not move it or evict a slot',()=>{
 const six=['m001','m002','m003','m004','m005','m006'];
 const input=room({hand:['d001'],learned:six,mp:10});
 const stage=command(input,'A','castLearned',{learnedDefinitionId:'m002'});
 const completed=command(stage.state,'B','defend').state;
 assert.deepEqual(completed.players[0].learned,six);
 assert.equal(completed.players[0].hand.length,2);
 assert.equal(completed.players[0].mp,8);
});
