/**
 * G3 weapon-stop resolver: the defensive miracle Wall stops any neutral
 * non-miracle weapon attack. The preceding Rainbow Curtain may strip an
 * elemental attack. Both first-use (in hand) and learned casts are supported.
 * Everything else is deliberately rejected until source-backed resolution.
 */
import {compileBasicWeaponAttack} from './basic-resolution.mjs';
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
 if(p.sourceId===p.targetId||p.originalAttackerId===p.targetId)
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
 const wallFromHand=hand.filter(x=>x.def.family==='miracle'&&x.def.effects.some(
   e=>e.type==='stopAttack'&&e.params.scope==='neutralWeapon'));
 if(wallFromHand.length>1)bad('Only one Wall may be cast');
 const learnedId=p.defense.learnedDefinitionId??null;
 if(learnedId!==null){
   const learned=catalog.get(learnedId);
   if(learnedId!=='m001'||!caster.learned.includes(learnedId)||
      learned?.family!=='miracle' || !learned.effects.some(e=>e.type==='stopAttack'&&e.params.scope==='neutralWeapon'))
     bad('Wall was not learned');
   if(wallFromHand.length)bad('Cannot cast Wall from hand and learned together');
 }
 if(wallFromHand.length+(learnedId!==null?1:0)!==1)bad('Exactly one Wall is required');
 const strip=hand.length>0&&hand[0].def.effects.some(e=>e.type==='stripElement');
 if(hand.length!==(strip?1:0)+wallFromHand.length)
   bad('Wall may only combine with first Rainbow Curtain');
 if(strip&&hand[0].def.effects.filter(e=>e.type==='stripElement').length!==1)
   bad('Unsupported Rainbow Curtain');
 if(!strip&&hand.some(x=>x.def.effects.some(e=>e.type==='stripElement')))
   bad('Rainbow Curtain must be selected first');
 if(wallFromHand.length && hand.at(-1)!==wallFromHand[0])
   bad('Wall must follow the optional Rainbow Curtain');
 if(attackContext.element!=='none'&&!strip)bad('Wall requires neutral weapon attack');
 const wall=wallFromHand.length?wallFromHand[0].def:catalog.get(learnedId);
 const mpCost=wall.stats.mpCost;
 if(caster.mp<mpCost)bad('Not enough MP for Wall');
 const queue=Object.freeze([
   ...(p.attackContext?[]:[effect('spend',{playerId:attacker.id,instanceIds:attackContext.instanceIds})]),
   ...(hand.length?[effect('spend',{playerId:caster.id,instanceIds:hand.map(x=>x.instance.instanceId)})]:[]),
   ...(learnedId!==null?[effect('grantDraw',{playerId:caster.id,count:1})]
     :[effect('learn',{playerId:caster.id,definitionId:wall.id})]),
   effect('mp',{playerId:caster.id,cost:mpCost}),
   effect('hit',{targetId:caster.id,damage:0,hpAfter:caster.hp,instantDefeat:false,stopped:true}),
   effect('refill'),effect('advance',{afterId:attacker.id})
 ]);
 return Object.freeze({wallId:wall.id,learnedCast:learnedId!==null,
   stripElement:!!strip,attack:attackContext.attack,
   element:attackContext.element,mpCost,queue});
}
export function resolveWallFixture(state,catalog,opts={}) {
 if(opts.labOnly!==true)bad('Only available in lab fixture mode');
 const plan=compileWallResolution(state,catalog);
 const result=runEffectQueueFixture(state,catalog,plan.queue,opts);
 return {...result,plan};
}
