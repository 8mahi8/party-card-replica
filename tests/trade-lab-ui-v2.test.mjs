import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';

const use=(lab,view,index)=>lab.toggle({instanceId:view.hand[index].instanceId});
function declare(lab){
 const a=lab.reveal();
 use(lab,a,0);use(lab,a,1);
 const result=lab.submit();
 assert.equal(result.ok,true,result.error);
 return result;
}
test('default sealed view offers an optional isolated trade trial, not a live mode',()=>{
 const lab=createV2LabController();
 const initial=lab.view();
 assert.equal(initial.tradeTrial,false);
 assert.match(renderV2LabMarkup(initial),/data-action="trade-demo"/);
 assert.doesNotMatch(renderV2LabMarkup(initial),/売り付けられた神器/);
 const game=lab.loadTradeTrial();
 assert.equal(game.tradeTrial,true);
 assert.equal(game.revealed,false);
 assert.deepEqual(lab.labSnapshot().players.map(p=>p.hand.map(c=>c.definitionId)),
  [['t001','w003','d005'],['i002','d001']]);
 assert.doesNotMatch(renderV2LabMarkup(game),/data-card="hand"/);
 assert.doesNotMatch(renderV2LabMarkup(game),/data-action="trade-demo"/);
});
test('trade seller selects Sell then item; researched two-step view shows target',()=>{
 const lab=createV2LabController();lab.loadTradeTrial();
 const a=lab.reveal();
 assert.equal(a.hand[0].tradeAction,'sell');
 use(lab,a,0);
 assert.match(renderV2LabMarkup(lab.view()),/「売る」→売り渡す神器/);
 use(lab,a,1);
 const selected=renderV2LabMarkup(lab.view());
 assert.match(selected,/攻撃を確定/);
 const result=lab.submit();
 assert.equal(result.ok,true,result.error);
 assert.equal(result.view.phase,'tradeDefense');
 assert.equal(result.view.revealed,false);
 assert.equal(result.view.actorId,'B');
 assert.equal(result.view.hand.length,0);
 assert.match(result.view.notice,/取引相手に端末を渡して/);
 const locked=renderV2LabMarkup(result.view);
 assert.doesNotMatch(locked,/金のこん棒/,'handoff never reveals offer or hidden hand');
 const b=lab.reveal();
 assert.equal(b.pending.offer.label,'金のこん棒');
 assert.equal(b.pending.offer.price,25);
 const offered=renderV2LabMarkup(b);
 assert.match(offered,/売り付けられた神器/);
 assert.match(offered,/価格 ¥25/);
 assert.match(offered,/スーパーミラーで跳ね返す|売買を受け入れる/);
 assert.doesNotMatch(offered,/ci-\d+/,'instance IDs must not appear unencoded as text');
});
test('no mirror chosen means accept the sale; exactly the Sell card gets replaced',()=>{
 const lab=createV2LabController();lab.loadTradeTrial();declare(lab);
 const result=lab.reveal();
 assert.match(renderV2LabMarkup(result),/売買を受け入れる/);
 const accepted=lab.submit();
 assert.equal(accepted.ok,true,accepted.error);
 assert.equal(accepted.view.phase,'turn');
 assert.equal(accepted.view.actorId,'B');
 assert.equal(accepted.view.revealed,false);
 const s=lab.labSnapshot();
 assert.deepEqual(s.players.map(p=>[p.hp,p.mp,p.money]),[
  [40,10,45],[40,5,0]
 ]);
 assert.deepEqual(s.players[0].hand.map(c=>c.definitionId),['d005','d001']);
 assert.deepEqual(s.players[1].hand.map(c=>c.definitionId),['i002','d001','w003']);
 assert.equal(s.turnCount,1);
 assert.equal(s.revision,3);
});
test('one Super Mirror reverses payment and keeps the exact offered item',()=>{
 const lab=createV2LabController();lab.loadTradeTrial();
 const initial=lab.labSnapshot(),itemId=initial.players[0].hand[1].instanceId;
 declare(lab);
 const b=lab.reveal();
 assert.equal(b.hand[0].canReflectTrade,true);
 assert.equal(b.hand[1].tradeSelectable,false);
 use(lab,b,0);
 assert.match(renderV2LabMarkup(lab.view()),/スーパーミラーで跳ね返す/);
 const reflected=lab.submit();
 assert.equal(reflected.ok,true,reflected.error);
 const state=lab.labSnapshot();
 assert.equal(state.players[0].hand[0].instanceId,itemId);
 assert.equal(state.players[1].hand.some(c=>c.instanceId===itemId),false);
 assert.deepEqual(state.players.map(p=>[p.hp,p.mp,p.money]),[
  [40,5,0],[40,10,45]
 ]);
 assert.deepEqual(state.players[1].hand.map(c=>c.definitionId),['d001','d001']);
 assert.equal(state.turnCount,1);
});
test('a nonmirror card cannot be used for a trade defense; result is atomic',()=>{
 const lab=createV2LabController();lab.loadTradeTrial();declare(lab);
 const b=lab.reveal();
 const snapshot=JSON.stringify(lab.labSnapshot());
 assert.match(renderV2LabMarkup(b),/data-card="hand"[^>]*disabled/);
 assert.throws(()=>use(lab,b,1),/取引に使える防御はスーパーミラーだけ/);
 assert.equal(JSON.stringify(lab.labSnapshot()),snapshot);
 assert.equal(lab.view().selection.length,0);
 assert.equal(lab.submit().ok,true);
});
test('an incomplete or self-directed Sell cannot strand a trade-defending seat',()=>{
 const lab=createV2LabController();lab.loadTradeTrial();
 const a=lab.reveal();use(lab,a,0);
 const original=JSON.stringify(lab.labSnapshot());
 assert.throws(()=>lab.submit(),/「売る」と売り渡す神器/);
 assert.equal(JSON.stringify(lab.labSnapshot()),original);
 use(lab,a,1);lab.setTarget('A');
 assert.throws(()=>lab.submit(),/自分への売却は原作確認/);
 assert.equal(JSON.stringify(lab.labSnapshot()),original);
 lab.setTarget('B');
 assert.equal(lab.submit().ok,true);
});
test('reset returns to normal research hand after trade trial',()=>{
 const lab=createV2LabController(),initial=lab.labSnapshot();
 lab.loadTradeTrial();declare(lab);lab.reset();
 assert.equal(lab.view().phase,'turn');
 assert.equal(lab.view().tradeTrial,false);
 assert.equal(lab.view().revealed,false);
 assert.deepEqual(lab.labSnapshot().players.map(p=>p.hand.map(x=>x.definitionId)),
   initial.players.map(p=>p.hand.map(x=>x.definitionId)));
 assert.match(renderV2LabMarkup(lab.view()),/data-action="trade-demo"/);
});
