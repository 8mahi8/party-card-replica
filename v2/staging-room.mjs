/**
 * V2 G2: authoritatively *stage* a combat interaction.
 *
 * Rules in this module are only structural: a card instance belongs to the
 * sender, selections have preserved order, the proper seat acts in each phase,
 * and room commands are applied at most once. There is intentionally NO
 * damage, MP consumption, card removal, draw, or rule-dependent resolution.
 * G3 will compile and resolve pending intents.
 *
 * Only a trusted transport should supply the authorizedSeatId context. A
 * client-controlled actorId alone never authenticates a sender.
 */
import {createInstance, selectInstances} from './foundation.mjs';
import {previewBuyOfferFixture} from './trade-buy.mjs';

const ID=/^[a-zA-Z0-9._:-]{1,80}$/;
const MAX_PLAYERS=9;
const MAX_HAND=18;
const ALLOWED_KEYS={
  pray:new Set(['commandId','expectedRevision','actorId','type']),
  discard:new Set(['commandId','expectedRevision','actorId','type','orderedInstanceIds']),
  declareSale:new Set(['commandId','expectedRevision','actorId','type','targetId','saleInstanceId','soldInstanceId']),
  respondSale:new Set(['commandId','expectedRevision','actorId','type','mirrorInstanceId']),
  declareBuy:new Set(['commandId','expectedRevision','actorId','type','targetId','buyInstanceId']),
  respondBuy:new Set(['commandId','expectedRevision','actorId','type','mirrorInstanceId']),
  decideBuy:new Set(['commandId','expectedRevision','actorId','type','accept']),
  playCards:new Set(['commandId','expectedRevision','actorId','type','targetId','orderedInstanceIds']),
  playSequence:new Set(['commandId','expectedRevision','actorId','type','targetId','orderedPlays']),
  castLearned:new Set(['commandId','expectedRevision','actorId','type','targetId','learnedDefinitionId']),
  defend:new Set(['commandId','expectedRevision','actorId','type','orderedInstanceIds','learnedDefinitionId']),
  defendSequence:new Set(['commandId','expectedRevision','actorId','type','orderedPlays'])
};

