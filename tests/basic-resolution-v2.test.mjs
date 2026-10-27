import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand,viewStagingRoom} from '../v2/staging-room.mjs';
import {compileBasicResolution,resolveBasicFixture} from '../v2/basic-resolution.mjs';
import {findVerifiedBasicCard as oldCard} from '../src/verified-basic-cards.mjs';
import {createMatch,playAttack,defend} from '../src/match.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const lab=(hands,{first='A',hp}={})=>{
 const ids=Object.keys(hands);
 const state=createStagingRoom({
  seats:ids.map(id=>({id,handDefinitionIds:hands[id]})),firstSeatId:first
 },catalog);
 for(const [id,value] of Object.entries(hp??{}))state.players.find(p=>p.id===id).hp=value;
 return state;
};
function stage(state,{from='A',target='B',attack=[0],defense=[],self=false}={}) {
 const attacker=state.players.find(p=>p.id===from);
 const targetSeat=state.players.find(p=>p.id===target);
 const attacking=attack.map(i=>attacker.hand[i].instanceId);
 const a=applyStagingCommand(state,{
  commandId:'attack-1',expectedRevision:0,type:'playCards',
  actorId:from,targetId:self?from:target,orderedInstanceIds:attacking
 },catalog,{authorizedSeatId:from}).state;
 if(self)return a;
 const guarded=defense.map(i=>targetSeat.hand[i].instanceId);
 return applyStagingCommand(a,{
  commandId:'defend-1',expectedRevision:1,type:'defend',
  actorId:target,orderedInstanceIds:guarded
 },catalog,{authorizedSeatId:target}).state;
}
const resolve=s=>resolveBasicFixture(s,catalog,{labOnly:true,fixtureDrawDefinitionId:'d001'});
function legacy(hands,{target='B',attack=[0],defense=[],self=false,hp={}}={}){
 const ids=Object.keys(hands),draw=()=>oldCard('d001');
 let s=createMatch({playerIds:ids,firstPlayerId:'A',rng:()=>0,draw});
 s.players.forEach(p=>p.hand=hands[p.id].map(oldCard));
 for(const [id,value] of Object.entries(hp))s.players.find(p=>p.id===id).hp=value;
 const pending=playAttack(s,{playerId:'A',targetId:self?'A':target,handIndices:attack},draw);
 return self?pending:defend(pending,{playerId:target,handIndices:defense},draw);
}
function sameOutcome(next,old) {
 assert.deepEqual(next.players.map(p=>({id:p.id,hp:p.hp,mp:p.mp,money:p.money,hand:p.hand.length})),
   old.players.map(p=>({id:p.id,hp:p.hp,mp:p.mp,money:p.money,hand:p.hand.length})));
 assert.equal(next.phase,old.phase);
 assert.equal(next.activePlayerId,old.activePlayerId);
 assert.equal(next.winnerId,old.winnerId);
}

