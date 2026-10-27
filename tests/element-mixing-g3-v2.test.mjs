import test from 'node:test';
import assert from 'node:assert/strict';
import {combineElements,canBlock} from '../src/rules.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {compileOrderedWeaponAttack} from '../v2/ordered-attack.mjs';
import {resolveStagedFixture} from '../v2/room-transition.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const draw={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(cards){
 return createStagingRoom({seats:[
  {id:'A',handDefinitionIds:cards},
  {id:'B',handDefinitionIds:['d015']} // Water guard, sufficient to block fire
 ],firstSeatId:'A'},catalog);
}
function attack(state){
 const ids=state.players[0].hand.map(x=>x.instanceId);
 return applyStagingCommand(state,{type:'playCards',actorId:'A',
  targetId:'B',commandId:'element-a',expectedRevision:state.revision,
  orderedInstanceIds:ids},catalog,{authorizedSeatId:'A'}).state;
}
function defend(state){
 return applyStagingCommand(state,{type:'defend',actorId:'B',
  commandId:'element-b',expectedRevision:state.revision,orderedInstanceIds:[]},
 catalog,{authorizedSeatId:'B'}).state;
}
test('research matrix: different elements yield neutral, same element stays, light with four basic elements is special',()=>{
 const scenarios=[
  ['fire','water','none'],
  ['fire','wood','none'],
  ['none','fire','none'],
  ['fire','none','none'],
  ['fire','fire','fire'],
  ['water','water','water'],
  ['light','fire','fire'],
  ['fire','light','fire'],
  ['light','water','water'],
  ['light','wood','wood'],
  ['light','earth','earth'],
  ['light','light','light'],
  ['light','dark','none'],
  ['dark','fire','none'],
  ['none','none','none']
 ];
 for(const [a,b,result] of scenarios)
  assert.equal(combineElements(a,b),result,`${a} + ${b}`);
});
test('real card pairing: neutral+fire, water+fire, fire+fire, light+fire behave per rule',()=>{
 for(const [cards,element,attackValue] of [
  [['w016','a009'],'none',14],
  [['w021','a009'],'none',5],
  [['w018','a009'],'fire',5],
  [['w024','a009'],'fire',7],
  [['w025','a009'],'none',5],
  [['w021','a010'],'water',2],
  [['w024','a010'],'light',4]
 ]){
  const staged=attack(room(cards)),plan=compileOrderedWeaponAttack(staged,catalog);
  assert.equal(plan.element,element,cards.join('+'));
  assert.equal(plan.attack,attackValue,cards.join('+'));
  const result=resolveStagedFixture(defend(staged),catalog,draw);
  assert.equal(result.state.players[1].hp,40-attackValue,cards.join('+'));
 }
});
test('same fire pairing and fire dye differ from neutral mixing in defensive legality',()=>{
 const a=compileOrderedWeaponAttack(attack(room(['w018','a009'])),catalog);
 const b=compileOrderedWeaponAttack(attack(room(['w016','a009'])),catalog);
 const c=compileOrderedWeaponAttack(attack(room(['w021','a015'])),catalog);
 assert.equal(a.element,'fire');
 assert.equal(b.element,'none');
 assert.equal(c.element,'fire'); // Explicit +ATK fire dye wand overrides water
 assert.equal(canBlock(a.element,'none'),false);
 assert.equal(canBlock(b.element,'none'),true);
 assert.equal(canBlock(c.element,'water'),true);
});
