import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {inspectForcedSaleLethalityFixture} from '../v2/trade-lethal-review.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
const {byId:catalog}=migrateLegacyCatalog();
function room({soldId='w003',defense=['d005'],buyerStats={hp:15,mp:10,money:5}}={}){
 const s=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['t001',soldId,'d001']},
  {id:'B',handDefinitionIds:defense}
 ],firstSeatId:'A',rngSeed:89},catalog);
 Object.assign(s.players[1],buyerStats);
 return s;
}
const selection=s=>({
 sellerId:'A',targetId:'B',
 saleInstanceId:s.players[0].hand[0].instanceId,
 soldInstanceId:s.players[0].hand[1].instanceId
});
const inspect=s=>inspectForcedSaleLethalityFixture(s,catalog,selection(s));
test('normal ¥25 against HP15 MP10 ¥5 has source-backed money->MP->HP debit',()=>{
 const s=room(),before=JSON.stringify(s);
 const plan=inspect(s);
 assert.equal(plan.consequence,'survives');
 assert.equal(plan.needsZeroHpReview,false);
 assert.deepEqual(plan.payment.debit,{money:5,mp:10,hp:10});
 assert.deepEqual(plan.payment.buyerAfter,{hp:5,mp:0,money:0});
 assert.deepEqual(plan.unresolved,[]);
 assert.equal(plan.payment.sellerCredit,25);
 assert.equal(plan.itemDefinitionId,'w003');
 assert.equal(plan.price,25);
 assert.equal(Object.isFrozen(plan),true);
 assert.equal(Object.isFrozen(plan.unresolved),true);
 assert.equal(JSON.stringify(s),before);
});
test('exact full resources reaching HP0 remains separate from normal complete payment',()=>{
 const s=room({buyerStats:{hp:10,mp:10,money:5}});
 const plan=inspect(s);
 assert.equal(plan.consequence,'hp-zero-exact');
 assert.equal(plan.needsZeroHpReview,true);
 assert.equal(plan.payment.unpaid,0);
 assert.equal(plan.payment.paid,25);
 assert.equal(plan.payment.sellerCredit,25);
 assert.deepEqual(plan.payment.buyerAfter,{hp:0,mp:0,money:0});
 assert.ok(plan.unresolved.includes('zeroHpRecoveryOrResurrection'));
 assert.ok(plan.unresolved.includes('lethalCardTransferAndRefill'));
 assert.equal(plan.unresolved.includes('sellerCreditWithUnpaidAmount'),false);
});
test('underfunded lethal sale keeps sellerCredit null rather than fabricating payout',()=>{
 const s=room({buyerStats:{hp:1,mp:0,money:0}});
 const plan=inspect(s);
 assert.equal(plan.consequence,'hp-zero-shortfall');
 assert.equal(plan.needsZeroHpReview,true);
 assert.deepEqual(plan.payment.debit,{money:0,mp:0,hp:1});
 assert.equal(plan.payment.paid,1);
 assert.equal(plan.payment.unpaid,24);
 assert.equal(plan.payment.sellerCredit,null);
 assert.deepEqual(plan.payment.buyerAfter,{hp:0,mp:0,money:0});
 assert.ok(plan.unresolved.includes('sellerCreditWithUnpaidAmount'));
});
test('payment shortfall but not HP0 is mathematically impossible for living buyer',()=>{
 for(let hp=1;hp<=6;hp++)for(let mp=0;mp<=3;mp++)for(let money=0;money<=3;money++){
   const s=room({buyerStats:{hp,mp,money}});
   const p=inspect(s);
   assert.equal(p.payment.unpaid>0,p.payment.buyerEliminated);
   assert.equal(p.needsZeroHpReview,p.payment.buyerEliminated);
   assert.equal(p.payment.paid+p.payment.unpaid,p.price);
 }
});
test('randomized source of evidence does not affect price or room RNG',()=>{
 const s=room({buyerStats:{hp:1,mp:0,money:0}});
 const before=JSON.stringify(s),seed=s.rngSeed;
 const p=inspect(s);
 assert.equal(p.price,catalog.get('w003').stats.price);
 assert.equal(s.rngSeed,seed);
 assert.equal(JSON.stringify(s),before);
});
test('owner, physical Sell ID, and different offer ID are all validated',()=>{
 const s=room(),sel=selection(s);
 for(const invalid of [
  {...sel,sellerId:'B'},
  {...sel,targetId:'A'},
  {...sel,targetId:'C'},
  {...sel,saleInstanceId:sel.soldInstanceId},
  {...sel,saleInstanceId:s.players[0].hand[2].instanceId},
  {...sel,soldInstanceId:'fake'},
  {...sel,soldInstanceId:sel.saleInstanceId}
 ])assert.throws(()=>inspectForcedSaleLethalityFixture(s,catalog,invalid));
 assert.equal(s.phase,'turn');
});
test('invalid deleted player or missing current turn is rejected without cloning invalid input',()=>{
 const s=room();
 const snapshot=JSON.stringify(s);
 assert.throws(()=>inspectForcedSaleLethalityFixture({...s,phase:'defense'},
   catalog,selection(s)),/V2 research turn/);
 assert.throws(()=>inspectForcedSaleLethalityFixture({...s,activePlayerId:'B'},
   catalog,selection(s)),/current seller/);
 assert.equal(JSON.stringify(s),snapshot);
});
test('zero-price unused miracle cannot falsely show a lethal charge',()=>{
 const s=room({soldId:'m002',buyerStats:{hp:1,mp:0,money:0}});
 const p=inspect(s);
 assert.equal(p.price,0);
 assert.equal(p.payment.buyerAfter.hp,1);
 assert.equal(p.consequence,'survives');
 assert.deepEqual(p.payment.debit,{money:0,mp:0,hp:0});
});
test('lack of any safe defense refuses lethal sale before awaiting remote seat',()=>{
 const s=room({defense:['d005'],buyerStats:{hp:1,mp:0,money:0}});
 const initial=JSON.stringify(s),sel=selection(s);
 const command={type:'declareSale',actorId:'A',commandId:'lethal-offer',
  expectedRevision:s.revision,targetId:'B',
  saleInstanceId:sel.saleInstanceId,soldInstanceId:sel.soldInstanceId};
 assert.throws(()=>submitAndResolveFixture(s,command,catalog,{
  labOnly:true,fixtureDrawDefinitionId:'d001',authorizedSeatId:'A'
 }),/Lethal forced sale requires original zero-HP settlement verification/);
 assert.equal(JSON.stringify(s),initial);
});
test('a real Super Mirror may still deflect the otherwise fatal sale',()=>{
 const s=room({defense:['i002'],buyerStats:{hp:1,mp:0,money:0}});
 const sel=selection(s);
 const cmd={type:'declareSale',actorId:'A',commandId:'mirror-offer',
   expectedRevision:0,targetId:'B',saleInstanceId:sel.saleInstanceId,
   soldInstanceId:sel.soldInstanceId};
 const d=submitAndResolveFixture(s,cmd,catalog,{
  labOnly:true,fixtureDrawDefinitionId:'d001',authorizedSeatId:'A'
 });
 assert.equal(d.state.phase,'tradeDefense');
 const pass={type:'respondSale',actorId:'B',commandId:'pass-1',
   expectedRevision:d.state.revision};
 const state=JSON.stringify(d.state);
 assert.throws(()=>submitAndResolveFixture(d.state,pass,catalog,{
  labOnly:true,fixtureDrawDefinitionId:'d001',authorizedSeatId:'B'
 }),/Lethal forced sale requires original verification/);
 assert.equal(JSON.stringify(d.state),state);
 const reflected=submitAndResolveFixture(d.state,{
  ...pass,mirrorInstanceId:d.state.players[1].hand[0].instanceId
 },catalog,{labOnly:true,fixtureDrawDefinitionId:'d001',authorizedSeatId:'B'});
 assert.equal(reflected.state.players[1].hp,1);
 assert.equal(reflected.state.players[1].money,25);
});
