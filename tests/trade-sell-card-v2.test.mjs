/**
 * G4 original-rule parity: a "Sell" artifact can itself be the ITEM sold
 * using another physical "Sell" artifact.
 * Explicit textual evidence (2020 practical rules):
 * https://note.com/parlavigate_4/n/nfe106cef56a5
 *
 * The two physical t001 instances MUST retain distinct identities. This
 * is supported by our instance-based design and may not be replaced by
 * card-definition-only payment or ownership.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {previewUncontestedSale,settleUncontestedSaleFixture} from '../v2/trade-sale.mjs';
import {previewSingleMirrorSale,settleSingleMirrorSaleFixture} from '../v2/trade-reflection.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const opt={labOnly:true,fixtureDrawDefinitionId:'d001',authorizedSeatId:'A'};
const room=(B=['i002','d005'])=>createStagingRoom({
 seats:[{id:'A',handDefinitionIds:['t001','t001','d001']},
        {id:'B',handDefinitionIds:B}],firstSeatId:'A',rngSeed:40
},catalog);
const sel=s=>({sellerId:'A',targetId:'B',
 saleInstanceId:s.players[0].hand[0].instanceId,
 soldInstanceId:s.players[0].hand[1].instanceId});
const send=(s,command)=>submitAndResolveFixture(s,command,catalog,{
 ...opt,authorizedSeatId:command.actorId
});
const declare=s=>({commandId:'sell-trade',expectedRevision:s.revision,
 actorId:'A',type:'declareSale',targetId:'B',
 saleInstanceId:sel(s).saleInstanceId,soldInstanceId:sel(s).soldInstanceId});
const response=(s,mirror=false)=>({
 commandId:'respond-trade',expectedRevision:s.revision,actorId:'B',
 type:'respondSale',...(mirror?{mirrorInstanceId:s.players[1].hand[0].instanceId}:{})
});
test('trade artifact has source-defined ¥5 sale price and can be previewed',()=>{
 const s=room(),selection=sel(s),original=JSON.stringify(s);
 const plan=previewUncontestedSale(s,catalog,selection);
 assert.equal(plan.itemDefinitionId,'t001');
 assert.equal(plan.price,5);
 assert.deepEqual(plan.payment.debit,{money:5,mp:0,hp:0});
 assert.equal(JSON.stringify(s),original);
});
test('uncontested Sell-of-Sell spends exactly one trade, transfers the other physical instance',()=>{
 const s=room(),original=JSON.stringify(s),itemId=sel(s).soldInstanceId;
 const r=settleUncontestedSaleFixture(s,catalog,sel(s),opt),n=r.state;
 assert.equal(n.phase,'turn');assert.equal(n.activePlayerId,'B');
 assert.deepEqual(n.players.map(p=>[p.hp,p.mp,p.money]),[
  [40,10,25],[40,10,15]
 ]);
 assert.deepEqual(n.players[0].hand.map(x=>x.definitionId),['d001','d001']);
 assert.deepEqual(n.players[1].hand.map(x=>x.definitionId),['i002','d005','t001']);
 assert.equal(n.players[1].hand.at(-1).instanceId,itemId);
 assert.equal(n.players[0].hand.some(x=>x.instanceId===itemId),false);
 assert.deepEqual(r.events.map(x=>x.type),['spend','uncontestedSale','refill','turnAdvance']);
 assert.equal(JSON.stringify(s),original);
});
test('auth staged Sell-of-Sell shows ¥5 and lets buyer accept the correct instance',()=>{
 const s=room();
 const first=send(s,declare(s));
 assert.equal(first.autoResolved,false);
 assert.equal(first.state.phase,'tradeDefense');
 const buyerView=viewStagingRoom(first.state,'B');
 assert.deepEqual(buyerView.pending.offer,{definitionId:'t001',price:5});
 const result=send(first.state,response(first.state));
 assert.equal(result.state.players[1].hand.at(-1).instanceId,sel(s).soldInstanceId);
 assert.equal(result.state.players[1].money,15);
 assert.equal(result.state.players[0].money,25);
 assert.equal(result.state.turnCount,1);
 assert.equal(result.state.revision,3);
 assert.equal(s.players[0].hand.length,3);
});
test('staged single Super Mirror reflects ¥5 Sell-of-Sell and leaves offered Sell on A',()=>{
 const s=room(),original=JSON.stringify(s),item=sel(s).soldInstanceId;
 const p=previewSingleMirrorSale(s,catalog,sel(s),{
  mirrorInstanceId:s.players[1].hand[0].instanceId
 });
 assert.equal(p.price,5);
 assert.equal(p.itemDefinitionId,'t001');
 const direct=settleSingleMirrorSaleFixture(s,catalog,sel(s),{
  ...opt,mirrorInstanceId:s.players[1].hand[0].instanceId
 }).state;
 const staged=send(s,declare(s)),n=send(staged.state,response(staged.state,true)).state;
 for(const state of [direct,n]){
  assert.deepEqual(state.players.map(p=>[p.hp,p.mp,p.money]),[
   [40,10,15],[40,10,25]
  ]);
  assert.equal(state.players[0].hand[0].instanceId,item);
  assert.equal(state.players[1].hand.some(c=>c.instanceId===item),false);
  assert.deepEqual(state.players[0].hand.map(c=>c.definitionId),['t001','d001','d001']);
  assert.deepEqual(state.players[1].hand.map(c=>c.definitionId),['d005','d001']);
 }
 assert.equal(JSON.stringify(s),original);
});
test('same physical Sell instance cannot both invoke sale and be its sold item',()=>{
 const s=room();
 const invalid={...sel(s),soldInstanceId:sel(s).saleInstanceId};
 assert.throws(()=>previewUncontestedSale(s,catalog,invalid),/differ/);
 assert.throws(()=>previewSingleMirrorSale(s,catalog,invalid,{
  mirrorInstanceId:s.players[1].hand[0].instanceId
 }),/differ/);
 const bad={...declare(s),soldInstanceId:sel(s).saleInstanceId};
 assert.throws(()=>send(s,bad),/differ/);
});
test('selling a second trade does not authorize a forged third settlement',()=>{
 const s=room(),first=send(s,declare(s)),accept=send(first.state,response(first.state));
 assert.equal(accept.state.players[0].hand.some(x=>x.definitionId==='t001'),false);
 assert.throws(()=>send(accept.state,{...declare(s),commandId:'illegal-repeat',
  expectedRevision:accept.state.revision}),/Not the active seat|Sale card not held/);
});
test('hotseat UI can choose two identical Sell definitions by distinct instance IDs',()=>{
 const lab=createV2LabController({hands:{A:['t001','t001','d005'],B:['i002','d001']}});
 const a=lab.reveal();
 assert.equal(a.hand[0].definitionId,'t001');
 assert.equal(a.hand[1].definitionId,'t001');
 assert.notEqual(a.hand[0].instanceId,a.hand[1].instanceId);
 lab.toggle({instanceId:a.hand[0].instanceId});
 lab.toggle({instanceId:a.hand[1].instanceId});
 assert.match(renderV2LabMarkup(lab.view()),/取引を申し込む/);
 const sent=lab.submit();
 assert.equal(sent.ok,true,sent.error);
 const b=lab.reveal();
 assert.equal(b.pending.offer.label,'売る');
 assert.equal(b.pending.offer.price,5);
 assert.match(renderV2LabMarkup(b),/売り付けられた神器：売る/);
 assert.match(renderV2LabMarkup(b),/価格 ¥5/);
 assert.equal(lab.submit().ok,true);
 assert.deepEqual(lab.labSnapshot().players[1].hand.map(x=>x.definitionId),
  ['i002','d001','t001']);
});

test('a Sell artifact received as merchandise can be used on the buyer next turn',()=>{
 const lab=createV2LabController({
  hands:{A:['t001','t001','d001'],B:['i002','d005']}
 });
 // Turn A: sell the SECOND physical Sell artifact to B.
 const a=lab.reveal();
 lab.toggle({instanceId:a.hand[0].instanceId});
 lab.toggle({instanceId:a.hand[1].instanceId});
 assert.equal(lab.submit().ok,true);
 lab.reveal();
 assert.equal(lab.submit().ok,true);
 let state=lab.labSnapshot();
 const acquired=state.players[1].hand.find(x=>x.definitionId==='t001');
 assert.ok(acquired);
 assert.equal(acquired.instanceId,a.hand[1].instanceId);
 // Turn B: use exactly this acquired Sell to sell physical d005 to A.
 const b=lab.reveal();
 assert.equal(b.actorId,'B');
 assert.equal(b.hand.find(x=>x.instanceId===acquired.instanceId).tradeAction,'sell');
 const item=b.hand.find(x=>x.definitionId==='d005');
 lab.toggle({instanceId:acquired.instanceId});
 lab.toggle({instanceId:item.instanceId});
 lab.setTarget('A');
 const second=lab.submit();
 assert.equal(second.ok,true,second.error);
 assert.equal(second.view.phase,'tradeDefense');
 assert.equal(second.view.actorId,'A');
 const answer=lab.reveal();
 assert.equal(answer.pending.offer.definitionId,'d005');
 assert.equal(lab.submit().ok,true);
 state=lab.labSnapshot();
 assert.equal(state.turnCount,2);
 assert.equal(state.phase,'turn');
 assert.equal(state.activePlayerId,'A');
 assert.equal(state.players[0].hand.some(x=>x.instanceId===item.instanceId),true);
 assert.equal(state.players[1].hand.some(x=>x.instanceId===acquired.instanceId),false);
 assert.equal(state.players[1].hand.some(x=>x.instanceId===item.instanceId),false);
});
