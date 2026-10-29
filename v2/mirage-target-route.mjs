/**
 * Source-limited, PURE multiplayer Mirage target scheduler.
 *
 * Piong's "new Mirage" guide describes a serial attack that randomly
 * selects one not-yet-attacked eligible player after a target resolves.
 * This module schedules TARGETS only. It NEVER resolves HP, defenses,
 * redirects, Wall, cost, learned miracles, or a live turn.
 *
 * Research fixtures MAY provide an explicit firstTargetId, preserving RNG.
 * Without it the first victim is seeded-random. Original first-victim
 * selection has NOT been directly confirmed.
 * No code in the playable 1v1 resolver calls this research-only module.
 *
 * https://w.atwiki.jp/piong/pages/20.html
 * https://w.atwiki.jp/gfplusa/pages/19.html
 */
import {drawRandom32} from './foundation.mjs';

const MAX_PLAYERS=9;
function fail(reason){throw new Error('Mirage route: '+reason);}
function id(value){
 if(typeof value!=='string'||!/^[a-zA-Z0-9._:-]{1,80}$/.test(value))
  fail('Invalid seat ID');
 return value;
}
function checkPlayers(players){
 if(!Array.isArray(players)||players.length<2||players.length>MAX_PLAYERS)
  fail('Requires 2-9 seats');
 const seen=new Set();
 for(const p of players){
  if(!p||typeof p!=='object'||Array.isArray(p))fail('Malformed seat');
  const name=id(p.id);
  if(seen.has(name))fail('Duplicate seat');
  seen.add(name);
  if(!Number.isSafeInteger(p.hp)||p.hp<0)fail('Invalid HP');
 }
 return seen;
}
function checkShape(route,players){
 checkPlayers(players);
 if(!route||typeof route!=='object'||Array.isArray(route))
  fail('Missing route');
 if(!Number.isSafeInteger(route.roundCount)||route.roundCount<1||route.roundCount>3||
    ![1,2].includes(route.hitsPerTarget)||
    !Number.isSafeInteger(route.roundIndex)||route.roundIndex<0||
    route.roundIndex>=route.roundCount||
    !Number.isSafeInteger(route.subHitIndex)||route.subHitIndex<0||
    route.subHitIndex>=route.hitsPerTarget||
    !Number.isSafeInteger(route.hitNumber)||route.hitNumber<0)
  fail('Invalid route counters');
 const initial=route.initialSeatIds;
 if(!Array.isArray(initial)||initial.length!==players.length||
    initial.some((v,i)=>v!==players[i].id))fail('Seats changed during attack');
 const eligible=route.eligibleIds;
 if(!Array.isArray(eligible)||!eligible.length||eligible.length>MAX_PLAYERS-1||
    new Set(eligible).size!==eligible.length||
    eligible.some(x=>typeof x!=='string'||x===route.sourceId||
      !initial.includes(x)))fail('Invalid initial eligible targets');
 if(!initial.includes(route.sourceId)||!initial.includes(route.targetId)||
    route.sourceId===route.targetId||
    !eligible.includes(route.targetId))fail('Invalid route actor or target');
 const visited=route.visitedIds;
 if(!Array.isArray(visited)||!visited.includes(route.targetId)||
    new Set(visited).size!==visited.length||
    visited.some(x=>!eligible.includes(x)))fail('Invalid visited ledger');
 if(route.hitNumber>=route.roundCount*eligible.length*route.hitsPerTarget)
  fail('Route already exhausted');
 if(route.hitsPerTarget===1&&route.subHitIndex!==0)
  fail('Single hit target cannot have a second subhit');
}
function draw(candidates,seed){
 const rng=drawRandom32(seed);
 const choice=candidates[Math.floor(rng.value*candidates.length)];
 if(!choice)fail('Unable to choose live target');
 return {targetId:choice,nextSeed:rng.nextSeed};
}
function immutableRoute(base,extra={}){
 return Object.freeze({...base,...extra,
   initialSeatIds:Object.freeze([...base.initialSeatIds]),
   eligibleIds:Object.freeze([...base.eligibleIds]),
   visitedIds:Object.freeze([...(extra.visitedIds??base.visitedIds)])});
}
/** Create an isolated fixture plan; optional selected first target spends no RNG. */
export function beginMirageTargetRouteFixture({
 players,sourceId,firstTargetId=null,mirageCount=1,hitsPerTarget=1,rngSeed
}={}){
 checkPlayers(players);id(sourceId);
 if(!Number.isSafeInteger(rngSeed)||rngSeed<=0||rngSeed>0xffffffff)
  fail('Invalid RNG seed');
 if(![1,2,3].includes(mirageCount)||![1,2].includes(hitsPerTarget))
  fail('Only 1-3 sweeps and 1-2 weapon hits are source-backed');
 if(!players.some(p=>p.id===sourceId&&p.hp>0))
  fail('Source must be alive');
 const eligible=players.filter(p=>p.id!==sourceId&&p.hp>0).map(p=>p.id);
 if(!eligible.length)fail('No living targets');
 if(firstTargetId!==null&&(!eligible.includes(firstTargetId)))
  fail('First target must be a living opponent');
 const choice=firstTargetId===null?draw(eligible,rngSeed)
   :{targetId:firstTargetId,nextSeed:rngSeed};
 const {targetId,nextSeed}=choice;
 const route=immutableRoute({
   sourceId,targetId,initialSeatIds:players.map(p=>p.id),eligibleIds:eligible,
   roundCount:mirageCount,hitsPerTarget,
   roundIndex:0,subHitIndex:0,hitNumber:0,
   visitedIds:[targetId]
 });
 return Object.freeze({route,targetId,nextSeed});
}
/**
 * Progress after ONE fully resolved attack. The caller supplies *post-hit*
 * seats (including charm revival and reflected self-damage), not prospective
 * damage, and commits nextSeed only after its authoritative transaction.
 */
