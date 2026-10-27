/**
 * V2 G3 integration layer: ONE lab command entrypoint for staged attacks.
 *
 * Caller must be the room's trusted owner: authorizedSeatId comes from the
 * transport's seat authentication, never from command.actorId alone.
 * Every failure throws before returning state; the caller must persist only
 * the returned state, using an external transaction/CAS in live multiplayer.
 *
 * This module is LAB-ONLY. It uses an audited-incomplete fixture card draw
 * and must not be used for production card probability or online play.
 */
import {applyStagingCommand} from './staging-room.mjs';
import {resolveRedirectFixture} from './redirect-resolution.mjs';
import {resolveSoloMiracleFixture} from './miracle-resolution.mjs';
import {compileOrderedWeaponAttack} from './ordered-attack.mjs';

function fail(message){throw new Error(message);}
function attackFamily(state,catalog) {
  const pending=state?.pending;
  if(!pending||pending.type!=='attack')fail('No attack queued');
  if(pending.attackContext) {
    if(pending.attackContext.attackKind!=='weapon')
      fail('Unknown compiled attack family');
    return 'weapon';
  }
  if(pending.attackLearnedDefinitionId!==undefined) {
    const actor=state.players.find(p=>p.id===pending.originalAttackerId);
    const id=pending.attackLearnedDefinitionId;
    if(!actor?.learned.includes(id)||catalog.get(id)?.family!=='miracle')
      fail('Attack miracle is not learned');
    return 'miracle';
  }
  const attackSequence=pending.attackSequence;
  if(attackSequence!==undefined) {
    if(!Array.isArray(attackSequence)||!attackSequence.length)
      fail('Invalid attack sequence');
    const first=attackSequence[0];
    if(!first?.instanceId||Object.keys(first).length!==1)
      fail('Unsupported sequence opening');
  }
  const firstId=attackSequence?.[0].instanceId??pending.attackInstanceIds?.[0];
  if(typeof firstId!=='string')fail('No playable opening card');
  const caster=state.players.find(p=>p.id===pending.originalAttackerId);
  const instance=caster?.hand.find(c=>c.instanceId===firstId);
  const def=catalog.get(instance?.definitionId);
  if(!def)fail('Opening card is missing');
  if(!['weapon','miracle'].includes(def.family))
    fail('Unknown opening card family');
  return def.family;
}
/**
 * Resolve a complete defense response OR a direct self-targeting attack.
 * If the defender redirects, the output returns to the "defense" phase.
 */
export function resolveStagedFixture(state,catalog,{
  labOnly=false,fixtureDrawDefinitionId,deflectRng=null
}={}){
  if(labOnly!==true)fail('Only available in lab fixture mode');
  if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
    fail('Unknown fixture draw card');
  if(state?.schemaVersion!==2||state.phase!=='resolving')
    fail('No attack waiting for resolution');
  const family=attackFamily(state,catalog);
  if(family==='miracle')
    return resolveSoloMiracleFixture(state,catalog,{labOnly:true,fixtureDrawDefinitionId});
  return resolveRedirectFixture(state,catalog,{
    labOnly:true,fixtureDrawDefinitionId,deflectRng
  });
}
/**
 * Turn the authenticated input into a new state, resolving automatically as
 * far as possible. One call can produce a pending defense, a redirect to a new
 * defender, a completed turn, or finished match.
 *
 * IMPORTANT: events are internal audit/debug data only. A real transport must
 * use viewStagingRoom(state, authenticatedSeatId), not broadcast these events
 * or the full authoritative state.
 */
export function submitAndResolveFixture(state,command,catalog,{
  authorizedSeatId,labOnly=false,fixtureDrawDefinitionId,deflectRng=null
}={}){
  if(labOnly!==true)fail('Only available in lab fixture mode');
  if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
    fail('Unknown fixture draw card');
  const stage=applyStagingCommand(state,command,catalog,{authorizedSeatId});
  if(stage.duplicate)
    return {state:stage.state,applied:false,duplicate:true,autoResolved:false,
      events:[],plan:null};
  // Attack selection must be validated BEFORE asking another seat to defend.
  // Otherwise a bad weapon+miracle combination can strand both players in
  // a pending-defense state with no way to correct the attacking selection.
  if(stage.state.phase==='defense' &&
    ['playCards','playSequence'].includes(command.type) &&
    attackFamily(stage.state,catalog)==='weapon')
    compileOrderedWeaponAttack(stage.state,catalog);
  if(stage.state.phase!=='resolving')
    return {state:stage.state,applied:true,duplicate:false,autoResolved:false,
      events:[],plan:null};
  const resolved=resolveStagedFixture(stage.state,catalog,{
    labOnly:true,fixtureDrawDefinitionId,deflectRng
  });
  return {...resolved,applied:true,duplicate:false,autoResolved:true};
}
