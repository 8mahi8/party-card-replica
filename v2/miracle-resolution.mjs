/**
 * V2 G3 Part 3: intentionally narrow, reference-backed first-use solo miracles.
 * Card source: the existing 68-card verified research subset.
 * Does NOT handle re-casting from learned list, multiple miracles, Aura,
 * wall or reflection; these require additional command/interrupt contracts.
 */
import {calculateHit,canBlock,MAX_HAND_SIZE,MAX_LEARNED_MIRACLES} from '../src/rules.mjs';
import {createInstance} from './foundation.mjs';

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
 const cards=selected(caster,p.attackInstanceIds,catalog);
 if(cards.length<1||cards.length>2)fail('Only one miracle and optional spirit');
 const miracle=cards[0].def;
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
   item('spend',{playerId:caster.id,instanceIds:cards.map(x=>x.instance.instanceId)}),
   item('mp',{playerId:caster.id,cost:payableMP}),
   item('learn',{playerId:caster.id,definitionId:miracle.id}),
   ...(self?[]:[item('spend',{playerId:target.id,instanceIds:defense.map(x=>x.instance.instanceId)})]),
   item('hit',{targetId:target.id,...hit,stopped}),
   item('refill'),item('advance',{afterId:caster.id})
 ]);
 return Object.freeze({miracleId:miracle.id,attack:miracle.stats.attack,element:miracle.element,
   payableMP,spirit,stopped,guard,hit,queue});
}
function nextAlive(players,after) {
 const offset=players.findIndex(p=>p.id===after);
 for(let i=1;i<=players.length;i++) {
   const p=players[(offset+i)%players.length];
   if(p.hp>0)return p.id;
 }
 return null;
}
/** Fixed draw lab implementation only. Does not use the incomplete reference
 * catalog to generate gameplay probabilities. */
export function resolveSoloMiracleFixture(state,catalog,{labOnly=false,fixtureDrawDefinitionId}={}) {
 if(labOnly!==true)fail('Only available in lab fixture mode');
 if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
   fail('Unknown fixture draw card');
 const plan=compileSoloMiracleResolution(state,catalog);
 const s={...state,revision:state.revision+1,pending:null,
   players:state.players.map(p=>({...p,hand:p.hand.map(x=>({...x})),learned:[...p.learned]})),
   processedCommands:[...state.processedCommands]};
 const spent=Object.create(null),events=[];
 for(const e of plan.queue){
   if(e.type==='spend'){
     const who=person(s,e.playerId),ids=new Set(e.instanceIds),before=who.hand.length;
     who.hand=who.hand.filter(x=>!ids.has(x.instanceId));
     if(before-who.hand.length!==ids.size)fail('Missing spent card');
     spent[who.id]=(spent[who.id]??0)+ids.size;
     events.push({type:'spend',playerId:who.id,count:ids.size});
   } else if(e.type==='mp'){
     const who=person(s,e.playerId);
     who.mp-=e.cost;
     events.push({type:'payMp',playerId:who.id,cost:e.cost});
   } else if(e.type==='learn'){
     const who=person(s,e.playerId);
     if(!who.learned.includes(e.definitionId))
       who.learned=[...who.learned,e.definitionId].slice(-MAX_LEARNED_MIRACLES);
     events.push({type:'learn',playerId:who.id,definitionId:e.definitionId});
   } else if(e.type==='hit'){
     const who=person(s,e.targetId);
     who.hp=e.hpAfter;
     events.push({type:'damage',targetId:who.id,damage:e.damage,
       instantDefeat:e.instantDefeat,stopped:e.stopped});
   } else if(e.type==='refill'){
     for(const who of s.players) {
       const n=spent[who.id]??0;
       let added=0;
       if(who.hp>0) {
         while(added<n&&who.hand.length<MAX_HAND_SIZE){
           who.hand.push(createInstance(fixtureDrawDefinitionId,s.nextInstanceSerial++,catalog));
           added++;
         }
       }
       if(n)events.push({type:'refill',playerId:who.id,added});
     }
   } else if(e.type==='advance'){
     const living=s.players.filter(p=>p.hp>0);
     if(living.length<=1){
       s.phase='finished';s.activePlayerId=null;
       s.winnerId=living.length===1?living[0].id:null;
     } else {
       s.phase='turn';s.activePlayerId=nextAlive(s.players,e.afterId);
       s.turnCount++;
     }
   } else fail('Unknown miracle queue effect');
 }
 return {state:s,plan,events};
}
