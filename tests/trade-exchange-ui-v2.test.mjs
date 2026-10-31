import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';
function trial(){
 const lab=createV2LabController();lab.loadExchangeTrial();return lab;
}
function select(lab,index=0){
 const card=lab.view().hand[index];
 assert.ok(card);
 lab.toggle({instanceId:card.instanceId});
}
const allocation={hp:50,mp:10,money:10};
test('Exchange trial launch uses a separate hand and hides it before reveal',()=>{
 const lab=createV2LabController();
 assert.match(renderV2LabMarkup(lab.view()),/data-action="exchange-demo"/);
 const v=lab.loadExchangeTrial();
 assert.equal(v.exchangeTrial,true);
 assert.equal(v.buyTrial,false);assert.equal(v.tradeTrial,false);
 assert.equal(v.revealed,false);assert.equal(v.hand.length,0);
 assert.deepEqual(lab.labSnapshot().players.map(p=>p.hand.map(c=>c.definitionId)),
  [['t003','d001'],['d005','i002']]);
});
test('selected Exchange displays 3 large named numeric inputs with current resources',()=>{
 const lab=trial();lab.reveal();select(lab);
 const data=lab.view(),html=renderV2LabMarkup(data);
 assert.equal(data.hand[0].tradeAction,'exchange');
 assert.deepEqual(data.exchangeAllocation,{hp:40,mp:10,money:20});
 assert.match(html,/data-exchange-field="hp"/);
 assert.match(html,/data-exchange-field="mp"/);
 assert.match(html,/data-exchange-field="money"/);
 assert.match(html,/振り分ける/);
 assert.match(html,/合計：70/);
 assert.match(html,/両替を確定/);
 assert.doesNotMatch(html,/data-target=/);
});
test('selected Exchange executes one legal turn and maintains resource conservation',()=>{
 const lab=trial(),initial=lab.labSnapshot();
 lab.reveal();select(lab);
 const out=lab.submit({allocation});
 assert.equal(out.ok,true,out.error);
 assert.equal(out.view.revealed,false);
 assert.equal(out.view.actorId,'B');
 const s=lab.labSnapshot();
 assert.equal(s.revision,2);
 assert.equal(s.turnCount,1);
 assert.equal(s.activePlayerId,'B');
 assert.deepEqual([s.players[0].hp,s.players[0].mp,s.players[0].money],[50,10,10]);
 assert.deepEqual(s.players[0].hand.map(c=>c.definitionId),['d001','d001']);
 assert.equal(s.players[1].hp,initial.players[1].hp);
 assert.equal(s.players[1].hand[0].instanceId,initial.players[1].hand[0].instanceId);
 assert.equal(out.events.map(e=>e.type).join(','),'spend,exchange,refill,turnAdvance');
});
test('bad sum is rejected without hand movement or turn change and edited draft is retained',()=>{
 const lab=trial();lab.reveal();select(lab);
 const before=JSON.stringify(lab.labSnapshot());
 const invalid={hp:50,mp:10,money:20};
 const result=lab.submit({allocation:invalid});
 assert.equal(result.ok,false);
 assert.match(result.error,/conserve total/);
 assert.equal(JSON.stringify(lab.labSnapshot()),before);
 assert.deepEqual(lab.view().exchangeAllocation,invalid);
 assert.match(renderV2LabMarkup(lab.view()),/value="50"/);
 const good=lab.submit({allocation});
 assert.equal(good.ok,true,good.error);
});
test('zero HP, negative MP, decimal and overflow are blocked with source state unchanged',()=>{
 const lab=trial();lab.reveal();select(lab);
 const before=JSON.stringify(lab.labSnapshot());
 for(const invalid of [
  {hp:0,mp:10,money:60},{hp:50,mp:-1,money:21},
  {hp:40.5,mp:9.5,money:20},{hp:Number.MAX_SAFE_INTEGER,mp:10,money:20}
 ]){
   const out=lab.submit({allocation:invalid});
   assert.equal(out.ok,false);
   assert.equal(JSON.stringify(lab.labSnapshot()),before);
 }
});
test('only one Exchange may be chosen and missing allocation rejected before command',()=>{
 const lab=trial();lab.reveal();
 select(lab);select(lab,1);
 const before=JSON.stringify(lab.labSnapshot());
 assert.throws(()=>lab.submit({allocation}),/「両替」だけ/);
 assert.equal(JSON.stringify(lab.labSnapshot()),before);
 select(lab,1);
 assert.throws(()=>lab.submit(),/配分を入力/);
 assert.equal(JSON.stringify(lab.labSnapshot()),before);
});
test('reset leaves the Exchange research mode and restores ordinary hand',()=>{
 const lab=createV2LabController(),initial=lab.labSnapshot();
 lab.loadExchangeTrial();lab.reveal();select(lab);lab.reset();
 assert.equal(lab.view().exchangeTrial,false);
 assert.equal(lab.view().revealed,false);
 assert.deepEqual(lab.labSnapshot().players.map(p=>p.hand.map(c=>c.definitionId)),
  initial.players.map(p=>p.hand.map(c=>c.definitionId)));
 assert.match(renderV2LabMarkup(lab.view()),/data-action="exchange-demo"/);
});