test('pure G3 compiler emits spend/hit/refill/advance queue without modifying state',()=>{
 const s=stage(lab({A:['w016'],B:['d005']}),{defense:[0]});
 const before=JSON.stringify(s);
 const plan=compileBasicResolution(s,catalog);
 assert.deepEqual(plan.queue.map(x=>x.type),['spend','spend','hit','refill','advance']);
 assert.equal(plan.attack,10);assert.equal(plan.armor,5);assert.equal(plan.hit.damage,5);
 assert.equal(JSON.stringify(s),before);
 assert.ok(Object.isFrozen(plan.queue));
});
test('neutral attack and armor defense match old engine: refill and next turn',()=>{
 const hands={A:['w016','d001'],B:['d005']};
 const s=stage(lab(hands),{defense:[0]}),r=resolve(s);
 sameOutcome(r.state,legacy(hands,{defense:[0]}));
 assert.equal(r.state.players[1].hp,35);
 assert.equal(r.state.revision,3);
 assert.equal(r.state.nextInstanceSerial,6);
 assert.equal(r.events.filter(e=>e.type==='refill').length,2);
});
test('fire attack with two weapons matches legacy element mixing and defense',()=>{
 const hands={A:['w018','a009'],B:['d015']};
 const result=resolve(stage(lab(hands),{attack:[0,1],defense:[0]}));
 sameOutcome(result.state,legacy(hands,{attack:[0,1],defense:[0]}));
 assert.equal(result.plan.attack,5);assert.equal(result.plan.element,'fire');
 assert.equal(result.state.players[1].hp,38);
});
test('main and multiple add-on weapons follow legacy attack values',()=>{
 const hands={A:['w016','a001','a003'],B:['d005']};
 const r=resolve(stage(lab(hands),{attack:[0,1,2],defense:[0]}));
 sameOutcome(r.state,legacy(hands,{attack:[0,1,2],defense:[0]}));
 assert.equal(r.plan.attack,14);
});
test('add-on-only attacks match legacy damage and cards drawn',()=>{
 const hands={A:['a001','a003'],B:['d001']};
 const r=resolve(stage(lab(hands),{attack:[0,1],defense:[0]}));
 sameOutcome(r.state,legacy(hands,{attack:[0,1],defense:[0]}));
 assert.equal(r.plan.attack,4);
});
test('armor with attack bonus can add to weapon without replacing weapon element',()=>{
 const hands={A:['w018','d010'],B:['d015']};
 const r=resolve(stage(lab(hands),{attack:[0,1],defense:[0]}));
 sameOutcome(r.state,legacy(hands,{attack:[0,1],defense:[0]}));
 assert.equal(r.plan.attack,6);assert.equal(r.plan.element,'fire');
});
test('dark attack causes death when unblocked; dead player not replenished',()=>{
 const hands={A:['w025'],B:['d001']};
 const r=resolve(stage(lab(hands),{defense:[]}));
 sameOutcome(r.state,legacy(hands));
 assert.equal(r.state.phase,'finished');assert.equal(r.state.winnerId,'A');
 assert.equal(r.state.players[1].hand[0].definitionId,'d001');
});
test('dark damage fully guarded is not instant defeat',()=>{
 const hands={A:['w025'],B:['d001']};
 const r=resolve(stage(lab(hands),{defense:[0]}));
 sameOutcome(r.state,legacy(hands,{defense:[0]}));
 assert.equal(r.plan.hit.instantDefeat,false);
});
test('light attack refuses ordinary guard without attribute removal; no state mutation',()=>{
 const hands={A:['w024'],B:['d001']};
 const s=stage(lab(hands),{defense:[0]});
 const before=JSON.stringify(s);
 assert.throws(()=>resolve(s),/Illegal shield/);
 assert.equal(JSON.stringify(s),before);
});
test('rainbow curtain first permits neutral guard of light attack',()=>{
 const hands={A:['w024'],B:['d001','i001']};
 const r=resolve(stage(lab(hands),{defense:[1,0]}));
 sameOutcome(r.state,legacy(hands,{defense:[1,0]}));
 assert.equal(r.plan.stripElement,true);
 assert.equal(r.state.players[1].hp,38);
});
test('hybrid main weapon with guard can defend',()=>{
 const hands={A:['w016'],B:['w005']};
 const r=resolve(stage(lab(hands),{defense:[0]}));
 sameOutcome(r.state,legacy(hands,{defense:[0]}));
 assert.equal(r.plan.armor,6);
});
test('angel armor is ordinary numeric guard against weapon attack',()=>{
 const hands={A:['w016'],B:['d018']};
 const r=resolve(stage(lab(hands),{defense:[0]}));
 sameOutcome(r.state,legacy(hands,{defense:[0]}));
 assert.equal(r.state.players[1].hp,39);
});
test('self attack skips defense and matches legacy next turn',()=>{
 const hands={A:['w016'],B:['d001']};
 const r=resolve(stage(lab(hands),{self:true}));
 sameOutcome(r.state,legacy(hands,{self:true}));
 assert.equal(r.state.players[0].hp,30);
});
test('dark self attack kills attacker; opponent wins',()=>{
 const hands={A:['w025'],B:['d001']};
 const r=resolve(stage(lab(hands),{self:true}));
 sameOutcome(r.state,legacy(hands,{self:true}));
 assert.equal(r.state.winnerId,'B');assert.equal(r.state.phase,'finished');
});
test('three-player attack on B leaves correct next turn C when B eliminated',()=>{
 const hands={A:['w016'],B:['d001'],C:['d001']};
 const hp={B:5};
 const r=resolve(stage(lab(hands,{hp}),{defense:[]}));
 sameOutcome(r.state,legacy(hands,{hp}));
 assert.equal(r.state.activePlayerId,'C');
});
test('incoming reaction/reflect defense deliberately rejected before card is consumed',()=>{
 const hands={A:['w016'],B:['w027']};
 const s=stage(lab(hands),{defense:[0]});
 const before=JSON.stringify(s);
 assert.throws(()=>resolve(s),/Redirect reactions require G3 reaction resolver/);
 assert.equal(JSON.stringify(s),before);
});
test('offensive miracle is staged but not silently treated as a weapon',()=>{
 const hands={A:['m002'],B:['d001']};
 const s=stage(lab(hands));
 assert.throws(()=>resolve(s),/Basic resolution requires weapon first/);
 assert.equal(s.players[0].mp,10);
});
test('still-unverified Aura + Fireball is rejected without mutating state',()=>{
 const hands={A:['w016','m004','m005'],B:['d001']};
 const s=stage(lab(hands),{attack:[0,1,2],defense:[0]});
 const before=JSON.stringify(s);
 assert.throws(()=>resolve(s),/Aura stacked with other miracles/);
 assert.equal(JSON.stringify(s),before);
});
test('fixture-only guard prevents exposing fake full-card draw probabilities',()=>{
 const s=stage(lab({A:['w016'],B:['d001']}));
 assert.throws(()=>resolveBasicFixture(s,catalog,{fixtureDrawDefinitionId:'d001'}),/lab fixture mode/);
 assert.throws(()=>resolveBasicFixture(s,catalog,{labOnly:true,fixtureDrawDefinitionId:'missing'}),/fixture draw/);
});
test('physical refill IDs stay unique; 18-card cap respected',()=>{
 const hands={A:['w006',...Array(17).fill('d001')],B:['d001']};
 const r=resolve(stage(lab(hands)));
 assert.equal(r.state.players[0].hand.length,18);
 const all=r.state.players.flatMap(p=>p.hand.map(c=>c.instanceId));
 assert.equal(new Set(all).size,all.length);
 assert.equal(r.state.nextInstanceSerial,21);
});
test('pending selection order is preserved in spent events and old game is untouched',()=>{
 const hands={A:['w016','a003'],B:['d001','d005']};
 const staged=stage(lab(hands),{attack:[1,0],defense:[1,0]});
 const original=JSON.stringify(staged);
 const plan=compileBasicResolution(staged,catalog);
 assert.deepEqual(plan.queue[0].instanceIds,staged.pending.attackInstanceIds);
 assert.deepEqual(plan.queue[1].instanceIds,staged.pending.defense.instanceIds);
 const r=resolve(staged);
 assert.equal(JSON.stringify(staged),original);
 assert.deepEqual(r.events.filter(e=>e.type==='spend').map(e=>e.count),[2,2]);
});