function id(value,label) {
  if(typeof value!=='string'||!ID.test(value))throw new Error('Invalid '+label);
  return value;
}
function finiteInt(value,label,min=0) {
  if(!Number.isSafeInteger(value)||value<min)throw new Error('Invalid '+label);
  return value;
}
function catalogReady(catalog) {
  if(!(catalog instanceof Map)||catalog.size===0)throw new Error('Card catalog Map required');
}
function seat(state,seatId) {
  const p=state.players.find(x=>x.id===seatId);
  if(!p)throw new Error('Unknown seat');
  return p;
}
function fingerprint(command) {
  return JSON.stringify({
    actorId:command.actorId,
    type:command.type,
    expectedRevision:command.expectedRevision,
    targetId:['playCards','playSequence','castLearned','declareSale','declareBuy'].includes(command.type)?command.targetId:null,
    orderedPlays:command.orderedPlays??null,
    orderedInstanceIds:command.orderedInstanceIds??null,
    learnedDefinitionId:command.learnedDefinitionId??null,
    buyInstanceId:command.buyInstanceId??null,
    accept:command.accept??null,
    saleInstanceId:command.saleInstanceId??null,
    soldInstanceId:command.soldInstanceId??null,
    mirrorInstanceId:command.mirrorInstanceId??null
  });
}
function takeLegalSelection(player,instanceIds,catalog,mode,{allowEmpty=false}={}) {
  if(!Array.isArray(instanceIds)||(!allowEmpty&&!instanceIds.length)||
     instanceIds.some(x=>typeof x!=='string'||!ID.test(x))) throw new Error('Invalid ordered card selection');
  const selected=instanceIds.length?selectInstances(player.hand,instanceIds):[];
  const defs=selected.map(c=>{
    const def=catalog.get(c.definitionId);
    if(!def)throw new Error('Missing card definition');
    return def;
  });
  if(mode==='attack') {
    const mainCount=defs.filter(c=>c.playModes.includes('mainAttack')).length;
    if(mainCount>1 || !defs.every(c=>c.playModes.some(m=>['mainAttack','addAttack','cast','support'].includes(m))))
      throw new Error('Not a structural attack selection');
    const first=defs[0];
    if(first.family!=='weapon' &&
       !(first.family==='miracle' && first.playModes.includes('cast') && first.stats.attack>0))
      throw new Error('Attack must start with a weapon or offensive miracle');
    // Exact later combination legality is compiled in G3, not guessed here.
  } else if(mode==='defense') {
    if(!defs.every(c=>c.playModes.includes('defend')||c.playModes.includes('support')) ||
       (defs.length>0 && !defs[0].playModes.includes('defend')))
      throw new Error('Not a defensive card');
    const rainbowIndex=defs.findIndex(c=>c.effects.some(e=>e.type==='stripElement'));
    if(rainbowIndex>0)throw new Error('Attribute remover must be first');
    // Exact defense combinations, MP costs, reflection and stop priority: G3.
  }
  return selected;
}
/** Strictly preserve the sender's interleaved hand/learned order. */
function takeOrderedPlays(actor,plays,catalog){
  if(!Array.isArray(plays)||plays.length===0||plays.length>36)
    throw new Error('Invalid ordered play sequence');
  const handIds=new Set(),learnedIds=new Set();
  return plays.map((step,index)=>{
    if(!step||typeof step!=='object'||Array.isArray(step))
      throw new Error('Malformed sequence step');
    const keys=Object.keys(step);
    if(keys.length!==1)throw new Error('Sequence step must name one source');
    if(keys[0]==='instanceId'){
      const instanceId=id(step.instanceId,'instance ID');
      if(handIds.has(instanceId))throw new Error('Repeated card instance');
      handIds.add(instanceId);
      const instance=actor.hand.find(c=>c.instanceId===instanceId);
      if(!instance)throw new Error('Selected card not held');
      const def=catalog.get(instance.definitionId);
      if(!def||!def.playModes.some(mode=>['mainAttack','addAttack','cast','support'].includes(mode)))
        throw new Error('Not a structural attack selection');
      if(index===0 && def.family!=='weapon' &&
         !(def.family==='miracle' && def.playModes.includes('cast') && def.stats.attack>0))
        throw new Error('Sequence must begin with weapon or offensive miracle');
      return {instanceId};
    }
    if(keys[0]==='learnedDefinitionId'){
      const defId=id(step.learnedDefinitionId,'learned definition ID');
      if(learnedIds.has(defId))throw new Error('Repeated learned miracle in one sequence not verified');
      learnedIds.add(defId);
      const def=catalog.get(defId);
      if(!actor.learned.includes(defId)||def?.family!=='miracle'||!def.playModes.includes('cast'))
        throw new Error('Selected miracle not learned');
      if(index===0)throw new Error('Sequence must begin with weapon');
      return {learnedDefinitionId:defId};
    }
    throw new Error('Unknown sequence step source');
  });
}
/** Preserve exact defensive order (including a learned miracle before a hand item). */
function takeOrderedDefense(actor,plays,catalog){
  if(!Array.isArray(plays)||!plays.length||plays.length>36)
    throw new Error('Invalid ordered defense sequence');
  const physical=new Set(),learnedSet=new Set();
  return plays.map((step,index)=>{
    if(!step||typeof step!=='object'||Array.isArray(step)||Object.keys(step).length!==1)
      throw new Error('Malformed defense sequence step');
    if(Object.hasOwn(step,'instanceId')){
      const instanceId=id(step.instanceId,'instance ID');
      if(physical.has(instanceId))throw new Error('Repeated defense card instance');
      physical.add(instanceId);
      const card=actor.hand.find(c=>c.instanceId===instanceId);
      if(!card)throw new Error('Selected defense card not held');
      const def=catalog.get(card.definitionId);
      if(!def||( !def.playModes.includes('defend')&&!def.playModes.includes('support')))
        throw new Error('Not a defensive card');
      if(index===0&&!def.playModes.includes('defend'))
        throw new Error('Defensive sequence must start with a defense');
      if(def.effects.some(e=>e.type==='stripElement')&&index!==0)
        throw new Error('Attribute remover must be first');
      return {instanceId};
    }
    if(Object.hasOwn(step,'learnedDefinitionId')){
      const definitionId=id(step.learnedDefinitionId,'learned definition ID');
      if(learnedSet.size)throw new Error('Only one learned defensive miracle per sequence');
      learnedSet.add(definitionId);
      const def=catalog.get(definitionId);
      if(!actor.learned.includes(definitionId)||def?.family!=='miracle'||
        !def.playModes.includes('defend'))
        throw new Error('Defensive miracle not learned');
      return {learnedDefinitionId:definitionId};
    }
    throw new Error('Unknown defense sequence step source');
  });
}
/**
 * Seed known opening hands (in tests or local lab only). A live game must use
 * the audited deck + authoritative draw, not these caller-specified hands.
 */
