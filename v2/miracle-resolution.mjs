/**
 * V2 G3: narrow solo attack miracles with ordered defensive reactions.
 * Includes initial/learned casts, reflection, deflection and plain armor
 * stacking. This is still a PARTIAL test catalog, not full rules.
 * Unsupported mixed special effects are rejected, never guessed.
 */
import {calculateHit,sumLegalArmor,reflectTarget} from '../src/rules.mjs';
import {drawRandom32} from './foundation.mjs';
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
 const cached=p.attackContext??null;
 if(cached&&(cached.attackKind!=='miracle'||typeof cached.miracleId!=='string'||
    !Number.isSafeInteger(cached.attack)||cached.attack<=0||
    typeof cached.element!=='string'))fail('Unsupported cached miracle attack');
 const caster=person(state,p.originalAttackerId),target=person(state,p.targetId);
 if(caster.hp<=0||target.hp<=0)fail('Caster or target is dead');
 const learnedId=cached?null:(p.attackLearnedDefinitionId??null);
 // Ordered plays can interleave learned and hand cards, but a miracle
 // opening is SOLO (plus at most one immediate physical Spirit).
 // Do not silently drop learned steps from attackSequence while resolving
 // only attackInstanceIds.
 if(!cached && p.attackSequence!==undefined){
   if(!Array.isArray(p.attackSequence) ||
      p.attackSequence.some(step=>!step||typeof step.instanceId!=='string'||
        Object.keys(step).length!==1) ||
      JSON.stringify(p.attackSequence.map(step=>step.instanceId))!==
        JSON.stringify(p.attackInstanceIds))
     fail('Miracle opening cannot mix learned or extra attack steps');
 }
 const cards=cached?[]:selected(caster,p.attackInstanceIds,catalog);
 if(!cached){
   if(learnedId!==null) {
     if(cards.length!==0||typeof learnedId!=='string'||
        !caster.learned.includes(learnedId))fail('Invalid learned miracle selection');
   } else if(cards.length<1||cards.length>2) {
     fail('Only one miracle and optional spirit');
   }
 }
 const miracle=cached?catalog.get(cached.miracleId)
   :(learnedId!==null?catalog.get(learnedId):cards[0].def);
 if(!miracle)fail('Missing learned miracle definition');
 // A +attack miracle selected FIRST is an offensive miracle, not a
 // weapon modifier. Its onDeclare/addAttack tag is inert in this position.
 const soloEffectsSupported=miracle.effects.length===0 ||
   (miracle.effects.length===1&&miracle.effects[0].when==='onDeclare'&&
    miracle.effects[0].type==='addAttack'&&miracle.effects[0].params.scope==='weapon');
 if(miracle.family!=='miracle'||!miracle.playModes.includes('cast')||miracle.stats.attack<=0||
    !soloEffectsSupported)fail('Not a supported solo attack miracle');
 if(cached&&(cached.attack!==miracle.stats.attack||cached.element!==miracle.element))
   fail('Cached miracle payload mismatch');
 let spirit=false;
 if(cards.length===2){
   const support=cards[1].def;
   if(support.family!=='item'||!support.playModes.includes('support')||
      support.effects.length!==1 || support.effects[0].type!=='waivePreviousMp' ||
      support.effects[0].params.target!=='previousMiracle')
      fail('Only spirit directly after miracle is supported');
   spirit=true;
 }
 const payableMP=cached?0:(spirit?0:miracle.stats.mpCost);
 if(!cached&&caster.mp<payableMP)fail('Not enough MP');
 const self=(p.sourceId??p.originalAttackerId)===p.targetId;
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
 const physicalShields=[];
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
   physicalShields.push({guard:def.stats.guard,element:def.element});
 }
 // Angel armor stops a miracle outright; its printed guard does not need
 // to match the stopped miracle's original attribute. 'none' is all-blockable.
 // Non-angel defenses share the SAME numeric and elemental calculation used
 // for ordinary weapons, including Rainbow Curtain's attribute removal.
 const guard=sumLegalArmor(angel?'none':miracle.element,physicalShields,
   {rainbowCurtain:stripElement});
 const stopped=angel;
 const hit=stopped?Object.freeze({damage:0,hpAfter:target.hp,instantDefeat:false,effectiveElement:miracle.element})
  :calculateHit({attack:miracle.stats.attack,element:miracle.element,armor:guard,hp:target.hp,rainbowCurtain:stripElement});
 const queue=Object.freeze([
   ...(cached?[]:[
     ...(learnedId!==null
       ?[item('grantDraw',{playerId:caster.id,count:1})]
       :[item('spend',{playerId:caster.id,instanceIds:cards.map(x=>x.instance.instanceId)})]),
     item('mp',{playerId:caster.id,cost:payableMP}),
     item('learn',{playerId:caster.id,definitionId:miracle.id})
   ]),
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
 const p=state?.pending;
 if(state?.phase==='resolving'&&p?.type==='attack'&&p.defense){
   const defender=person(state,p.targetId);
   if(p.defense.playerId!==defender.id)fail('Defense player mismatch');
   const sequence=p.defense.sequence??[
     ...p.defense.instanceIds.map(instanceId=>({instanceId})),
     ...(p.defense.learnedDefinitionId===undefined?[]
       :[{learnedDefinitionId:p.defense.learnedDefinitionId}])
   ];
   // Ordinary armor stacking is unlimited by the game rule (subject to
   // the staged command's 36-step ceiling). Only special redirects are
   // constrained to solo / immediately-following-Spirit combinations.
   if(!Array.isArray(sequence)||sequence.length>36)
     fail('Invalid miracle defensive selection');
   const handSteps=sequence.filter(step=>step?.instanceId).map(step=>step.instanceId);
   const learnedSteps=sequence.filter(step=>step?.learnedDefinitionId)
     .map(step=>step.learnedDefinitionId);
   // Never interpret a forged/reordered sequence differently from the actual
   // command payload's selected hand cards and optional learned miracle.
   if(JSON.stringify(handSteps)!==JSON.stringify(p.defense.instanceIds)||
      learnedSteps.length>(p.defense.learnedDefinitionId===undefined?0:1)||
      (p.defense.learnedDefinitionId===undefined
        ?learnedSteps.length!==0
        :learnedSteps[0]!==p.defense.learnedDefinitionId))
     fail('Defensive selection sequence mismatch');
   const entries=sequence.map(step=>{
     if(step.instanceId){
       const found=selected(defender,[step.instanceId],catalog)[0];
       return {...found,source:'hand'};
     }
     if(step.learnedDefinitionId){
       if(!defender.learned.includes(step.learnedDefinitionId))
         fail('Defensive miracle not learned');
       const def=catalog.get(step.learnedDefinitionId);
       if(def?.family!=='miracle'||!def.playModes.includes('defend'))
         fail('Unsupported learned defense');
       return {instance:null,def,source:'learned'};
     }
     fail('Malformed miracle defensive selection');
   });
   const redirects=entries.filter(({def})=>def.effects.some(e=>
     e.when==='onDefense'&&e.type==='redirectAttack'&&
     ['miracle','any'].includes(e.params.scope)));
   if(redirects.length){
     const selectedRedirect=entries[0];
     const e=selectedRedirect?.def.effects.find(e=>e.when==='onDefense'&&
       e.type==='redirectAttack'&&['miracle','any'].includes(e.params.scope));
     if(redirects.length!==1||!e||!['reflect','deflect'].includes(e.params.mode)||
       !selectedRedirect.def.playModes.includes('defend'))
       fail('Only one supported miracle redirect');
     const isMiracle=selectedRedirect.def.family==='miracle';
     const spirit=entries.length===2 && isMiracle && entries[1].source==='hand' &&
       entries[1].def.family==='item'&&entries[1].def.playModes.includes('support')&&
       entries[1].def.effects.length===1&&entries[1].def.effects[0].when==='onCost'&&
       entries[1].def.effects[0].type==='waivePreviousMp'&&
       entries[1].def.effects[0].params.target==='previousMiracle';
     if(entries.length!==(spirit?2:1))
       fail('Redirect must be used alone or followed immediately by Spirit');
     if(isMiracle&&!selectedRedirect.def.effects.some(x=>x===e))
       fail('Unsupported defensive miracle');
     const mpCost=isMiracle&&!spirit?selectedRedirect.def.stats.mpCost:0;
     if(defender.mp<mpCost)fail('Not enough MP for defensive miracle');
     const previousSource=p.sourceId??p.originalAttackerId;
     if(previousSource===p.targetId)fail('Self-hit cannot be redirected');
     const living=state.players.filter(x=>x.hp>0).map(x=>x.id);
     let rngSeed=state.rngSeed;
     let rng=()=>0;
     if(e.params.mode==='deflect'){
       if(options.deflectRng!==undefined&&options.deflectRng!==null){
         if(typeof options.deflectRng!=='function')fail('Invalid deflect RNG');
         rng=options.deflectRng;
       }else{
         const roll=drawRandom32(state.rngSeed);
         rngSeed=roll.nextSeed;
         rng=()=>roll.value;
       }
     }
     const route=reflectTarget({source:previousSource,target:p.targetId,actor:p.targetId,
       mode:e.params.mode,living,rng});
     // Preview source spell cost without committing. Cached reflected attacks
     // have already paid their cast price, and never charge it again.
     const preview={...state,pending:{...p,defense:{playerId:p.targetId,instanceIds:[]}}};
     const base=compileSoloMiracleResolution(preview,catalog);
     const originalCosts=base.queue.filter(x=>
       ['spend','grantDraw','mp','learn'].includes(x.type));
     const defenseCosts=[
       ...(selectedRedirect.source==='hand'
         ?[item('spend',{playerId:defender.id,instanceIds:[
           selectedRedirect.instance.instanceId,...(spirit?[entries[1].instance.instanceId]:[])
         ]})]
         :[item('grantDraw',{playerId:defender.id,count:1}),
           ...(spirit?[item('spend',{playerId:defender.id,
             instanceIds:[entries[1].instance.instanceId]})]:[])]),
       ...(isMiracle?[item('mp',{playerId:defender.id,cost:mpCost}),
         item('learn',{playerId:defender.id,definitionId:selectedRedirect.def.id})]:[])
     ];
     const paused=runEffectQueueFixture(state,catalog,[...originalCosts,...defenseCosts],
       {...options,interruptionOnly:true});
     const next=paused.state;
     next.rngSeed=rngSeed;
     next.pending={...next.pending,sourceId:route.source,targetId:route.target,
       attackContext:{attackKind:'miracle',miracleId:base.miracleId,
         attack:base.attack,element:base.element},defense:null};
     const events=[...paused.events,{type:'redirect',mode:e.params.mode,
       by:defender.id,from:previousSource,to:route.target,cardId:selectedRedirect.def.id}];
     if(route.target===defender.id){
       // A deflection that hits its own user resolves immediately: the
       // defender cannot stop, deflect, reflect or guard against this hit.
       next.phase='resolving';next.activePlayerId=null;
       const plan=compileSoloMiracleResolution(next,catalog);
       const settled=runEffectQueueFixture(next,catalog,plan.queue,options);
       return {...settled,plan,events:[...events,...settled.events],
         redirected:true,immediate:true};
     }
     next.phase='defense';next.activePlayerId=route.target;
     return {state:next,plan:Object.freeze({type:'miracleRedirect',
       mode:e.params.mode,miracleId:base.miracleId,targetId:route.target,
       spirit,mpCost}),events,redirected:true,immediate:false};
   }
 }
 const plan=compileSoloMiracleResolution(state,catalog);
 const result=runEffectQueueFixture(state,catalog,plan.queue,options);
 return {...result,plan};
}