export function advanceMirageTargetRouteFixture({route,players,rngSeed}={}){
 checkShape(route,players);
 if(!players.some(p=>p.id===route.sourceId&&p.hp>0))
   return Object.freeze({complete:true,reason:'sourceEliminated',
      nextSeed:rngSeed,hitNumber:route.hitNumber+1});
 const alive=new Set(players.filter(p=>p.hp>0).map(p=>p.id));
 const opponents=route.eligibleIds.filter(v=>alive.has(v));
 if(!opponents.length)
   return Object.freeze({complete:true,reason:'allTargetsEliminated',
      nextSeed:rngSeed,hitNumber:route.hitNumber+1});
 // A multi-hit weapon repeats on the same defender before selecting a new
 // prophet. If that defender died, skip its remaining unresolvable subhits.
 if(route.subHitIndex+1<route.hitsPerTarget&&alive.has(route.targetId)){
   const next=immutableRoute(route,{subHitIndex:route.subHitIndex+1,
      hitNumber:route.hitNumber+1});
   return Object.freeze({complete:false,reason:'sameTarget',
      targetId:next.targetId,route:next,nextSeed:rngSeed});
 }
 let roundIndex=route.roundIndex;
 let visited=route.visitedIds;
 let candidates=opponents.filter(x=>!visited.includes(x));
 if(!candidates.length){
   roundIndex++;
   if(roundIndex>=route.roundCount)
     return Object.freeze({complete:true,reason:'allSweepsComplete',
       nextSeed:rngSeed,hitNumber:route.hitNumber+1});
   visited=[];
   candidates=[...opponents];
 }
 const choice=draw(candidates,rngSeed);
 const next=immutableRoute(route,{
   targetId:choice.targetId,visitedIds:[...visited,choice.targetId],
   roundIndex,subHitIndex:0,hitNumber:route.hitNumber+1
 });
 return Object.freeze({complete:false,reason:'nextTarget',
   targetId:next.targetId,route:next,nextSeed:choice.nextSeed});
}
