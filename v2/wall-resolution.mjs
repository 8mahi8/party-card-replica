/**
 * G3 weapon-stop resolver: the defensive miracle Wall stops any neutral
 * non-miracle weapon attack. The preceding Rainbow Curtain may strip an
 * elemental attack. Both first-use (in hand) and learned casts are supported.
 * Everything else is deliberately rejected until source-backed resolution.
 */
import {compileBasicWeaponAttack} from './basic-resolution.mjs';
import {queuedAttackCosts} from './ordered-attack.mjs';
import {runEffectQueueFixture} from './effect-runner.mjs';

function bad(msg){throw new Error(msg);}
function find(state,id) {
 const p=state.players.find(p=>p.id===id);
 if(!p)bad('Unknown wall actor');
 return p;
}
const effect=(type,other={})=>Object.freeze({type,...other});
export function isWallDefense(state,catalog) {
 const p=state?.pending;
 if(!p?.defense)return false;
 if(p.defense.learnedDefinitionId!==undefined)return p.defense.learnedDefinitionId==='m001';
 const player=state.players.find(x=>x.id===p.targetId);
 return p.defense.instanceIds.some(id=>{
   const instance=player?.hand.find(c=>c.instanceId===id);
   return !!instance&&catalog.get(instance.definitionId)?.effects.some(e=>e.type==='stopAttack'&&e.params.scope==='neutralWeapon');
 });
}
export function compileWallResolution(state,catalog) {
 if(!state||state.schemaVersion!==2||state.phase!=='resolving'||state.pending?.type!=='attack')
   bad('Not a pending wall defense');
 const p=state.pending;
 if(!p.defense||p.defense.playerId!==p.targetId)bad('Wall defense response required');
 const caster=find(state,p.targetId),attacker=find(state,p.originalAttackerId);
 if(caster.hp<=0||attacker.hp<=0)bad('Dead wall participant');
 if((p.sourceId??p.originalAttackerId)===p.targetId)
   bad('Self directed attacks cannot be stopped');
 if(!Array.isArray(p.defense.instanceIds)||new Set(p.defense.instanceIds).size!==p.defense.instanceIds.length)
   bad('Invalid wall card selection');
 const attackContext=p.attackContext??compileBasicWeaponAttack(state,catalog);
 if(attackContext.attackKind!=='weapon')bad('Wall cannot stop miracles');
 const hand=p.defense.instanceIds.map(id=>{
   const instance=caster.hand.find(x=>x.instanceId===id);
   if(!instance)bad('Wall card no longer in hand');
   const def=catalog.get(instance.definitionId);
   if(!def)bad('Unknown wall card');
   return {instance,def};
 });
 const learnedId=p.defense.learnedDefinitionId??null;
 if(learnedId!==null){
   const learned=catalog.get(learnedId);
   if(!caster.learned.includes(learnedId)||learned?.family!=='miracle'||
      !learned.effects.some(e=>e.type==='stopAttack'&&e.params.scope==='neutralWeapon'))
     bad('Wall was not learned');
 }
 // The legacy defend format places the learned miracle AFTER all hand cards.
 // The new defendSequence preserves its true place in the selection order,
 // which is necessary for "learned Wall -> spirit doll".
 const sequence=p.defense.sequence??[
   ...p.defense.instanceIds.map(instanceId=>({instanceId})),
   ...(learnedId===null?[]:[{learnedDefinitionId:learnedId}])
 ];
 if(!Array.isArray(sequence)||!sequence.length||sequence.length>4)
   bad('Unsupported Wall defensive selection length');
 if(JSON.stringify(sequence.filter(x=>x?.instanceId).map(x=>x.instanceId))!==
     JSON.stringify(p.defense.instanceIds))
   bad('Wall defense card sequence mismatch');
 const learnedSteps=sequence.filter(x=>x?.learnedDefinitionId);
 if(learnedSteps.length>1||
    (learnedSteps[0]?.learnedDefinitionId??null)!==learnedId)
   bad('Wall learned sequence mismatch');
 let wall=null,wallIndex=-1,spiritIndex=-1,stripIndex=-1;
 const kinds=sequence.map((step,i)=>{
   let def,origin;
   if(step?.instanceId&&Object.keys(step).length===1){
     const found=hand.find(x=>x.instance.instanceId===step.instanceId);
     if(!found)bad('Unheld card in Wall selection');
     def=found.def;origin='hand';
   } else if(step?.learnedDefinitionId&&Object.keys(step).length===1){
     def=catalog.get(step.learnedDefinitionId);origin='learned';
   } else bad('Malformed Wall selection order');
   if(def?.family==='miracle'&&def.effects.some(
      e=>e.type==='stopAttack'&&e.params.scope==='neutralWeapon')){
     if(wall)bad('Only one Wall may be cast');
     wall=def;wallIndex=i;return 'wall';
   }
   if(origin==='learned')bad('Unsupported learned defense miracle');
   if(def.effects.length===1&&def.effects[0].type==='stripElement'&&
      def.effects[0].when==='onDefense'){
     if(stripIndex!==-1)bad('Only one Rainbow Curtain');
     stripIndex=i;return 'strip';
   }
   if(def.family==='item'&&def.playModes.includes('support')&&
      def.effects.length===1&&def.effects[0].type==='waivePreviousMp'&&
      def.effects[0].when==='onCost'&&
      def.effects[0].params.target==='previousMiracle'){
     if(spiritIndex!==-1)bad('Only one spirit per Wall');
     spiritIndex=i;return 'spirit';
   }
   bad('Wall may only combine with Rainbow Curtain and spirit');
 });
 if(!wall)bad('Exactly one Wall is required');
 if(stripIndex!==-1&&stripIndex!==0)bad('Rainbow Curtain must be selected first');
 if(wallIndex!==(stripIndex===0?1:0))
   bad('Wall must follow the optional Rainbow Curtain');
 if(spiritIndex!==-1&&spiritIndex!==wallIndex+1)
   bad('Spirit must immediately follow Wall');
 if(kinds.length!==(stripIndex===0?1:0)+1+(spiritIndex===-1?0:1))
   bad('Unsupported Wall defense ordering');
 if(attackContext.element!=='none'&&stripIndex!==0)
   bad('Wall requires neutral weapon attack');
 const strip=stripIndex===0;
 const spiritUsed=spiritIndex!==-1;
 const mpCost=spiritUsed?0:wall.stats.mpCost;
 if(caster.mp<mpCost)bad('Not enough MP for Wall');
 const queue=Object.freeze([
   ...(p.attackContext?[]:queuedAttackCosts(attackContext,attacker.id)),
   ...(hand.length?[effect('spend',{playerId:caster.id,instanceIds:hand.map(x=>x.instance.instanceId)})]:[]),
   ...(learnedId!==null?[effect('grantDraw',{playerId:caster.id,count:1})]
     :[effect('learn',{playerId:caster.id,definitionId:wall.id})]),
   effect('mp',{playerId:caster.id,cost:mpCost}),
   effect('hit',{targetId:caster.id,damage:0,hpAfter:caster.hp,instantDefeat:false,stopped:true}),
   effect('refill'),effect('advance',{afterId:attacker.id})
 ]);
 return Object.freeze({wallId:wall.id,learnedCast:learnedId!==null,
   stripElement:strip,spiritUsed,attack:attackContext.attack,
   element:attackContext.element,mpCost,queue});
}
export function resolveWallFixture(state,catalog,opts={}) {
 if(opts.labOnly!==true)bad('Only available in lab fixture mode');
 const plan=compileWallResolution(state,catalog);
 const result=runEffectQueueFixture(state,catalog,plan.queue,opts);
 return {...result,plan};
}
