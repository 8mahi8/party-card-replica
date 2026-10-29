/**
 * V2 G3 Part 2: source-backed basic redirect / deflect resolver.
 * Only weapons, including the reference-data neutral reflectors and the
 * "Super Mirror" item, are supported. Other card families remain gated.
 *
 * NOTE: This module is fixture-only, with deterministic non-secret RNG.
 * Do not publish its biased test draws as original game probabilities.
 */
import {planRedirectRoute} from './redirect-route.mjs';
import {compileBasicWeaponAttack,resolveBasicFixture} from './basic-resolution.mjs';
import {isWallDefense,resolveWallFixture} from './wall-resolution.mjs';
import {queuedAttackCosts} from './ordered-attack.mjs';
import {runEffectQueueFixture} from './effect-runner.mjs';

function bad(message){throw new Error(message);}
function player(state,id){
 const found=state.players.find(p=>p.id===id);
 if(!found)bad('Unknown player');
 return found;
}
function locateDefense(state,catalog) {
 if(!state || state.schemaVersion!==2 || state.phase!=='resolving' || !state.pending)
   bad('No staged defense');
 const p=state.pending;
 if(!p.defense || p.defense.playerId!==p.targetId)
   bad('Defense response missing');
 const receiver=player(state,p.targetId);
 const indices=p.defense.instanceIds;
 if(!Array.isArray(indices) || new Set(indices).size!==indices.length)
   bad('Invalid defense instance list');
 return indices.map(id=>{
   const instance=receiver.hand.find(c=>c.instanceId===id);
   if(!instance)bad('Selected defense card was not held');
   const def=catalog.get(instance.definitionId);
   if(!def)bad('Missing defense definition');
   return {instance,def};
 });
}
/**
 * Advances a redirect or applies a final defense. Attack hand cards are spent
 * on the first redirect, while each redirect card is consumed at its hop.
 * Refill of all surviving participants occurs once the final hit resolves.
 */
export function resolveRedirectFixture(state,catalog,{
 labOnly=false,fixtureDrawDefinitionId,deflectRng=null
}={}) {
 if(labOnly!==true)bad('Only available in lab fixture mode');
 if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
   bad('Unknown fixture draw card');
 if(state?.phase!=='resolving'||!state.pending?.type||
    state.pending.type!=='attack')bad('Not a pending attack');
 const p=state.pending;
 if((p.sourceId??p.originalAttackerId)===p.targetId && p.defense===null) {
   // The prior deflection landed on its caster. It cannot defend itself.
   return resolveBasicFixture(state,catalog,{labOnly:true,fixtureDrawDefinitionId});
 }
 const selected=locateDefense(state,catalog);
 const redirected=selected.filter(x=>x.def.effects.some(e=>e.type==='redirectAttack'&&e.when==='onDefense'&&
   e.params.scope!=='miracle'));
 if(!redirected.length) {
   if(isWallDefense(state,catalog)){
     const attack=p.attackContext??compileBasicWeaponAttack(state,catalog);
     if((attack.hitCount??1)>1)
       bad('Wall versus repeated strikes needs original stop timing verification');
     return resolveWallFixture(state,catalog,{labOnly:true,fixtureDrawDefinitionId});
   }
   if(p.defense.learnedDefinitionId!==undefined)
     bad('Unknown learned defensive miracle');
   return resolveBasicFixture(state,catalog,{labOnly:true,fixtureDrawDefinitionId});
 }
 if(p.defense.learnedDefinitionId!==undefined)
   bad('Redirect may not mix learned defensive miracles');
 if(selected.length!==1)bad('A redirect card must be selected alone');
 const reaction=redirected[0];
 const effect=reaction.def.effects.find(e=>e.type==='redirectAttack'&&e.when==='onDefense');
 if(!['reflect','deflect'].includes(effect.params.mode))
   bad('Unsupported redirect mode');
 const attackContext=p.attackContext??compileBasicWeaponAttack(state,catalog);
 if(attackContext.attackKind!=='weapon')bad('Only weapon attack redirect implemented');
 // Combined weapon attacks pay costs exactly once on the first redirect.
 if(effect.params.scope==='neutralWeapon' && attackContext.element!=='none')
   bad('Reaction cannot redirect this attack');
 if(!['any','neutralWeapon'].includes(effect.params.scope))
   bad('Unmapped redirect scope');
 const sourceId=p.sourceId??p.originalAttackerId;
 const {route,nextSeed,immediate}=planRedirectRoute(state,{
   sourceId,targetId:p.targetId,mode:effect.params.mode,deflectRng
 });
 // Reuse the central queue for every cost, including learned spell draws.
 // In the paused mode the runner retains the pending attack and its refill
 // credits, without drawing any cards or advancing a turn.
 const initialCosts=p.attackContext?[]:queuedAttackCosts(attackContext,p.originalAttackerId);
 const paused=runEffectQueueFixture(state,catalog,[
   ...initialCosts,
   {type:'spend',playerId:p.targetId,instanceIds:[reaction.instance.instanceId]}
 ],{labOnly:true,fixtureDrawDefinitionId,interruptionOnly:true});
 const result=paused.state;
 result.rngSeed=nextSeed;
 const events=[...paused.events,{
   type:'redirect',mode:effect.params.mode,
   by:p.targetId,from:sourceId,to:route.target,
   cardId:reaction.def.id
 }];
 result.pending={
   ...result.pending,sourceId:route.source,targetId:route.target,
   attackContext,defense:null,
   ...((attackContext.hitCount??1)>1&&(p.strikeIndex??0)===0?
     {repeatTargetId:p.repeatTargetId??p.targetId}:{})
 };
 if(immediate) {
   // Self-deflection is an immediate hit, not an extra defense opportunity.
   result.phase='resolving';result.activePlayerId=null;
   const settled=resolveBasicFixture(result,catalog,{labOnly:true,fixtureDrawDefinitionId});
   return {...settled,events:[...events,...settled.events],redirected:true,immediate:true};
 }
 result.phase='defense';result.activePlayerId=route.target;
 return {state:result,plan:Object.freeze({type:'redirect',route,attackContext}),
   events,redirected:true,immediate:false};
}