export function createStagingRoom({seats,firstSeatId,rulesetId='lab-v2',rngSeed=1},catalog) {
  catalogReady(catalog);
  if(!Array.isArray(seats)||seats.length<2||seats.length>MAX_PLAYERS)
    throw new Error('Need 2-9 seats');
  const ids=seats.map(p=>id(p.id,'seat ID'));
  if(new Set(ids).size!==ids.length)throw new Error('Duplicate seat ID');
  if(!ids.includes(firstSeatId))throw new Error('Invalid first seat');
  id(rulesetId,'ruleset ID');
  finiteInt(rngSeed,'rng seed',1);
  if(rngSeed>0xffffffff)throw new Error('Invalid rng seed');
  let serial=1;
  const players=seats.map(p=>{
    if(!Array.isArray(p.handDefinitionIds)||p.handDefinitionIds.length>MAX_HAND)
      throw new Error('Invalid starting hand');
    const hand=p.handDefinitionIds.map(definitionId=>createInstance(definitionId,serial++,catalog));
    return {id:p.id,hp:40,mp:10,money:20,hand,learned:[]};
  });
  return {
    schemaVersion:2,rulesetId,revision:0,phase:'turn',
    activePlayerId:firstSeatId,players,nextInstanceSerial:serial,
    rngSeed,pending:null,processedCommands:[],turnCount:0,winnerId:null
  };
}
/**
 * A same-ID retry with precisely the same payload is an idempotent no-op.
 * A conflicting retry is rejected. All processed IDs persist until this
 * room is destroyed, avoiding stale retries becoming fresh actions.
 */
