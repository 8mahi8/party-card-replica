/**
 * V2 G3 Part 3: intentionally narrow, reference-backed first-use solo miracles.
 * Card source: the existing 68-card verified research subset.
 * Does NOT handle re-casting from learned list, multiple miracles, Aura,
 * wall or reflection; these require additional command/interrupt contracts.
 */
import {calculateHit,canBlock} from '../src/rules.mjs';
import {runEffectQueueFixture} from './effect-runner.mjs';

function fail(s){throw new Error(s);}
function person(s,id) {
 const p=s.players.find(x=>x.id===id);
 if(!p)fail('Unknown player');
 return p;
}
function selected(player,ids,catalog) {
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length)fail('Invalid card selection');
 return ids.map(id=>{
   const instance=player.hand.find(x=>x.instanceId===id);
   if(!instance)fail('Selected card missing from hand');
   const def=catalog.get(instance.definitionId);
   if(!def)fail('Unknown definition');
   return {instance,def};
 });
}
function checkShieldEffects(card,{angel=false}={}) {
 for(const effect of card.effects) {
   if(effect.type==='stripElement')continue;
   if(effect.type==='stopAttack'&&effect.params.scope==='miracle'&&angel)continue;
   if(effect.type==='stopAttack'&&effect.params.scope==='miracle')continue;
   fail('Unsupported miracle defense effect '+effect.type);
 }
}
const item=(type,extra={})=>Object.freeze({type,...extra});
export function compileSoloMiracleResolution(state,catalog) {
 if(!(catalog instanceof Map)||!catalog.size)fail('Catalog required');
 if(!state||state.schemaVersion!==2||state.phase!=='resolving'||state.pending?.type!=='attack')
   fail('Not a pending miracle attack');
 const p=state.pending;
 if(p.attackContext)fail('Miracle chains not implemented');
 const caster=person(state,p.originalAttackerId),target=person(state,p.targetId);
 if(caster.hp<=0||target.hp<=0)fail('Caster or target is dead');
 const learnedId=p.attackLearnedDefinitionId??null;
 const cards=selected(caster,p.attackInstanceIds,catalog);
 if(learnedId!==null) {
   if(cards.length!==0||typeof learnedId!=='string'||
      !caster.learned.includes(learnedId))fail('Invalid learned miracle selection');
 } else if(cards.length<1||cards.length>2) {
   fail('Only one miracle and optional spirit');
 }
 const miracle=learnedId!==null?catalog.get(learnedId):cards[0].def;
 if(!miracle)fail('Missing learned miracle definition');
 if(miracle.family!=='miracle'||!miracle.playModes.includes('cast')||miracle.stats.attack<=0||
    miracle.effects.length)fail('Not a supported solo attack miracle');
 let spirit=false;
 if(cards.length===2){
   const support=cards[1].def;
   if(support.family!=='item'||!support.playModes.includes('support')||
      support.effects.length!==1 || support.effects[0].type!=='waivePreviousMp' ||
      support.effects[0].params.target!=='previousMiracle')
      fail('Only spirit directly after miracle is supported');
   spirit=true;
 }
 const payableMP=spirit?0:miracle.stats.mpCost;
 if(caster.mp<payableMP)fail('Not enough MP');
 const self=p.targetId===p.originalAttackerId;
 let defense=[];
 if(self) {
   if(p.defense!==null)fail('Self cast cannot be defended');
 } else {
   if(!p.defense||p.defense.playerId!==target.id)fail('Defense required');
   if(p.defense.learnedDefinitionId!==undefined)
     fail('Learned defensive miracle is unsupported against miracle attacks');
   defense=selected(target,p.defense.instanceIds,catalog);
 }
 const angel=defense.some(c=>c.def.effects.some(e=>e.type==='stopAttack'&&e.params.scope==='miracle'));
 if(angel&&defense.length!==1)fail('Angel stop armor must be selected alone');
 const stripElement=defense.some((c,i)=>c.def.effects.some(e=>e.type==='stripElement'&&i===0));
 let guard=0;
 for(const [index,{def}] of defense.entries()) {
   if(!def.playModes.includes('defend'))fail('Not a defensive card');
   checkShieldEffects(def,{angel});
   const strip=def.effects.some(e=>e.type==='stripElement');
   if(strip) {
     if(index!==0)fail('Rainbow curtain must be first');
     continue;
   }
   if(def.family!=='weapon'&&def.family!=='armor')
     fail('Unsupported item in miracle defense');
   if(!angel&&!canBlock(miracle.element,def.element,{rainbowCurtain:stripElement}))
     fail('Illegal shield for attack element');
   guard+=def.stats.guard;
   if(!Number.isSafeInteger(guard))fail('Guard overflow');
 }
 const stopped=angel;
 const hit=stopped?Object.freeze({damage:0,hpAfter:target.hp,instantDefeat:false,effectiveElement:miracle.element})
  :calculateHit({attack:miracle.stats.attack,element:miracle.element,armor:guard,hp:target.hp,rainbowCurtain:stripElement});
 const queue=Object.freeze([
   ...(learnedId!==null
      ?[item('grantDraw',{playerId:caster.id,count:1})]
      :[item('spend',{playerId:caster.id,instanceIds:cards.map(x=>x.instance.instanceId)})]),
   item('mp',{playerId:caster.id,cost:payableMP}),
   item('learn',{playerId:caster.id,definitionId:miracle.id}),
   ...(self?[]:[item('spend',{playerId:target.id,instanceIds:defense.map(x=>x.instance.instanceId)})]),
   item('hit',{targetId:target.id,...hit,stopped}),
   item('refill'),item('advance',{afterId:caster.id})
 ]);
 return Object.freeze({miracleId:miracle.id,attack:miracle.stats.attack,element:miracle.element,
   payableMP,spirit,stopped,guard,hit,queue});
}
/** Lab-only resolver for a compiled miracle queue. */
export function resolveSoloMiracleFixture(state,catalog,options={}) {
 if(options.labOnly!==true)fail('Only available in lab fixture mode');
 if(!(catalog instanceof Map)||!catalog.has(options.fixtureDrawDefinitionId))
   fail('Unknown fixture draw card');
 const plan=compileSoloMiracleResolution(state,catalog);
 const result=runEffectQueueFixture(state,catalog,plan.queue,options);
 return {...result,plan};
}
