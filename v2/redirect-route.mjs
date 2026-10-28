/**
 * G3 shared, source-backed redirect target + RNG planner.
 *
 * Both physical weapons and standalone miracles use the same original rules:
 * reflect -> previous attacking prophet; deflect -> any living prophet,
 * including self. If deflect lands on its owner, there is NO second defense.
 *
 * This is a PURE routing plan. It does not pay costs, spend cards, refill,
 * change room revision or commit a state. The hosting resolver is responsible
 * for those actions and must use a transaction/CAS for live multiplayer.
 *
 * Source: https://w.atwiki.jp/piong/pages/17.html
 */
import {reflectTarget} from '../src/rules.mjs';
import {drawRandom32} from './foundation.mjs';

export function planRedirectRoute(state,{
  mode,sourceId,targetId,deflectRng=null
}={}){
  if(!state||!Array.isArray(state.players)||!state.players.length||
     typeof sourceId!=='string'||typeof targetId!=='string')
    throw new Error('Invalid redirect room or parties');
  const living=state.players.filter(x=>x.hp>0).map(x=>x.id);
  if(!living.includes(sourceId)||!living.includes(targetId))
    throw new Error('Redirect parties must be alive');
  if(!['reflect','deflect'].includes(mode))
    throw new Error('Unsupported redirect mode');
  let nextSeed=state.rngSeed;
  let rng=()=>0;
  if(mode==='deflect'){
    if(deflectRng!==null){
      if(typeof deflectRng!=='function')
        throw new Error('Invalid deflect RNG');
      rng=deflectRng;
    } else {
      const roll=drawRandom32(state.rngSeed);
      nextSeed=roll.nextSeed;
      rng=()=>roll.value;
    }
  }
  const route=reflectTarget({
    source:sourceId,target:targetId,actor:targetId,mode,living,rng
  });
  return Object.freeze({
    route:Object.freeze({...route}),
    nextSeed,
    immediate:route.target===targetId
  });
}
