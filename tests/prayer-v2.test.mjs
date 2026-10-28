import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand,viewStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture,resolvePrayFixture} from '../v2/room-transition.mjs';
import {drawRandom32} from '../v2/foundation.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';
const {byId:catalog}=migrateLegacyCatalog();
const options={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(cards=[],{rngSeed=1,second=['w016'],third=null}={}){
 const seats=[{id:'A',handDefinitionIds:cards},{id:'B',handDefinitionIds:second}];
 if(third)seats.push({id:'C',handDefinitionIds:third});
 return createStagingRoom({seats,firstSeatId:'A',rngSeed},catalog);
}
function cmd(state,actorId='A',extra={}){
 return {type:'pray',actorId,commandId:'prayer-'+actorId,
   expectedRevision:state.revision,...extra};
}
function send(state,actorId='A',extra={}){
 return submitAndResolveFixture(state,cmd(state,actorId,extra),catalog,
   {...options,authorizedSeatId:actorId});
}
test('an empty-handed player prays: draw one, no HP/MP change, next turn and one revision each stage',()=>{
 const initial=room();
 const before=JSON.stringify(initial);
 const result=send(initial);
 assert.equal(result.autoResolved,true);
 assert.equal(result.plan.type,'pray');
 assert.equal(result.plan.wasFull,false);
 assert.equal(result.state.players[0].hand.length,1);
 assert.equal(result.state.players[0].hand[0].definitionId,'d001');
 assert.equal(result.state.players[0].hp,40);
 assert.equal(result.state.players[0].mp,10);
 assert.equal(result.state.players[0].money,20);
 assert.equal(result.state.activePlayerId,'B');
 assert.equal(result.state.phase,'turn');
 assert.equal(result.state.turnCount,1);
 assert.equal(result.state.revision,2);
 assert.equal(JSON.stringify(initial),before);
 assert.equal(result.events.filter(e=>e.type==='refill')[0].added,1);
});
test('a player with ordinary armor or offensive miracle but no physical weapon can pray',()=>{
 for(const cards of [['d001'],['m002'],['d001','m002','i003']]){
  const result=send(room(cards));
  assert.equal(result.state.players[0].hand.length,cards.length+1,cards.join(','));
  assert.equal(result.state.players[0].mp,10);
 }
});
test('holding a main weapon or addon weapon blocks prayer, leaving room unchanged',()=>{
 for(const cards of [['w016'],['a003'],['d001','a014'],['w016','m002']]){
  const state=room(cards),original=JSON.stringify(state);
  assert.throws(()=>send(state),/Cannot pray while holding a weapon/);
  assert.equal(JSON.stringify(state),original);
 }
});
test('forged prayer commands cannot bypass sender verification or append unrecognized input',()=>{
 const state=room();
 assert.throws(()=>applyStagingCommand(state,cmd(state),catalog),/not authenticated/);
 assert.throws(()=>applyStagingCommand(state,cmd(state),catalog,{authorizedSeatId:'B'}),/not authenticated/);
 assert.throws(()=>send(state,'B'),/Not the active seat/);
 assert.throws(()=>send(state,'A',{targetId:'B'}),/Unexpected command property/);
 assert.throws(()=>send(state,'A',{expectedRevision:9}),/Stale room revision/);
 assert.equal(state.phase,'turn');
});
test('a retry of the same exact prayer command cannot draw again',()=>{
 const state=room();
 const command=cmd(state);
 const first=submitAndResolveFixture(state,command,catalog,{...options,authorizedSeatId:'A'});
 const repeated=submitAndResolveFixture(first.state,command,catalog,{...options,authorizedSeatId:'A'});
 assert.equal(repeated.duplicate,true);
 assert.strictEqual(repeated.state,first.state);
 assert.equal(repeated.events.length,0);
 assert.equal(repeated.state.players[0].hand.length,1);
 assert.throws(()=>submitAndResolveFixture(first.state,{...command,type:'playCards'},catalog,
   {...options,authorizedSeatId:'A'}),/Unexpected command property|Conflicting commandId/);
});
test('when 17 cards are held prayer increases hand to the original maximum 18',()=>{
 const state=room(Array(17).fill('d014'));
 const result=send(state).state;
 assert.equal(result.players[0].hand.length,18);
 assert.equal(result.players[0].hand.at(-1).definitionId,'d001');
 assert.equal(result.rngSeed,state.rngSeed,'no random replacement below maximum');
});
test('when 18 cards are held prayer randomly replaces exactly one existing card',()=>{
 for(const seed of [1,1234567,0x7fffffff]){
  const state=room(Array(18).fill('d014'),{rngSeed:seed});
  const original=JSON.stringify(state),before=state.players[0].hand.map(x=>x.instanceId);
  const roll=drawRandom32(seed),index=Math.floor(roll.value*18);
  const result=send(state).state,after=result.players[0].hand.map(x=>x.instanceId);
  assert.equal(result.players[0].hand.length,18);
  assert.equal(result.rngSeed,roll.nextSeed);
  assert.equal(result.nextInstanceSerial,state.nextInstanceSerial+1);
  assert.deepEqual(before.filter(id=>!after.includes(id)),[before[index]]);
  assert.equal(result.players[0].hand.at(-1).definitionId,'d001');
  assert.equal(new Set(result.players.flatMap(x=>x.hand.map(c=>c.instanceId))).size,19);
  assert.equal(JSON.stringify(state),original);
 }
});
test('prayer serializes cleanly and transitions to next living seat in three-player room',()=>{
 const state=JSON.parse(JSON.stringify(room(['d001'],{second:['d001'],third:['d001']})));
 const result=send(state);
 assert.equal(result.state.activePlayerId,'B');
 assert.equal(result.state.players[1].hand.length,1);
 assert.equal(result.state.players[2].hand.length,1);
 const view=viewStagingRoom(result.state,'B');
 assert.equal(Object.hasOwn(view.players[0],'hand'),false);
 assert.equal(Object.hasOwn(view,'rngSeed'),false);
 assert.equal(Object.hasOwn(view,'processedCommands'),false);
});
test('prayer resolution is only executable through explicit lab fixture, not live card odds',()=>{
 const state=room();
 const staged=applyStagingCommand(state,cmd(state),catalog,{authorizedSeatId:'A'}).state;
 assert.throws(()=>resolvePrayFixture(staged,catalog,{}),/lab fixture mode/);
 assert.equal(staged.phase,'resolving');
 assert.equal(staged.players[0].hand.length,0);
});
test('hotseat reveals a Japanese prayer button and transfers concealed turn after tapping it',()=>{
 const lab=createV2LabController({hands:{A:['d014'],B:['w016']}});
 const revealed=lab.reveal();
 assert.equal(revealed.canPray,true);
 const markup=renderV2LabMarkup(revealed);
 assert.match(markup,/祈る（神器を1枚引く）/);
 assert.match(markup,/武器がないとき/);
 const sent=lab.submit();
 assert.equal(sent.ok,true,sent.error);
 assert.equal(lab.view().phase,'turn');
 assert.equal(lab.view().actorId,'B');
 assert.equal(lab.view().revealed,false);
 assert.equal(lab.view().hand.length,0);
 assert.equal(lab.labSnapshot().players[0].hand.length,2);
});
test('hotseat still offers miracle attack if weaponless; it does not automatically pray',()=>{
 const lab=createV2LabController({hands:{A:['m002'],B:['d001']}});
 const v=lab.reveal();
 assert.equal(v.canPray,true);
 lab.toggle({instanceId:v.hand[0].instanceId});
 assert.doesNotMatch(renderV2LabMarkup(lab.view()),/祈る（神器を1枚引く）/);
 assert.equal(lab.submit().ok,true);
 assert.equal(lab.view().phase,'defense');
});
test('hotseat with addon weapons keeps attack confirmation and rejects empty selection',()=>{
 const lab=createV2LabController({hands:{A:['a003'],B:[]}});
 const v=lab.reveal();
 assert.equal(v.canPray,false);
 assert.doesNotMatch(renderV2LabMarkup(v),/祈る（神器を1枚引く）/);
 const before=JSON.stringify(lab.labSnapshot());
 assert.throws(()=>lab.submit(),/使用するカードを選んでください/);
 assert.equal(JSON.stringify(lab.labSnapshot()),before);
});
