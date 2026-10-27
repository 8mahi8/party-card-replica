import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand,viewStagingRoom} from '../v2/staging-room.mjs';
import {resolveSoloMiracleFixture} from '../v2/miracle-resolution.mjs';
import {resolveWallFixture,compileWallResolution} from '../v2/wall-resolution.mjs';
import {resolveRedirectFixture} from '../v2/redirect-resolution.mjs';
import {createMatch,playAttack,playMiracleAttack,defend} from '../src/match.mjs';
import {findVerifiedBasicCard as oldCard} from '../src/verified-basic-cards.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const draw=()=>oldCard('d001');
const hands={A:['w016'],B:['d001']};
function room(input=hands,{learned={},mp={},hp={}}={}){
 const s=createStagingRoom({seats:Object.keys(input).map(id=>({id,handDefinitionIds:input[id]})),
  firstSeatId:'A'},catalog);
 for(const p of s.players){
  if(learned[p.id])p.learned=[...learned[p.id]];
  if(mp[p.id]!==undefined)p.mp=mp[p.id];
  if(hp[p.id]!==undefined)p.hp=hp[p.id];
 }
 return s;
}
function old(input=hands,{learned={},mp={},hp={}}={}){
 const s=createMatch({playerIds:Object.keys(input),firstPlayerId:'A',rng:()=>0,draw});
 for(const p of s.players){
  p.hand=input[p.id].map(oldCard);
  if(learned[p.id])p.learned=learned[p.id].map(oldCard);
  if(mp[p.id]!==undefined)p.mp=mp[p.id];
  if(hp[p.id]!==undefined)p.hp=hp[p.id];
 }
 return s;
}
function action(s,actor,type,indices=[],option={}){
 const p=s.players.find(x=>x.id===actor);
 return applyStagingCommand(s,{
  commandId:option.commandId??('cmd-'+actor+'-'+s.revision),expectedRevision:s.revision,
  actorId:actor,type,...(type==='castLearned'
   ?{targetId:option.targetId??'B',learnedDefinitionId:option.learnedId}
   :{orderedInstanceIds:indices.map(i=>p.hand[i].instanceId),
      ...(type==='playCards'?{targetId:option.targetId??'B'}:{}),
      ...(option.learnedId?{learnedDefinitionId:option.learnedId}:{})})
 },catalog,{authorizedSeatId:actor}).state;
}
function attackAndDefend(s,{attack=[0],attackLearned=null,defense=[],wallLearned=null,target='B'}={}){
 const a=attackLearned
  ?action(s,'A','castLearned',[],{learnedId:attackLearned,targetId:target})
  :action(s,'A','playCards',attack,{targetId:target});
 return target==='A'?a:action(a,target,'defend',defense,{learnedId:wallLearned});
}
function outcome(a,b){
 assert.deepEqual(a.players.map(p=>[p.hp,p.mp,p.money,p.hand.length,p.learned.map(x=>x.id)]),
  b.players.map(p=>[p.hp,p.mp,p.money,p.hand.length,p.learned]));
 assert.equal(a.phase,b.phase);assert.equal(a.activePlayerId,b.activePlayerId);
 assert.equal(a.winnerId,b.winnerId);
}
const stop=s=>resolveRedirectFixture(s,catalog,{labOnly:true,fixtureDrawDefinitionId:'d001'});
const cast=s=>resolveSoloMiracleFixture(s,catalog,{labOnly:true,fixtureDrawDefinitionId:'d001'});

