import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';

function trial(){
 const lab=createV2LabController();
 lab.loadBuyTrial();
 return lab;
}
function select(lab,index=0){
 const current=lab.view();
 const card=current.hand[index];
 assert.ok(card);
 lab.toggle({instanceId:card.instanceId});
}
function begin(lab){
 const a=lab.reveal();
 assert.equal(a.hand[0].tradeAction,'buy');
 select(lab);
 assert.match(renderV2LabMarkup(lab.view()),/取引を申し込む/);
 const out=lab.submit();
 assert.equal(out.ok,true,out.error);
 assert.equal(out.view.phase,'buyDefense');
 assert.equal(out.view.revealed,false);
 return out;
}
function pass(lab){
 const b=lab.reveal();
 assert.equal(b.hand[1].canReflectTrade,true);
 assert.equal(b.hand[0].tradeSelectable,false);
 assert.equal(b.hand[1].tradeSelectable,true);
 const html=renderV2LabMarkup(b);
 assert.match(html,/買うへの応答/);
 assert.match(html,/買うを許す/);
 assert.doesNotMatch(html,/購入候補：/);
 const out=lab.submit();
 assert.equal(out.ok,true,out.error);
 assert.equal(out.view.phase,'buyDecision');
 assert.equal(out.view.revealed,false);
 return out;
}

test('new Buy trial launcher is separate from Sell and hides P1 hand before reveal',()=>{
 const lab=createV2LabController();
 const first=renderV2LabMarkup(lab.view());
 assert.match(first,/data-action="trade-demo"/);
 assert.match(first,/data-action="buy-demo"/);
 const v=lab.loadBuyTrial();
 assert.equal(v.buyTrial,true);
 assert.equal(v.tradeTrial,false);
 assert.equal(v.revealed,false);
 assert.deepEqual(lab.labSnapshot().players.map(p=>p.hand.map(c=>c.definitionId)),
  [['t002','d001'],['d005','i002']]);
 assert.match(renderV2LabMarkup(v),/P1 の番/);
 assert.doesNotMatch(renderV2LabMarkup(v),/data-card="hand"/);
});
test('Buy declaration and target pass preserve privacy at both handoffs',()=>{
 const lab=trial();
 begin(lab);
 const anonymous=lab.view();
 assert.equal(anonymous.hand.length,0);
 assert.equal(anonymous.actorId,'B');
 assert.equal(anonymous.pending.offer,undefined);
 assert.match(renderV2LabMarkup(anonymous),/P2 の番/);
 pass(lab);
 const privateA=lab.view();
 assert.equal(privateA.actorId,'A');
 assert.equal(privateA.hand.length,0);
 assert.equal(privateA.pending.offer.definitionId,'d005');
 assert.equal(privateA.pending.offer.label,'アイアンアーマー');
 assert.equal(privateA.pending.offer.price,5);
 assert.match(renderV2LabMarkup(privateA),/P1 の番/);
 assert.doesNotMatch(renderV2LabMarkup(privateA),/購入候補：/);
 const a=lab.reveal();
 const html=renderV2LabMarkup(a);
 assert.match(html,/購入候補：アイアンアーマー/);
 assert.match(html,/価格 ¥5/);
 assert.match(html,/data-action="buy-accept"/);
 assert.match(html,/data-action="buy-decline"/);
 assert.doesNotMatch(html,/data-card="hand"/);
});
test('buying the original random item spends ¥5, transfers ID, refills once and changes seats',()=>{
 const lab=trial(),before=lab.labSnapshot();
 const offered=before.players[1].hand[0].instanceId;
 begin(lab);pass(lab);lab.reveal();
 const out=lab.submit({accept:true});
 assert.equal(out.ok,true,out.error);
 assert.equal(out.view.revealed,false);
 assert.equal(out.view.phase,'turn');
 assert.equal(out.view.actorId,'B');
 const after=lab.labSnapshot();
 assert.equal(after.turnCount,1);
 assert.equal(after.revision,4);
 assert.equal(after.pending,null);
 assert.deepEqual(after.players.map(p=>[p.hp,p.mp,p.money]),[
   [40,10,15],[40,10,25]
 ]);
 assert.equal(after.players[0].hand[1].instanceId,offered);
 assert.deepEqual(after.players[0].hand.map(c=>c.definitionId),
  ['d001','d005','d001']);
 assert.deepEqual(after.players[1].hand.map(c=>c.definitionId),['i002']);
 assert.equal(lab.view().hand.length,0);
});
test('declining Buy spends only the Buy action, never the offered item or money',()=>{
 const lab=trial(),before=lab.labSnapshot();
 begin(lab);pass(lab);lab.reveal();
 const out=lab.submit({accept:false});
 assert.equal(out.ok,true,out.error);
 const after=lab.labSnapshot();
 assert.equal(after.players[0].money,20);
 assert.equal(after.players[1].money,20);
 assert.deepEqual(after.players[1].hand,before.players[1].hand);
 assert.deepEqual(after.players[0].hand.map(c=>c.definitionId),
  ['d001','d001']);
 assert.equal(after.turnCount,1);
});
test('real Super Mirror is recognized but an unverified reflection does not mutate game',()=>{
 const lab=trial();begin(lab);
 const hand=lab.reveal();
 assert.equal(hand.hand[0].tradeSelectable,false);
 assert.throws(()=>select(lab,0),/スーパーミラー/);
 select(lab,1);
 assert.match(renderV2LabMarkup(lab.view()),/未検証/);
 const snapshot=JSON.stringify(lab.labSnapshot());
 const result=lab.submit();
 assert.equal(result.ok,false);
 assert.match(result.error,/原作の確認待ち/);
 assert.equal(JSON.stringify(lab.labSnapshot()),snapshot);
 assert.equal(lab.view().phase,'buyDefense');
 // Remove mirror and proceed with the researched non-reflected case.
 select(lab,1);
 assert.equal(lab.submit().ok,true);
});
test('Buy trial reset removes staging and restores the default scenario',()=>{
 const lab=trial();begin(lab);
 lab.reset();
 assert.equal(lab.view().buyTrial,false);
 assert.equal(lab.view().tradeTrial,false);
 assert.equal(lab.view().phase,'turn');
 assert.equal(lab.view().revealed,false);
 assert.match(renderV2LabMarkup(lab.view()),/data-action="buy-demo"/);
});
test('attempting to select extra purchase goods or self-buy is rejected without room change',()=>{
 const lab=trial(),before=JSON.stringify(lab.labSnapshot());
 const initial=lab.reveal();
 select(lab,0);select(lab,1);
 assert.throws(()=>lab.submit(),/「買う」だけを1枚/);
 assert.equal(JSON.stringify(lab.labSnapshot()),before);
 select(lab,1);lab.setTarget('A');
 assert.throws(()=>lab.submit(),/自分への買う/);
 assert.equal(JSON.stringify(lab.labSnapshot()),before);
 assert.equal(initial.tradeTrial,false);
});
test('Buy decision requires explicit boolean and a failed choice does not advance',()=>{
 const lab=trial();begin(lab);pass(lab);lab.reveal();
 const before=JSON.stringify(lab.labSnapshot());
 assert.throws(()=>lab.submit(),/買うか買わないか/);
 assert.equal(JSON.stringify(lab.labSnapshot()),before);
 assert.equal(lab.submit({accept:false}).ok,true);
});
