import test from 'node:test';
import assert from 'node:assert/strict';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {findVerifiedBasicCard} from '../src/verified-basic-cards.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';

// Source evidence: https://w.atwiki.jp/piong/pages/20.html
// Independent reference: https://w.atwiki.jp/gfplusa/pages/19.html
const spells=[
 {id:'m008',name:'炎',element:'fire',attack:10,mp:5,defense:'d015',guard:3},
 {id:'m009',name:'大木',element:'wood',attack:6,mp:3,defense:'d017',guard:1},
 {id:'m010',name:'岩',element:'earth',attack:8,mp:4,defense:'d016',guard:6},
 {id:'m011',name:'滝',element:'water',attack:25,mp:12,defense:'d014',guard:3}
];
const {byId:catalog,summary}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(A,B,{mp=20,learned=[]}={}){
 const state=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:A},
  {id:'B',handDefinitionIds:B}
 ],firstSeatId:'A'},catalog);
 state.players[0].mp=mp;
 state.players[0].learned=[...learned];
 return state;
}
function send(s,actorId,type,{indices=[],learnedDefinitionId}={}){
 const actor=s.players.find(p=>p.id===actorId);
 const command={
  commandId:'solo-'+actorId+'-'+s.revision,
  expectedRevision:s.revision,actorId,type,
  ...(['playCards','castLearned'].includes(type)?{targetId:'B'}:{}),
  ...(type==='castLearned'?{learnedDefinitionId}:{
    orderedInstanceIds:indices.map(i=>actor.hand[i].instanceId)
  })
 };
 return submitAndResolveFixture(s,command,catalog,{...fixture,authorizedSeatId:actorId});
}

test('the four new cards are exact, distinct 0.2%-weight miracle definitions',()=>{
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
 assert.equal(summary.complete,false,'this is not an audited full deck');
 for(const m of spells){
  const raw=findVerifiedBasicCard(m.id),def=catalog.get(m.id);
  assert.equal(raw.referenceName,m.name);
  assert.equal(raw.kind,'miracle');
  assert.equal(raw.attack,m.attack);
  assert.equal(raw.mpCost,m.mp);
  assert.equal(raw.weight,1);
  assert.equal(raw.price,0);
  assert.equal(raw.element,m.element);
  assert.equal(def.family,'miracle');
  assert.equal(def.stats.attack,m.attack);
  assert.equal(def.stats.mpCost,m.mp);
  assert.equal(def.element,m.element);
  assert.deepEqual(def.playModes,['cast']);
  assert.deepEqual(def.effects,[]);
 }
});
for(const m of spells){
 test(m.name+': hand cast pays MP, honors elemental armor, learns the spell and refills',()=>{
  const original=room([m.id],[m.defense],{mp:20}),before=JSON.stringify(original);
  const pending=send(original,'A','playCards',{indices:[0]});
  assert.equal(pending.autoResolved,false);
  assert.equal(pending.state.phase,'defense');
  const resolved=send(pending.state,'B','defend',{indices:[0]});
  const state=resolved.state;
  assert.equal(resolved.autoResolved,true);
  assert.equal(state.phase,'turn');
  assert.equal(state.activePlayerId,'B');
  assert.equal(state.players[1].hp,40-(m.attack-m.guard));
  assert.equal(state.players[0].mp,20-m.mp);
  assert.deepEqual(state.players[0].learned,[m.id]);
  assert.deepEqual(state.players[0].hand.map(c=>c.definitionId),['d001']);
  assert.deepEqual(state.players[1].hand.map(c=>c.definitionId),['d001']);
  assert.equal(JSON.stringify(original),before);
 });
 test(m.name+': learned recast consumes MP and grants one draw without consuming hand',()=>{
  const original=room(['d001'],[],{mp:20,learned:[m.id]});
  const first=send(original,'A','castLearned',{learnedDefinitionId:m.id});
  assert.equal(first.state.phase,'defense');
  const state=send(first.state,'B','defend').state;
  assert.equal(state.players[1].hp,40-m.attack);
  assert.equal(state.players[0].mp,20-m.mp);
  assert.deepEqual(state.players[0].learned,[m.id]);
  assert.equal(state.players[0].hand.length,2);
  assert.equal(state.players[0].hand[0].instanceId,original.players[0].hand[0].instanceId);
 });
 test(m.name+': insufficient MP refuses the hand miracle atomically',()=>{
  const state=room([m.id],[],{mp:m.mp-1}),snapshot=JSON.stringify(state);
  assert.throws(()=>send(state,'A','playCards',{indices:[0]}),/Not enough MP/);
  assert.equal(JSON.stringify(state),snapshot);
 });
}
test('Spirit immediately after waterfall waives all MP12; remote target still takes water damage',()=>{
 const state=room(['m011','i003'],[],{mp:0});
 const pending=send(state,'A','playCards',{indices:[0,1]});
 assert.equal(pending.state.phase,'defense');
 const done=send(pending.state,'B','defend').state;
 assert.equal(done.players[1].hp,15);
 assert.equal(done.players[0].mp,0);
 assert.deepEqual(done.players[0].learned,['m011']);
 assert.deepEqual(done.players[0].hand.map(x=>x.definitionId),['d001','d001']);
});
test('standalone attack miracle is not silently combined with Strength Powder',()=>{
 const state=room(['m008','i004'],[]),before=JSON.stringify(state);
 assert.throws(()=>send(state,'A','playCards',{indices:[0,1]}),
  /Only one miracle and optional spirit|Not a structural attack selection|Only spirit directly after miracle is supported/);
 assert.equal(JSON.stringify(state),before);
});
test('hotseat touch UI exposes Flame and can attack without selecting a weapon',()=>{
 const controller=createV2LabController({hands:{A:['m008'],B:['d015']}});
 const a=controller.reveal();
 assert.match(a.hand[0].label,/炎/);
 assert.match(a.hand[0].label,/攻10/);
 assert.match(a.hand[0].label,/MP5/);
 assert.match(renderV2LabMarkup(a),/炎/);
 controller.toggle({instanceId:a.hand[0].instanceId});
 assert.equal(controller.submit().ok,true);
 assert.equal(controller.view().phase,'defense');
 const b=controller.reveal();
 controller.toggle({instanceId:b.hand[0].instanceId});
 assert.equal(controller.submit().ok,true);
 const end=controller.labSnapshot();
 assert.equal(end.players[1].hp,33);
 assert.equal(end.players[0].mp,5);
 assert.deepEqual(end.players[0].learned,['m008']);
 assert.equal(controller.view().revealed,false,'handoff must conceal the next hand');
});
