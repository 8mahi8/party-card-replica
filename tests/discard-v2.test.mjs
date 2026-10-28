/**
 * V2 research lab: source-backed ordinary discard (捨てる).
 * Sources:
 * https://note.com/md_stardustman/n/nfc5dfb559f95
 * https://w.atwiki.jp/aniwotawiki/pages/47010.html
 *
 * Discard spends the whole turn, removes arbitrary selected physical cards,
 * and NEVER draws replacements. Rare returning/HP-penalty artifacts are
 * not yet in the incomplete catalog; their explicit policy is fail-closed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {defineCard} from '../v2/foundation.mjs';
import {createStagingRoom,viewStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {submitAndResolveFixture,resolveDiscardFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';

const {byId:catalog}=migrateLegacyCatalog(),opt={
 labOnly:true,fixtureDrawDefinitionId:'d001',authorizedSeatId:'A'
};
function room(hand=['d001','w016','i004'],other=['m002'],third=null,db=catalog){
 const seats=[{id:'A',handDefinitionIds:hand},{id:'B',handDefinitionIds:other}];
 if(third!==null)seats.push({id:'C',handDefinitionIds:third});
 return createStagingRoom({seats,firstSeatId:'A'},db);
}
function cmd(state,indices=[0],more={}){
 return {commandId:'discard-1',type:'discard',actorId:'A',
  expectedRevision:state.revision,
  orderedInstanceIds:indices.map(i=>state.players[0].hand[i].instanceId),
  ...more
 };
}
function run(state,indices=[0],args={}){
 return submitAndResolveFixture(state,cmd(state,indices),args.catalog??catalog,
  {...opt,...args});
}

test('single discard consumes one full turn without refill, MP, damage or RNG',()=>{
 const s=room(),before=JSON.stringify(s),serial=s.nextInstanceSerial;
 const result=run(s,[1]),after=result.state;
 assert.equal(result.autoResolved,true);
 assert.equal(result.plan.type,'discard');
 assert.equal(result.plan.count,1);
 assert.equal(after.revision,2);
 assert.equal(after.turnCount,1);
 assert.equal(after.phase,'turn');
 assert.equal(after.activePlayerId,'B');
 assert.deepEqual(after.players[0].hand.map(c=>c.definitionId),['d001','i004']);
 assert.equal(after.players[1].hand.length,1);
 assert.equal(after.nextInstanceSerial,serial);
 assert.equal(after.rngSeed,s.rngSeed);
 assert.deepEqual(after.players.map(p=>[p.hp,p.mp,p.money]),[[40,10,20],[40,10,20]]);
 assert.deepEqual(result.events.map(e=>e.type),['discard','turnAdvance']);
 assert.equal(JSON.stringify(s),before);
});

test('discard any number of ordinary cards including weapons and miracles, no replacement',()=>{
 const s=room(['w016','d001','m002','i004','a003','i003']);
 const leftover=s.players[0].hand[4];
 const result=run(s,[0,1,2,3,5]);
 assert.deepEqual(result.state.players[0].hand,[leftover]);
 assert.equal(result.state.players[0].learned.length,0);
 assert.equal(result.state.players[0].mp,10);
 assert.equal(result.events[0].count,5);
 assert.equal(result.state.nextInstanceSerial,s.nextInstanceSerial);
});

test('discard all 18 cards is legal and leaves hand empty without drawing',()=>{
 const hand=Array(18).fill('d014'),s=room(hand);
 const r=run(s,hand.map((_,i)=>i));
 assert.equal(r.state.players[0].hand.length,0);
 assert.equal(r.state.players[1].hand.length,1);
 assert.equal(r.state.nextInstanceSerial,s.nextInstanceSerial);
 assert.equal(r.events.filter(x=>x.type==='refill').length,0);
});

test('discarding one card in 3-seat room skips dead seat, leaves other hands unchanged',()=>{
 const s=room(['d001','w016'],['w016'],['d009']);
 s.players[1].hp=0;
 const b=JSON.stringify(s.players[1].hand),c=JSON.stringify(s.players[2].hand);
 const r=run(s,[1]);
 assert.equal(r.state.activePlayerId,'C');
 assert.equal(r.state.turnCount,1);
 assert.equal(JSON.stringify(r.state.players[1].hand),b);
 assert.equal(JSON.stringify(r.state.players[2].hand),c);
 assert.equal(r.state.players[0].hand.length,1);
 assert.equal(r.events.some(e=>e.type==='refill'),false);
});

test('empty, repeated, forged, stale, off-turn and extra-key commands do not mutate room',()=>{
 const s=room(),before=JSON.stringify(s),valid=cmd(s);
 for(const bad of [
  {...valid,orderedInstanceIds:[]},
  {...valid,orderedInstanceIds:[valid.orderedInstanceIds[0],valid.orderedInstanceIds[0]]},
  {...valid,orderedInstanceIds:['ci-missing']},
  {...valid,expectedRevision:99},
  {...valid,unrecognized:true},
  {...valid,actorId:'B'}
 ]){
  assert.throws(()=>submitAndResolveFixture(s,bad,catalog,opt));
  assert.equal(JSON.stringify(s),before);
 }
 assert.throws(()=>applyStagingCommand(s,valid,catalog),/not authenticated/);
});

test('duplicate commandId after successful discard cannot discard again',()=>{
 const s=room(),command=cmd(s,[0]);
 const first=submitAndResolveFixture(s,command,catalog,opt);
 const retry=submitAndResolveFixture(first.state,command,catalog,opt);
 assert.equal(retry.duplicate,true);
 assert.strictEqual(retry.state,first.state);
 assert.deepEqual(retry.events,[]);
 assert.throws(()=>submitAndResolveFixture(first.state,
  {...command,orderedInstanceIds:[s.players[0].hand[1].instanceId]},catalog,opt),
  /Conflicting commandId reuse/);
 assert.equal(first.state.players[0].hand.length,2);
});

test('special source-gated discard policy blocks unverified return-with-damage cards',()=>{
 const alternative=new Map(catalog);
 alternative.set('d001',defineCard({...catalog.get('d001'),
  discardPolicy:'requiresSpecialResolution'}));
 const s=room(['d001','w016'],[],null,alternative),snapshot=JSON.stringify(s);
 assert.throws(()=>run(s,[0],{catalog:alternative}),/Special discard effect/);
 assert.equal(JSON.stringify(s),snapshot);
 const normal=run(s,[1],{catalog:alternative});
 assert.deepEqual(normal.state.players[0].hand.map(c=>c.definitionId),['d001']);
 assert.throws(()=>defineCard({...catalog.get('w016'),discardPolicy:'invented'}),
  /Unknown discard policy/);
});

test('direct discard resolver requires labOnly and staged discard phase',()=>{
 const s=room(),staged=applyStagingCommand(s,cmd(s),catalog,{authorizedSeatId:'A'}).state;
 assert.equal(staged.phase,'resolving');
 assert.throws(()=>resolveDiscardFixture(staged,catalog,{}),/lab fixture mode/);
 assert.throws(()=>resolveDiscardFixture(s,catalog,{...opt}),/No discard waiting/);
 const result=resolveDiscardFixture(staged,catalog,opt);
 assert.equal(result.state.phase,'turn');
 assert.equal(result.state.players[0].hand.length,2);
 assert.equal(staged.players[0].hand.length,3);
});

test('discard can select only a physical hand card, not a learned miracle',()=>{
 const lab=createV2LabController({hands:{A:['d001'],B:['w016']}});
 const mutable=lab.labSnapshot();
 mutable.players[0].learned=['m002'];
 // LabController uses private state: absence of learned cards also prevents
 // forgery of a learned item in the discard command API.
 const s=room();
 assert.throws(()=>submitAndResolveFixture(s,{
  ...cmd(s),orderedInstanceIds:[{learnedDefinitionId:'m002'}]
 },catalog,opt));
});

test('hotseat discard is clearly labeled, conceals next hand, and never refills',()=>{
 const lab=createV2LabController({hands:{A:['w016','d005','m002'],B:['d001']}});
 let view=lab.reveal();
 assert.equal(view.canDiscardSelection,false);
 assert.doesNotMatch(renderV2LabMarkup(view),/data-action="discard"/);
 const selected=view.hand[0].instanceId;
 lab.toggle({instanceId:selected});
 view=lab.view();
 assert.equal(view.canDiscardSelection,true);
 const html=renderV2LabMarkup(view);
 assert.match(html,/data-action="discard"/);
 assert.match(html,/補充なし・ターン終了/);
 const before=lab.labSnapshot(),sent=lab.submit({discard:true});
 assert.equal(sent.ok,true,sent.error);
 assert.equal(sent.view.actorId,'B');
 assert.equal(sent.view.revealed,false);
 assert.equal(sent.view.hand.length,0);
 const after=lab.labSnapshot();
 assert.deepEqual(after.players[0].hand.map(c=>c.definitionId),['d005','m002']);
 assert.equal(after.nextInstanceSerial,before.nextInstanceSerial);
});

test('hotseat reject discard with no hand selection, or a learned-only choice',()=>{
 const lab=createV2LabController({hands:{A:['w016'],B:['d001']}});
 lab.reveal();
 assert.throws(()=>lab.submit({discard:true}),/手札から選んでください/);
 assert.equal(lab.labSnapshot().turnCount,0);
});
