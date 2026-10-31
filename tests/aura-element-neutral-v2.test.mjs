import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {compileOrderedWeaponAttack} from '../v2/ordered-attack.mjs';
import {resolveStagedFixture} from '../v2/room-transition.mjs';

// Reference: https://ameblo.jp/shibransk/entry-12647363984.html
// Aura makes ordinary weapons neutral; later wands can explicitly dye them:
// https://w.atwiki.jp/gfplusa/pages/19.html
const {byId:catalog}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001'};
function create(cards,defense){
 return createStagingRoom({seats:[
  {id:'A',handDefinitionIds:cards},
  {id:'B',handDefinitionIds:defense}
 ],firstSeatId:'A'},catalog);
}
function send(state,actorId,selection,type){
 const actor=state.players.find(p=>p.id===actorId);
 return applyStagingCommand(state,{type,actorId,
  commandId:'aura-neutral-'+actorId+'-'+state.revision,
  expectedRevision:state.revision,
  ...(type==='playCards'?{targetId:'B'}:{}),
  orderedInstanceIds:selection.map(i=>actor.hand[i].instanceId)
 },catalog,{authorizedSeatId:actorId}).state;
}
function attack(cards,defender=[],attackOrder=cards.map((_,i)=>i),defendOrder=[]){
 const start=create(cards,defender);
 const before=JSON.stringify(start);
 const pending=send(start,'A',attackOrder,'playCards');
 const plan=compileOrderedWeaponAttack(pending,catalog);
 const result=resolveStagedFixture(send(pending,'B',defendOrder,'defend'),catalog,fixture).state;
 assert.equal(JSON.stringify(start),before,'source room must remain immutable');
 return {plan,result};
}
test('fire sword + Aura is neutral: a same-fire shield can block it',()=>{
 const {plan,result}=attack(['w018','m004'],['d014'],[0,1],[0]);
 assert.equal(plan.attack,2);
 assert.equal(plan.element,'none');
 assert.equal(plan.payableMP,6);
 assert.equal(result.players[1].hp,40);
 assert.equal(result.players[0].mp,4);
 assert.deepEqual(result.players[0].learned,['m004']);
});
test('water sword + Aura is neutral: a same-water shield can block it',()=>{
 const {plan,result}=attack(['w021','m004'],['d015'],[0,1],[0]);
 assert.equal(plan.attack,2);
 assert.equal(plan.element,'none');
 assert.equal(result.players[1].hp,40);
});
test('light weapon + Aura becomes neutral, so non-elemental armor can block',()=>{
 const {plan,result}=attack(['w024','m004'],['d001'],[0,1],[0]);
 assert.equal(plan.attack,6);
 assert.equal(plan.element,'none');
 assert.equal(result.players[1].hp,35);
});
test('dark weapon + Aura cannot retain instant-kill darkness',()=>{
 const {plan,result}=attack(['w025','m004']);
 assert.equal(plan.attack,2);
 assert.equal(plan.element,'none');
 assert.equal(result.players[1].hp,38);
 assert.equal(result.phase,'turn');
});
test('weapon + Aura + water wand is water, not neutral, due to explicit later dye',()=>{
 const {plan,result}=attack(['w018','m004','a014'],['d014'],[0,1,2],[0]);
 assert.equal(plan.attack,12);
 assert.equal(plan.element,'water');
 assert.equal(result.players[1].hp,31);
 assert.equal(result.players[0].mp,4);
});
test('unverified elemental wand before Aura still rejects atomically',()=>{
 const s=create(['w018','a014','m004'],['d001']);
 const pending=send(s,'A',[0,1,2],'playCards'),before=JSON.stringify(pending);
 assert.throws(()=>compileOrderedWeaponAttack(pending,catalog),/Attribute wand before Aura/);
 assert.equal(JSON.stringify(pending),before);
});
