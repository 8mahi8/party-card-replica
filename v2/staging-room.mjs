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

const ID=/^[a-zA-Z0-9._:-]{1,80}$/;
const MAX_PLAYERS=9;
const MAX_HAND=18;
const ALLOWED_KEYS={
  playCards:new Set(['commandId','expectedRevision','actorId','type','targetId','orderedInstanceIds']),
  defend:new Set(['commandId','expectedRevision','actorId','type','orderedInstanceIds'])
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
    targetId:command.type==='playCards'?command.targetId:null,
    orderedInstanceIds:command.orderedInstanceIds
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
  if(command.type==='playCards') {
    if(state.phase!=='turn')throw new Error('Not an attacking turn');
    id(command.targetId,'target ID');
    const target=seat(state,command.targetId);
    if(target.hp<=0)throw new Error('Invalid G2 target');
    if(actor.hp<=0)throw new Error('Dead actor');
    const selected=takeLegalSelection(actor,command.orderedInstanceIds,catalog,'attack');
    pending={
      type:'attack',originalAttackerId:actor.id,targetId:target.id,
      attackInstanceIds:selected.map(x=>x.instanceId),defense:null
    };
    // A self-targeting attack skips defense, as in the old rules engine.
    // G3 will decide damage and possible self-defeat.
    phase=target.id===actor.id?'resolving':'defense';
    activePlayerId=target.id===actor.id?null:target.id;
  } else {
    if(state.phase!=='defense'||!state.pending||
       state.pending.targetId!==actor.id)throw new Error('Not the defending seat');
    const selected=takeLegalSelection(actor,command.orderedInstanceIds,catalog,'defense',{allowEmpty:true});
    pending={...state.pending,defense:{playerId:actor.id,instanceIds:selected.map(x=>x.instanceId)}};
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
      stage:state.pending.defense?'awaitingResolution':'awaitingDefense'
    }:null
  };
}
