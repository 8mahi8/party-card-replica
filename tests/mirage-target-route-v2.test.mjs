import test from 'node:test';
import assert from 'node:assert/strict';
import {
 beginMirageTargetRouteFixture as begin,
 advanceMirageTargetRouteFixture as advance
} from '../v2/mirage-target-route.mjs';

const seats=(n=4,hp=40)=>Array.from({length:n},(_,i)=>({id:String.fromCharCode(65+i),hp}));
const start=(players=seats(),rounds=1,hits=1,seed=41)=>
 begin({players,sourceId:'A',mirageCount:rounds,hitsPerTarget:hits,rngSeed:seed});
function journey({players=seats(),rounds=1,hits=1,seed=17,onHit=()=>{}}={}){
 let {route,nextSeed}=start(players,rounds,hits,seed);
 let choice=route.targetId;
 const steps=[];
 for(let n=0;n<100;n++){
  const before=structuredClone(players);
  steps.push({target:choice,round:route.roundIndex,subhit:route.subHitIndex,
   hitNumber:route.hitNumber});
  onHit({players,choice,step:n});
  const result=advance({route,players,rngSeed:nextSeed});
  if(result.complete)return {steps,result,players,before};
  route=result.route;choice=result.targetId;nextSeed=result.nextSeed;
 }
 throw new Error('Route did not terminate within the proven maximum');
}
test('seeded opening is deterministic and has no self target',()=>{
 const a=start(),b=start();
 assert.deepEqual(a,b);
 assert.notEqual(a.targetId,'A');
 assert.equal(a.route.visitedIds.length,1);
 assert.equal(a.route.targetId,a.targetId);
});
test('route and nested arrays are immutable',()=>{
 const a=start();
 assert.equal(Object.isFrozen(a.route),true);
 assert.equal(Object.isFrozen(a.route.eligibleIds),true);
 assert.equal(Object.isFrozen(a.route.visitedIds),true);
 assert.equal(Object.isFrozen(a.route.initialSeatIds),true);
});
test('one Mirage in four seats attacks each eligible victim once',()=>{
 const x=journey();
 assert.equal(x.steps.length,3);
 assert.deepEqual([...new Set(x.steps.map(s=>s.target))].sort(),['B','C','D']);
 assert(x.steps.every(s=>s.round===0&&s.subhit===0));
 assert.equal(x.result.reason,'allSweepsComplete');
});
test('two Mirage casts produce distinct target visits per sweep',()=>{
 const x=journey({rounds:2});
 assert.equal(x.steps.length,6);
 for(const round of [0,1]){
  const victims=x.steps.filter(s=>s.round===round).map(s=>s.target);
  assert.deepEqual(victims.slice().sort(),['B','C','D']);
 }
});
test('three Mirage casts reach precisely three complete rounds',()=>{
 const x=journey({rounds:3});
 assert.equal(x.steps.length,9);
 for(const round of [0,1,2])
   assert.equal(new Set(x.steps.filter(x=>x.round===round).map(x=>x.target)).size,3);
});
test('Nokobunbun repeats twice on each player BEFORE moving to another',()=>{
 const x=journey({hits:2});
 assert.equal(x.steps.length,6);
 for(let i=0;i<x.steps.length;i+=2){
  assert.equal(x.steps[i].target,x.steps[i+1].target);
  assert.deepEqual([x.steps[i].subhit,x.steps[i+1].subhit],[0,1]);
 }
});
test('three Mirages and Nokobunbun allow max 48 bounded hits for nine seats',()=>{
 const x=journey({players:seats(9),rounds:3,hits:2});
 assert.equal(x.steps.length,48);
 for(const r of [0,1,2]){
  const targets=x.steps.filter(s=>s.round===r).map(s=>s.target);
  assert.equal(targets.length,16);
  assert.deepEqual([...new Set(targets)].sort(),['B','C','D','E','F','G','H','I']);
 }
});
test('visiting a victim that dies on subhit one skips its second subhit',()=>{
 const x=journey({rounds:1,hits:2,onHit:({players,choice,step})=>{
  if(step===0)players.find(p=>p.id===choice).hp=0;
 }});
 assert.equal(x.steps.length,5);
 assert.equal(x.steps.filter(s=>s.target===x.steps[0].target).length,1);
 assert.equal(x.result.reason,'allSweepsComplete');
});
test('targets eliminated by another strike are not selected in later sweeps',()=>{
 const x=journey({rounds:2,onHit:({players,choice})=>{
  players.find(p=>p.id===choice).hp=0;
 }});
 assert.equal(x.steps.length,3);
 assert.deepEqual([...new Set(x.steps.map(s=>s.target))].sort(),['B','C','D']);
 assert.equal(x.result.reason,'allTargetsEliminated');
});
test('a Sun-Charm-like revived victim is allowed its second subhit',()=>{
 const x=journey({hits:2,onHit:({players,choice,step})=>{
  if(step===0)players.find(p=>p.id===choice).hp=10;
 }});
 assert.equal(x.steps.length,6);
 assert.equal(x.steps[0].target,x.steps[1].target);
});
test('if the source is killed by a reflected hit the scheduler stops safely',()=>{
 const x=journey({rounds:2,onHit:({players,step})=>{
  if(step===0)players.find(p=>p.id==='A').hp=0;
 }});
 assert.equal(x.steps.length,1);
 assert.equal(x.result.reason,'sourceEliminated');
});
test('all eliminated targets terminate without a stale defense prompt',()=>{
 const x=journey({rounds:3,onHit:({players,step})=>{
  if(step===0)for(const p of players)if(p.id!=='A')p.hp=0;
 }});
 assert.equal(x.steps.length,1);
 assert.equal(x.result.reason,'allTargetsEliminated');
});
test('an initially dead opponent is excluded while all survivors get visited',()=>{
 const players=seats();players[3].hp=0;
 const x=journey({players,rounds:2});
 assert.deepEqual(x.steps.map(s=>s.target).sort(),['B','B','C','C']);
});
test('source or all candidates dead at opening fail',()=>{
 const dead=seats();dead[0].hp=0;
 assert.throws(()=>start(dead),/Source must be alive/);
 const none=seats();for(const p of none.slice(1))p.hp=0;
 assert.throws(()=>start(none),/No living targets/);
});
test('invalid counts, rooms, duplicate seats or bad HP cannot create route',()=>{
 for(const count of [0,4,-1,1.5,'2'])
  assert.throws(()=>begin({players:seats(),sourceId:'A',mirageCount:count,rngSeed:7}),/Mirage route/);
 for(const hits of [0,3,2.5])
  assert.throws(()=>begin({players:seats(),sourceId:'A',hitsPerTarget:hits,rngSeed:7}),/Mirage route/);
 assert.throws(()=>start(seats(10)),/2-9 seats/);
 assert.throws(()=>start([{id:'A',hp:40},{id:'A',hp:40}]),/Duplicate seat/);
 assert.throws(()=>start([{id:'A',hp:40},{id:'B',hp:NaN}]),/Invalid HP/);
 assert.throws(()=>begin({players:seats(),sourceId:'Z',rngSeed:1}),/Source must be alive/);
});
test('invalid PRNG seeds reject before allocating a random target',()=>{
 for(const rngSeed of [-1,0,NaN,'1',4294967296])
  assert.throws(()=>start(seats(),1,1,rngSeed),/Invalid RNG seed/);
});
test('router never mutates caller-owned players, seed, or route',()=>{
 const players=seats(),old=JSON.stringify(players),first=start(players);
 const prior=JSON.stringify(first.route);
 const out=advance({route:first.route,players,rngSeed:first.nextSeed});
 assert.equal(JSON.stringify(players),old);
 assert.equal(JSON.stringify(first.route),prior);
 assert.notEqual(out.route,first.route);
});
test('each next victim spends exactly one RNG step, repeated subhit none',()=>{
 const players=seats(3),first=start(players,2,2,59);
 const hit2=advance({route:first.route,players,rngSeed:first.nextSeed});
 assert.equal(hit2.reason,'sameTarget');
 assert.equal(hit2.nextSeed,first.nextSeed);
 const next=advance({route:hit2.route,players,rngSeed:hit2.nextSeed});
 assert.equal(next.reason,'nextTarget');
 assert.notEqual(next.nextSeed,hit2.nextSeed);
});
test('identity swap, extra seat, and eliminated or forged visited ledger are rejected',()=>{
 const players=seats(),first=start(players);
 assert.throws(()=>advance({route:first.route,
  players:[players[1],players[0],...players.slice(2)],rngSeed:first.nextSeed}),/Seats changed/);
 assert.throws(()=>advance({route:first.route,
  players:[...players,{id:'E',hp:40}],rngSeed:first.nextSeed}),/Seats changed/);
 assert.throws(()=>advance({route:{...first.route,visitedIds:['A',first.targetId]},
  players,rngSeed:first.nextSeed}),/Invalid visited ledger/);
 assert.throws(()=>advance({route:{...first.route,subHitIndex:100},
  players,rngSeed:first.nextSeed}),/Invalid route counters/);
});
test('a post-attack completed route is never valid for continuation replay',()=>{
 const players=seats(2),first=start(players);
 const result=advance({route:first.route,players,rngSeed:first.nextSeed});
 assert.equal(result.complete,true);
 assert.equal(result.route,undefined);
 assert.equal(result.hitNumber,1);
 assert.throws(()=>advance({route:result.route,players,rngSeed:result.nextSeed}),/Missing route/);
});
test('no random target appears twice until all eligible seats are visited',()=>{
 for(let seed=1;seed<=64;seed++){
  const x=journey({players:seats(5),rounds:2,seed});
  for(let round=0;round<=1;round++){
   const targets=x.steps.filter(v=>v.round===round).map(v=>v.target);
   assert.equal(new Set(targets).size,4);
  }
 }
});
test('the room caps 9 seats and 3 sweeps but keeps deterministic order',()=>{
 const players=seats(9),first=start(players,3,2,717);
 const x=journey({players,rounds:3,hits:2,seed:717});
 const y=journey({players:seats(9),rounds:3,hits:2,seed:717});
 assert.equal(first.route.eligibleIds.length,8);
 assert.deepEqual(x.steps,y.steps);
});

