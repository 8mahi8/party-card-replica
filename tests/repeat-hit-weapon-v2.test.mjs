/**
 * Source-backed Nokobunbun: two SEPARATE attack/defense transactions.
 * Source facts: Piong/Macaron: attack3 price10 0.2%; 2023 and 2026
 * player guides: additive weapons apply to BOTH attacks; defense is split.
 * Unverified all-target/Mirage and self-target combos are gated.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {runEffectQueueFixture} from '../v2/effect-runner.mjs';
import {defineCard} from '../v2/foundation.mjs';
const {byId:catalog,summary}=migrateLegacyCatalog();
const config={labOnly:true,fixtureDrawDefinitionId:'d001'};
const room=(a=['w050'],b=[],hpA=40,hpB=40)=>{
 const s=createStagingRoom({firstSeatId:'A',
   seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]
 },catalog);
 s.players[0].hp=hpA;s.players[1].hp=hpB;
 return s;
};
const cmd=(s,actorId,type,values={})=>submitAndResolveFixture(s,{
 commandId:'repeat-'+s.revision,expectedRevision:s.revision,actorId,type,...values
},catalog,{...config,authorizedSeatId:actorId});
const attack=(s,targetId='B',ids=s.players[0].hand.map(c=>c.instanceId))=>
 cmd(s,'A','playCards',{targetId,orderedInstanceIds:ids});
const defense=(s,selected=[])=>{
 const seat=s.activePlayerId;
 const cards=s.players.find(p=>p.id===seat).hand;
 return cmd(s,seat,'defend',{orderedInstanceIds:selected.map(index=>cards[index].instanceId)});
};
test('the physical reference is attack3, ¥10, 1/500 and a typed two-hit effect',()=>{
 const d=catalog.get('w050');
 assert.equal(d.stats.attack,3);assert.equal(d.stats.price,10);
 assert.equal(d.drawWeight,1);
 assert.deepEqual(d.effects,[{when:'onDeclare',type:'repeatAttack',params:{count:2}}]);
 assert.equal(summary.unique,119);assert.equal(summary.slots,308);
});
test('two separate damage events and defense prompts for one opening weapon',()=>{
 const start=room(),before=JSON.stringify(start);
 const one=attack(start);
 assert.equal(one.state.phase,'defense');
 const first=defense(one.state);
 assert.equal(first.state.phase,'defense');
 assert.equal(first.state.activePlayerId,'B');
 assert.equal(first.state.players[1].hp,37);
 assert.equal(first.state.pending.strikeIndex,1);
 assert.equal(first.state.pending.attackContext.hitCount,2);
 assert.equal(first.state.pending.spentByPlayer.A,1);
 assert.equal(first.state.players[0].hand.length,0); // not refilled yet
 assert.equal(first.events.filter(e=>e.type==='damage').length,1);
 assert.equal(first.events.filter(e=>e.type==='nextStrike').length,1);
 const last=defense(first.state);
 assert.equal(last.state.phase,'turn');
 assert.equal(last.state.activePlayerId,'B');
 assert.equal(last.state.players[1].hp,34);
 assert.equal(last.state.players[0].hand.length,1);
 assert.equal(last.state.players[0].hand[0].definitionId,'d001');
 assert.equal(last.state.turnCount,1);
 assert.equal(last.events.filter(e=>e.type==='damage').length,1);
 assert.equal(JSON.stringify(start),before);
});
test('both hits inherit ONE ordered additive weapon attack, without paying twice',()=>{
 const a=attack(room(['w050','a003'])),one=defense(a.state);
 assert.equal(one.plan.hitCount,2);
 assert.equal(one.state.players[1].hp,34);
 assert.equal(one.state.pending.spentByPlayer.A,2);
 assert.equal(one.state.players[0].hand.length,0);
 const last=defense(one.state);
 assert.equal(last.state.players[1].hp,28);
 assert.equal(last.state.players[0].hand.length,2);
 assert.equal(last.state.turnCount,1);
});
test('a defense card spent on hit one is unavailable on hit two until final refill',()=>{
 const a=attack(room(['w050'],['d003']));
 const first=defense(a.state,[0]);
 assert.equal(first.state.players[1].hp,40);
 assert.equal(first.state.players[1].hand.length,0);
 assert.equal(first.state.pending.spentByPlayer.B,1);
 const last=defense(first.state);
 assert.equal(last.state.players[1].hp,37);
 assert.equal(last.state.players[1].hand.length,1);
 assert.equal(last.state.players[1].hand[0].definitionId,'d001');
});
test('defender can conserve armor for second hit',()=>{
 const a=attack(room(['w050'],['d003']));
 const first=defense(a.state);
 assert.equal(first.state.players[1].hp,37);
 const last=defense(first.state,[0]);
 assert.equal(last.state.players[1].hp,37);
 assert.equal(last.state.players[1].hand[0].definitionId,'d001');
});
test('lethal first strike ends game immediately without second prompt or draw',()=>{
 const a=attack(room(['w050'],[],40,2));
 const first=defense(a.state);
 assert.equal(first.state.phase,'finished');
 assert.equal(first.state.winnerId,'A');
 assert.equal(first.state.players[1].hp,0);
 assert.equal(first.events.some(e=>e.type==='nextStrike'),false);
 assert.equal(first.state.players[0].hand[0].definitionId,'d001');
});
test('Sun Charm on first lethal hit is consumed and a second hit occurs',()=>{
 const a=attack(room(['w050'],['i005'],40,2));
 const first=defense(a.state);
 assert.equal(first.state.phase,'defense');
 assert.equal(first.state.players[1].hp,10);
 assert.equal(first.state.pending.strikeIndex,1);
 assert.equal(first.events.filter(e=>e.type==='revive').length,1);
 assert.equal(first.state.players[1].hand.length,0);
 const second=defense(first.state);
 assert.equal(second.state.players[1].hp,7);
 assert.equal(second.state.players[1].hand[0].definitionId,'d001');
});
test('reflect first hit, then restart second hit at original target',()=>{
 const a=attack(room(['w050'],['w027']));
 const redirect=defense(a.state,[0]);
 assert.equal(redirect.state.phase,'defense');
 assert.equal(redirect.state.activePlayerId,'A');
 assert.equal(redirect.state.pending.repeatTargetId,'B');
 const hitA=defense(redirect.state);
 assert.equal(hitA.state.players[0].hp,37);
 assert.equal(hitA.state.players[1].hp,40);
 assert.equal(hitA.state.activePlayerId,'B');
 assert.equal(hitA.state.pending.strikeIndex,1);
 assert.equal(hitA.state.pending.sourceId,'A');
 const second=defense(hitA.state);
 assert.equal(second.state.players[1].hp,37);
 assert.equal(second.state.players[0].hp,37);
 assert.equal(second.state.players[1].hand.length,1);
});
test('reflect second hit only, with no third hit',()=>{
 const a=attack(room(['w050'],['w027']));
 const first=defense(a.state);
 assert.equal(first.state.players[1].hp,37);
 const redirect=defense(first.state,[0]);
 assert.equal(redirect.state.activePlayerId,'A');
 const last=defense(redirect.state);
 assert.equal(last.state.phase,'turn');
 assert.equal(last.state.players[0].hp,37);
 assert.equal(last.state.players[1].hp,37);
 assert.equal(last.state.turnCount,1);
});
test('deflect first hit back to its owner still starts independent next defense',()=>{
 const start=room(['w050'],['w026']);
 const a=attack(start);
 const b=submitAndResolveFixture(a.state,{
   commandId:'deflect',expectedRevision:a.state.revision,
   actorId:'B',type:'defend',
   orderedInstanceIds:[a.state.players[1].hand[0].instanceId]
 },catalog,{...config,authorizedSeatId:'B',deflectRng:()=>0.99});
 assert.equal(b.state.players[1].hp,37);
 assert.equal(b.state.phase,'defense');
 assert.equal(b.state.pending.strikeIndex,1);
 assert.equal(b.state.activePlayerId,'B');
 const c=defense(b.state);
 assert.equal(c.state.players[1].hp,34);
 assert.equal(c.state.turnCount,1);
});
test('duplicate first defense is idempotent, stale or conflicting input rejected',()=>{
 const a=attack(room(['w050'],['d003']));
 const instruction={commandId:'defense1',expectedRevision:a.state.revision,
   actorId:'B',type:'defend',orderedInstanceIds:[]};
 const first=submitAndResolveFixture(a.state,instruction,catalog,{...config,authorizedSeatId:'B'});
 const duplicate=submitAndResolveFixture(first.state,instruction,catalog,{...config,authorizedSeatId:'B'});
 assert.equal(duplicate.duplicate,true);
 assert.equal(duplicate.state,first.state);
 assert.throws(()=>submitAndResolveFixture(first.state,{...instruction,orderedInstanceIds:['bad']},
   catalog,{...config,authorizedSeatId:'B'}),/Conflicting/);
 assert.throws(()=>cmd(first.state,'B','defend',{orderedInstanceIds:['bad']}),/Stale|not held|not present/);
});
test('forged continuation is rejected without mutating room',()=>{
 const a=attack(room(['w016']));
 const d=cmd(a.state,'B','defend',{orderedInstanceIds:[]});
 // Ordinary weapons resolve immediately. No repeat remains pending.
 assert.equal(d.state.phase,'turn');
 const forged={...a.state,phase:'resolving',activePlayerId:null,
   pending:{...a.state.pending,defense:{playerId:'B',instanceIds:[]}}};
 const old=JSON.stringify(forged);
 assert.throws(()=>runEffectQueueFixture(forged,catalog,[
   {type:'hit',targetId:'B',damage:3,hpAfter:37,instantDefeat:false},
   {type:'continueStrike',attackContext:{attackKind:'weapon',hitCount:2},repeatTargetId:'B'}
 ],config),/original physical weapon|repeated attack/i);
 assert.equal(JSON.stringify(forged),old);
});
test('invalid repeat timing, count and injected legacy fields are rejected',()=>{
 const base={id:'test.repeat',family:'weapon',element:'none',drawWeight:1,
   source:{ruleset:'fixture',confidence:'research'},playModes:['mainAttack'],
   stats:{attack:3,price:10}};
 for(const effect of [
   {when:'afterHit',type:'repeatAttack',params:{count:2}},
   {when:'onDeclare',type:'repeatAttack',params:{count:3}},
   {when:'onDeclare',type:'repeatAttack',params:{count:2,extra:true}}
 ]) assert.throws(()=>defineCard({...base,effects:[effect]}),/repeatAttack/);
});
test('repeated self-target attack is gated instead of guessing HP0 progression',()=>{
 const s=room(['w050'],[],40,40),before=JSON.stringify(s);
 assert.throws(()=>attack(s,'A'),/self-directed|repeat/i);
 assert.equal(JSON.stringify(s),before);
});
