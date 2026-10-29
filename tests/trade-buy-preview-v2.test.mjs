import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {drawRandom32} from '../v2/foundation.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {previewBuyOfferFixture,previewBuyChoiceFixture} from '../v2/trade-buy.mjs';

const {byId:catalog}=migrateLegacyCatalog();
function room(B=['w003','m002','d005'],A=['t001','d001'],seed=53){
 return createStagingRoom({seats:[
   {id:'A',handDefinitionIds:A},{id:'B',handDefinitionIds:B}
 ],firstSeatId:'A',rngSeed:seed},catalog);
}
const selection={buyerId:'A',targetId:'B'};
const offer=s=>previewBuyOfferFixture(s,catalog,selection);
const choose=(s,o,accept)=>previewBuyChoiceFixture(s,catalog,o,{accept});

test('Buy samples one owned physical card, preserving its identity and original room',()=>{
 const s=room(),before=JSON.stringify(s);
 const p=offer(s),target=s.players[1].hand;
 const draw=drawRandom32(s.rngSeed);
 const selected=target[Math.floor(draw.value*target.length)];
 assert.equal(p.type,'buyOfferFixture');
 assert.equal(p.itemInstanceId,selected.instanceId);
 assert.equal(p.itemDefinitionId,selected.definitionId);
 assert.equal(p.price,catalog.get(selected.definitionId).stats.price);
 assert.equal(p.canAfford,s.players[0].money>=p.price);
 assert.equal(p.nextSeed,draw.nextSeed);
 assert.equal(p.originRevision,s.revision);
 assert.equal(Object.isFrozen(p),true);
 assert.equal(JSON.stringify(s),before);
});
test('research sampling explores every physical position without disclosing a full hand',()=>{
 const s=room(['d001','w003','m002','d005']);
 const seen=new Set();
 for(let seed=1;seed<=20000;seed++){
   const sample=offer({...s,rngSeed:seed});
   seen.add(sample.itemInstanceId);
   assert.equal(Object.hasOwn(sample,'targetHand'),false);
   assert.equal(Object.hasOwn(sample,'players'),false);
 }
 assert.equal(seen.size,4);
});
test('unused miracle costs 0 and is affordable even when buyer has no money',()=>{
 const s=room(['m002']),buyer=s.players[0];
 buyer.money=0;
 const before=JSON.stringify(s),p=offer(s),decision=choose(s,p,true);
 assert.equal(p.price,0);
 assert.equal(p.canAfford,true);
 assert.equal(decision.decision,'accepted');
 assert.equal(decision.price,0);
 assert.equal(decision.buyerMoneyAfter,0);
 assert.equal(decision.sellerMoneyAfter,20);
 assert.equal(decision.overflow.willOverflow,false);
 assert.equal(JSON.stringify(s),before);
});
test('money shortfall is Poor even if buyer has plenty of MP and HP',()=>{
 const s=room(['w003']); // gold club, price 25
 Object.assign(s.players[0],{money:24,mp:1000,hp:1000});
 const before=JSON.stringify(s),p=offer(s);
 assert.equal(p.canAfford,false);
 assert.throws(()=>choose(s,p,true),/Poor: Buy cannot spend MP or HP/);
 const decline=choose(s,p,false);
 assert.equal(decline.decision,'declined');
 assert.equal(decline.buyerMoneyAfter,24);
 assert.equal(decline.sellerMoneyAfter,20);
 assert.equal(JSON.stringify(s),before);
});
test('exact-money purchase uses only money, preserves the target item ID in preview',()=>{
 const s=room(['w003']);
 s.players[0].money=25;
 const before=JSON.stringify(s),p=offer(s),d=choose(s,p,true);
 assert.equal(d.decision,'accepted');
 assert.equal(d.buyerMoneyAfter,0);
 assert.equal(d.sellerMoneyAfter,45);
 assert.equal(d.price,25);
 assert.equal(d.itemInstanceId,s.players[1].hand[0].instanceId);
 assert.equal(d.nextSeed,p.nextSeed);
 assert.equal(d.overflow.willOverflow,false);
 assert.equal(JSON.stringify(s),before);
});
test('declining a displayed offer consumes no extra random sample or payment',()=>{
 const s=room(['d005','w003'],['t001',...Array(17).fill('d001')]);
 const before=JSON.stringify(s),p=offer(s),d=choose(s,p,false);
 assert.equal(d.decision,'declined');
 assert.equal(d.overflow,null);
 assert.equal(d.nextSeed,p.nextSeed);
 assert.equal(d.buyerMoneyAfter,20);
 assert.equal(d.sellerMoneyAfter,20);
 assert.equal(JSON.stringify(s),before);
});
test('full hand purchase previews loss of one old card using the shared overflow planner',()=>{
 const s=room(['d005'],['t001',...Array(17).fill('d001')],91);
 const p=offer(s),d=choose(s,p,true);
 assert.equal(d.overflow.willOverflow,true);
 const oldIds=s.players[0].hand.map(c=>c.instanceId);
 assert.ok(oldIds.includes(d.overflow.evictedInstanceId));
 assert.equal(d.overflow.nextSeed,d.nextSeed);
 assert.notEqual(d.nextSeed,p.nextSeed);
 assert.equal(s.players[0].hand.length,18,'pure preview never modifies a hand');
});
test('learned miracles at the total cap stay unresolved; below cap purchase works',()=>{
 const s=room(['d005'],['t001',...Array(16).fill('d001')]);
 s.players[0].learned=['m002'];
 const p=offer(s),snapshot=JSON.stringify(s);
 assert.throws(()=>choose(s,p,true),/Learned miracle overflow/);
 assert.equal(choose(s,p,false).decision,'declined');
 assert.equal(JSON.stringify(s),snapshot);
 s.players[0].hand.pop();
 const under=offer(s),d=choose(s,under,true);
 assert.equal(d.overflow.willOverflow,false);
});
test('stale, forged or extra-field buy offers cannot be accepted or declined',()=>{
 const s=room(['d005','w003']),p=offer(s);
 const snapshot=JSON.stringify(s);
 for(const forged of [
   {...p,price:0},{...p,itemInstanceId:'ci-fake'},
   {...p,nextSeed:1},{...p,canAfford:!p.canAfford},
   {...p,extra:'visible'},{...p,originRevision:p.originRevision+1}
 ]){
   assert.throws(()=>choose(s,forged,true),/Stale or forged/);
   assert.throws(()=>choose(s,forged,false),/Stale or forged/);
 }
 assert.throws(()=>choose({...s,revision:s.revision+1},p,true),/Stale or forged/);
 assert.throws(()=>choose(s,p,undefined),/explicit/);
 assert.equal(JSON.stringify(s),snapshot);
});
test('self-target, eliminated seats and empty target hands remain fail-closed',()=>{
 for(const s of [room([]),room(['d005'])]){
   assert.throws(()=>previewBuyOfferFixture(s,catalog,{buyerId:'A',targetId:'A'}));
 }
 const empty=room([]);
 assert.throws(()=>offer(empty),/empty hand/);
 const dead=room(['d005']);dead.players[1].hp=0;
 assert.throws(()=>offer(dead),/living buyer and target/);
 assert.throws(()=>previewBuyOfferFixture(dead,catalog,{buyerId:'B',targetId:'A'}));
});
test('unexpected balance overflow and malformed card ownership cannot create a payment plan',()=>{
 const s=room(['w003']);
 s.players[0].money=25;
 s.players[1].money=Number.MAX_SAFE_INTEGER-1;
 const p=offer(s),before=JSON.stringify(s);
 assert.throws(()=>choose(s,p,true),/Seller money overflow/);
 assert.equal(choose(s,p,false).decision,'declined');
 assert.equal(JSON.stringify(s),before);
 const malformed=room(['w003','d005']);
 malformed.players[1].hand[1]={...malformed.players[1].hand[0]};
 assert.throws(()=>offer(malformed),/Invalid target hand item/);
});
