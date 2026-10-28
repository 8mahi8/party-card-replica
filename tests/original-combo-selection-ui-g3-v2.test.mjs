import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2LabController} from '../v2/lab-controller.mjs';

// These are hotseat/UI-through-engine regressions, NOT direct tests of the
// current official God Field server. Source: oreapo's 2025 server/API bot
// selection research: https://note.com/oreapo_note/n/n7791e8e30943
function lab(cards){
  const ui=createV2LabController({hands:{A:cards,B:[]}});
  const first=ui.reveal();
  return {ui,hand:first.hand};
}
function select(ui,cards){
  for(const c of cards)ui.toggle({instanceId:c.instanceId});
}
function finishUnprotected(ui){
  assert.equal(ui.view().phase,'defense');
  assert.equal(ui.view().revealed,false);
  assert.equal(ui.view().hand.length,0);
  ui.reveal();
  const defended=ui.submit();
  assert.equal(defended.ok,true);
  return ui.labSnapshot();
}

test('source-explicit weapon -> Fireball -> Fireball -> Spirit uses only MP2 through hotseat',()=>{
  const {ui,hand}=lab(['w016','m005','m005','i003']);
  select(ui,hand);
  assert.deepEqual(ui.view().selection.map(x=>x.instanceId),
    hand.map(x=>x.instanceId));
  const attack=ui.submit();
  assert.equal(attack.ok,true);
  const state=finishUnprotected(ui);
  assert.equal(state.players[1].hp,26); // 10 + 2 + 2
  assert.equal(state.players[0].mp,8); // only SECOND Fireball is free
  assert.deepEqual(state.players[0].learned,['m005']);
  assert.equal(state.players[0].hand.length,4);
  const afterIds=state.players[0].hand.map(c=>c.instanceId);
  assert.equal(afterIds.some(id=>hand.some(c=>c.instanceId===id)),false);
});

test('without Spirit the same two Fireballs cost MP4 through hotseat',()=>{
  const {ui,hand}=lab(['w016','m005','m005']);
  select(ui,hand);
  assert.equal(ui.submit().ok,true);
  const state=finishUnprotected(ui);
  assert.equal(state.players[1].hp,26);
  assert.equal(state.players[0].mp,6);
  assert.deepEqual(state.players[0].learned,['m005']);
});

test('API-rejected Meteor-first + Fireball is refused BEFORE defender handoff and remains editable',()=>{
  const {ui,hand}=lab(['m006','m005']);
  select(ui,hand);
  const before=JSON.stringify(ui.labSnapshot());
  const outcome=ui.submit();
  assert.equal(outcome.ok,false);
  assert.equal(ui.view().phase,'turn');
  assert.equal(ui.view().revealed,true);
  assert.equal(JSON.stringify(ui.labSnapshot()),before);
  assert.equal(ui.view().selection.length,2);
  ui.toggle({instanceId:hand[1].instanceId});
  assert.equal(ui.submit().ok,true);
  const state=finishUnprotected(ui);
  assert.equal(state.players[1].hp,30);
  assert.equal(state.players[0].mp,3);
});

test('unverified weapon -> Fireball -> extra weapon remains blocked without consuming anything',()=>{
  const {ui,hand}=lab(['w016','m005','a003']);
  select(ui,hand);
  const before=JSON.stringify(ui.labSnapshot());
  const outcome=ui.submit();
  assert.equal(outcome.ok,false);
  assert.equal(ui.view().phase,'turn');
  assert.equal(ui.view().revealed,true);
  assert.equal(JSON.stringify(ui.labSnapshot()),before);
  // This restriction is research-only, not a claim the official game rejects it.
  ui.toggle({instanceId:hand[2].instanceId});
  assert.equal(ui.submit().ok,true);
  const state=finishUnprotected(ui);
  assert.equal(state.players[1].hp,28);
  assert.equal(state.players[0].mp,8);
});

test('weapon -> extra weapon -> Fireball is supported and distinct from the uncertain reverse',()=>{
  const {ui,hand}=lab(['w016','a003','m005']);
  select(ui,hand);
  assert.equal(ui.submit().ok,true);
  const state=finishUnprotected(ui);
  assert.equal(state.players[1].hp,25);
  assert.equal(state.players[0].mp,8);
  assert.deepEqual(state.players[0].learned,['m005']);
});
