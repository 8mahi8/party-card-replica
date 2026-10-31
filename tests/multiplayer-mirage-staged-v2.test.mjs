/**
 * EXPERIMENTAL multiplayer Mirage integration only. First target is
 * attacker-selected in this named fixture; this is NOT proven original behavior.
 * No live or public ruleset is permitted to use this route.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {runEffectQueueFixture} from '../v2/effect-runner.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const opts={labOnly:true,fixtureDrawDefinitionId:'d001'};
const EXP='mirage-multiplayer-research-fixture-v2';
function init({hands={A:['w016','m012'],B:['d003'],C:[]},
 rulesetId=EXP,seed=7,hp={},mp={A:25}}={}){
 const s=createStagingRoom({seats:Object.entries(hands).map(([id,handDefinitionIds])=>({
  id,handDefinitionIds
 })),firstSeatId:'A',rngSeed:seed,rulesetId},catalog);
 for(const p of s.players){p.hp=hp[p.id]??40;p.mp=mp[p.id]??10;}
 return s;
}
function send(s,type,data={},actorId=s.activePlayerId){
 return submitAndResolveFixture(s,{commandId:'mt-'+s.revision+'-'+type,
  expectedRevision:s.revision,actorId,type,...data},catalog,{
  ...opts,authorizedSeatId:actorId
 });
}
function attack(s,targetId='B'){
 return send(s,'playCards',{targetId,
  orderedInstanceIds:s.players[0].hand.map(c=>c.instanceId)});
}
function block(s,ids=[]){
 return send(s,'defend',{orderedInstanceIds:ids});
}
function run(s,{target='B',onDefense=()=>[]}={}){
 let r=attack(s,target),hops=[],events=[];
 for(let steps=0;r.state.phase==='defense'&&steps<80;steps++){
  let snapshot=r.state;
  hops.push({target:snapshot.activePlayerId,
   hp:Object.fromEntries(snapshot.players.map(p=>[p.id,p.hp])),
   route:snapshot.pending.mirageRoute??null,
   seed:snapshot.rngSeed,revision:snapshot.revision});
  r=block(snapshot,onDefense(snapshot,steps));
  events.push(...r.events);
 }
 if(r.state.phase==='defense')throw Error('Misrouted endless defense');
 return {r,hops,events};
}
test('the default multiplayer room still explicitly rejects Mirage and is immutable',()=>{
 const s=init({rulesetId:'lab-v2'}),before=JSON.stringify(s);
 assert.throws(()=>attack(s),/multiplayer routing verification/);
 assert.equal(JSON.stringify(s),before);
});
test('single Mirage visits attacker-selected B, then C, with defenses one by one',()=>{
 const s=init(),unchanged=JSON.stringify(s);
 const out=run(s);
 assert.deepEqual(out.hops.map(x=>x.target),['B','C']);
 assert.equal(out.r.state.players[1].hp,30);
 assert.equal(out.r.state.players[2].hp,30);
 assert.equal(out.r.state.players[0].mp,20);
 assert.equal(out.r.state.players[0].hand.length,2);
 assert.equal(out.r.state.turnCount,1);
 assert.equal(out.r.state.phase,'turn');
 assert.equal(out.r.state.activePlayerId,'B');
 assert.equal(JSON.stringify(s),unchanged);
 assert.equal(out.events.filter(e=>e.type==='refill'&&e.playerId==='A').length,1);
 assert.equal(out.events.filter(e=>e.type==='mirageNextTarget').length,1);
});
test('four-seat Mirage visits each living defender exactly once before refill',()=>{
 const s=init({hands:{A:['w016','m012'],B:[],C:[],D:[]}});
 const out=run(s);
 assert.equal(out.hops.length,3);
 assert.equal(out.hops[0].target,'B');
 assert.deepEqual(new Set(out.hops.map(x=>x.target)),new Set(['B','C','D']));
 assert(out.r.state.players.slice(1).every(p=>p.hp===30));
 assert.equal(out.r.state.players[0].hand.length,2);
 assert.equal(out.r.state.turnCount,1);
});
test('two Mirages revisit opponents once in second sweep; spent/MP once',()=>{
 const s=init({hands:{A:['w016','m012','m012'],B:[],C:[]}});
 const out=run(s);
 assert.equal(out.hops.length,4);
 assert.deepEqual(out.hops.map(x=>x.target).slice(0,2),['B','C']);
 assert.deepEqual(new Set(out.hops.slice(2).map(x=>x.target)),new Set(['B','C']));
 assert.equal(out.r.state.players[1].hp,20);
 assert.equal(out.r.state.players[2].hp,20);
 assert.equal(out.r.state.players[0].mp,15);
 assert.equal(out.r.state.players[0].hand.length,3);
 assert.equal(out.events.filter(e=>e.type==='payMp').length,1);
 assert.equal(out.events.filter(e=>e.type==='turnAdvance').length,1);
});
test('Nokobunbun repeats same defender twice then visits next',()=>{
 const s=init({hands:{A:['w050','m012'],B:['d003'],C:[]}});
 const first=attack(s),defenseCard=first.state.players[1].hand[0].instanceId;
 const blocked=block(first.state,[defenseCard]);
 assert.equal(blocked.state.players[1].hp,40);
 assert.equal(blocked.state.activePlayerId,'B');
 assert.equal(blocked.state.pending.mirageRoute.subHitIndex,1);
 assert.equal(blocked.state.players[1].hand.length,0);
 const stage=viewStagingRoom(blocked.state,'C',catalog);
 assert(!Object.hasOwn(stage.players[1],'hand'));
 const second=block(blocked.state);
 assert.equal(second.state.players[1].hp,37);
 assert.equal(second.state.activePlayerId,'C');
 assert.equal(second.state.pending.mirageRoute.subHitIndex,0);
 const third=block(second.state),fourth=block(third.state);
 assert.equal(third.state.activePlayerId,'C');
 assert.equal(fourth.state.phase,'turn');
 assert.equal(fourth.state.players[2].hp,34);
 assert.equal(fourth.state.players[1].hand.length,1);
 assert.equal(fourth.state.players[0].hand.length,2);
 assert.equal(fourth.state.players[0].mp,20);
});
test('lethal first opponent skips deceased and goes to remaining living victim',()=>{
 const s=init({hp:{B:5},hands:{A:['w016','m012'],B:[],C:[]}});
 const out=run(s);
 assert.deepEqual(out.hops.map(x=>x.target),['B','C']);
 assert.equal(out.r.state.players[1].hp,0);
 assert.equal(out.r.state.players[2].hp,30);
 assert.equal(out.r.state.activePlayerId,'C');
 assert.equal(out.r.state.turnCount,1);
});
test('eliminating all opponents ends match directly, no additional defense',()=>{
 const s=init({hp:{B:5,C:6},hands:{A:['w016','m012','m012'],B:[],C:[]}});
 const out=run(s);
 assert.equal(out.hops.length,2);
 assert.equal(out.r.state.phase,'finished');
 assert.equal(out.r.state.winnerId,'A');
 assert.equal(out.r.state.turnCount,0);
 assert.equal(out.r.state.players[0].mp,15);
});
test('Sun Charm brings dead victim back after hit; later sweep can hit again',()=>{
 const s=init({hp:{B:5},hands:{A:['w016','m012','m012'],B:['i005'],C:[]}});
 const out=run(s);
 assert.equal(out.hops.length,4);
 assert.equal(out.r.state.players[1].hp,0);
 assert(out.events.some(e=>e.type==='revive'&&e.playerId==='B'));
 assert.equal(out.r.state.turnCount,1);
});
test('each new opponent consumes seed once but repeat hit does not',()=>{
 const s=init({hands:{A:['w050','m012'],B:[],C:[],D:[]}});
 const out=run(s);
 assert.equal(out.hops.length,6);
 assert.equal(out.hops[0].seed,s.rngSeed);
 assert.equal(out.hops[1].seed,s.rngSeed);
 assert.notEqual(out.hops[2].seed,s.rngSeed);
 assert.equal(out.hops[2].seed,out.hops[3].seed);
 assert.notEqual(out.hops[4].seed,out.hops[3].seed);
});
test('Wall reaction is forbidden in research 3+ fixture BEFORE any payment',()=>{
 const s=init({hands:{A:['w016','m012'],B:['m001'],C:[]}});
 const a=attack(s),before=JSON.stringify(a.state);
 assert.throws(()=>block(a.state,[a.state.players[1].hand[0].instanceId]),
  /Multiplayer Mirage redirect or Wall/);
 assert.equal(JSON.stringify(a.state),before);
});
test('neutral redirect reaction is gated without mutating defense or seed',()=>{
 const s=init({hands:{A:['w016','m012'],B:['w027'],C:[]}});
 const a=attack(s),before=JSON.stringify(a.state);
 assert.throws(()=>block(a.state,[a.state.players[1].hand[0].instanceId]),
  /Multiplayer Mirage redirect or Wall/);
 assert.equal(JSON.stringify(a.state),before);
});
test('an attacking player cannot forge an extra next-target effect',()=>{
 const s=init({hands:{A:['w016','m012'],B:[],C:[]}});
 const a=attack(s);
 const pending={...a.state.pending,defense:{playerId:'B',instanceIds:[]}};
 const forged={...a.state,phase:'resolving',pending,activePlayerId:null};
 const route={sourceId:'A',targetId:'B',initialSeatIds:['A','B','C'],
  eligibleIds:['B','C'],visitedIds:['B'],roundCount:1,hitsPerTarget:1,
  roundIndex:0,subHitIndex:0,hitNumber:0};
 assert.throws(()=>runEffectQueueFixture(forged,catalog,[
  {type:'hit',targetId:'B',damage:10,hpAfter:30,instantDefeat:false},
  {type:'advanceMirageRoute',attackContext:{
   attackKind:'weapon',mirageCount:3,hitCount:3,attack:999
  },route}
 ],opts),/Mirage first-hit route needs authentic/);
});
test('wrong authenticated seat cannot defend or steal another player hand',()=>{
 const s=init(),first=attack(s),before=JSON.stringify(first.state);
 assert.throws(()=>send(first.state,'defend',{orderedInstanceIds:[]},'C'),
   /Not the|authenticated|Wrong/);
 assert.equal(JSON.stringify(first.state),before);
 const c=viewStagingRoom(first.state,'C',catalog);
 assert(!Object.hasOwn(c.players[1],'hand'));
});
test('same command id replay does not apply second damage or RNG draw',()=>{
 const s=init(),a=attack(s);
 const command={commandId:'single-mirage-b',expectedRevision:a.state.revision,
  actorId:'B',type:'defend',orderedInstanceIds:[]};
 const b=submitAndResolveFixture(a.state,command,catalog,{...opts,authorizedSeatId:'B'});
 const second=submitAndResolveFixture(b.state,command,catalog,{...opts,authorizedSeatId:'B'});
 assert.equal(second.applied,false);
 assert.equal(second.duplicate,true);
 assert.equal(second.state.rngSeed,b.state.rngSeed);
 assert.equal(JSON.stringify(second.state.players),JSON.stringify(b.state.players));
});

test('explicit first-target C is deterministic and costs no opening RNG draw',()=>{
 const s=init();
 const first=attack(s,'C');
 assert.equal(first.state.activePlayerId,'C');
 assert.equal(first.state.rngSeed,s.rngSeed);
 const second=block(first.state);
 assert.equal(second.state.activePlayerId,'B');
 assert.notEqual(second.state.rngSeed,s.rngSeed);
});
test('learned Wall cannot truncate a research multi-recipient attack',()=>{
 const s=init({hands:{A:['w016','m012'],B:[],C:[]}});
 s.players[1].learned.push('m001');
 const a=attack(s),before=JSON.stringify(a.state);
 assert.throws(()=>send(a.state,'defend',{orderedInstanceIds:[],
   learnedDefinitionId:'m001'}),/Multiplayer Mirage redirect or Wall/);
 assert.equal(JSON.stringify(a.state),before);
});
test('ordinary guard on miracle-reactive armor still works in multi-seat',()=>{
 const s=init({hands:{A:['w016','m012'],B:['d018'],C:[]}});
 const a=attack(s);
 const b=block(a.state,[a.state.players[1].hand[0].instanceId]);
 assert.equal(b.state.players[1].hp,39);
 assert.equal(b.state.activePlayerId,'C');
 const end=block(b.state);
 assert.equal(end.state.phase,'turn');
 assert.equal(end.state.players[2].hp,30);
});
test('projection shows sweep / subhit but never opponents hidden cards',()=>{
 const s=init({hands:{A:['w050','m012','m012'],B:[],C:['d003']}});
 const a=attack(s),b=block(a.state);
 const p=viewStagingRoom(b.state,'C',catalog);
 assert.equal(p.pending.mirageRound,1);
 assert.equal(p.pending.mirageRounds,2);
 assert.equal(p.pending.mirageTargetHit,2);
 assert.equal(p.pending.mirageTargetHits,2);
 assert.equal(p.pending.mirageHitsResolved,1);
 assert(!Object.hasOwn(p.players[0],'hand'));
 assert(!Object.hasOwn(p.players[1],'hand'));
 assert(!Object.hasOwn(p.pending,'eligibleIds'));
});
test('three Mirages times Nokobunbun reaches 12 independent defenses across two rivals',()=>{
 const s=init({hands:{A:['w050','m012','m012','m012'],B:[],C:[]}});
 const out=run(s);
 assert.equal(out.hops.length,12);
 assert.equal(out.hops.filter(x=>x.target==='B').length,6);
 assert.equal(out.hops.filter(x=>x.target==='C').length,6);
 assert.equal(out.r.state.players[1].hp,22);
 assert.equal(out.r.state.players[2].hp,22);
 assert.equal(out.r.state.players[0].mp,10);
 assert.equal(out.r.state.players[0].hand.length,4);
 assert.equal(out.r.state.turnCount,1);
});
test('an eliminated first target skips the remainder of its Nokobunbun subhits',()=>{
 const s=init({hp:{B:2},hands:{A:['w050','m012'],B:[],C:[]}});
 const out=run(s);
 assert.equal(out.hops.length,3);
 assert.deepEqual(out.hops.map(x=>x.target),['B','C','C']);
 assert.equal(out.r.state.players[1].hp,0);
 assert.equal(out.r.state.players[2].hp,34);
});

test('nine-seat integration resolves up to 48 separate defenses without double refill',()=>{
 const hands={A:['w050','m012','m012','m012']};
 for(const id of ['B','C','D','E','F','G','H','I'])hands[id]=[];
 const s=init({hands,seed:337});
 const result=run(s);
 assert.equal(result.hops.length,48);
 assert.equal(result.hops[0].target,'B');
 for(const id of ['B','C','D','E','F','G','H','I']){
  assert.equal(result.hops.filter(h=>h.target===id).length,6);
  assert.equal(result.r.state.players.find(p=>p.id===id).hp,22);
 }
 assert.equal(result.r.state.players[0].mp,10);
 assert.equal(result.r.state.players[0].hand.length,4);
 assert.equal(result.r.state.phase,'turn');
 assert.equal(result.r.state.activePlayerId,'B');
 assert.equal(result.r.state.turnCount,1);
 assert.equal(result.events.filter(e=>e.type==='turnAdvance').length,1);
 assert.equal(result.events.filter(e=>e.type==='refill'&&e.playerId==='A').length,1);
});
