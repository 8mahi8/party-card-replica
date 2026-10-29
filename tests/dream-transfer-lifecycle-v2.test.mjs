import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {
 attachDreamAppearanceFixture,retireDreamAppearancesFixture,
 validateDreamOwnershipFixture
} from '../v2/dream-appearance.mjs';
const {byId:catalog}=migrateLegacyCatalog();
const source={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(A=['t001','w003','d001'],B=['d005'],seed=71){
 return createStagingRoom({seats:[{id:'A',handDefinitionIds:A},
   {id:'B',handDefinitionIds:B}],firstSeatId:'A',rngSeed:seed},catalog);
}
function dream(s,seatId,index,appearsAsDefinitionId){
 return attachDreamAppearanceFixture(s,catalog,{
   seatId,instanceId:s.players.find(p=>p.id===seatId).hand[index].instanceId,
   appearsAsDefinitionId
 });
}
function issue(s,actorId,type,fields={},id=type+'-'+s.revision){
 return {type,actorId,commandId:id,expectedRevision:s.revision,...fields};
}
function send(s,c){
 return submitAndResolveFixture(s,c,catalog,{...source,authorizedSeatId:c.actorId});
}
const sale=s=>issue(s,'A','declareSale',{
 targetId:'B',saleInstanceId:s.players[0].hand[0].instanceId,
 soldInstanceId:s.players[0].hand[1].instanceId
});
const pass=s=>issue(s,'B','respondSale');
test('pure Dream retirement clears requested IDs only without changing originals',()=>{
 const s=dream(dream(room(['t001','w003','w016']),'A',1,'w016'),
   'A',2,'w003');
 const player=s.players[0],raw=JSON.stringify(s);
 const retired=retireDreamAppearancesFixture(player,[player.hand[1].instanceId]);
 assert.equal(retired.length,1);
 assert.equal(retired[0].instanceId,player.hand[2].instanceId);
 assert.equal(JSON.stringify(s),raw);
 assert.notStrictEqual(retired,player.dreamDisguises);
 assert.equal(validateDreamOwnershipFixture(s,catalog),true);
});
test('Dream ledger ownership validation rejects dangling, repeated and invalid timing entries',()=>{
 const s=dream(room(),'A',1,'w016'),p=s.players[0];
 for(const entries of [
  [{instanceId:'forged',appearsAsDefinitionId:'w016'}],
  [p.dreamDisguises[0],p.dreamDisguises[0]],
  [{instanceId:p.hand[1].instanceId,appearsAsDefinitionId:'m002'}],
  [{instanceId:p.hand[1].instanceId,appearsAsDefinitionId:'w003'}],
  [{instanceId:p.hand[1].instanceId,appearsAsDefinitionId:'unknown'}],
  null
 ]){
  const forged={...s,players:[{...p,dreamDisguises:entries},s.players[1]]};
  assert.throws(()=>validateDreamOwnershipFixture(forged,catalog));
 }
});
test('ordinary accepted Sell reveals disguised item and removes stale alias from original seller',()=>{
 const start=dream(room(),'A',1,'w016');
 const physical=start.players[0].hand[1].instanceId;
 const stage=send(start,sale(start)),resolved=send(stage.state,pass(stage.state));
 assert.equal(resolved.state.phase,'turn');
 assert.equal(resolved.state.players[0].dreamDisguises.length,0);
 assert.equal(resolved.state.players[0].hand.some(c=>c.instanceId===physical),false);
 assert.equal(resolved.state.players[1].hand.at(-1).instanceId,physical);
 assert.equal(resolved.state.players[1].hand.at(-1).definitionId,'w003');
 assert.equal(viewStagingRoom(resolved.state,'B',catalog).players[1].hand.at(-1).definitionId,'w003');
 assert.equal(validateDreamOwnershipFixture(resolved.state,catalog),true);
});
test('real Sell settles for original price rather than fake appearance price',()=>{
 const start=dream(room(),'A',1,'w016');
 const targetBefore=start.players[1].money;
 const done=send(send(start,sale(start)).state,pass(send(start,sale(start)).state));
 assert.equal(done.state.players[0].money,45);
 assert.equal(done.state.players[1].money,0);
 assert.equal(done.state.players[1].mp,5);
 assert.equal(targetBefore,20);
});
test('full-hand Sell eviction cannot leave a Dream alias pointing to a lost item',()=>{
 const start=dream(dream(room(['t001','w003'],Array(18).fill('d001')),'A',1,'w016'),
   'B',4,'d002');
 const beforeB=start.players[1].dreamDisguises[0].instanceId;
 const result=send(send(start,sale(start)).state,
   pass(send(start,sale(start)).state));
 const buyer=result.state.players[1];
 const wasEvicted=!buyer.hand.some(c=>c.instanceId===beforeB);
 assert.equal(buyer.hand.length,18);
 assert.equal(buyer.hand.some(c=>c.definitionId==='w003'),true);
 assert.equal(result.state.players[0].dreamDisguises.length,0);
 assert.equal(buyer.dreamDisguises?.some(x=>x.instanceId===beforeB)??false,!wasEvicted);
 assert.equal(validateDreamOwnershipFixture(result.state,catalog),true);
});
test('Buy accepted transfers the real artifact and retires seller Dream appearance',()=>{
 const start=dream(room(['t002','d001'],['w003']),'B',0,'w016');
 start.players[0].money=40;
 const actual=start.players[1].hand[0].instanceId;
 const stage=send(start,issue(start,'A','declareBuy',{
   targetId:'B',buyInstanceId:start.players[0].hand[0].instanceId
 }));
 const respond=send(stage.state,issue(stage.state,'B','respondBuy'));
 assert.equal(respond.state.phase,'buyDecision');
 const result=send(respond.state,issue(respond.state,'A','decideBuy',{accept:true}));
 assert.equal(result.state.players[1].hand.some(c=>c.instanceId===actual),false);
 assert.deepEqual(result.state.players[1].dreamDisguises,[]);
 assert.equal(result.state.players[0].hand.some(c=>c.instanceId===actual),true);
 assert.equal(result.state.players[0].hand.find(c=>c.instanceId===actual).definitionId,'w003');
 assert.equal(validateDreamOwnershipFixture(result.state,catalog),true);
});
test('reflected Sell reveals offered Dream card while it remains with original player',()=>{
 const start=dream(room(['t001','w003'],['i002']),'A',1,'w016');
 const target=start.players[0].hand[1].instanceId;
 const stage=send(start,sale(start));
 const mirror=stage.state.players[1].hand[0].instanceId;
 const response=send(stage.state,issue(stage.state,'B','respondSale',{mirrorInstanceId:mirror}));
 assert.equal(response.state.players[0].hand.some(c=>c.instanceId===target),true);
 assert.equal(response.state.players[0].dreamDisguises.length,0);
 assert.equal(response.state.players[0].hp,40);
 assert.equal(response.state.players[0].mp,5);
 assert.equal(response.state.players[1].money,45);
 assert.equal(validateDreamOwnershipFixture(response.state,catalog),true);
});
test('spending a Dream card drops its alias without revealing real card to opposing player',()=>{
 const start=dream(room(['w003'],['d001']),'A',0,'w016');
 const card=start.players[0].hand[0].instanceId;
 const stage=send(start,issue(start,'A','playCards',{targetId:'B',orderedInstanceIds:[card]}));
 const result=send(stage.state,issue(stage.state,'B','defend',{orderedInstanceIds:[]}));
 assert.equal(result.state.players[0].dreamDisguises.length,0);
 assert.equal(result.state.players[0].hand.some(x=>x.instanceId===card),false);
 assert.equal(Object.hasOwn(viewStagingRoom(result.state,'B',catalog).players[0],'hand'),false);
 assert.equal(validateDreamOwnershipFixture(result.state,catalog),true);
});
test('discarding disguised defense card retires alias permanently',()=>{
 const start=dream(room(['d005'],['d001']),'A',0,'d004');
 const card=start.players[0].hand[0].instanceId;
 const result=send(start,issue(start,'A','discard',{orderedInstanceIds:[card]}));
 assert.equal(result.state.players[0].dreamDisguises.length,0);
 assert.equal(result.state.players[0].hand.length,0);
 assert.equal(validateDreamOwnershipFixture(result.state,catalog),true);
});
test('malformed retirement cannot mutate the private dream ledger',()=>{
 const s=dream(room(),'A',1,'w016'),before=JSON.stringify(s);
 for(const ids of [null,[''],[null],['good',2],{}]){
  assert.throws(()=>retireDreamAppearancesFixture(s.players[0],ids));
 }
 assert.equal(JSON.stringify(s),before);
});

test('forged trade-to-trade Dream alias is never admitted through owner projection',()=>{
 const s=room(),trade=s.players[0].hand[0];
 const forged={...s,players:s.players.map(p=>p.id==='A'?{
  ...p,dreamDisguises:[{
   instanceId:trade.instanceId,appearsAsDefinitionId:'t002'
  }]
 }:p)};
 assert.throws(()=>validateDreamOwnershipFixture(forged,catalog),/timing mismatch/);
 assert.throws(()=>viewStagingRoom(forged,'A',catalog),/timing mismatch/);
 assert.equal(forged.players[0].hand[0].definitionId,'t001');
});
test('authentic Dream disguise remains valid when no alias is defined for another seat',()=>{
 const s=dream(room(),'A',1,'w016');
 assert.equal(validateDreamOwnershipFixture(s,catalog),true);
 const projection=viewStagingRoom(s,'B',catalog);
 assert.equal(projection.players[0].hand,undefined);
 assert.equal(projection.players[1].hand.length,1);
});
