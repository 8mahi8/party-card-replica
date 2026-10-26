/**
 * 2+ player *basic attack/defense laboratory* for checking source-backed rules.
 * Hybrid main weapons with an explicit guard value can be used for defense.
 * NOT the complete God Field game: special cards, status, catastrophes,
 * end-of-world and networking are intentionally not modelled.
 *
 * In-memory state contains only serializable data. Draw/RNG are injected so
 * online authoritative replay and deterministic tests can use the same rules.
 */
import {
  STARTING_STATS, MAX_HAND_SIZE, ELEMENTS, combineElements,
  calculateHit, canBlock, initialHand, refillHand,
} from './rules.mjs';

function validCard(card) {
  if (!card || typeof card !== 'object' || typeof card.id !== 'string' || !card.id) throw new TypeError('Invalid card');
  if (card.effect !== undefined || card.special !== undefined) throw new Error('Special effects not implemented');
  if (card.kind === 'weapon') {
    if (!['main','addon'].includes(card.slot) || !Number.isInteger(card.attack) || card.attack < 0 || !ELEMENTS.includes(card.element) || (card.guard !== undefined && (!Number.isInteger(card.guard) || card.guard < 0))) throw new TypeError('Invalid weapon');
  } else if (card.kind === 'armor') {
    if (!Number.isInteger(card.guard) || card.guard < 0 || !ELEMENTS.includes(card.element) || (card.attackBonus !== undefined && (!Number.isInteger(card.attackBonus) || card.attackBonus < 0))) throw new TypeError('Invalid armor');
  } else {
    throw new Error(`Unsupported card category: ${card.kind}`);
  }
  return card;
}
function normalizeIndexes(indices, hand) {
  if (!Array.isArray(indices) || !indices.length || indices.some(i => !Number.isInteger(i) || i < 0 || i >= hand.length)) throw new RangeError('Invalid selection');
  if (new Set(indices).size !== indices.length) throw new Error('Repeated hand index');
  return indices;
}
function take(hand,indices) {
  const ix=new Set(indices);
  return hand.filter((_,i)=>!ix.has(i));
}
function expectTurn(state,playerId) {
  if (state.phase !== 'turn' || state.activePlayerId !== playerId) throw new Error('Not active turn');
}
function person(state,id) {
  const p=state.players.find(p=>p.id===id);
  if (!p || p.hp<=0) throw new Error('Player not alive');
  return p;
}
function clone(state) {
  return {
    ...state,
    players: state.players.map(p=>({...p, hand:[...p.hand]})),
    pending: state.pending ? {...state.pending} : null,
    events:[...state.events],
  };
}
function nextAlive(players, afterId) {
  const from=players.findIndex(p=>p.id===afterId);
  for(let offset=1;offset<=players.length;offset++) {
    const candidate=players[(from+offset)%players.length];
    if(candidate.hp>0) return candidate.id;
  }
  return null;
}
function finishAndDraw(match, selectedDefenseCount, draw) {
  if (typeof draw !== 'function') throw new TypeError('draw callback required');
  const s=clone(match);
  const p=s.pending;
  if (!p) throw new Error('No pending attack');
  const to=person(s,p.targetId);
  const hit=calculateHit({attack:p.attack,element:p.element,armor:p.armor,hp:to.hp});
  to.hp=hit.hpAfter;
  s.events.push({type:'damage',targetId:to.id,damage:hit.damage,instantDefeat:hit.instantDefeat,hpAfter:to.hp});
  s.pending=null;
  // The response completes before hand replacement; sequence within the
  // replacement step remains a hypothesis until checked in the live game.
  const attacker=s.players.find(x=>x.id===p.sourceId);
  if(attacker.hp>0) attacker.hand=refillHand(attacker.hand,p.attackerSpent,()=>validCard(draw()));
  if(to.hp>0 && to.id!==attacker.id) to.hand=refillHand(to.hand,selectedDefenseCount,()=>validCard(draw()));
  const living=s.players.filter(x=>x.hp>0);
  if(living.length<=1) {
    s.phase='finished';s.activePlayerId=null;
    s.winnerId=living.length===1?living[0].id:null;
    s.events.push({type:'match_end',winnerId:s.winnerId});
  } else {
    s.phase='turn';s.activePlayerId=nextAlive(s.players,p.sourceId);
    s.turnCount+=1;
  }
  return s;
}
export function createMatch({playerIds,draw,rng=Math.random,firstPlayerId=null}) {
  if(!Array.isArray(playerIds) || playerIds.length<2 || playerIds.length>9 ||
     playerIds.some(id=>typeof id!=='string' || !id) || new Set(playerIds).size!==playerIds.length) {
    throw new Error('Need 2-9 distinct nonempty player IDs');
  }
  if(typeof draw!=='function' || typeof rng!=='function') throw new TypeError('draw and rng required');
  const r=rng();
  if(!Number.isFinite(r)||r<0||r>=1)throw new RangeError('rng must return [0,1)');
  const first=firstPlayerId??playerIds[Math.floor(r*playerIds.length)];
  if(!playerIds.includes(first))throw new Error('Invalid first player');
  const players=playerIds.map(id=>({...STARTING_STATS,id,hand:initialHand(()=>validCard(draw()))}));
  return {players,activePlayerId:first,phase:'turn',pending:null,turnCount:0,winnerId:null,events:[]};
}
export function playAttack(state,{playerId,targetId,handIndices},draw) {
  expectTurn(state,playerId);
  const attacker=person(state,playerId);
  person(state,targetId);
  const indices=normalizeIndexes(handIndices,attacker.hand);
  const cards=indices.map(i=>validCard(attacker.hand[i]));
  const weapons=cards.filter(c=>c.kind==='weapon');
  const bonuses=cards.filter(c=>c.kind==='armor' && c.attackBonus > 0);
  if (weapons.length===0 || bonuses.length+weapons.length!==cards.length || weapons.filter(c=>c.slot==='main').length>1) throw new Error('Attack needs weapon(s), <=1 main weapon, and attack-bonus armor only');
  const attack=weapons.reduce((sum,c)=>sum+c.attack,0)+bonuses.reduce((sum,c)=>sum+c.attackBonus,0);
  let element=weapons[0].element;
  for(const card of weapons.slice(1)) element=combineElements(element,card.element);
  const s=clone(state);
  const source=person(s,playerId);
  source.hand=take(source.hand,indices);
  s.pending={sourceId:playerId,targetId,attack,element,armor:0,attackerSpent:cards.length};
  s.events.push({type:'attack',sourceId:playerId,targetId,attack,element,spent:cards.length});
  if(targetId===playerId) return finishAndDraw(s,0,draw); // Self-hit cannot be defended.
  s.phase='defense';s.activePlayerId=targetId;
  return s;
}
export function defend(state,{playerId,handIndices=[]},draw) {
  if(state.phase!=='defense'||!state.pending||state.pending.targetId!==playerId)throw new Error('Not your defense');
  const p=person(state,playerId);
  if(!Array.isArray(handIndices))throw new TypeError('Selection must be array');
  const indices=handIndices.length?normalizeIndexes(handIndices,p.hand):[];
  const cards=indices.map(i=>validCard(p.hand[i]));
  if(cards.some(c=>!((c.kind==='armor') || (c.kind==='weapon' && Number.isInteger(c.guard))) || !canBlock(state.pending.element,c.element))) throw new Error('Illegal shield for attack element');
  const s=clone(state);
  const defender=person(s,playerId);
  defender.hand=take(defender.hand,indices);
  s.pending.armor=cards.reduce((sum,c)=>sum+c.guard,0);
  s.events.push({type:'defense',playerId,spent:cards.length,armor:s.pending.armor});
  return finishAndDraw(s,cards.length,draw);
}
export function pray(state,{playerId},draw) {
  expectTurn(state,playerId);
  const p=person(state,playerId);
  if(p.hand.some(c=>validCard(c).kind==='weapon'))throw new Error('Pray only when no weapons are available');
  // The documented at-cap random-discard corner case is deferred rather than guessed.
  if(p.hand.length===MAX_HAND_SIZE)throw new Error('Pray at 18 cards not implemented');
  if(typeof draw!=='function')throw new TypeError('draw required');
  const s=clone(state);
  person(s,playerId).hand=refillHand(p.hand,1,()=>validCard(draw()));
  s.events.push({type:'pray',playerId,drawn:1});
  s.activePlayerId=nextAlive(s.players,playerId);
  s.turnCount+=1;
  return s;
}
