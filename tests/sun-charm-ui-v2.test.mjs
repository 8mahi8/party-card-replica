import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';
function trial(){
 const lab=createV2LabController();
 lab.loadRevivalTrial();
 return lab;
}
test('revival research launcher is available from sealed default state',()=>{
 const lab=createV2LabController();
 assert.match(renderV2LabMarkup(lab.view()),/data-action="revival-demo"/);
 const view=lab.loadRevivalTrial();
 assert.equal(view.revivalTrial,true);
 assert.equal(view.revealed,false);
 assert.equal(view.hand.length,0);
 assert.deepEqual(lab.labSnapshot().players.map(p=>p.hand.map(c=>c.definitionId)),
  [['w016','d001'],['i005','d001']]);
 assert.equal(lab.labSnapshot().players[1].hp,5);
});
test('P1 attack then P2 no defense consumes charm and hands off to a living P2',()=>{
 const lab=trial();const before=JSON.stringify(lab.labSnapshot());
 const a=lab.reveal();
 assert.match(a.hand[0].label,/^ワンダーソード/);
 lab.toggle({instanceId:a.hand[0].instanceId});
 assert.equal(lab.submit().ok,true);
 assert.equal(lab.view().revealed,false);
 assert.equal(lab.view().actorId,'B');
 const b=lab.reveal();
 assert.equal(b.hand[0].passive,true);
 assert.deepEqual(b.hand[0].playModes,['passive']);
 const markup=renderV2LabMarkup(b);
 assert.match(markup,/太陽のお守り/);
 assert.match(markup,/HP0で自動発動/);
 assert.match(markup,/data-card="hand"[^>]*disabled/);
 assert.throws(()=>lab.toggle({instanceId:b.hand[0].instanceId}),/自動発動/);
 const out=lab.submit();
 assert.equal(out.ok,true,out.error);
 assert.equal(out.view.actorId,'B');
 assert.equal(out.view.phase,'turn');
 assert.equal(out.view.revealed,false);
 const s=lab.labSnapshot();
 assert.equal(s.players[1].hp,10);
 assert.deepEqual(s.players[1].hand.map(c=>c.definitionId),['d001','d001']);
 assert.equal(s.players[1].hand.filter(c=>c.definitionId==='i005').length,0);
 assert.equal(out.events.some(e=>e.type==='revive'),true);
 assert.equal(s.turnCount,1);
 assert.notEqual(JSON.stringify(s),before);
});
test('revival trial reset returns to ordinary game and clears scenario flag',()=>{
 const lab=createV2LabController(),original=lab.labSnapshot();
 lab.loadRevivalTrial();lab.reset();
 const now=lab.view();
 assert.equal(now.revivalTrial,false);
 assert.equal(now.revealed,false);
 assert.deepEqual(lab.labSnapshot().players.map(p=>p.hand.map(c=>c.definitionId)),
  original.players.map(p=>p.hand.map(c=>c.definitionId)));
 assert.match(renderV2LabMarkup(now),/data-action="revival-demo"/);
});
test('research mode leaves both player hands secret across every handoff',()=>{
 const lab=trial();
 lab.reveal();
 const attack=lab.view().hand[0].instanceId;
 lab.toggle({instanceId:attack});
 assert.equal(lab.submit().view.hand.length,0);
 lab.reveal();
 assert.equal(lab.submit().view.hand.length,0);
 assert.equal(lab.view().revealed,false);
 assert.doesNotMatch(renderV2LabMarkup(lab.view()),/data-card="hand"/);
});
