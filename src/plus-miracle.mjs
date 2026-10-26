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
  // Normal weapons are replaced AND an additional card is drawn for casting.
  // The miracle itself remains in hand or the learned list.
  next.pending.spentByPlayer={...next.pending.spentByPlayer,
    [playerId]:next.pending.spentByPlayer[playerId]+1};
  next.events.push({type:'plus_miracle',playerId,miracleId:miracle.id,
    attackAfter:next.pending.attack,elementAfter:next.pending.element,
    mpCost:miracle.mpCost});
  return next;
}
