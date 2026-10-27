import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {findVerifiedBasicCard} from '../src/verified-basic-cards.mjs';
import {createStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {compileOrderedWeaponAttack} from '../v2/ordered-attack.mjs';
import {resolveStagedFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(ids,{mp=10}={}){
 const s=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:ids},
  {id:'B',handDefinitionIds:['d014','d015']}
 ],firstSeatId:'A'},catalog);
 s.players[0].mp=mp;
 return s;
}
function send(s,id,type,more){
 return applyStagingCommand(s,{commandId:'wand-'+id+'-'+s.revision,
  expectedRevision:s.revision,actorId:id,type,...more},catalog,
 {authorizedSeatId:id}).state;
}
function attack(s,indices){
 const actor=s.players[0];
 return send(s,'A','playCards',{targetId:'B',
  orderedInstanceIds:indices.map(i=>actor.hand[i].instanceId)});
}
function defend(s,indices=[]){
 const actor=s.players[1];
 return send(s,'B','defend',{
  orderedInstanceIds:indices.map(i=>actor.hand[i].instanceId)});
}
const compile=s=>compileOrderedWeaponAttack(s,catalog);
const resolve=s=>resolveStagedFixture(s,catalog,fixture);

test('both elemental additive wands have independently documented printed values and typed overrides',()=>{
 for(const [id,name,element,attack] of [
  ['a014','魔水のワンド','water',5],
  ['a015','発火のワンド','fire',2]
 ]){
  const original=findVerifiedBasicCard(id),def=catalog.get(id);
  assert.equal(original.referenceName,name);
  assert.equal(original.attack,attack);
  assert.equal(original.price,15);
  assert.equal(original.weight,1);
  assert.equal(original.slot,'addon');
  assert.equal(original.attackElementOverride,element);
  assert.equal(def.stats.attack,attack);
  assert.equal(def.stats.price,15);
  assert.equal(def.drawWeight,1);
  assert.deepEqual(def.playModes,['addAttack']);
  assert.deepEqual(def.effects,[{when:'onDeclare',type:'setAttackElement',params:{element}}]);
 }
});
test('source explicit: Wonder Sword -> Aura -> Magic Water Wand is water ATK30',()=>{
 const h=room(['w016','m004','a014']);
 const a=attack(h,[0,1,2]),p=compile(a);
 assert.equal(p.attack,30);
 assert.equal(p.element,'water');
 assert.equal(p.payableMP,6);
 assert.deepEqual(p.learnedMiracles,['m004']);
 const after=resolve(defend(a,[0])).state; // fire shield 3 guards water attacks
 assert.equal(after.players[1].hp,13);
 assert.equal(after.players[0].mp,4);
 assert.equal(after.players[0].hand.length,3);
 assert.deepEqual(after.players[0].learned,['m004']);
});
test('same documented Aura effect also doubles a wand selected before Aura',()=>{
 const h=room(['w016','a014','m004']);
 const a=attack(h,[0,1,2]),p=compile(a);
 assert.equal(p.attack,30);
 assert.equal(p.element,'water');
 assert.equal(resolve(defend(a,[0])).state.players[1].hp,13);
});
test('another source-listed attribute wand converts neutral plus ATK to fire',()=>{
 const h=room(['w016','a015']);
 const a=attack(h,[0,1]),p=compile(a);
 assert.equal(p.attack,12);
 assert.equal(p.element,'fire');
 assert.equal(p.payableMP,0);
 const after=resolve(defend(a,[1])).state; // ice shield 3 guards fire
 assert.equal(after.players[1].hp,31);
});
test('Magic Water Wand is also a legal +ATK-only water attack',()=>{
 const h=room(['a014']),a=attack(h,[0]),p=compile(a);
 assert.equal(p.attack,5);
 assert.equal(p.element,'water');
 assert.equal(resolve(defend(a,[0])).state.players[1].hp,38);
});
test('Spirit immediately after Aura waives MP even when elemental wand follows',()=>{
 const h=room(['w016','m004','i003','a014'],{mp:0});
 const a=attack(h,[0,1,2,3]),p=compile(a);
 assert.equal(p.attack,30);
 assert.equal(p.element,'water');
 assert.equal(p.payableMP,0);
 const result=resolve(defend(a,[0])).state;
 assert.equal(result.players[0].mp,0);
 assert.deepEqual(result.players[0].learned,['m004']);
 assert.equal(result.players[1].hp,13);
});
test('two attribute-setting wands do not silently guess precedence',()=>{
 const h=room(['w016','a014','a015']);
 const a=attack(h,[0,1,2]),before=JSON.stringify(a);
 assert.throws(()=>compile(a),/Multiple attack-element override wands unverified/);
 assert.equal(JSON.stringify(a),before);
});
test('wand plus Fireball or Meteor holds unresolved elemental-composition questions',()=>{
 for(const miracle of ['m005','m006']){
  const h=room(['w016','a014',miracle]);
  const a=attack(h,[0,1,2]),before=JSON.stringify(a);
  assert.throws(()=>compile(a),/wand with plus miracle unverified/);
  assert.equal(JSON.stringify(a),before);
 }
});
test('wand plus conflicting attribute weapon is not silently overwritten',()=>{
 const h=room(['w018','a014']);
 const a=attack(h,[0,1]),before=JSON.stringify(a);
 assert.throws(()=>compile(a),/Conflicting elemental weapons with override wand unverified/);
 assert.equal(JSON.stringify(a),before);
});
test('malformed or miscategorized override cards fail adapter validation',()=>{
 for(const change of [
  {slot:'main'},
  {attackElementOverride:'dark'},
  {element:'fire'}
 ]){
  const malformed={...findVerifiedBasicCard('a014'),...change};
  assert.throws(()=>convertLegacyCard(malformed),/Unverified attribute override definition/);
 }
});
test('addon-only plus Fireball and Meteor retain preexisting MP and attack behavior (not official sequence evidence)',()=>{
 for(const [miracle,boost,cost] of [['m005',2,2],['m006',10,7]]){
  const h=room(['a003',miracle]),a=attack(h,[0,1]),p=compile(a);
  assert.equal(p.attack,3+boost);
  assert.equal(p.payableMP,cost);
  assert.equal(p.element,'none');
  const final=resolve(defend(a)).state;
  assert.equal(final.players[1].hp,40-3-boost);
  assert.equal(final.players[0].mp,10-cost);
  assert.deepEqual(final.players[0].learned,[miracle]);
 }
});
test('lab hotseat selects all three source-example cards in order without leaking opponent hand',()=>{
 const ui=createV2LabController({hands:{A:['w016','m004','a014'],B:['d014']}});
 const cards=ui.reveal().hand;
 for(const c of cards)ui.toggle({instanceId:c.instanceId});
 assert.equal(ui.submit().ok,true);
 assert.equal(ui.view().actorId,'B');
 assert.equal(ui.view().revealed,false);
 assert.equal(ui.view().hand.length,0);
 const shield=ui.reveal().hand[0];
 ui.toggle({instanceId:shield.instanceId});
 assert.equal(ui.submit().ok,true);
 assert.equal(ui.labSnapshot().players[1].hp,13);
});