test('explicit first target cannot bypass RNG seed validation',()=>{
 for(const seed of [0,-1,NaN,'7',4294967296]){
  assert.throws(()=>begin({players:seats(),sourceId:'A',
    firstTargetId:'B',rngSeed:seed}),/Invalid RNG seed/);
 }
 assert.throws(()=>begin({players:seats(),sourceId:'A',
  firstTargetId:'Z',rngSeed:7}),/First target must be a living opponent/);
 const x=begin({players:seats(),sourceId:'A',firstTargetId:'C',rngSeed:7});
 assert.equal(x.targetId,'C');
 assert.equal(x.nextSeed,7);
});

test('forged Mirage history cannot skip a future defender or invent past visits',()=>{
 const players=seats(4),first=start(players,2,1,71);
 const current=first.route.targetId;
 const other=players.find(p=>p.id!=='A'&&p.id!==current).id;
 const cases=[
  {...first.route,visitedIds:[current,other]},
  {...first.route,visitedIds:[other,current]}
 ];
 for(const route of cases){
  const before=JSON.stringify(route);
  assert.throws(()=>advance({route,players,rngSeed:first.nextSeed}),
    /Invalid visited ledger/);
  assert.equal(JSON.stringify(route),before);
 }
 // The engine's real, sequential visits still progress.
 const valid=advance({route:first.route,players,rngSeed:first.nextSeed});
 assert.equal(valid.reason,'nextTarget');
 assert.equal(valid.route.visitedIds.at(-1),valid.targetId);
 assert.equal(valid.route.visitedIds.length,2);
});
test('invalid RNG seed is rejected even when route terminates without a draw',()=>{
 const players=seats(2),first=start(players);
 players[1].hp=0; // Legitimate all-targets-eliminated terminal state.
 assert.equal(advance({route:first.route,players,rngSeed:first.nextSeed}).complete,true);
 for(const seed of [undefined,0,-1,NaN,'7',4294967296]){
  assert.throws(()=>advance({route:first.route,players,rngSeed:seed}),
    /Invalid RNG seed/);
 }
});