export function applyStagingCommand(state,command,catalog,{authorizedSeatId}={}) {
  catalogReady(catalog);
  if(!state || state.schemaVersion!==2 || !Array.isArray(state.players))
    throw new Error('Invalid V2 room state');
  if(!command || typeof command!=='object' || Array.isArray(command))
    throw new Error('Invalid command');
  if(!ALLOWED_KEYS[command.type])throw new Error('Unsupported G2 command');
  const allowed=ALLOWED_KEYS[command.type];
  if(Object.keys(command).some(k=>!allowed.has(k)))throw new Error('Unexpected command property');
  id(command.commandId,'command ID');
  id(command.actorId,'actor ID');
  if(typeof authorizedSeatId!=='string'||authorizedSeatId!==command.actorId)
    throw new Error('Sender seat is not authenticated');
  const actor=seat(state,command.actorId);
  if(!Array.isArray(state.processedCommands))throw new Error('Invalid command ledger');
  const match=state.processedCommands.find(x=>x.commandId===command.commandId);
  const signature=fingerprint(command);
  if(match) {
    if(match.signature!==signature)throw new Error('Conflicting commandId reuse');
    return {state,applied:false,duplicate:true};
  }
  finiteInt(command.expectedRevision,'expected revision');
  if(command.expectedRevision!==state.revision)throw new Error('Stale room revision');
  if(state.phase==='resolving')throw new Error('Awaiting G3 effect resolution');
  if(state.activePlayerId!==actor.id)throw new Error('Not the active seat');
  let pending;
  let phase;
  let activePlayerId;
  if(command.type==='declareBuy'){
    if(state.phase!=='turn'||actor.hp<=0)
      throw new Error('Not a living trade turn');
    id(command.targetId,'target ID');
    const target=seat(state,command.targetId);
    if(target.id===actor.id||target.hp<=0)
      throw new Error('Invalid Buy target');
    if(!target.hand.length)
      throw new Error('Buy from empty hand needs original verification');
    id(command.buyInstanceId,'Buy card ID');
    const card=actor.hand.find(c=>c.instanceId===command.buyInstanceId);
    const def=catalog.get(card?.definitionId);
    if(!card||def?.family!=='trade'||
       !def.effects.some(e=>e.when==='onDeclare'&&
         e.type==='requestBuy'&&e.params.kind==='buy'))
      throw new Error('Selected card cannot declare Buy');
    // Do not reveal or sample the target's card before its chance to respond.
    pending={type:'buy',originalAttackerId:actor.id,targetId:target.id,
      buyInstanceId:card.instanceId,defense:null,offer:null,accept:null};
    phase='buyDefense';activePlayerId=target.id;
  }else if(command.type==='respondBuy'){
    if(state.phase!=='buyDefense'||state.pending?.type!=='buy'||
       state.pending.targetId!==actor.id||actor.hp<=0)
      throw new Error('Not the Buy defending seat');
    if(command.mirrorInstanceId!==undefined){
      id(command.mirrorInstanceId,'Mirror instance ID');
      const mirror=actor.hand.find(c=>c.instanceId===command.mirrorInstanceId);
      const def=catalog.get(mirror?.definitionId);
      if(!mirror||!def?.effects.some(e=>e.when==='onDefense'&&
         e.type==='redirectAttack'&&e.params.mode==='reflect'&&
         e.params.scope==='any'))
        throw new Error('Only Super Mirror may reflect Buy');
      throw new Error('Buy mirror response requires original verification');
    }
    const p=state.pending;
    const asTurn={...state,phase:'turn',
      activePlayerId:p.originalAttackerId,pending:null};
    const offer=previewBuyOfferFixture(asTurn,catalog,{
      buyerId:p.originalAttackerId,targetId:p.targetId
    });
    pending={...p,defense:{playerId:actor.id,mirrorInstanceId:null},
      offer:{itemInstanceId:offer.itemInstanceId,
        itemDefinitionId:offer.itemDefinitionId,price:offer.price,
        nextSeed:offer.nextSeed}};
    phase='buyDecision';activePlayerId=p.originalAttackerId;
  }else if(command.type==='decideBuy'){
    if(state.phase!=='buyDecision'||state.pending?.type!=='buy'||
       state.pending.originalAttackerId!==actor.id||
       state.pending.defense?.mirrorInstanceId!==null||
       state.pending.defense?.playerId!==state.pending.targetId||
       !state.pending.offer)
      throw new Error('Not the Buy decision seat');
    if(typeof command.accept!=='boolean')
      throw new Error('Buy decision must be explicit');
    pending={...state.pending,accept:command.accept};
    phase='resolving';activePlayerId=null;
  }else if(command.type==='declareSale'){
    if(state.phase!=='turn'||actor.hp<=0)throw new Error('Not a living trade turn');
    id(command.targetId,'target ID');
    const target=seat(state,command.targetId);
    if(target.id===actor.id||target.hp<=0)throw new Error('Invalid sale target');
    id(command.saleInstanceId,'Sell card ID');
    id(command.soldInstanceId,'offered item ID');
    if(command.saleInstanceId===command.soldInstanceId)
      throw new Error('Sell card and offered item must differ');
    const trade=actor.hand.find(c=>c.instanceId===command.saleInstanceId);
    const offer=actor.hand.find(c=>c.instanceId===command.soldInstanceId);
    if(!trade||!offer)throw new Error('Sale card not held');
    const tradeDef=catalog.get(trade.definitionId),offeredDef=catalog.get(offer.definitionId);
    if(tradeDef?.family!=='trade'||!tradeDef.effects.some(e=>
       e.when==='onDeclare'&&e.type==='forceSale'&&e.params.kind==='sell'))
      throw new Error('Selected card cannot declare Sell');
    if(!offeredDef)
      throw new Error('Unknown offered card definition');
    pending={type:'sale',originalAttackerId:actor.id,targetId:target.id,
      saleInstanceId:trade.instanceId,soldInstanceId:offer.instanceId,
      offeredDefinitionId:offer.definitionId,price:offeredDef.stats.price,
      defense:null};
    phase='tradeDefense';activePlayerId=target.id;
  }else if(command.type==='respondSale'){
    if(state.phase!=='tradeDefense'||state.pending?.type!=='sale'||
       state.pending.targetId!==actor.id||actor.hp<=0)
      throw new Error('Not the trade defending seat');
    let mirrorInstanceId=null;
    if(command.mirrorInstanceId!==undefined){
      id(command.mirrorInstanceId,'Mirror instance ID');
      const mirror=actor.hand.find(c=>c.instanceId===command.mirrorInstanceId);
      const def=catalog.get(mirror?.definitionId);
      if(!mirror||!def?.effects.some(e=>e.when==='onDefense'&&
          e.type==='redirectAttack'&&e.params.mode==='reflect'&&e.params.scope==='any'))
        throw new Error('Only Super Mirror can reflect this trade');
      mirrorInstanceId=mirror.instanceId;
    }
    pending={...state.pending,defense:{playerId:actor.id,mirrorInstanceId}};
    phase='resolving';activePlayerId=null;
  }else if(command.type==='discard'){
    if(state.phase!=='turn'||actor.hp<=0)
      throw new Error('Cannot discard outside a living turn');
    // Discard uses PHYSICAL card instances; learned spells cannot be thrown.
    // Rare return-with-damage artifacts will require a separate researched
    // resolution, never silently destroy those cards as ordinary discard.
    const cards=selectInstances(actor.hand,command.orderedInstanceIds);
    if(cards.length>MAX_HAND)throw new Error('Too many discarded cards');
    for(const card of cards){
      const def=catalog.get(card.definitionId);
      if(def?.discardPolicy==='forbidden')
        throw new Error('This card cannot be discarded');
      if(!def||def.discardPolicy!=='ordinary')
        throw new Error('Special discard effect is not yet implemented');
    }
    pending={type:'discard',originalAttackerId:actor.id,
      discardInstanceIds:cards.map(x=>x.instanceId)};
    phase='resolving';activePlayerId=null;
  } else if(command.type==='pray'){
    if(state.phase!=='turn'||actor.hp<=0)throw new Error('Cannot pray outside a living turn');
    // The source game permits prayer only when NO physical weapon is held.
    // This includes +ATK addon weapons; an offensive miracle is not a weapon.
    if(actor.hand.some(card=>catalog.get(card.definitionId)?.family==='weapon'))
      throw new Error('Cannot pray while holding a weapon');
    pending={type:'pray',originalAttackerId:actor.id};
    phase='resolving';activePlayerId=null;
  } else if(['playCards','playSequence','castLearned'].includes(command.type)) {
    if(state.phase!=='turn')throw new Error('Not an attacking turn');
    id(command.targetId,'target ID');
    const target=seat(state,command.targetId);
    if(target.hp<=0)throw new Error('Invalid G2 target');
    if(actor.hp<=0)throw new Error('Dead actor');
    let selected=[],learned=null;
    if(command.type==='castLearned'){
      id(command.learnedDefinitionId,'learned definition ID');
      learned=catalog.get(command.learnedDefinitionId);
      if(!actor.learned.includes(command.learnedDefinitionId)||
        learned?.family!=='miracle'||!learned.playModes.includes('cast')||
        learned.stats.attack<=0)
        throw new Error('Offensive miracle not learned');
    } else if(command.type==='playCards'){
      selected=takeLegalSelection(actor,command.orderedInstanceIds,catalog,'attack');
    }
    const sequence=command.type==='playSequence'
      ?takeOrderedPlays(actor,command.orderedPlays,catalog):null;
    pending={
      type:'attack',originalAttackerId:actor.id,targetId:target.id,
      attackInstanceIds:sequence?sequence.filter(x=>x.instanceId).map(x=>x.instanceId)
        :selected.map(x=>x.instanceId),
      ...(sequence?{attackSequence:sequence}:{}),
      ...(learned?{attackLearnedDefinitionId:learned.id}:{}),defense:null
    };
    // A self-targeting attack skips defense, as in the old rules engine.
    // G3 will decide damage and possible self-defeat.
    phase=target.id===actor.id?'resolving':'defense';
    activePlayerId=target.id===actor.id?null:target.id;
  } else if(command.type==='defend'||command.type==='defendSequence') {
    if(state.phase!=='defense'||!state.pending||
       state.pending.targetId!==actor.id)throw new Error('Not the defending seat');
    const sequence=command.type==='defendSequence'
      ?takeOrderedDefense(actor,command.orderedPlays,catalog):null;
    const selected=sequence?[]:takeLegalSelection(actor,command.orderedInstanceIds,catalog,'defense',{allowEmpty:true});
    let learned=null;
    const learnedId=sequence?.find(x=>x.learnedDefinitionId)?.learnedDefinitionId
      ??command.learnedDefinitionId;
    if(learnedId!==undefined){
      id(learnedId,'learned definition ID');
      learned=catalog.get(learnedId);
      if(!actor.learned.includes(learnedId)||
        learned?.family!=='miracle'||!learned.playModes.includes('defend'))
        throw new Error('Defensive miracle not learned');
    }
    pending={...state.pending,defense:{playerId:actor.id,
      instanceIds:sequence?sequence.filter(x=>x.instanceId).map(x=>x.instanceId)
        :selected.map(x=>x.instanceId),
      ...(sequence?{sequence}:{}),
      ...(learned?{learnedDefinitionId:learned.id}:{})}};
    phase='resolving';activePlayerId=null;
  }
  const next={
    ...state,revision:state.revision+1,phase,activePlayerId,pending,
    processedCommands:[...state.processedCommands,{commandId:command.commandId,signature}]
  };
  return {state:next,applied:true,duplicate:false};
}
/**
 * Only a trustworthy server/host may call this for the authenticated seat.
 * Never transmit internal state or processed command payloads to opponents.
 */
