import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {compileOrderedWeaponAttack} from '../v2/ordered-attack.mjs';
import {resolveStagedFixture,submitAndResolveFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(hands){
 return createStagingRoom({
   seats:Object.entries(hands).map(([id,handDefinitionIds])=>({id,handDefinitionIds})),
   firstSeatId:'A',rngSeed:123
 },catalog);
}
const card=(s,id,index)=>s.players.find(p=>p.id===id).hand[index].instanceId;
function send(s,actorId,type,values={}){
 return applyStagingCommand(s,{
   commandId:'addon-'+actorId+'-'+s.revision,
   actorId,type,expectedRevision:s.revision,...values
 },catalog,{authorizedSeatId:actorId}).state;
}
const attack=(s,indexes,targetId='B')=>send(s,'A','playCards',{
 targetId,orderedInstanceIds:indexes.map(i=>card(s,'A',i))
});
const defend=(s,indexes=[])=>send(s,'B','defend',{
 orderedInstanceIds:indexes.map(i=>card(s,'B',i))
});
const resolve=s=>resolveStagedFixture(s,catalog,fixture);

test('source-backed +ATK cards are addAttack weapons but do not require a main weapon',()=>{
 for(const [id,attack] of [['a001',1],['a003',3],['a012',9],['a013',15]]){
  const def=catalog.get(id);
  assert.equal(def.family,'weapon',id);
  assert.equal(def.stats.attack,attack,id);
  assert.ok(def.playModes.includes('addAttack'),id);
  assert.ok(!def.playModes.includes('mainAttack'),id);
 }
});
test('a single +ATK card can open an attack, hit and redraw without MP cost',()=>{
 const start=room({A:['a001'],B:[]}),original=JSON.stringify(start);
 const staged=attack(start,[0]);
 assert.equal(staged.phase,'defense');
 const attacked=compileOrderedWeaponAttack(staged,catalog);
 assert.equal(attacked.attack,1);assert.equal(attacked.element,'none');
 assert.equal(attacked.payableMP,0);
 const r=resolve(defend(staged));
 assert.equal(r.plan.attack,1);
 assert.equal(r.state.players[1].hp,39);
 assert.equal(r.state.players[0].mp,10);
 assert.equal(r.state.players[0].hand.length,1);
 assert.equal(r.state.players[0].hand[0].definitionId,'d001');
 assert.equal(r.state.activePlayerId,'B');
 assert.equal(JSON.stringify(start),original);
});
test('three +ATK cards stack attack values and all spent cards are redrawn',()=>{
 const start=room({A:['a001','a003','a012'],B:['d001']});
 const pending=attack(start,[0,1,2]);
 const plan=compileOrderedWeaponAttack(pending,catalog);
 assert.equal(plan.attack,13);
 assert.equal(plan.hasModifiers,false);
 assert.deepEqual(plan.instanceIds,start.players[0].hand.map(x=>x.instanceId));
 const result=resolve(defend(pending,[0]));
 assert.equal(result.plan.armor,1);
 assert.equal(result.state.players[1].hp,28);
 assert.equal(result.state.players[0].hand.length,3);
 assert.ok(result.state.players[0].hand.every(x=>x.definitionId==='d001'));
 assert.equal(result.state.players[0].mp,10);
});
test('elemental +ATK and Light +ATK retain fire through light-mixing rule',()=>{
 const s=attack(room({A:['a009','a010'],B:['d015']}),[0,1]);
 const p=compileOrderedWeaponAttack(s,catalog);
 assert.equal(p.attack,5);assert.equal(p.element,'fire');
 const r=resolve(defend(s,[0]));
 assert.equal(r.state.players[1].hp,38);
});
test('fire +ATK mixed with neutral +ATK produces a neutral attack',()=>{
 const s=attack(room({A:['a009','a003'],B:['d001']}),[0,1]);
 const p=compileOrderedWeaponAttack(s,catalog);
 assert.equal(p.attack,7);assert.equal(p.element,'none');
 assert.equal(resolve(defend(s,[0])).state.players[1].hp,34);
});
test('ordered playSequence can start with +ATK and preserve two additive cards',()=>{
 const s=room({A:['a003','a001'],B:[]});
 const ids=s.players[0].hand.map(x=>x.instanceId);
 const p=send(s,'A','playSequence',{targetId:'B',
   orderedPlays:ids.map(instanceId=>({instanceId}))});
 assert.deepEqual(p.pending.attackSequence,ids.map(instanceId=>({instanceId})));
 const r=resolve(defend(p));
 assert.equal(r.plan.attack,4);
 assert.equal(r.state.players[1].hp,36);
});
test('a reflected +ATK-only attack sends the same damage back once',()=>{
 const p=attack(room({A:['a003'],B:['w027']}),[0]);
 const returned=resolve(defend(p,[0]));
 assert.equal(returned.redirected,true);
 assert.equal(returned.state.activePlayerId,'A');
 assert.equal(returned.state.players[0].mp,10);
 const a=send(returned.state,'A','defend',{orderedInstanceIds:[]});
 const final=resolve(a);
 assert.equal(final.state.players[0].hp,37);
 assert.equal(final.state.players[1].hp,40);
 assert.equal(final.state.players[0].mp,10);
});
test('the Wall defensive miracle blocks a neutral +ATK-only attack',()=>{
 const p=attack(room({A:['a003'],B:['m001']}),[0]);
 const r=resolve(defend(p,[0]));
 assert.equal(r.state.players[1].hp,40);
 assert.equal(r.state.players[1].mp,4);
 assert.deepEqual(r.state.players[1].learned,['m001']);
});
test('addon-only self-targeting attack skips defense without inventing a shield',()=>{
 const start=room({A:['a001'],B:[]});
 const pending=attack(start,[0],'A');
 assert.equal(pending.phase,'resolving');
 const resolved=resolve(pending);
 assert.equal(resolved.state.players[0].hp,39);
 assert.equal(resolved.state.players[1].hp,40);
});
test('submit and resolve path accepts +ATK-only before showing enemy defense',()=>{
 let state=room({A:['a003'],B:[]});
 const first=submitAndResolveFixture(state,{commandId:'start',actorId:'A',
   expectedRevision:0,type:'playCards',targetId:'B',
   orderedInstanceIds:[card(state,'A',0)]},catalog,{...fixture,authorizedSeatId:'A'});
 assert.equal(first.state.phase,'defense');
 const second=submitAndResolveFixture(first.state,{commandId:'block',actorId:'B',
   expectedRevision:1,type:'defend',orderedInstanceIds:[]},catalog,
   {...fixture,authorizedSeatId:'B'});
 assert.equal(second.autoResolved,true);
 assert.equal(second.state.players[1].hp,37);
});
test('duplicate +ATK instance selection rejects without changing staged room',()=>{
 const s=room({A:['a001'],B:[]});
 const one=card(s,'A',0),snapshot=JSON.stringify(s);
 assert.throws(()=>send(s,'A','playCards',{targetId:'B',
   orderedInstanceIds:[one,one]}),/Repeated card instance/);
 assert.equal(JSON.stringify(s),snapshot);
});
test('hotseat UI accurately labels +ATK and actually submits an addon-only attack',()=>{
 const ui=createV2LabController({hands:{A:['a001','a012'],B:[]}});
 const first=ui.reveal();
 assert.match(first.hand[0].label,/\+攻1(?:\D|$)/);
 assert.match(first.hand[1].label,/\+攻9(?:\D|$)/);
 assert.match(renderV2LabMarkup(first),/追加武器だけでも攻撃可/);
 ui.toggle({instanceId:first.hand[0].instanceId});
 ui.toggle({instanceId:first.hand[1].instanceId});
 assert.equal(ui.submit().ok,true);
 assert.equal(ui.view().phase,'defense');
 ui.reveal();
 const final=ui.submit();
 assert.equal(final.ok,true,final.error);
 assert.equal(ui.labSnapshot().players[1].hp,30);
 assert.equal(ui.labSnapshot().players[0].hand.length,2);
});
