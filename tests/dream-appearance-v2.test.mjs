import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';
import {attachDreamAppearanceFixture,dreamTimingSignatureFixture,
 dreamVisibleDefinitionIdFixture} from '../v2/dream-appearance.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001',authorizedSeatId:'A'};
function plain(){
 return createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['t001','w003','d001']},
  {id:'B',handDefinitionIds:['d005','i002']}
 ],firstSeatId:'A',rngSeed:11},catalog);
}
function dream(s=plain(),appearsAsDefinitionId='w016',index=1){
 return attachDreamAppearanceFixture(s,catalog,{
  seatId:'A',instanceId:s.players[0].hand[index].instanceId,
  appearsAsDefinitionId
 });
}
function selfSale(s){
 return {type:'declareSale',actorId:'A',commandId:'dream-self-sale',
  expectedRevision:s.revision,targetId:'A',
  saleInstanceId:s.players[0].hand[0].instanceId,
  soldInstanceId:s.players[0].hand[1].instanceId};
}
test('Dream fixed fixture alters appearance but never physical true definition or RNG',()=>{
 const s=plain(),before=JSON.stringify(s);
 const n=dream(s);
 assert.equal(n.players[0].hand[1].definitionId,'w003');
 assert.deepEqual(n.players[0].dreamDisguises,[{
  instanceId:s.players[0].hand[1].instanceId,appearsAsDefinitionId:'w016'
 }]);
 assert.equal(JSON.stringify(s),before);
 assert.equal(n.rngSeed,s.rngSeed);
 assert.equal(n.revision,s.revision);
});
test('only current owner gets fake name, and projected state never contains real name',()=>{
 const n=dream(),mine=viewStagingRoom(n,'A',catalog);
 const other=viewStagingRoom(n,'B',catalog);
 assert.equal(mine.players[0].hand[1].definitionId,'w016');
 assert.equal(mine.players[0].hand[1].instanceId,n.players[0].hand[1].instanceId);
 assert.equal(other.players[0].hand,undefined);
 assert.equal(other.players[0].dreamDisguises,undefined);
 assert.equal(mine.players[0].dreamDisguises,undefined);
 assert.equal(Object.hasOwn(mine,'rngSeed'),false);
 assert.equal(JSON.stringify(mine).includes('w003'),false);
});
test('Dream view refuses projection without a catalog rather than leaking true identity',()=>{
 const n=dream();
 assert.throws(()=>viewStagingRoom(n,'A'),/requires catalog/);
 assert.doesNotThrow(()=>viewStagingRoom(n,'B'));
});
test('real artifact still settles at real price, removes only the fake appearance',()=>{
 const n=dream(),snapshot=JSON.stringify(n),real=n.players[0].hand[1];
 const out=submitAndResolveFixture(n,selfSale(n),catalog,fixture);
 assert.equal(out.applied,true);
 assert.equal(out.autoResolved,true);
 assert.equal(out.plan.price,25);
 assert.equal(out.plan.itemDefinitionId,'w003');
 assert.equal(out.state.players[0].hp,40);
 assert.equal(out.state.players[0].mp,5);
 assert.equal(out.state.players[0].money,25);
 assert.equal(out.state.players[0].hand[0].instanceId,real.instanceId);
 assert.equal(out.state.players[0].hand[0].definitionId,'w003');
 assert.deepEqual(out.state.players[0].dreamDisguises,[]);
 assert.equal(viewStagingRoom(out.state,'A',catalog).players[0].hand[0].definitionId,'w003');
 assert.deepEqual(out.events.map(e=>e.type),['spend','selfSale','refill','turnAdvance']);
 assert.equal(JSON.stringify(n),snapshot);
});
test('canonical same-timing check refuses trade, miracles, passive, and cross modes',()=>{
 const s=plain();
 for(const [index,appearance] of [
  [0,'t002'],[0,'w016'],[1,'t002'],[1,'m002'],[1,'d001'],[2,'w016'],[1,'i005']
 ]){
  assert.throws(()=>dream(s,appearance,index));
 }
});
test('same-timing ordinary weapons have equal signature despite value/price difference',()=>{
 assert.equal(dreamTimingSignatureFixture(catalog.get('w003')),
  dreamTimingSignatureFixture(catalog.get('w016')));
 assert.notEqual(dreamTimingSignatureFixture(catalog.get('w016')),
  dreamTimingSignatureFixture(catalog.get('d001')));
});
test('malformed and duplicate appearance injections cannot modify state',()=>{
 const s=plain(),n=dream(s),start=JSON.stringify(n);
 for(const p of [
  {seatId:'X',instanceId:n.players[0].hand[1].instanceId,appearsAsDefinitionId:'w016'},
  {seatId:'A',instanceId:'ci-forged',appearsAsDefinitionId:'w016'},
  {seatId:'A',instanceId:n.players[0].hand[1].instanceId,appearsAsDefinitionId:'bad'},
  {seatId:'A',instanceId:n.players[0].hand[1].instanceId,appearsAsDefinitionId:'w003'}
 ]){
  assert.throws(()=>attachDreamAppearanceFixture(n,catalog,p));
 }
 assert.throws(()=>attachDreamAppearanceFixture(n,catalog,{
  seatId:'A',instanceId:n.players[0].hand[1].instanceId,appearsAsDefinitionId:'w016'
 }),/Duplicate/);
 assert.equal(JSON.stringify(n),start);
});
test('disguise only changes selected card; other true cards remain correctly identified',()=>{
 const n=dream(),p=n.players[0];
 assert.equal(dreamVisibleDefinitionIdFixture(p,p.hand[0],catalog),'t001');
 assert.equal(dreamVisibleDefinitionIdFixture(p,p.hand[1],catalog),'w016');
 assert.equal(dreamVisibleDefinitionIdFixture(p,p.hand[2],catalog),'d001');
});
test('Dream is a display fixture only: spell/trade cards are not randomized with partial deck',()=>{
 const s=plain(),n=dream(s);
 assert.equal(n.players[0].hand[0].definitionId,'t001');
 assert.equal(n.players[0].hand[1].definitionId,'w003');
 assert.equal(n.players[1].hand[1].definitionId,'i002');
 assert.equal(n.players[0].dreamDisguises.length,1);
});
test('dream lab view shows fake before Sell and true name after Sell',()=>{
 const lab=createV2LabController();
 assert.match(renderV2LabMarkup(lab.view()),/data-action="dream-demo"/);
 const startup=lab.loadDreamTrial();
 assert.equal(startup.dreamTrial,true);assert.equal(startup.hand.length,0);
 const hand=lab.reveal().hand;
 assert.equal(hand[1].definitionId,'w016');
 assert.match(hand[1].label,/ワンダーソード/);
 assert.equal(lab.labSnapshot().players[0].hand[1].definitionId,'w003');
 lab.toggle({instanceId:hand[0].instanceId});
 lab.toggle({instanceId:hand[1].instanceId});
 const out=lab.submit();
 assert.equal(out.ok,true,out.error);
 assert.equal(out.view.revealed,false);
 assert.equal(out.view.actorId,'B');
 assert.equal(lab.labSnapshot().players[0].dreamDisguises.length,0);
 assert.equal(lab.labSnapshot().players[0].hand[0].definitionId,'w003');
 assert.equal(lab.labSnapshot().players[0].money,25);
 lab.reset();assert.equal(lab.view().dreamTrial,false);
});
test('self sale in Dream scenario preserves the physically selected instanceId',()=>{
 const lab=createV2LabController();lab.loadDreamTrial();
 const n=lab.labSnapshot();
 const held=n.players[0].hand[1].instanceId;
 lab.reveal();lab.toggle({instanceId:n.players[0].hand[0].instanceId});
 lab.toggle({instanceId:held});
 assert.equal(lab.submit().ok,true);
 const done=lab.labSnapshot();
 assert.equal(done.players[0].hand[0].instanceId,held);
 assert.equal(done.players[0].hand[0].definitionId,'w003');
});
test('a second Dream disguise remains intact after self-sale of another artifact',()=>{
 const s=plain();const extra=attachDreamAppearanceFixture(dream(s),catalog,{
  seatId:'A',instanceId:s.players[0].hand[2].instanceId,appearsAsDefinitionId:'d002'
 });
 const out=submitAndResolveFixture(extra,selfSale(extra),catalog,fixture);
 assert.equal(out.state.players[0].dreamDisguises.length,1);
 assert.equal(out.state.players[0].dreamDisguises[0].instanceId,s.players[0].hand[2].instanceId);
 assert.equal(viewStagingRoom(out.state,'A',catalog).players[0].hand[1].definitionId,'d002');
});
test('forged corrupt appearance state fails closed during own hand projection',()=>{
 const n=dream();
 const forged={...n,players:n.players.map(p=>p.id==='A'?{
   ...p,dreamDisguises:[{instanceId:p.hand[1].instanceId,appearsAsDefinitionId:'m002'}]
 }:p)};
 assert.throws(()=>viewStagingRoom(forged,'A',catalog),/timing mismatch/);
});
