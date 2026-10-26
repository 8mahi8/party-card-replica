/**
 * Minimal +attack miracle combinations (Fireball, Meteor).
 * Original game sources:
 * https://w.atwiki.jp/piong/pages/20.html
 * https://note.com/oreapo_note/n/n7791e8e30943
 *
 * Does not guess stacked miracle, self-attack, demon armor, or other unusual
 * action order effects. Inputs use explicit hand indices and learned IDs.
 */
import {combineElements, ELEMENTS, MAX_LEARNED_MIRACLES} from './rules.mjs';
import {playAttack} from './match.mjs';

function cardFromPlayer(player, {plusHandIndex,learnedPlusId},handIndices) {
  if ((plusHandIndex === null) === (learnedPlusId === null)) {
    throw new Error('Select exactly one plus miracle source');
  }
  if (plusHandIndex !== null) {
    if (!Number.isInteger(plusHandIndex) || plusHandIndex < 0 ||
        plusHandIndex >= player.hand.length || handIndices.includes(plusHandIndex)) {
      throw new RangeError('Invalid plus miracle hand index');
    }
    return player.hand[plusHandIndex];
  }
  if(typeof learnedPlusId !== 'string' || !learnedPlusId) throw new TypeError('Invalid learned miracle ID');
  return player.learned?.find(c => c.id===learnedPlusId);
}
export function playPlusMiracleAttack(state,{
  playerId,targetId,handIndices,plusHandIndex=null,learnedPlusId=null
},draw) {
  if(!state || state.phase!=='turn' || state.activePlayerId!==playerId)
    throw new Error('Not active turn');
  const player=state.players.find(p=>p.id===playerId && p.hp>0);
  if(!player) throw new Error('Player not alive');
  if(targetId===playerId) throw new Error('Plus miracle self-target sequence not verified');
  if(!Array.isArray(handIndices) || handIndices.length===0 || new Set(handIndices).size!==handIndices.length)
    throw new RangeError('Invalid hand selection');
  const miracle=cardFromPlayer(player,{plusHandIndex,learnedPlusId},handIndices);
  if(!miracle || miracle.kind!=='miracle' || miracle.role!=='attack' || miracle.plusAttack!==true ||
    !Number.isInteger(miracle.attack) || miracle.attack<0 || !Number.isInteger(miracle.mpCost) || miracle.mpCost<0 ||
    !ELEMENTS.includes(miracle.element) || !miracle.id) throw new Error('Not a plus-attack miracle');
  if(player.mp<miracle.mpCost) throw new Error('Not enough MP');
  if(handIndices.some(i=>player.hand[i]?.kind!=='weapon'))
    throw new Error('Only weapons may accompany plus miracles in this version');
  const next=playAttack(state,{playerId,targetId,handIndices},draw);
  next.pending.attack += miracle.attack;
  next.pending.element=combineElements(next.pending.element, miracle.element);
  const caster=next.players.find(p=>p.id===playerId);
  caster.mp-=miracle.mpCost;
  if(!caster.learned.some(c=>c.id===miracle.id)) {
    caster.learned=[...caster.learned,miracle].slice(-MAX_LEARNED_MIRACLES);
  }
  // A first casting transfers the hand miracle to the learned list;
  // the resulting card draw replaces that slot. Recasts increase hand size.
  if (plusHandIndex!==null) {
    const adjusted=plusHandIndex-handIndices.filter(i=>i<plusHandIndex).length;
    caster.hand=caster.hand.filter((_,i)=>i!==adjusted);
  }
  next.pending.spentByPlayer={...next.pending.spentByPlayer,
    [playerId]:next.pending.spentByPlayer[playerId]+1};
  next.events.push({type:'plus_miracle',playerId,miracleId:miracle.id,
    attackAfter:next.pending.attack,elementAfter:next.pending.element,
    mpCost:miracle.mpCost});
  return next;
}

/**
 * Narrow source-backed sequence: single-target weapon(s) first, then two
 * additive miracle cards selected from hand. No arbitrary miracle-first,
 * spirits, stacked Aura, or other unverified order is accepted.
 */
export function playStackedPlusMiracles(state,{
  playerId,targetId,handIndices,plusHandIndices
},draw) {
  if(!state || state.phase!=='turn' || state.activePlayerId!==playerId)
    throw new Error('Not active turn');
  if(targetId===playerId)throw new Error('Self-target miracle combination unverified');
  const caster=state.players.find(p=>p.id===playerId && p.hp>0);
  if(!caster)throw new Error('Player not alive');
  if(!Array.isArray(handIndices)||!handIndices.length ||
     !Array.isArray(plusHandIndices)||plusHandIndices.length!==2)
    throw new Error('Only two hand-based additive miracles supported');
  const combined=[...handIndices,...plusHandIndices];
  if(new Set(combined).size!==combined.length ||
     combined.some(i=>!Number.isInteger(i)||i<0||i>=caster.hand.length))
    throw new RangeError('Repeated or invalid hand index');
  if(handIndices.some(i=>caster.hand[i].kind!=='weapon'))
    throw new Error('Weapons must precede miracles');
  const miracles=plusHandIndices.map(i=>caster.hand[i]);
  if(miracles.some(m=>!m||m.kind!=='miracle'||m.role!=='attack'||m.plusAttack!==true||
     !Number.isInteger(m.mpCost)||m.mpCost<0||!Number.isInteger(m.attack)||m.attack<0||
     !ELEMENTS.includes(m.element)))throw new Error('Only additive attack miracles supported');
  const cost=miracles.reduce((a,m)=>a+m.mpCost,0);
  if(caster.mp<cost)throw new Error('Not enough MP');
  const result=playAttack(state,{playerId,targetId,handIndices},draw);
  const owner=result.players.find(p=>p.id===playerId);
  for(const miracle of miracles){
    result.pending.attack+=miracle.attack;
    result.pending.element=combineElements(result.pending.element,miracle.element);
    if(!owner.learned.some(x=>x.id===miracle.id))
      owner.learned=[...owner.learned,miracle].slice(-MAX_LEARNED_MIRACLES);
  }
  owner.mp-=cost;
  const shifted=plusHandIndices.map(i=>i-handIndices.filter(j=>j<i).length);
  owner.hand=owner.hand.filter((_,i)=>!shifted.includes(i));
  result.pending.spentByPlayer={...result.pending.spentByPlayer,
    [playerId]:result.pending.spentByPlayer[playerId]+miracles.length};
  result.events.push({type:'stacked_plus_miracles',playerId,
    miracleIds:miracles.map(m=>m.id),attackAfter:result.pending.attack,
    elementAfter:result.pending.element,mpCost:cost});
  return result;
}