test('G2 stages a learned solo ice miracle without a card instance',()=>{
 const s=room({A:['d001'],B:['d001']},{learned:{A:['m002']}});
 const staged=attackAndDefend(s,{attackLearned:'m002'});
 assert.deepEqual(staged.pending.attackInstanceIds,[]);
 assert.equal(staged.pending.attackLearnedDefinitionId,'m002');
 assert.equal(staged.revision,2);
 assert.equal(staged.phase,'resolving');
});
test('learned ice recast draws a card without consuming hand cards and matches old rules',()=>{
 const input={A:['d001'],B:['d001']},opts={learned:{A:['m002']}};
 const staged=attackAndDefend(room(input,opts),{attackLearned:'m002'});
 const next=cast(staged).state;
 let orig=playMiracleAttack(old(input,opts),{playerId:'A',targetId:'B',learnedId:'m002'},draw);
 orig=defend(orig,{playerId:'B',handIndices:[]},draw);
 outcome(orig,next);
 assert.equal(next.players[0].hand.length,2);
 assert.equal(next.players[0].mp,8);
 assert.deepEqual(next.players[0].learned,['m002']);
});
test('learned dark miracle consumes MP5, can eliminate player, and draws on survival',()=>{
 const input={A:['d001'],B:['d001']},opts={learned:{A:['m003']}};
 const s=attackAndDefend(room(input,opts),{attackLearned:'m003'});
 const next=cast(s).state;
 let orig=playMiracleAttack(old(input,opts),{playerId:'A',targetId:'B',learnedId:'m003'},draw);
 orig=defend(orig,{playerId:'B'},draw);
 outcome(orig,next);
 assert.equal(next.phase,'finished');assert.equal(next.winnerId,'A');
});
test('learned casting obeys hand limit of 18',()=>{
 const input={A:Array(18).fill('d001'),B:['d001']},opts={learned:{A:['m002']}};
 const next=cast(attackAndDefend(room(input,opts),{attackLearned:'m002'})).state;
 assert.equal(next.players[0].hand.length,18);
});
test('G2 rejects unlearned, non-offensive and spoofed learned attack before staging',()=>{
 const s=room({A:['d001'],B:['d001']},{learned:{A:['m002','m001','m004']}});
 const before=JSON.stringify(s);
 assert.throws(()=>action(s,'A','castLearned',[],{learnedId:'m003'}),/Offensive miracle not learned/);
 assert.throws(()=>action(s,'A','castLearned',[],{learnedId:'m001'}),/Offensive miracle not learned/);
 assert.throws(()=>action(s,'A','castLearned',[],{learnedId:'m004'}),/Offensive miracle not learned/);
 assert.equal(JSON.stringify(s),before);
});
test('learned attack must pay its cost or fail without modifying source',()=>{
 const input={A:['d001'],B:['d001']},opts={learned:{A:['m002']},mp:{A:1}};
 const s=attackAndDefend(room(input,opts),{attackLearned:'m002'});
 const baseline=JSON.stringify(s);
 assert.throws(()=>cast(s),/Not enough MP/);
 assert.equal(JSON.stringify(s),baseline);
});
test('learned action idempotency and private learned spell visibility',()=>{
 const s=room({A:['d001'],B:['d001']},{learned:{A:['m002']}});
 const cmd={commandId:'cast-1',actorId:'A',expectedRevision:0,type:'castLearned',targetId:'B',learnedDefinitionId:'m002'};
 const one=applyStagingCommand(s,cmd,catalog,{authorizedSeatId:'A'}).state;
 const second=applyStagingCommand(one,cmd,catalog,{authorizedSeatId:'A'});
 assert.equal(second.duplicate,true);assert.strictEqual(second.state,one);
 assert.throws(()=>applyStagingCommand(one,{...cmd,learnedDefinitionId:'m003'},catalog,{authorizedSeatId:'A'}),/Conflicting commandId/);
 const other=viewStagingRoom(one,'B');
 assert.equal(JSON.stringify(other).includes('"learned"'),true);
 assert.equal(JSON.stringify(other).includes('"m002"'),false);
});
test('first Wall use from hand stops neutral weapon, costs MP6, learns and refills',()=>{
 const input={A:['w016'],B:['m001','d001']},s=attackAndDefend(room(input),{defense:[0]});
 const plan=compileWallResolution(s,catalog);
 assert.equal(plan.mpCost,6);assert.equal(plan.learnedCast,false);
 assert.equal(plan.queue.some(e=>e.type==='learn'),true);
 const next=stop(s).state;
 let orig=playAttack(old(input),{playerId:'A',targetId:'B',handIndices:[0]},draw);
 orig=defend(orig,{playerId:'B',wallHandIndex:0},draw);
 outcome(orig,next);
 assert.equal(next.players[1].hp,40);assert.equal(next.players[1].mp,4);
 assert.deepEqual(next.players[1].learned,['m001']);
});
test('learned Wall stops neutral weapon and grants one additional hand card',()=>{
 const input={A:['w016'],B:['d001']},opts={learned:{B:['m001']}};
 const s=attackAndDefend(room(input,opts),{wallLearned:'m001'});
 const next=stop(s).state;
 let orig=playAttack(old(input,opts),{playerId:'A',targetId:'B',handIndices:[0]},draw);
 orig=defend(orig,{playerId:'B',wallLearnedId:'m001'},draw);
 outcome(orig,next);
 assert.equal(next.players[1].hand.length,2);assert.equal(next.players[1].mp,4);
});
test('Wall rejects an elemental attack without curtain, atomically',()=>{
 const input={A:['w018'],B:['m001']},s=attackAndDefend(room(input),{defense:[0]});
 const before=JSON.stringify(s);
 assert.throws(()=>stop(s),/neutral weapon attack/);
 assert.equal(JSON.stringify(s),before);
});
test('Rainbow Curtain followed by first-use Wall stops elemental weapon',()=>{
 const input={A:['w018'],B:['i001','m001']},s=attackAndDefend(room(input),{defense:[0,1]});
 const next=stop(s).state;
 let orig=playAttack(old(input),{playerId:'A',targetId:'B',handIndices:[0]},draw);
 orig=defend(orig,{playerId:'B',handIndices:[0],wallHandIndex:1},draw);
 outcome(orig,next);
 assert.equal(next.players[1].hp,40);
});
test('Rainbow Curtain followed by learned Wall stops elemental weapon',()=>{
 const input={A:['w018'],B:['i001','d001']},opts={learned:{B:['m001']}};
 const s=attackAndDefend(room(input,opts),{defense:[0],wallLearned:'m001'});
 const next=stop(s).state;
 let orig=playAttack(old(input,opts),{playerId:'A',targetId:'B',handIndices:[0]},draw);
 orig=defend(orig,{playerId:'B',handIndices:[0],wallLearnedId:'m001'},draw);
 outcome(orig,next);
 assert.equal(next.players[1].hp,40);
});
test('Wall cannot stop a miracle, even if its attack element is neutral',()=>{
 const input={A:['m002'],B:['m001']};
 const s=attackAndDefend(room(input),{defense:[0]});
 assert.throws(()=>stop(s),/Basic resolution requires weapon first/);
});
test('Wall refuses MP deficit or unsupported mixed defensive cards',()=>{
 const input={A:['w016'],B:['m001','d001']},opts={mp:{B:5}};
 const s=attackAndDefend(room(input,opts),{defense:[0]});
 assert.throws(()=>stop(s),/Not enough MP/);
 const extras=attackAndDefend(room(input),{defense:[0,1]});
 assert.throws(()=>stop(extras),/Wall may only combine/);
});
test('learned Wall followed by replayed command cannot spend twice',()=>{
 const input={A:['w016'],B:['d001']},opts={learned:{B:['m001']}};
 const s=attackAndDefend(room(input,opts),{wallLearned:'m001'});
 const f=stop(s).state;
 assert.equal(f.phase,'turn');assert.equal(f.revision,3);
 assert.throws(()=>stop(f),/Not a pending attack/);
});
test('old attacker may defend a reflection with learned Wall without breaking replenishment',()=>{
 const input={A:['w016','d001'],B:['w027']},opts={learned:{A:['m001']}};
 const opening=action(room(input,opts),'A','playCards',[0]);
 const reflected=stop(action(opening,'B','defend',[0]));
 assert.equal(reflected.state.activePlayerId,'A');
 const response=action(reflected.state,'A','defend',[],{learnedId:'m001'});
 const next=stop(response).state;
 let orig=playAttack(old(input,opts),{playerId:'A',targetId:'B',handIndices:[0]},draw);
 orig=defend(orig,{playerId:'B',handIndices:[0]},draw);
 orig=defend(orig,{playerId:'A',wallLearnedId:'m001'},draw);
 outcome(orig,next);
 assert.equal(next.players[0].mp,4);
});
