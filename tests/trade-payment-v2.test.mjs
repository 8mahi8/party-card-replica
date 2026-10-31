import test from 'node:test';
import assert from 'node:assert/strict';
import {planForcedSalePayment} from '../v2/trade-payment.mjs';

/**
 * Source-backed scope: money -> MP -> HP debit only.
 * https://w.atwiki.jp/aniwotawiki/pages/47010.html
 * https://w.atwiki.jp/piong/pages/19.html
 *
 * Card transfer, source card spend, hand refill, and seller money during
 * lethal underpayment remain unimplemented and MUST NOT be invented.
 */
test('the original forced sale example debits ¥5 then MP10 then HP10 for ¥25',()=>{
 const buyer=Object.freeze({hp:15,mp:10,money:5}),before=JSON.stringify(buyer);
 const plan=planForcedSalePayment({price:25,buyer});
 assert.deepEqual(plan.debit,{money:5,mp:10,hp:10});
 assert.deepEqual(plan.buyerAfter,{hp:5,mp:0,money:0});
 assert.equal(plan.price,25);
 assert.equal(plan.paid,25);
 assert.equal(plan.unpaid,0);
 assert.equal(plan.sellerCredit,25);
 assert.equal(plan.buyerEliminated,false);
 assert.equal(plan.settlement,'complete');
 assert.equal(JSON.stringify(buyer),before);
 assert.equal(Object.isFrozen(plan),true);
 assert.equal(Object.isFrozen(plan.debit),true);
 assert.equal(Object.isFrozen(plan.buyerAfter),true);
});

test('money is exhausted before MP and HP are touched',()=>{
 const buyer={hp:40,mp:10,money:20};
 assert.deepEqual(planForcedSalePayment({price:7,buyer}).debit,
  {money:7,mp:0,hp:0});
 assert.deepEqual(planForcedSalePayment({price:24,buyer}).debit,
  {money:20,mp:4,hp:0});
 assert.deepEqual(planForcedSalePayment({price:33,buyer}).debit,
  {money:20,mp:10,hp:3});
});

test('zero-price miracle sale has no payment effects',()=>{
 const x=planForcedSalePayment({price:0,buyer:{hp:40,mp:10,money:20}});
 assert.equal(x.sellerCredit,0);
 assert.equal(x.paid,0);
 assert.deepEqual(x.debit,{money:0,mp:0,hp:0});
 assert.deepEqual(x.buyerAfter,{hp:40,mp:10,money:20});
});

test('exactly all resources owed eliminates buyer without an outstanding amount',()=>{
 const p=planForcedSalePayment({price:35,buyer:{hp:15,mp:10,money:10}});
 assert.equal(p.buyerEliminated,true);
 assert.equal(p.unpaid,0);
 assert.equal(p.settlement,'complete');
 assert.equal(p.sellerCredit,35);
 assert.deepEqual(p.buyerAfter,{hp:0,mp:0,money:0});
});

test('insufficient total resources kills buyer but does NOT invent seller payment',()=>{
 const p=planForcedSalePayment({price:45,buyer:{hp:15,mp:10,money:5}});
 assert.deepEqual(p.debit,{money:5,mp:10,hp:15});
 assert.equal(p.paid,30);
 assert.equal(p.unpaid,15);
 assert.equal(p.buyerEliminated,true);
 assert.equal(p.settlement,'lethal-unverified');
 assert.equal(p.sellerCredit,null,'original payout on lethal shortfall is unverified');
});

test('each safe price preserves nonnegative pools and exact conservation',()=>{
 const buyer={hp:40,mp:10,money:20},snapshot=JSON.stringify(buyer);
 for(let price=0;price<=100;price++){
  const p=planForcedSalePayment({price,buyer});
  assert.equal(p.debit.money+p.debit.mp+p.debit.hp,p.paid);
  assert.equal(p.paid+p.unpaid,price);
  assert.equal(p.buyerAfter.hp+p.debit.hp,buyer.hp);
  assert.equal(p.buyerAfter.mp+p.debit.mp,buyer.mp);
  assert.equal(p.buyerAfter.money+p.debit.money,buyer.money);
  assert.equal(p.unpaid,Math.max(0,price-70));
  assert.equal(p.sellerCredit,p.unpaid?null:price);
  assert.equal(p.buyerEliminated,p.buyerAfter.hp===0);
 }
 assert.equal(JSON.stringify(buyer),snapshot);
});

test('invalid price, buyer pools, and eliminated buyer are rejected',()=>{
 const buyer={hp:40,mp:10,money:20};
 for(const price of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'25',undefined])
  assert.throws(()=>planForcedSalePayment({price,buyer}),/Invalid sale price/);
 for(const key of ['hp','mp','money']){
  for(const value of [-1,0.25,NaN,Infinity,undefined]){
   assert.throws(()=>planForcedSalePayment({price:5,buyer:{...buyer,[key]:value}}),
    /Invalid buyer/);
  }
 }
 assert.throws(()=>planForcedSalePayment({price:5,buyer:{...buyer,hp:0}}),
  /Buyer is eliminated/);
 assert.throws(()=>planForcedSalePayment({price:5,buyer:null}),/Invalid buyer/);
});
