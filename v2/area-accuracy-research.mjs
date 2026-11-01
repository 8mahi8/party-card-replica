/**
 * G7 research-only: original %-labelled area attacks roll accuracy for EACH
 * living opponent independently. 25/50/75 are source-backed rates.
 *
 * This is NOT a playable attack resolver. In particular it does not assign
 * defense windows, resolve redirects, spend MP, draw cards, deal damage, or
 * apply Flash. Timing/order of these operations requires separate verification.
 *
 * The lab currently has no team data: only free-for-all / 1v1 seating may use
 * this planner. Never pass these samples through a public room view.
 *
 * Sources: https://w.atwiki.jp/piong/pages/20.html
 *          https://w.atwiki.jp/aniwotawiki/pages/47010.html
 */
import {drawRandom32} from './foundation.mjs';

function fail(message){throw new Error('Area accuracy research: '+message);}
function validId(value){return typeof value==='string'&&/^[a-zA-Z0-9._:-]{1,80}$/.test(value);}

/**
 * Host-side, pure research simulation. Seat order is used ONLY as a repeatable
 * sampling order; whether the original client consumes RNG in this order is
 * unverified. Team battle targeting and Dark Cloud are not covered.
 *
 * Each qualifying recipient consumes one RNG step, including a miss. A miss
 * is NOT synonymous with a fully blocked hit: shields and afflictions are
 * deliberately outside this function.
 */
export function planAreaAccuracyResearchFixture({
 players,sourceId,accuracyPercent,rngSeed
}={}){
 if(!Array.isArray(players)||players.length<2||players.length>9)
   fail('Requires 2-9 free-for-all seats');
 if(!validId(sourceId)||!players.some(p=>p?.id===sourceId&&p.hp>0))
   fail('Source must be a living seat');
 if(![25,50,75].includes(accuracyPercent))
   fail('Unsupported original area-attack rate');
 if(!Number.isSafeInteger(rngSeed)||rngSeed<1||rngSeed>0xffffffff)
   fail('Invalid host RNG seed');
 const seen=new Set();
 for(const p of players){
   if(!p||typeof p!=='object'||Array.isArray(p)||!validId(p.id)||
      seen.has(p.id)||!Number.isSafeInteger(p.hp)||p.hp<0||
      'teamId' in p||'team' in p)
     fail('Invalid or team-mode seating');
   seen.add(p.id);
 }
 let seed=rngSeed;
 const outcomes=[];
 for(const player of players){
   if(player.id===sourceId||player.hp===0)continue;
   const next=drawRandom32(seed);
   seed=next.nextSeed;
   outcomes.push(Object.freeze({
     targetId:player.id,hit:next.value<accuracyPercent/100
   }));
 }
 if(!outcomes.length)fail('No living opposing seats');
 return Object.freeze({
   accuracyPercent,
   outcomes:Object.freeze(outcomes),
   nextSeed:seed
 });
}
