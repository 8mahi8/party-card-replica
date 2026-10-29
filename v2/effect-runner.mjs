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
import {planIncomingHandTransfer} from './hand-overflow.mjs';
import {previewBuyOfferFixture,previewBuyChoiceFixture} from './trade-buy.mjs';
import {previewExchangeFixture} from './trade-exchange.mjs';
import {planZeroHpRecoveryFixture} from './zero-hp-recovery.mjs';
import {previewSelfSaleFixture} from './trade-self-sale.mjs';

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
     const recovery=planZeroHpRecoveryFixture({player:p,catalog,
       hpAfter:effect.hpAfter});
     p.hp=recovery.hpAfter;
     events.push({type:'damage',targetId:p.id,damage:effect.damage,
       instantDefeat:effect.instantDefeat,hpAfter:effect.hpAfter,
       ...(effect.stopped===undefined?{}:{stopped:effect.stopped})});
     if(recovery.kind==='revived'){
       const index=p.hand.findIndex(x=>x.instanceId===recovery.consumedInstanceId);
       if(index<0)fail('Passive charm disappeared during resolution');
       p.hand.splice(index,1);
       // Source-backed used-artifact replacement, drawn only at the
       // existing shared refill point in this isolated laboratory.
       spent[p.id]=(spent[p.id]??0)+1;
       events.push({type:'revive',playerId:p.id,revivedHp:10,
         consumedInstanceId:recovery.consumedInstanceId,
         consumedDefinitionId:recovery.consumedDefinitionId});
     }
   } else if(effect.type==='exchange'){
     // All Exchange allocations are server-side staged and self-directed.
     // There is no opposing defense and no change of total HP+MP+money.
     if(Object.keys(effect).length!==2||
        !['type','playerId'].every(k=>Object.hasOwn(effect,k)))
       fail('Malformed exchange effect');
     const p=state.pending;
     if(p?.type!=='exchange'||p.originalAttackerId!==effect.playerId)
       fail('Exchange does not match staged command');
     const original=who(state,effect.playerId);
     const trade=original.hand.find(x=>x.instanceId===p.exchangeInstanceId);
     const def=catalog.get(trade?.definitionId);
     const spends=queue.filter(x=>x?.type==='spend');
     if(!trade||def?.family!=='trade'||!def.effects.some(e=>
       e.when==='onDeclare'&&e.type==='reallocateResources'&&
       e.params.kind==='exchange')||
       spends.length!==1||spends[0].playerId!==effect.playerId||
       spends[0].instanceIds?.length!==1||
       spends[0].instanceIds[0]!==trade.instanceId)
       fail('Exchange requires exactly one authentic spent Exchange card');
     const plan=previewExchangeFixture({hp:original.hp,mp:original.mp,money:original.money},p.allocation);
     const player=who(s,effect.playerId);
     player.hp=plan.after.hp;
     player.mp=plan.after.mp;
     player.money=plan.after.money;
     events.push({type:'exchange',playerId:player.id,before:plan.before,
       after:plan.after,total:plan.total});
   } else if(effect.type==='selfSale'){
     if(Object.keys(effect).length!==2||!Object.hasOwn(effect,'playerId'))
       fail('Malformed self Sale effect');
     const pending=state.pending;
     if(pending?.type!=='selfSale'||pending.originalAttackerId!==effect.playerId||
        pending.targetId!==effect.playerId)
       fail('Self Sale must match the authenticated room');
     const actor=who(state,effect.playerId),current=who(s,effect.playerId);
     const consumed=queue.filter(q=>q.type==='spend'&&q.playerId===effect.playerId);
     if(consumed.length!==1||
        consumed[0].instanceIds?.length!==1||
        consumed[0].instanceIds[0]!==pending.saleInstanceId)
       fail('Self Sale requires spending exactly one authentic Sell card');
     const asTurn={...state,phase:'turn',activePlayerId:effect.playerId,pending:null};
     const plan=previewSelfSaleFixture(asTurn,catalog,{
       sellerId:effect.playerId,saleInstanceId:pending.saleInstanceId,
       soldInstanceId:pending.soldInstanceId
     });
     if(!current.hand.some(c=>c.instanceId===plan.soldInstanceId))
       fail('Self Sale offered item must remain held');
     current.hp=plan.after.hp;
     current.mp=plan.after.mp;
     current.money=plan.after.money;
     events.push({type:'selfSale',playerId:effect.playerId,
       itemDefinitionId:plan.itemDefinitionId,
       price:plan.price,total:plan.total});
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
     if(state.pending?.type==='sale'&&(
       state.pending.originalAttackerId!==effect.sellerId||
       state.pending.targetId!==effect.buyerId||
       state.pending.soldInstanceId!==effect.soldInstanceId||
       state.pending.defense?.playerId!==effect.buyerId||
       state.pending.defense?.mirrorInstanceId!==null))
       fail('Sale does not match authenticated accepted response');
     if(effect.sellerId===effect.buyerId)fail('Cannot sell to self');
     const seller=who(s,effect.sellerId),buyer=who(s,effect.buyerId);
     if(seller.hp<=0||buyer.hp<=0)fail('Trade seat eliminated');
     const saleIndex=seller.hand.findIndex(x=>x.instanceId===effect.soldInstanceId);
     if(saleIndex<0)fail('Sold card is not held');
     const item=seller.hand[saleIndex],definition=catalog.get(item.definitionId);
     if(!definition)
       fail('Unknown offered card definition');
     if(buyer.learned.length>0 &&
        buyer.hand.length+buyer.learned.length>=MAX_HAND_SIZE)
       fail('Learned miracle overflow at hand cap needs original verification');
     const incoming=planIncomingHandTransfer(buyer.hand,s.rngSeed);
     const payment=planForcedSalePayment({price:definition.stats.price,buyer});
     // The buyer-death transfer, seller payout and hand ownership timing
     // cannot yet be asserted from the original client's observed actions.
     if(payment.buyerEliminated||payment.unpaid)
       fail('Lethal forced sale requires original verification');
     if(!Number.isSafeInteger(seller.money+payment.sellerCredit))
       fail('Seller money overflow');
     seller.hand.splice(saleIndex,1);
     if(incoming.willOverflow){
       const removed=buyer.hand.splice(incoming.evictedIndex,1)[0];
       if(removed?.instanceId!==incoming.evictedInstanceId)
         fail('Incorrect receiver overflow card');
       s.rngSeed=incoming.nextSeed;
       events.push({type:'handOverflow',playerId:buyer.id,
         lostInstanceId:removed.instanceId,lostDefinitionId:removed.definitionId,
         cause:'trade'});
     }
     buyer.hand.push(item);
     buyer.hp=payment.buyerAfter.hp;
     buyer.mp=payment.buyerAfter.mp;
     buyer.money=payment.buyerAfter.money;
     seller.money+=payment.sellerCredit;
     events.push({type:'uncontestedSale',sellerId:seller.id,buyerId:buyer.id,
       itemDefinitionId:item.definitionId,price:definition.stats.price,
       debit:payment.debit});
   } else if(effect.type==='uncontestedBuy'){
     // Research-only Buy settlement after an explicitly uncontested offer.
     // Original Super Mirror response timing and a buyer's initial full hand
     // are not established; never route a live command to this effect.
     const keys=['type','buyerId','sellerId','buyInstanceId','itemInstanceId','accept'];
     if(Object.keys(effect).some(k=>!keys.includes(k))||
        typeof effect.accept!=='boolean')
       fail('Invalid researched Buy effect');
     const pending=state.pending;
     if(!['uncontestedBuy','buy'].includes(pending?.type)||
        pending.originalAttackerId!==effect.buyerId||
        pending.targetId!==effect.sellerId||
        pending.buyInstanceId!==effect.buyInstanceId||
        (pending.type==='buy'?
          pending.offer?.itemInstanceId!==effect.itemInstanceId||
          pending.defense?.playerId!==effect.sellerId||
          pending.defense?.mirrorInstanceId!==null:
          pending.itemInstanceId!==effect.itemInstanceId)||
        pending.accept!==effect.accept)
       fail('Buy does not match authenticated research selection');
     if(effect.buyerId===effect.sellerId)fail('Cannot buy from self');
     const originalBuyer=who(state,effect.buyerId);
     const paidTrade=originalBuyer.hand.find(c=>c.instanceId===effect.buyInstanceId);
     const paidDef=catalog.get(paidTrade?.definitionId);
     const spendCommands=queue.filter(q=>q?.type==='spend');
     if(!paidTrade||paidDef?.family!=='trade'||
        !paidDef.effects.some(e=>e.type==='requestBuy'&&
          e.when==='onDeclare'&&e.params.kind==='buy')||
        spendCommands.length!==1||
        spendCommands[0].playerId!==effect.buyerId||
        spendCommands[0].instanceIds?.length!==1||
        spendCommands[0].instanceIds[0]!==effect.buyInstanceId)
       fail('Buy requires spending exactly the authentic Buy trade card');
     const asTurn={...state,phase:'turn',activePlayerId:effect.buyerId,pending:null};
     const offer=previewBuyOfferFixture(asTurn,catalog,{
       buyerId:effect.buyerId,targetId:effect.sellerId
     });
     if(offer.itemInstanceId!==effect.itemInstanceId)
       fail('Buy cannot choose a different randomly offered card');
     const choice=previewBuyChoiceFixture(asTurn,catalog,offer,{
       accept:effect.accept
     });
     const buyer=who(s,effect.buyerId),seller=who(s,effect.sellerId);
     // Avoid inventing whether the action-card refill or incoming item is
     // processed first at the physical 18-card limit.
     if(effect.accept && originalBuyer.hand.length===MAX_HAND_SIZE)
       fail('Full-hand Buy settlement requires original timing verification');
     s.rngSeed=offer.nextSeed;
     if(!effect.accept){
       events.push({type:'buyDeclined',buyerId:buyer.id,sellerId:seller.id,
         itemDefinitionId:offer.itemDefinitionId,price:offer.price});
     }else{
       const index=seller.hand.findIndex(c=>c.instanceId===offer.itemInstanceId);
       if(index<0)fail('Randomly chosen item is no longer held');
       const item=seller.hand.splice(index,1)[0];
       buyer.hand.push(item);
       buyer.money=choice.buyerMoneyAfter;
       seller.money=choice.sellerMoneyAfter;
       events.push({type:'uncontestedBuy',buyerId:buyer.id,sellerId:seller.id,
         itemDefinitionId:item.definitionId,price:offer.price,
         itemInstanceId:item.instanceId});
     }
   } else if(effect.type==='reflectedSale'){
     // One Super Mirror against a forced sale, research fixture only.
     // The original seller retains the item and becomes the payer; the
     // original target who supplied Super Mirror receives the price.
     const allowed=['type','originalSellerId','mirrorOwnerId','soldInstanceId'];
     if(Object.keys(effect).some(k=>!allowed.includes(k)))
       fail('Unexpected reflected sale property');
     if(state.pending?.type!=='singleMirrorSale'&&state.pending?.type!=='sale')
       fail('Reflected sale requires researched mirror staging');
     if(state.pending?.type==='sale'&&(
       state.pending.originalAttackerId!==effect.originalSellerId||
       state.pending.targetId!==effect.mirrorOwnerId||
       state.pending.soldInstanceId!==effect.soldInstanceId||
       state.pending.defense?.playerId!==effect.mirrorOwnerId||
       !state.pending.defense.mirrorInstanceId))
       fail('Reflected sale does not match authenticated response');
     if(effect.originalSellerId===effect.mirrorOwnerId)
       fail('Cannot reflect a sale to self');
     const originalSeller=who(state,effect.originalSellerId);
     const mirrorOwner=who(state,effect.mirrorOwnerId);
     const originalItem=originalSeller.hand.find(c=>c.instanceId===effect.soldInstanceId);
     const itemDef=catalog.get(originalItem?.definitionId);
     if(!originalItem||!itemDef)
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