export function viewStagingRoom(state,viewerId) {
  const p=seat(state,viewerId);
  return {
    schemaVersion:2,rulesetId:state.rulesetId,revision:state.revision,
    phase:state.phase,activePlayerId:state.activePlayerId,
    players:state.players.map(q=>({
      id:q.id,hp:q.hp,mp:q.mp,money:q.money,handCount:q.hand.length,
      ...(q.id===p.id?{hand:q.hand.map(x=>({instanceId:x.instanceId,definitionId:x.definitionId})),learned:[...q.learned]}:{})
    })),
    pending:state.pending?{
      type:state.pending.type,sourceId:state.pending.sourceId??state.pending.originalAttackerId,
      targetId:state.pending.targetId,
      stage:state.pending.type==='buy'?
        (state.phase==='buyDefense'?'awaitingTradeResponse':
         state.phase==='buyDecision'?'awaitingPurchaseDecision':'awaitingResolution'):
        state.pending.type==='sale'?
        (state.pending.defense?'awaitingResolution':'awaitingTradeResponse'):
        (state.pending.defense?'awaitingResolution':'awaitingDefense'),
      ...(state.pending.type==='buy'&&state.phase==='buyDecision'&&
        state.pending.originalAttackerId===p.id&&state.pending.offer?
        {offer:{definitionId:state.pending.offer.itemDefinitionId,
          price:state.pending.offer.price}}:{}),
      ...(state.pending.type==='sale'?{offer:{
        definitionId:state.pending.offeredDefinitionId,price:state.pending.price
      }}:{})
    }:null
  };
}
