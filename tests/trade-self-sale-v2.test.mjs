import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {previewSelfSaleFixture} from '../v2/trade-self-sale.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';
const {byId:catalog}=migrateLegacyCatalog();
function room(hand=['t001','w003','d001'],extra=['d001']){
 return createStagingRoom({seats:[{id:'A',handDefinitionIds:hand},
  {id:'B',handDefinitionIds:extra}],firstSeatId:'A',rngSeed:73},catalog);
}
const sample=s=>({sellerId:'A',saleInstanceId:s.players[0].hand[0].instanceId,
 soldInstanceId:s.players[0].hand[1].instanceId});
const cmd=s=>({type:'declareSale',commandId:'self-sale-1',actorId:'A',
 expectedRevision:s.revision,targetId:'A',...{
 saleInstanceId:sample(s).saleInstanceId,soldInstanceId:sample(s).soldInstanceId}});
const context={authorizedSeatId:'A',labOnly:true,fixtureDrawDefinitionId:'d001'};
test('self-sale preview changes resource distribution without changing their total',()=>{
 const s=room(),original=JSON.stringify(s),p=previewSelfSaleFixture(s,catalog,sample(s));
 assert.equal(p.type,'selfSale');assert.equal(p.price,25);
 assert.equal(p.total,70);
 assert.deepEqual(p.payment.debit,{money:20,mp:5,hp:0});
 assert.deepEqual(p.after,{hp:40,mp:5,money:25});
 assert.equal(p.after.hp+p.after.mp+p.after.money,70);
 assert.equal(Object.isFrozen(p),true);
 assert.equal(JSON.stringify(s),original);
});
test('self-sale without resource shortage is a no-change financial transaction',()=>{
 const s=room();s.players[0].money=30;
 const p=previewSelfSaleFixture(s,catalog,sample(s));
 assert.deepEqual(p.after,{hp:40,mp:10,money:30});
 assert.equal(p.total,80);
});
test('self-sale without money transfers MP to money and then HP to money',()=>{
 const s=room();
 s.players[0].money=0;
 const plan=previewSelfSaleFixture(s,catalog,sample(s));
 assert.deepEqual(plan.payment.debit,{money:0,mp:10,hp:15});
 assert.deepEqual(plan.after,{hp:25,mp:0,money:25});
 assert.equal(plan.total,50);
});
test('self-sale with zero-cost miracle consumes Sell only and preserves item',()=>{
 const s=room(['t001','m002']);
 const p=previewSelfSaleFixture(s,catalog,sample(s));
 assert.equal(p.price,0);assert.deepEqual(p.after,{hp:40,mp:10,money:20});
 const out=submitAndResolveFixture(s,cmd(s),catalog,context);
 assert.equal(out.autoResolved,true);
 assert.deepEqual(out.state.players[0].hand.map(c=>c.definitionId),['m002','d001']);
});
test('authenticated self-sale settles atomically and refills one card',()=>{
 const s=room(),snapshot=JSON.stringify(s),item=s.players[0].hand[1];
 const out=submitAndResolveFixture(s,cmd(s),catalog,context),n=out.state;
 assert.equal(out.applied,true);assert.equal(out.autoResolved,true);
 assert.equal(out.plan.type,'selfSale');assert.equal(n.revision,2);
 assert.equal(n.phase,'turn');assert.equal(n.activePlayerId,'B');assert.equal(n.turnCount,1);
 assert.deepEqual(out.events.map(e=>e.type),['spend','selfSale','refill','turnAdvance']);
 assert.deepEqual([n.players[0].hp,n.players[0].mp,n.players[0].money],[40,5,25]);
 assert.deepEqual(n.players[0].hand.map(c=>c.definitionId),['w003','d001','d001']);
 assert.equal(n.players[0].hand[0].instanceId,item.instanceId);
 assert.equal(n.players[1].hand[0].instanceId,s.players[1].hand[0].instanceId);
 assert.equal(JSON.stringify(s),snapshot);
});
test('self-sale command stays idempotent and changed same ID is rejected',()=>{
 const s=room(),command=cmd(s),first=submitAndResolveFixture(s,command,catalog,context);
 const retry=submitAndResolveFixture(first.state,command,catalog,context);
 assert.equal(retry.duplicate,true);assert.strictEqual(retry.state,first.state);
 assert.throws(()=>submitAndResolveFixture(first.state,{...command,
  soldInstanceId:s.players[0].hand[2].instanceId},catalog,context),/Conflicting commandId/);
});
test('only authenticated owner can self-sell a genuine Sell and a distinct held item',()=>{
 const s=room(),c=cmd(s),snapshot=JSON.stringify(s);
 for(const bad of [
  {c,auth:{...context,authorizedSeatId:'B'}},
  {c:{...c,saleInstanceId:s.players[0].hand[2].instanceId},auth:context},
  {c:{...c,soldInstanceId:c.saleInstanceId},auth:context},
  {c:{...c,soldInstanceId:'ci-forged'},auth:context},
  {c:{...c,extra:'bad'},auth:context},
  {c:{...c,expectedRevision:45},auth:context}
 ])assert.throws(()=>submitAndResolveFixture(s,bad.c,catalog,bad.auth));
 assert.equal(JSON.stringify(s),snapshot);
});
test('lethal self-sale stays fail-closed pending original zero-HP processing',()=>{
 const s=room();s.players[0].hp=1;s.players[0].mp=0;s.players[0].money=0;
 const snapshot=JSON.stringify(s);
 assert.throws(()=>previewSelfSaleFixture(s,catalog,sample(s)),/Lethal self Sale/);
 assert.throws(()=>submitAndResolveFixture(s,cmd(s),catalog,context),/Lethal self Sale/);
 assert.equal(JSON.stringify(s),snapshot);
});
test('even if Sun Charm is in hand, unknown lethal self-sale order is not assumed',()=>{
 const s=room(['t001','w003','i005']);s.players[0].hp=1;
 s.players[0].mp=0;s.players[0].money=0;
 assert.throws(()=>submitAndResolveFixture(s,cmd(s),catalog,context),/Lethal self Sale/);
 assert.equal(s.players[0].hand[2].definitionId,'i005');
});
test('self-sale returns no opponent defense and exposes only projected public fields',()=>{
 const s=room(),result=submitAndResolveFixture(s,cmd(s),catalog,context);
 const projection=viewStagingRoom(result.state,'B');
 assert.equal(projection.phase,'turn');assert.equal(projection.activePlayerId,'B');
 assert.equal(Object.hasOwn(projection,'rngSeed'),false);
 assert.equal(Object.hasOwn(projection.players[0],'hand'),false);
 assert.equal(JSON.stringify(projection).includes(s.players[0].hand[1].instanceId),false);
});
test('self-sale lab launcher allows a self-target without showing opponent hand',()=>{
 const lab=createV2LabController();
 assert.match(renderV2LabMarkup(lab.view()),/data-action="self-sale-demo"/);
 lab.loadSelfSaleTrial();
 assert.equal(lab.view().selfSaleTrial,true);assert.equal(lab.view().revealed,false);
 const a=lab.reveal();
 lab.toggle({instanceId:a.hand[0].instanceId});
 lab.toggle({instanceId:a.hand[1].instanceId});
 assert.match(renderV2LabMarkup(lab.view()),/自分にも売れます/);
 const result=lab.submit();
 assert.equal(result.ok,true,result.error);
 assert.equal(result.view.actorId,'B');
 assert.equal(result.view.revealed,false);
 assert.deepEqual(lab.labSnapshot().players[0].hand.map(c=>c.definitionId),
 ['w003','d001','d001']);
 lab.reset();assert.equal(lab.view().selfSaleTrial,false);
});
