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
import {planForcedSalePayment} from './trade-payment.mjs';

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
function cloneRoom(state,{interruptionOnly=false}={}){
 return {
   ...state,
   revision:state.revision+1,
   players:state.players.map(p=>({...p,
     hand:p.hand.map(c=>({...c})),learned:[...p.learned]})),
   pending:interruptionOnly?{...state.pending,spentByPlayer:{...state.pending.spentByPlayer}}:null,
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
 labOnly=false,fixtureDrawDefinitionId,interruptionOnly=false
}={}){
 if(labOnly!==true)fail('Only available in lab fixture mode');
 if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
   fail('Unknown fixture draw card');
 if(!state||state.schemaVersion!==2||state.phase!=='resolving'||!state.pending||
    !Array.isArray(state.players)||!Array.isArray(state.processedCommands))
   fail('Invalid state for effect queue');
 if(!Array.isArray(queue)||!queue.length)fail('Empty compiled effect queue');
 if(interruptionOnly&&queue.some(e=>!['spend','grantDraw','mp','learn'].includes(e?.type)))
   fail('Resolution commands are not permitted while staging');
 const s=cloneRoom(state,{interruptionOnly});
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
   } else if(effect.type==='discard'){
     // Unlike a played card, a discarded artifact gets NO replacement.
     // Only G3's strict discard command may compile this action. Keep
     // ordinary spend/refill credits and previous pending effects distinct.
     if(!Array.isArray(effect.instanceIds)||!effect.instanceIds.length)
       fail('Invalid discarded IDs');
     const ids=new Set(effect.instanceIds),p=who(s,effect.playerId);
     if(ids.size!==effect.instanceIds.length)fail('Repeated discarded card');
     for(const instance of p.hand){
       if(ids.has(instance.instanceId)){
         const policy=catalog.get(instance.definitionId)?.discardPolicy;
         if(policy==='forbidden')fail('This card cannot be discarded');
         if(policy!=='ordinary')fail('Special discard effect is not yet implemented');
       }
     }
     const before=p.hand.length;
     p.hand=p.hand.filter(x=>!ids.has(x.instanceId));
     if(before-p.hand.length!==ids.size)fail('Discarded card not in hand');
     events.push({type:'discard',playerId:p.id,count:ids.size});
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
   } else if(effect.type==='uncontestedSale'){
     // Source-verified transfer and debit only. A real live trade must first
     // implement Super Mirror counterplay; this effect is lab-fixture ONLY.
     if(Object.keys(effect).some(k=>!['type','sellerId','buyerId','soldInstanceId'].includes(k)))
       fail('Unexpected sale effect property');
     const sellerOriginal=who(state,effect.sellerId);
     const paidTradeCard=queue.some(q=>q?.type==='spend'&&
       q.playerId===effect.sellerId&&Array.isArray(q.instanceIds)&&
       q.instanceIds.some(id=>{
         const card=sellerOriginal.hand.find(c=>c.instanceId===id);
         const def=catalog.get(card?.definitionId);
         return def?.family==='trade'&&def.effects.some(e=>e.type==='forceSale'&&e.params.kind==='sell');
       }));
     if(!paidTradeCard)fail('Sale effect requires spending a valid Sell trade card');
     if(effect.sellerId===effect.buyerId)fail('Cannot sell to self');
     const seller=who(s,effect.sellerId),buyer=who(s,effect.buyerId);
     if(seller.hp<=0||buyer.hp<=0)fail('Trade seat eliminated');
     const saleIndex=seller.hand.findIndex(x=>x.instanceId===effect.soldInstanceId);
     if(saleIndex<0)fail('Sold card is not held');
     const item=seller.hand[saleIndex],definition=catalog.get(item.definitionId);
     if(!definition||definition.family==='trade')
       fail('Unverified trade item cannot be sold');
     if(buyer.hand.length>=MAX_HAND_SIZE)
       fail('Buyer hand cap needs original-game verification');
     const payment=planForcedSalePayment({price:definition.stats.price,buyer});
     // The buyer-death transfer, seller payout and hand ownership timing
     // cannot yet be asserted from the original client's observed actions.
     if(payment.buyerEliminated||payment.unpaid)
       fail('Lethal forced sale requires original verification');
     if(!Number.isSafeInteger(seller.money+payment.sellerCredit))
       fail('Seller money overflow');
     seller.hand.splice(saleIndex,1);
     buyer.hand.push(item);
     buyer.hp=payment.buyerAfter.hp;
     buyer.mp=payment.buyerAfter.mp;
     buyer.money=payment.buyerAfter.money;
     seller.money+=payment.sellerCredit;
     events.push({type:'uncontestedSale',sellerId:seller.id,buyerId:buyer.id,
       itemDefinitionId:item.definitionId,price:definition.stats.price,
       debit:payment.debit});
   } else if(effect.type==='reflectedSale'){
     // One Super Mirror against a forced sale, research fixture only.
     // The original seller retains the item and becomes the payer; the
     // original target who supplied Super Mirror receives the price.
     const allowed=['type','originalSellerId','mirrorOwnerId','soldInstanceId'];
     if(Object.keys(effect).some(k=>!allowed.includes(k)))
       fail('Unexpected reflected sale property');
     if(state.pending?.type!=='singleMirrorSale')
       fail('Reflected sale requires researched mirror staging');
     if(effect.originalSellerId===effect.mirrorOwnerId)
       fail('Cannot reflect a sale to self');
     const originalSeller=who(state,effect.originalSellerId);
     const mirrorOwner=who(state,effect.mirrorOwnerId);
     const originalItem=originalSeller.hand.find(c=>c.instanceId===effect.soldInstanceId);
     const itemDef=catalog.get(originalItem?.definitionId);
     if(!originalItem||!itemDef||itemDef.family==='trade')
       fail('Invalid item offered for reflected sale');
     if(!s.players.find(p=>p.id===originalSeller.id).hand.some(
       c=>c.instanceId===originalItem.instanceId))
       fail('Reflected sale must leave item with original owner');
     const hasPaidCard=(owner,predicate)=>queue.some(q=>
       q?.type==='spend'&&q.playerId===owner.id&&
       Array.isArray(q.instanceIds)&&q.instanceIds.some(id=>{
         const card=owner.hand.find(c=>c.instanceId===id);
         return card&&predicate(catalog.get(card.definitionId));
       }));
     if(!hasPaidCard(originalSeller,d=>d?.family==='trade'&&
       d.effects.some(e=>e.type==='forceSale'&&e.params.kind==='sell')))
       fail('Reflected sale requires a spent Sell card');
     if(!hasPaidCard(mirrorOwner,d=>d?.effects.some(e=>
       e.type==='redirectAttack'&&e.params.mode==='reflect'&&
       e.params.scope==='any')))
       fail('Reflected sale requires a spent Super Mirror');
     const seller=who(s,originalSeller.id),counter=who(s,mirrorOwner.id);
     if(seller.hp<=0||counter.hp<=0)fail('Reflected sale player eliminated');
     const payment=planForcedSalePayment({price:itemDef.stats.price,buyer:seller});
     if(payment.buyerEliminated||payment.unpaid)
       fail('Lethal reflected sale requires original verification');
     if(!Number.isSafeInteger(counter.money+payment.sellerCredit))
       fail('Mirror owner money overflow');
     seller.hp=payment.buyerAfter.hp;
     seller.mp=payment.buyerAfter.mp;
     seller.money=payment.buyerAfter.money;
     counter.money+=payment.sellerCredit;
     events.push({type:'reflectedSale',originalSellerId:seller.id,
       mirrorOwnerId:counter.id,itemDefinitionId:itemDef.id,
       price:itemDef.stats.price,debit:payment.debit});
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
 if(interruptionOnly)s.pending.spentByPlayer={...spent};
 return {state:s,events};
}
