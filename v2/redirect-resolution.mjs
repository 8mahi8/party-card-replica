/**
 * V2 G3 Part 2: source-backed basic redirect / deflect resolver.
 * Only weapons, including the reference-data neutral reflectors and the
 * "Super Mirror" item, are supported. Other card families remain gated.
 *
 * NOTE: This module is fixture-only, with deterministic non-secret RNG.
 * Do not publish its biased test draws as original game probabilities.
 */
import {reflectTarget} from '../src/rules.mjs';
import {createInstance, drawRandom32} from './foundation.mjs';
import {compileBasicWeaponAttack,resolveBasicFixture} from './basic-resolution.mjs';
import {isWallDefense,resolveWallFixture} from './wall-resolution.mjs';

function bad(message){throw new Error(message);}
function player(state,id){
 const found=state.players.find(p=>p.id===id);
 if(!found)bad('Unknown player');
 return found;
}
function copyState(state) {
 return {...state,players:state.players.map(p=>({...p,hand:p.hand.map(x=>({...x})),learned:[...p.learned]})),
   processedCommands:[...state.processedCommands],
   pending:{...state.pending,spentByPlayer:{...state.pending.spentByPlayer}}
 };
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
 const redirected=selected.filter(x=>x.def.effects.some(e=>e.type==='redirectAttack'&&e.when==='onDefense'));
 if(!redirected.length) {
   if(isWallDefense(state,catalog))
     return resolveWallFixture(state,catalog,{labOnly:true,fixtureDrawDefinitionId});
   if(p.defense.learnedDefinitionId!==undefined)
     bad('Unknown learned defensive miracle');
   return resolveBasicFixture(state,catalog,{labOnly:true,fixtureDrawDefinitionId});
 }
 if(selected.length!==1)bad('A redirect card must be selected alone');
 const reaction=redirected[0];
 const effect=reaction.def.effects.find(e=>e.type==='redirectAttack'&&e.when==='onDefense');
 if(!['reflect','deflect'].includes(effect.params.mode))
   bad('Unsupported redirect mode');
 const attackContext=p.attackContext??compileBasicWeaponAttack(state,catalog);
 if(attackContext.attackKind!=='weapon')bad('Only weapon attack redirect implemented');
 if(attackContext.hasModifiers)bad('Boosted weapon reactions require G3 redirect-cost support');
 if(effect.params.scope==='neutralWeapon' && attackContext.element!=='none')
   bad('Reaction cannot redirect this attack');
 if(!['any','neutralWeapon'].includes(effect.params.scope))
   bad('Unmapped redirect scope');
 const sourceId=p.sourceId??p.originalAttackerId;
 const living=state.players.filter(x=>x.hp>0).map(x=>x.id);
 if(!living.includes(sourceId)||!living.includes(p.targetId))
   bad('Redirect parties must be alive');
 let nextSeed=state.rngSeed;
 let rng=()=>0;
 if(effect.params.mode==='deflect'){
   if(deflectRng!==null) {
     if(typeof deflectRng!=='function')bad('Invalid deterministic deflect RNG');
     rng=deflectRng;
   } else {
     const outcome=drawRandom32(state.rngSeed);
     nextSeed=outcome.nextSeed;
     rng=()=>outcome.value;
   }
 }
 const route=reflectTarget({
   source:sourceId,target:p.targetId,actor:p.targetId,
   mode:effect.params.mode,living,rng
 });
 // We have fully validated the selection and RNG before mutating a copy.
 const result=copyState(state);
 result.rngSeed=nextSeed;
 const spent={...p.spentByPlayer};
 const events=[];
 if(!p.attackContext){
   const ids=new Set(attackContext.instanceIds);
   const actor=player(result,p.originalAttackerId);
   const before=actor.hand.length;
   actor.hand=actor.hand.filter(x=>!ids.has(x.instanceId));
   if(before-actor.hand.length!==ids.size)bad('Missing original attack card');
   spent[actor.id]=(spent[actor.id]??0)+ids.size;
   events.push({type:'spend',playerId:actor.id,count:ids.size});
 }
 const defender=player(result,p.targetId);
 defender.hand=defender.hand.filter(x=>x.instanceId!==reaction.instance.instanceId);
 spent[defender.id]=(spent[defender.id]??0)+1;
 events.push({type:'spend',playerId:defender.id,count:1});
 events.push({type:'redirect',mode:effect.params.mode,
   by:p.targetId,from:sourceId,to:route.target,
   cardId:reaction.def.id});
 result.revision++;
 result.pending={
   ...p,sourceId:route.source,targetId:route.target,
   attackContext,spentByPlayer:spent,defense:null
 };
 if(route.target===p.targetId) {
   // Self-deflection is an immediate hit, not an extra defense opportunity.
   result.phase='resolving';result.activePlayerId=null;
   const settled=resolveBasicFixture(result,catalog,{labOnly:true,fixtureDrawDefinitionId});
   return {...settled,events:[...events,...settled.events],redirected:true,immediate:true};
 }
 result.phase='defense';result.activePlayerId=route.target;
 return {state:result,plan:Object.freeze({type:'redirect',route,attackContext}),
   events,redirected:true,immediate:false};
}
