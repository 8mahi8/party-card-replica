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
  calculateHit, canBlock, initialHand, refillHand, reflectTarget,
} from './rules.mjs';
import {priceMiracleSequence} from './spirit-sequence.mjs';

function validCard(card) {
  if (!card || typeof card !== 'object' || typeof card.id !== 'string' || !card.id) throw new TypeError('Invalid card');
  if (card.special !== undefined || (card.effect !== undefined && !((card.kind === 'defense_item' && ['strip_element','reflect_any'].includes(card.effect)) || (card.kind === 'support_item' && card.effect === 'free_previous_miracle')))) throw new Error('Special effects not implemented');
  if (card.kind === 'weapon') {
    if (!['main','addon'].includes(card.slot) || !Number.isInteger(card.attack) || card.attack < 0 || !ELEMENTS.includes(card.element) || (card.guard !== undefined && (!Number.isInteger(card.guard) || card.guard < 0))) throw new TypeError('Invalid weapon');
    if (card.reaction !== undefined && (!['reflect','deflect'].includes(card.reaction) || card.reactionScope !== 'neutral_weapon')) throw new Error('Unknown weapon reaction');
  } else if (card.kind === 'armor') {
    if (!Number.isInteger(card.guard) || card.guard < 0 || !ELEMENTS.includes(card.element) || (card.attackBonus !== undefined && (!Number.isInteger(card.attackBonus) || card.attackBonus < 0))) throw new TypeError('Invalid armor');
    if (card.stopScope !== undefined && card.stopScope !== 'miracle') throw new Error('Unknown stop scope');
  } else if (card.kind === 'miracle') {
    if (!Number.isInteger(card.mpCost) || card.mpCost < 0 || !['attack','stop','boost_weapon'].includes(card.role)) throw new TypeError('Invalid miracle');
    if (card.role==='boost_weapon' && card.boost!=='double_weapon') throw new Error('Unknown boost miracle');
    if (card.role === 'attack' && (!Number.isInteger(card.attack) || card.attack<0 || !ELEMENTS.includes(card.element))) throw new TypeError('Invalid miracle attack');
    if (card.role === 'stop' && card.stopScope !== 'neutral_weapon') throw new Error('Unknown miracle stop scope');
  } else if (card.kind === 'support_item') {
    if (card.effect !== 'free_previous_miracle') throw new Error('Unsupported spirit item');
  } else if (card.kind === 'defense_item') {
    if (!['strip_element','reflect_any'].includes(card.effect)) throw new Error('Unsupported defense item');
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
    players: state.players.map(p=>({...p, hand:[...p.hand], learned:[...(p.learned ?? [])]})),
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
function finishAndDraw(match, draw) {
  if (typeof draw !== 'function') throw new TypeError('draw callback required');
  const s=clone(match);
  const p=s.pending;
  if (!p) throw new Error('No pending attack');
  const to=person(s,p.targetId);
  const hit=p.stopped ? {damage:0,instantDefeat:false,hpAfter:to.hp} : calculateHit({attack:p.attack,element:p.element,armor:p.armor,hp:to.hp,rainbowCurtain:!!p.rainbowCurtain});
  to.hp=hit.hpAfter;
  s.events.push({type:'damage',targetId:to.id,damage:hit.damage,instantDefeat:hit.instantDefeat,hpAfter:to.hp,stopped:!!p.stopped});
  s.pending=null;
  // The response completes before hand replacement; sequence within the
  // replacement step remains a hypothesis until checked in the live game.
  // Redirects change the apparent attacker. Keep the ORIGINAL turn owner for
  // turn order, while replenishing cards spent by EACH surviving participant.
  // Exact replenishment order still awaits comparison with a live match.
  for (const player of s.players) {
    const spent=p.spentByPlayer[player.id] ?? 0;
    if(player.hp>0 && spent>0) player.hand=refillHand(player.hand,spent,()=>validCard(draw()));
  }
  const living=s.players.filter(x=>x.hp>0);
  if(living.length<=1) {
    s.phase='finished';s.activePlayerId=null;
    s.winnerId=living.length===1?living[0].id:null;
    s.events.push({type:'match_end',winnerId:s.winnerId});
  } else {
    s.phase='turn';s.activePlayerId=nextAlive(s.players,p.originalAttackerId);
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
  const players=playerIds.map(id=>({...STARTING_STATS,id,hand:initialHand(()=>validCard(draw())),learned:[]}));
  return {players,activePlayerId:first,phase:'turn',pending:null,turnCount:0,winnerId:null,events:[]};
}
function learnFrom(learned, miracle) {
  if(learned.some(c=>c.id===miracle.id)) return [...learned];
  return [...learned, miracle].slice(-6);
}
export function playMiracleAttack(state,{playerId,targetId,handIndex=null,learnedId=null,spiritHandIndex=null},draw) {
  expectTurn(state,playerId);
  const caster=person(state,playerId);
  person(state,targetId);
  if((handIndex===null)===(learnedId===null)) throw new Error('Choose exactly one miracle source');
  let miracle;
  if(handIndex!==null){
    if(!Number.isInteger(handIndex)||handIndex<0||handIndex>=caster.hand.length) throw new RangeError('Invalid miracle index');
    miracle=validCard(caster.hand[handIndex]);
  }else miracle=validCard(caster.learned?.find(x=>x.id===learnedId));
  if(miracle.kind!=='miracle' || miracle.role!=='attack')throw new Error('Not an offensive miracle');
  let spirit=null;
  if(spiritHandIndex!==null) {
    if(!Number.isInteger(spiritHandIndex)||spiritHandIndex<0||
       spiritHandIndex>=caster.hand.length||spiritHandIndex===handIndex)
      throw new RangeError('Invalid spirit hand index');
    spirit=validCard(caster.hand[spiritHandIndex]);
    if(spirit.kind!=='support_item'||spirit.effect!=='free_previous_miracle')
      throw new Error('Not a spirit item');
  }
  // Selection order is explicit: miracle, then (optional) spirit.
  const price=priceMiracleSequence([{type:'miracle',mpCost:miracle.mpCost},
    ...(spirit?[{type:'spirit'}]:[])]).payableMP;
  if(caster.mp<price)throw new Error('Not enough MP');
  const s=clone(state),source=person(s,playerId);
  source.mp-=price;
  source.learned=learnFrom(source.learned,miracle);
  // First use transfers miracle from hand to learned; the miracle draw
  // replaces that slot. Recasts from learned add a card.
  source.hand=take(source.hand,[...(handIndex===null?[]:[handIndex]),...(spiritHandIndex===null?[]:[spiritHandIndex])]);
  s.pending={originalAttackerId:playerId,sourceId:playerId,targetId,
    attack:miracle.attack,element:miracle.element,attackKind:'miracle',armor:0,
    spentByPlayer:{[playerId]:1+(spirit?1:0)}};
  s.events.push({type:'miracle',sourceId:playerId,targetId,cardId:miracle.id,mpCost:price,spiritId:spirit?.id??null});
  if(targetId===playerId)return finishAndDraw(s,draw);
  s.phase='defense';s.activePlayerId=targetId;
  return s;
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
  s.pending={originalAttackerId:playerId,sourceId:playerId,targetId,attack,element,attackKind:'weapon',armor:0,spentByPlayer:{[playerId]:cards.length}};
  s.events.push({type:'attack',sourceId:playerId,targetId,attack,element,spent:cards.length});
  if(targetId===playerId) return finishAndDraw(s,draw); // Self-hit cannot be defended.
  s.phase='defense';s.activePlayerId=targetId;
  return s;
}
export function defend(state,{playerId,handIndices=[],wallHandIndex=null,wallLearnedId=null},draw,rng=Math.random) {
  if(state.phase!=='defense'||!state.pending||state.pending.targetId!==playerId)throw new Error('Not your defense');
  const p=person(state,playerId);
  if(!Array.isArray(handIndices))throw new TypeError('Selection must be array');
  const indices=handIndices.length?normalizeIndexes(handIndices,p.hand):[];
  const cards=indices.map(i=>validCard(p.hand[i]));
  // Observed server constraint: the attribute-removal curtain is only
  // allowed as the FIRST card in the ordered defense selection.
  if(cards.some((card,i)=>card.kind==='defense_item' && card.effect==='strip_element' && i!==0))
    throw new Error('Rainbow curtain must be selected first');
  if(wallHandIndex !== null || wallLearnedId !== null) {
    if(wallHandIndex !== null && wallLearnedId !== null) throw new Error('Choose one wall source');
    // Wall may be paired with Rainbow Curtain; until further verification,
    // combinations with any other item are deliberately not supported.
    if(cards.some(c=>c.kind !== 'defense_item' || c.effect !== 'strip_element')) throw new Error('Wall can only be paired with attribute remover');
    const stripElement=cards.some(c=>c.effect==='strip_element');
    if(state.pending.attackKind!=='weapon' || (state.pending.element!=='none' && !stripElement))
      throw new Error('Wall only stops neutral non-miracle attacks');
    const wall=(wallHandIndex!==null ? p.hand[wallHandIndex] : p.learned?.find(x=>x.id===wallLearnedId));
    if(wallHandIndex!==null && (!Number.isInteger(wallHandIndex) || wallHandIndex<0 || wallHandIndex>=p.hand.length || handIndices.includes(wallHandIndex)))
      throw new RangeError('Invalid wall index');
    validCard(wall);
    if(wall.kind!=='miracle' || wall.role!=='stop' || wall.stopScope!=='neutral_weapon') throw new Error('Not a wall miracle');
    if(p.mp < wall.mpCost) throw new Error('Not enough MP');
    const s=clone(state),defender=person(s,playerId);
    defender.mp-=wall.mpCost;
    defender.learned=learnFrom(defender.learned,wall);
    defender.hand=take(defender.hand,wallHandIndex===null?indices:[...indices,wallHandIndex]);
    s.pending.spentByPlayer={...s.pending.spentByPlayer,[playerId]:(s.pending.spentByPlayer[playerId]??0)+cards.length+1};
    s.pending.stopped=true;
    s.events.push({type:'stop',playerId,source:'wall',mpCost:wall.mpCost});
    return finishAndDraw(s,draw);
  }
  const stopCards=cards.filter(c=>c.kind==='armor' && c.stopScope==='miracle');
  if(stopCards.length && state.pending.attackKind==='miracle') {
    // The special armor's guard value is irrelevant: it stops the miracle.
    if(cards.length!==1) throw new Error('Angel stop armor must be selected alone');
    const s=clone(state),defender=person(s,playerId);
    defender.hand=take(defender.hand,indices);
    s.pending.spentByPlayer={...s.pending.spentByPlayer,[playerId]:(s.pending.spentByPlayer[playerId]??0)+1};
    s.pending.stopped=true;
    s.events.push({type:'stop',playerId,source:'angel',cardId:stopCards[0].id});
    return finishAndDraw(s,draw);
  }
  const reactionCards=cards.filter(c=>c.reaction !== undefined || (c.kind==='defense_item' && c.effect==='reflect_any'));
  if(reactionCards.length) {
    // Reflection/deflection is an exclusive defense selection. Do not invent
    // priority rules for mixing with numeric shields or rainbow curtain.
    if(cards.length!==1) throw new Error('A redirect card must be selected alone');
    const card=reactionCards[0];
    if(card.kind==='weapon' && (card.reactionScope!=='neutral_weapon' || state.pending.element!=='none' || state.pending.attackKind!=='weapon'))
      throw new Error('Reaction cannot redirect this attack');
    const mode=card.kind==='defense_item' ? 'reflect' : card.reaction;
    const route=reflectTarget({source:state.pending.sourceId,target:playerId,actor:playerId,mode,
      living:state.players.filter(p=>p.hp>0).map(p=>p.id),rng});
    const s=clone(state);
    const defender=person(s,playerId);
    defender.hand=take(defender.hand,indices);
    s.pending.spentByPlayer={...s.pending.spentByPlayer,[playerId]:(s.pending.spentByPlayer[playerId]??0)+1};
    s.events.push({type:'redirect',mode,by:playerId,from:state.pending.sourceId,to:route.target,cardId:card.id});
    s.pending.sourceId=route.source;
    s.pending.targetId=route.target;
    s.pending.armor=0;
    s.pending.rainbowCurtain=false;
    if(route.target===playerId) return finishAndDraw(s,draw); // self-deflection cannot be defended
    s.phase='defense';s.activePlayerId=route.target;
    return s;
  }
  const stripElement=cards.some(c=>c.kind==='defense_item' && c.effect==='strip_element');
  if(cards.some(c=>c.kind!=='defense_item' && (!((c.kind==='armor') || (c.kind==='weapon' && Number.isInteger(c.guard))) || !canBlock(state.pending.element,c.element,{rainbowCurtain:stripElement})))) throw new Error('Illegal shield for attack element');
  const s=clone(state);
  const defender=person(s,playerId);
  defender.hand=take(defender.hand,indices);
  s.pending.armor=cards.reduce((sum,c)=>sum+(c.guard ?? 0),0);
  s.pending.rainbowCurtain=stripElement;
  s.pending.spentByPlayer={...s.pending.spentByPlayer,[playerId]:(s.pending.spentByPlayer[playerId]??0)+cards.length};
  s.events.push({type:'defense',playerId,spent:cards.length,armor:s.pending.armor,stripElement});
  return finishAndDraw(s,draw);
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

/**
 * Single <Aura> boost: the sum of the selected single-target WEAPONS,
 * including add-on weapons, is doubled; spent MP and learned miracles follow
 * the same minimal rules as other miracles.
 * Restrictions: no self-target, demon armor or stacked boosts until their
 * original-game effect order is experimentally confirmed.
 */
export function playAuraWeaponAttack(state,{
  playerId,targetId,handIndices,auraHandIndex=null,learnedAuraId=null
},draw) {
  expectTurn(state,playerId);
  const caster=person(state,playerId);
  if(targetId===playerId) throw new Error('Aura self-target combo not yet verified');
  if((auraHandIndex===null)===(learnedAuraId===null))
    throw new Error('Choose exactly one aura source');
  const indices=normalizeIndexes(handIndices,caster.hand);
  if(indices.some(i=>validCard(caster.hand[i]).kind!=='weapon'))
    throw new Error('Aura plus attack-bonus armor not verified');
  if(auraHandIndex!==null &&
     (!Number.isInteger(auraHandIndex)||auraHandIndex<0||
      auraHandIndex>=caster.hand.length || indices.includes(auraHandIndex)))
    throw new RangeError('Invalid aura hand index');
  const aura=validCard(auraHandIndex===null
    ? caster.learned?.find(c=>c.id===learnedAuraId)
    : caster.hand[auraHandIndex]);
  if(aura.kind!=='miracle'||aura.role!=='boost_weapon'||aura.boost!=='double_weapon')
    throw new Error('Not an aura miracle');
  if(caster.mp<aura.mpCost)throw new Error('Not enough MP');
  const attacked=playAttack(state,{playerId,targetId,handIndices:indices},draw);
  const s=clone(attacked);
  s.pending.attack*=2;
  const attacker=person(s,playerId);
  attacker.mp-=aura.mpCost;
  attacker.learned=learnFrom(attacker.learned,aura);
  if (auraHandIndex!==null) {
    const adjusted=auraHandIndex-indices.filter(i=>i<auraHandIndex).length;
    attacker.hand=take(attacker.hand,[adjusted]);
  }
  // First cast replaces the hand miracle with a card; a recast grows hand.
  // First-use miracle hand handling remains to be verified against live UI.
  s.pending.spentByPlayer={...s.pending.spentByPlayer,
    [playerId]:(s.pending.spentByPlayer[playerId]??0)+1};
  s.events.push({type:'weapon_boost',sourceId:playerId,
    miracleId:aura.id,mpCost:aura.mpCost,attackAfter:s.pending.attack});
  return s;
}

/**
 * Normal phase: discard selected cards and end turn WITHOUT replenishing them.
 * "Sacrifice" and its extra draw in end-of-world mode remain unimplemented.
 */
export function discardCards(state,{playerId,handIndices}) {
  expectTurn(state,playerId);
  const player=person(state,playerId);
  const indices=normalizeIndexes(handIndices,player.hand);
  const s=clone(state);
  const discarded=indices.map(i=>player.hand[i].id);
  person(s,playerId).hand=take(player.hand,indices);
  s.events.push({type:'discard',playerId,cardIds:discarded,spent:indices.length});
  s.activePlayerId=nextAlive(s.players,playerId);
  s.turnCount++;
  return s;
}
