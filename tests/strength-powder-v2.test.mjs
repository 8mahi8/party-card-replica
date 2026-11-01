import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {findVerifiedBasicCard} from '../src/verified-basic-cards.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const opts={labOnly:true,fixtureDrawDefinitionId:'d001'};
const room=(cards,mp=10)=>{const s=createStagingRoom({
 seats:[{id:'A',handDefinitionIds:cards},{id:'B',handDefinitionIds:[]}],
 firstSeatId:'A'},catalog);s.players[0].mp=mp;return s;};
function act(s,ids,actorId='A'){
 const actor=s.players.find(p=>p.id===actorId);
 return submitAndResolveFixture(s,{type:actorId==='A'?'playCards':'defend',
  actorId,commandId:'powder-'+actorId+'-'+s.revision,expectedRevision:s.revision,
  ...(actorId==='A'?{targetId:'B'}:{}),
  orderedInstanceIds:ids.map(i=>actor.hand[i].instanceId)},catalog,
  {...opts,authorizedSeatId:actorId});
}
function finish(s){return act(s,[],'B').state;}

test('sourced powder definition has +10, price 15, 0.4% reference weight and item family',()=>{
 const card=findVerifiedBasicCard('i004'),def=catalog.get('i004');
 assert.equal(card.referenceName,'ちからの粉');
 assert.equal(card.attackBonus,10);
 assert.equal(card.price,15);
 assert.equal(card.weight,2);
 assert.equal(def.family,'item');
 assert.equal(def.stats.attack,10);
 assert.deepEqual(def.playModes,['addAttack']);
 assert.deepEqual(def.effects,[{when:'onDeclare',type:'addAttack',params:{scope:'weapon',stacking:'single'}}]);
});
test('weapon then non-weapon Powder adds 10 without MP and replenishes both physical cards',()=>{
 const initial=room(['w016','i004']);
 const before=JSON.stringify(initial);
 const first=act(initial,[0,1]);
 assert.equal(first.state.phase,'defense');
 const resolved=finish(first.state);
 assert.equal(resolved.players[1].hp,20); // 10+10, defender unguarded
 assert.equal(resolved.players[0].mp,10);
 assert.equal(resolved.players[0].hand.length,2);
 assert.equal(resolved.players[0].hand.every(c=>c.definitionId==='d001'),true);
 assert.deepEqual(resolved.players[0].learned,[]);
 assert.equal(JSON.stringify(initial),before);
});
test('Powder is NOT itself a weapon and cannot be the first attack card',()=>{
 for(const cards of [['i004'],['i004','w016']]){
  const s=room(cards),before=JSON.stringify(s);
  assert.throws(()=>act(s,cards.length===1?[0]:[0,1]),/start with a weapon/);
  assert.equal(JSON.stringify(s),before);
 }
});
test('Powder after a normal weapon works with zero MP, independent of miracle casting',()=>{
 const s=room(['w016','i004'],0),first=act(s,[0,1]),result=finish(first.state);
 assert.equal(result.players[1].hp,20);
 assert.equal(result.players[0].mp,0);
});
test('source confirms Powder->Aura->Spirit can be selected, but damage-order is not verified',()=>{
 const s=room(['w016','i004','m004','i003'],0),before=JSON.stringify(s);
 assert.throws(()=>act(s,[0,1,2,3]),/non-weapon bonus unverified/);
 assert.equal(JSON.stringify(s),before);
 // This is a LAB-ONLY research limitation, NOT a claim original rejects it.
});
test('do not invent item + additive miracle or two Powder stacking precedence',()=>{
 for(const cards of [
  ['w016','m005','i004'],
  ['w016','i004','m005'],
  ['w016','i004','i004']
 ]){
  const s=room(cards),before=JSON.stringify(s);
  assert.throws(()=>act(s,cards.map((_,i)=>i)),/unverified/);
  assert.equal(JSON.stringify(s),before);
 }
});
test('schema refuses malformed Powder additive metadata rather than guessing values',()=>{
 const c=findVerifiedBasicCard('i004');
 for(const change of [{attackBonus:-1},{effect:'unknown'},{attackBonus:undefined}]){
  assert.throws(()=>convertLegacyCard({...c,...change}),/Unmapped support item effect/);
 }
});
test('hotseat displays the attack bonus and transfers after weapon plus Powder',()=>{
 const ui=createV2LabController({hands:{A:['w016','i004'],B:[]}});
 const hand=ui.reveal().hand;
 assert.match(hand[1].label,/ちからの粉 · \+攻10/);
 assert.match(renderV2LabMarkup(ui.view()),/ちからの粉/);
 ui.toggle({instanceId:hand[0].instanceId});
 ui.toggle({instanceId:hand[1].instanceId});
 assert.equal(ui.submit().ok,true);
 assert.equal(ui.view().actorId,'B');
 assert.equal(ui.view().revealed,false);
 ui.reveal();
 assert.equal(ui.submit().ok,true);
 assert.equal(ui.labSnapshot().players[1].hp,20);
});
