import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {previewUncontestedSale,settleUncontestedSaleFixture} from '../v2/trade-sale.mjs';
import {runEffectQueueFixture} from '../v2/effect-runner.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const options={labOnly:true,authorizedSeatId:'A',fixtureDrawDefinitionId:'d001'};
function room(A=['t001','w003','d001'],B=['d014'],C=null){
 const seats=[{id:'A',handDefinitionIds:A},{id:'B',handDefinitionIds:B}];
 if(C)seats.push({id:'C',handDefinitionIds:C});
 return createStagingRoom({seats,firstSeatId:'A',rngSeed:789},catalog);
}
function selection(s,sold=1,target='B'){
 return {sellerId:'A',targetId:target,
  saleInstanceId:s.players[0].hand[0].instanceId,
  soldInstanceId:s.players[0].hand[sold].instanceId};
}
function settle(s,sel=selection(s),opts=options){
 return settleUncontestedSaleFixture(s,catalog,sel,opts);
}
test('Sell reference defines one trade card with source-backed 20/500 slots',()=>{
 const def=catalog.get('t001');
 assert.equal(def.family,'trade');
 assert.equal(def.stats.price,5);
 assert.equal(def.drawWeight,20);
 assert.deepEqual(def.playModes,['trade']);
 assert.deepEqual(def.effects.map(e=>[e.when,e.type,e.params.kind]),
  [['onDeclare','forceSale','sell']]);
});
test('uncontested ¥25 gold club sale: ¥5+MP10+HP10 paid, sale card refills only',()=>{
 const s=room(),seller=s.players[0],buyer=s.players[1];
 buyer.hp=15;buyer.mp=10;buyer.money=5;
 const before=JSON.stringify(s),serial=s.nextInstanceSerial;
 const offer=selection(s),sold=seller.hand[1];
 const plan=previewUncontestedSale(s,catalog,offer);
 assert.equal(plan.price,25);
 assert.deepEqual(plan.payment.buyerAfter,{hp:5,mp:0,money:0});
 const r=settle(s,offer),n=r.state;
 assert.equal(n.revision,2);
 assert.equal(n.turnCount,1);
 assert.equal(n.activePlayerId,'B');
 assert.equal(n.phase,'turn');
 assert.equal(n.pending,null);
 assert.equal(n.players[0].money,45);
 assert.equal(n.players[1].hp,5);
 assert.equal(n.players[1].mp,0);
 assert.equal(n.players[1].money,0);
 assert.deepEqual(n.players[0].hand.map(x=>x.definitionId),['d001','d001']);
 assert.deepEqual(n.players[1].hand.map(x=>x.definitionId),['d014','w003']);
 assert.strictEqual(n.players[1].hand[1].instanceId,sold.instanceId);
 assert.equal(n.nextInstanceSerial,serial+1);
 assert.deepEqual(r.events.map(e=>e.type),
  ['spend','uncontestedSale','refill','turnAdvance']);
 assert.deepEqual(r.events.find(x=>x.type==='refill'),{type:'refill',playerId:'A',added:1});
 assert.equal(JSON.stringify(s),before);
});
test('selling a zero-price unlearned miracle transfers its exact instance for free',()=>{
 const s=room(['t001','m002','d001'],['d005']);
 const id=s.players[0].hand[1].instanceId;
 const n=settle(s).state;
 assert.equal(n.players[0].money,20);
 assert.equal(n.players[1].money,20);
 assert.equal(n.players[1].hand.at(-1).instanceId,id);
 assert.equal(n.players[1].hand.at(-1).definitionId,'m002');
 assert.equal(n.players[0].hand.length,2);
 assert.equal(n.players[1].hand.length,2);
});
test('sale works with 3 seats and skip-dead on next turn, without touching C',()=>{
 const s=room(['t001','w016'],['d005'],['d001']);
 s.players[1].hp=0;
 const snapshot=JSON.stringify(s),other=s.players[2].hand[0].instanceId;
 assert.throws(()=>settle(s,selection(s,1,'B')),/Invalid alive trade parties/);
 // Sell to living C; B remains dead and is skipped on advance.
 const n=settle(s,selection(s,1,'C')).state;
 assert.equal(n.activePlayerId,'C');
 assert.equal(n.players[1].hp,0);
 assert.equal(n.players[2].hand[0].instanceId,other);
 assert.equal(n.players[2].hand[1].definitionId,'w016');
 assert.equal(n.players[2].money,16);
 assert.equal(n.players[0].money,24);
 assert.equal(JSON.stringify(s),snapshot);
});
test('a sale at 18-card limit randomly replaces one existing receiver card, preserving the incoming item',()=>{
 const s=room(['t001','w016'],Array(18).fill('d001'));
 const before=JSON.stringify(s),originalIds=s.players[1].hand.map(c=>c.instanceId);
 const soldId=s.players[0].hand[1].instanceId;
 const result=settle(s),buyer=result.state.players[1];
 const event=result.events.find(x=>x.type==='handOverflow');
 assert.ok(event);
 assert.equal(event.playerId,'B');
 assert.equal(event.cause,'trade');
 assert.ok(originalIds.includes(event.lostInstanceId));
 assert.equal(buyer.hand.length,18);
 assert.equal(buyer.hand.at(-1).instanceId,soldId);
 assert.equal(buyer.hand.filter(x=>originalIds.includes(x.instanceId)).length,17);
 assert.equal(result.state.players[0].money,24);
 assert.equal(JSON.stringify(s),before);
});
test('lethal underpayment is not settled until original payout/reflection observed',()=>{
 for(const {hp,mp,money} of [
  {hp:1,mp:0,money:0},{hp:5,mp:10,money:5}
 ]){
  const s=room();
  Object.assign(s.players[1],{hp,mp,money});
  const before=JSON.stringify(s);
  assert.throws(()=>settle(s),/Lethal forced sale requires original verification/);
  assert.equal(JSON.stringify(s),before);
 }
});
test('invalid seats, bogus trade item, forged ownership and self-target are rejected',()=>{
 const s=room(),before=JSON.stringify(s);
 for(const change of [
  {sellerId:'B'},{targetId:'A'},{targetId:'Z'},
  {saleInstanceId:s.players[0].hand[1].instanceId},
  {saleInstanceId:'ci-missing'},{soldInstanceId:'ci-missing'},
  {soldInstanceId:s.players[0].hand[0].instanceId},
  {soldInstanceId:'nonsense'}
 ]){
  assert.throws(()=>previewUncontestedSale(s,catalog,{...selection(s),...change}));
 }
 assert.throws(()=>settle(s,selection(s),{...options,authorizedSeatId:'B'}),
  /Sender seat is not authenticated/);
 assert.throws(()=>settle(s,selection(s),{...options,labOnly:false}),
  /lab fixture mode/);
 assert.equal(JSON.stringify(s),before);
});
test('forged queue price cannot be specified and a sell must use real catalog price',()=>{
 const s=room(),offer=selection(s);
 const staged={...s,phase:'resolving',pending:{type:'uncontestedSale'},activePlayerId:null};
 const forged=[
  {type:'spend',playerId:'A',instanceIds:[offer.saleInstanceId]},
  {type:'uncontestedSale',sellerId:'A',buyerId:'B',
   soldInstanceId:offer.soldInstanceId,price:0},
  {type:'refill'},{type:'advance',afterId:'A'}
 ];
 assert.throws(()=>runEffectQueueFixture(staged,catalog,forged,options),
  /Unexpected sale effect property/);
 assert.throws(()=>runEffectQueueFixture(staged,catalog,[
  {type:'uncontestedSale',sellerId:'A',buyerId:'B',
   soldInstanceId:offer.soldInstanceId},
  {type:'advance',afterId:'A'}
 ],options),/requires spending a valid Sell trade card/);
 assert.equal(s.players[0].money,20);
});
test('sale transaction fails atomically when seller money would overflow',()=>{
 const s=room();s.players[0].money=Number.MAX_SAFE_INTEGER-1;
 const snapshot=JSON.stringify(s);
 assert.throws(()=>settle(s),/Seller money overflow/);
 assert.equal(JSON.stringify(s),snapshot);
});
test('replayed settlement against already-transferred trade card is rejected',()=>{
 const s=room(),offer=selection(s);
 const first=settle(s,offer);
 assert.throws(()=>settle(first.state,offer),/Only current seller|Sale card not held/);
 assert.equal(first.state.players[0].hand[0].definitionId,'d001');
 assert.equal(s.players[0].hand[0].definitionId,'t001');
});
test('player view hides sold card and private hands until the public settlement',()=>{
 const s=room(),result=settle(s),a=viewStagingRoom(result.state,'A');
 assert.equal(Object.hasOwn(a.players[1],'hand'),false);
 assert.equal(JSON.stringify(a).includes('processedCommands'),false);
 assert.equal(JSON.stringify(a).includes('uncontestedSale'),false);
 assert.equal(a.players[1].handCount,2);
});
