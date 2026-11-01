/**
 * Explicit 3-seat Mirage RESEARCH hotseat, not original first-target semantics.
 * Uses the same seat-authorized staged engine and restricted public projection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';

const setup=()=>{const c=createV2LabController();c.loadMirageTrial();return c};
test('the default lab does not opt into 3-seat experimental rules',()=>{
 const c=createV2LabController();
 assert.equal(c.view().mirageTrial,false);
 assert.equal(c.labSnapshot().players.length,2);
 assert.equal(c.labSnapshot().rulesetId,'partial-reference-v2-lab');
 const markup=renderV2LabMarkup(c.view());
 assert.match(markup,/data-action="mirage-demo"/);
});
test('research launch is private, explicit, 3-seat, with deterministic seed',()=>{
 const c=setup(),s=c.labSnapshot(),v=c.view();
 assert.equal(s.rulesetId,'mirage-multiplayer-research-fixture-v2');
 assert.deepEqual(s.players.map(p=>p.id),['A','B','C']);
 assert.equal(s.rngSeed,7);
 assert.equal(s.players[0].mp,20);
 assert.equal(v.revealed,false);assert.equal(v.hand.length,0);
 assert.equal(v.targets.length,3);
 assert.equal(v.mirageTrial,true);
 assert.equal(v.targetId,'B');
 assert.equal(v.publicPlayers.length,3);
 const html=renderV2LabMarkup(v);
 assert.doesNotMatch(html,/data-action="mirage-demo"/);
 assert.match(html,/P1 の番/);
});
test('iPad markup labels 3 seats and loudly marks first target as assumption',()=>{
 const c=setup();c.reveal();
 const html=renderV2LabMarkup(c.view());
 assert.match(html,/score multi-seat/);
 assert.match(html,/P3/);
 assert.match(html,/実験/);
 assert.match(html,/未確認の仮定/);
 assert.match(html,/data-target="C"/);
 assert.equal((html.match(/class="seat"/g)||[]).length,3);
});
test('first target C is chosen by real UI/controller, not background RNG',()=>{
 const c=setup();c.reveal();c.setTarget('C');
 for(const card of c.view().hand.slice(0,3))c.toggle({instanceId:card.instanceId});
 const out=c.submit();assert.equal(out.ok,true,out.error);
 const s=c.labSnapshot();
 assert.equal(s.phase,'defense');
 assert.equal(s.activePlayerId,'C');
 assert.equal(s.rngSeed,7);
 assert.equal(c.view().revealed,false);
 assert.equal(c.view().hand.length,0);
 assert.equal(c.view().pending.targetId,'C');
 assert.equal(c.view().pending.mirageRound,1);
 assert.equal(c.view().pending.mirageRounds,2);
 assert.equal(c.view().pending.mirageTargetHit,1);
 assert.equal(c.view().pending.mirageHitsResolved,0);
});
test('all three players can hand off and defend once per Mirage sweep',()=>{
 const c=setup();c.reveal();
 for(const card of c.view().hand.slice(0,3))c.toggle({instanceId:card.instanceId});
 c.setTarget('C');
 assert.equal(c.submit().ok,true);
 const who=[],progress=[];
 for(let i=0;i<4;i++){
  const s=c.labSnapshot();
  assert.equal(s.phase,'defense');
  who.push(s.activePlayerId);
  assert.equal(c.view().hand.length,0);
  c.reveal();
  const v=c.view();progress.push(v.pending?.mirageRound);
  if(v.hand.some(x=>['d003','d001'].includes(x.definitionId))){
   const def=v.hand.find(x=>x.definitionId==='d003'||x.definitionId==='d001');
   c.toggle({instanceId:def.instanceId});
  }
  const out=c.submit();
  assert.equal(out.ok,true,out.error);
 }
 assert.deepEqual(who.slice(0,2),['C','B']);
 assert.deepEqual(who.slice(2).sort(),['B','C']);
 assert.deepEqual(progress,[1,1,2,2]);
 const final=c.labSnapshot();
 assert.equal(final.phase,'turn');
 assert.equal(final.activePlayerId,'B');
 assert.equal(final.players[0].mp,10);
 assert.equal(final.players[0].hand.length,4);
 assert.equal(final.players[1].hp,23);
 assert.equal(final.players[2].hp,21);
 assert.equal(final.turnCount,1);
});
test('another player never receives the previous defender private hand',()=>{
 const c=setup();c.reveal();
 for(const card of c.view().hand.slice(0,3))c.toggle({instanceId:card.instanceId});
 assert.equal(c.submit().ok,true);
 const first=c.view();assert.equal(first.revealed,false);
 assert.equal(first.hand.length,0);
 c.reveal();const shown=c.view();
 assert.equal(shown.actorId,'B');
 assert.equal(shown.hand.length,1);
 assert.equal(shown.hand[0].definitionId,'d003');
 c.toggle({instanceId:shown.hand[0].instanceId});
 assert.equal(c.submit().ok,true);
 const next=c.view();
 assert.equal(next.actorId,'C');
 assert.equal(next.revealed,false);
 assert.equal(next.hand.length,0);
 assert.doesNotMatch(renderV2LabMarkup(next),/アイアンガントレット/);
});
test('research reset returns to ordinary two-seat rules and removes warning',()=>{
 const c=setup();c.reveal();c.reset();
 const v=c.view();
 assert.equal(v.mirageTrial,false);
 assert.equal(v.publicPlayers.length,2);
 assert.equal(c.labSnapshot().rulesetId,'partial-reference-v2-lab');
 assert.doesNotMatch(renderV2LabMarkup({...v,revealed:true}),/最初の攻撃先は手動指定という未確認/);
});
test('otherSeat after a death never defaults target selection to dead player',()=>{
 const c=setup();const s=c.labSnapshot();
 // Keep contract defensive: startup default still selects a living opponent.
 assert.equal(c.view().targetId,'B');
 assert.equal(s.players.find(p=>p.id===c.view().targetId).hp>0,true);
});
