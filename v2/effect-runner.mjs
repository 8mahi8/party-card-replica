/**
 * Common, deterministic, JSON-only effect queue interpreter for the G3 lab.
 *
 * The plans are compiled by rules-specific modules. This module is the only
 * place allowed to mutate a NEW cloned room for shared spend/mp/learn/hit/
 * refill/advance effects. Never substitute a partial reference-deck draw for
 * real weighted draws in production.
 */
import {createInstance} from './foundation.mjs';
import {MAX_HAND_SIZE,MAX_LEARNED_MIRACLES} from '../src/rules.mjs';

function fail(message){throw new Error(message);}
function who(state,id){
 const p=state.players.find(x=>x.id===id);
 if(!p)fail('Unknown player');
 return p;
}
function positiveCount(n){return Number.isSafeInteger(n)&&n>=0;}
function nextAlive(players,afterId){
 const from=players.findIndex(p=>p.id===afterId);
 if(from<0)fail('Unknown original turn owner');
 for(let offset=1;offset<=players.length;offset++){
   const p=players[(from+offset)%players.length];
   if(p.hp>0)return p.id;
 }
 return null;
}
function cloneRoom(state){
 return {
   ...state,
   revision:state.revision+1,
   players:state.players.map(p=>({...p,
     hand:p.hand.map(c=>({...c})),learned:[...p.learned]})),
   pending:null,
   processedCommands:[...state.processedCommands]
 };
}
/**
 * Interpret a compiled queue atomically as an API: if any instruction fails,
 * the original input state remains untouched, and nothing is committed.
 *
 * External synchronization still needs an authoritative transaction/CAS.
 */
export function runEffectQueueFixture(state,catalog,queue,{
 labOnly=false,fixtureDrawDefinitionId
}={}){
 if(labOnly!==true)fail('Only available in lab fixture mode');
 if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
   fail('Unknown fixture draw card');
 if(!state||state.schemaVersion!==2||state.phase!=='resolving'||!state.pending||
    !Array.isArray(state.players)||!Array.isArray(state.processedCommands))
   fail('Invalid state for effect queue');
 if(!Array.isArray(queue)||!queue.length)fail('Empty compiled effect queue');
 const s=cloneRoom(state);
 const spent=Object.assign(Object.create(null),state.pending.spentByPlayer??{});
 const events=[];
 for(const effect of queue){
   if(!effect||typeof effect!=='object')fail('Malformed queued effect');
   if(effect.type==='spend'){
     if(!Array.isArray(effect.instanceIds))fail('Invalid spend IDs');
     const ids=new Set(effect.instanceIds),p=who(s,effect.playerId);
     if(ids.size!==effect.instanceIds.length)fail('Repeated card in spend instruction');
     const before=p.hand.length;
     p.hand=p.hand.filter(x=>!ids.has(x.instanceId));
     if(before-p.hand.length!==ids.size)fail('Card disappeared during resolution');
     spent[p.id]=(spent[p.id]??0)+ids.size;
     events.push({type:'spend',playerId:p.id,count:ids.size});
   } else if(effect.type==='grantDraw'){
     const p=who(s,effect.playerId);
     if(!positiveCount(effect.count)||effect.count<1||effect.count>18)
       fail('Invalid grantDraw count');
     spent[p.id]=(spent[p.id]??0)+effect.count;
     events.push({type:'grantDraw',playerId:p.id,count:effect.count});
   } else if(effect.type==='mp'){
     const p=who(s,effect.playerId);
     if(!positiveCount(effect.cost)||p.mp<effect.cost)fail('Invalid MP payment');
     p.mp-=effect.cost;
     events.push({type:'payMp',playerId:p.id,cost:effect.cost});
   } else if(effect.type==='learn'){
     const p=who(s,effect.playerId);
     const id=effect.definitionId;
     if(!catalog.has(id)||catalog.get(id).family!=='miracle')
       fail('Only known miracles may be learned');
     if(!p.learned.includes(id))
       p.learned=[...p.learned,id].slice(-MAX_LEARNED_MIRACLES);
     events.push({type:'learn',playerId:p.id,definitionId:id});
   } else if(effect.type==='hit'){
     const p=who(s,effect.targetId);
     if(!positiveCount(effect.damage)||!positiveCount(effect.hpAfter)||
        effect.hpAfter>p.hp||typeof effect.instantDefeat!=='boolean')
       fail('Malformed hit effect');
     p.hp=effect.hpAfter;
     events.push({type:'damage',targetId:p.id,damage:effect.damage,
       instantDefeat:effect.instantDefeat,hpAfter:effect.hpAfter,
       ...(effect.stopped===undefined?{}:{stopped:effect.stopped})});
   } else if(effect.type==='refill'){
     for(const p of s.players){
       const amount=spent[p.id]??0;
       if(!positiveCount(amount))fail('Invalid spent count');
       let added=0;
       if(p.hp>0){
         while(added<amount&&p.hand.length<MAX_HAND_SIZE){
           p.hand.push(createInstance(fixtureDrawDefinitionId,s.nextInstanceSerial++,catalog));
           added++;
         }
       }
       if(amount)events.push({type:'refill',playerId:p.id,added});
     }
   } else if(effect.type==='advance'){
     const living=s.players.filter(p=>p.hp>0);
     if(living.length<=1){
       s.phase='finished';s.activePlayerId=null;
       s.winnerId=living.length===1?living[0].id:null;
       events.push({type:'matchEnd',winnerId:s.winnerId});
     } else {
       s.phase='turn';s.activePlayerId=nextAlive(s.players,effect.afterId);
       s.turnCount++;
       events.push({type:'turnAdvance',activePlayerId:s.activePlayerId});
     }
   } else fail('Unknown queued effect: '+String(effect.type));
 }
 return {state:s,events};
}
