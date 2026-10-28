/**
 * G4 source-backed SINGLE Super Mirror vs "Sell" research fixture.
 *
 * This is deliberately NOT wired to live trade selection or the school UI:
 * the timing/priority of repeated mirrors, lethal settlement and card-hand
 * cap cases still need direct original-client observation.
 *
 * Sources:
 * https://kankurou53.hatenablog.com/entry/2025/07/19/165703
 * https://note.com/makariki/n/n437bc90ac4dc
 * https://ameblo.jp/shibransk/entry-12647363984.html
 */
import {planForcedSalePayment} from './trade-payment.mjs';
import {runEffectQueueFixture} from './effect-runner.mjs';

function fail(message){throw new Error(message);}
const livePlayer=(state,id)=>{
 const p=state.players.find(x=>x.id===id);
 if(!p||p.hp<=0)fail('Reflected sale requires living seats');
 return p;
};
/**
 * Refund the item to its original owner, charge that original seller for the
 * item's price, and credit the original target (Super Mirror's owner).
 * An existing physical card never duplicates or changes instance ID.
 *
 * This helper only evaluates a single successful reflection. It does NOT
 * claim that the original has no subsequent counter-reflection opportunity.
 */
export function previewSingleMirrorSale(state,catalog,selection,{mirrorInstanceId}={}){
 if(!state||state.phase!=='turn'||state.schemaVersion!==2)
   fail('Reflected sale requires starting turn');
 const seller=livePlayer(state,selection?.sellerId);
 const counter=livePlayer(state,selection?.targetId);
 if(typeof mirrorInstanceId!=='string')fail('Mirror instance ID required');
 if(mirrorInstanceId===selection?.saleInstanceId||
    mirrorInstanceId===selection?.soldInstanceId)
   fail('Mirror and sale instances must differ');
 const mirror=counter.hand.find(c=>c.instanceId===mirrorInstanceId);
 const def=catalog.get(mirror?.definitionId);
 if(!mirror||!def?.effects.some(e=>e.type==='redirectAttack'&&
    e.when==='onDefense'&&e.params.mode==='reflect'&&e.params.scope==='any'))
   fail('Only a real Super Mirror may reflect the sale');
 // Validate seller's actual trade and offered item, including strict ownership
 // and source-defined price. No transfer happens in this preview.
 // Avoid using previewUncontestedSale: it checks the ORIGINAL BUYER's
 // resources/hand cap, neither of which is relevant after a mirror.
 if(seller.id!==state.activePlayerId||seller.id===counter.id)
   fail('Only current seller can be reflected');
 const trade=seller.hand.find(c=>c.instanceId===selection.saleInstanceId);
 const item=seller.hand.find(c=>c.instanceId===selection.soldInstanceId);
 const tradeDef=catalog.get(trade?.definitionId);
 const itemDef=catalog.get(item?.definitionId);
 if(!trade||!item||trade.instanceId===item.instanceId||
    !tradeDef||tradeDef.family!=='trade'||
    !tradeDef.effects.some(e=>e.type==='forceSale'&&
      e.when==='onDeclare'&&e.params.kind==='sell'))
   fail('Sale requires valid Sell card and offered item');
 if(!itemDef||itemDef.family==='trade')
   fail('Cannot sell an unverified trade artifact');
 const payment=planForcedSalePayment({price:itemDef.stats.price,buyer:seller});
 if(payment.buyerEliminated||payment.unpaid)
   fail('Lethal reflected sale requires original verification');
 if(!Number.isSafeInteger(counter.money+payment.sellerCredit))
   fail('Mirror owner money overflow');
 return Object.freeze({
  originalSellerId:seller.id,mirrorOwnerId:counter.id,
  saleInstanceId:trade.instanceId,soldInstanceId:item.instanceId,
  mirrorInstanceId:mirror.instanceId,itemDefinitionId:item.definitionId,
  price:itemDef.stats.price,payment
 });
}
/**
 * Model one no-follow-up-mirror outcome. Both the Sell card and the mirror
 * are spent once and refilled once; the offered item stays in original hand.
 * Source-backed facts and internal fixture timing are distinguished in docs.
 */
export function settleSingleMirrorSaleFixture(state,catalog,selection,{
 mirrorInstanceId,labOnly=false,fixtureDrawDefinitionId,authorizedSeatId
}={}){
 if(labOnly!==true)fail('Only available in lab fixture mode');
 if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
   fail('Unknown fixture draw card');
 if(authorizedSeatId!==selection?.sellerId)
   fail('Sender seat is not authenticated');
 const plan=previewSingleMirrorSale(state,catalog,selection,{mirrorInstanceId});
 const staged={...state,revision:state.revision+1,phase:'resolving',
   activePlayerId:null,pending:{
    type:'singleMirrorSale',originalAttackerId:plan.originalSellerId
   }};
 const result=runEffectQueueFixture(staged,catalog,[
   {type:'spend',playerId:plan.originalSellerId,instanceIds:[plan.saleInstanceId]},
   {type:'spend',playerId:plan.mirrorOwnerId,instanceIds:[plan.mirrorInstanceId]},
   {type:'reflectedSale',originalSellerId:plan.originalSellerId,
    mirrorOwnerId:plan.mirrorOwnerId,soldInstanceId:plan.soldInstanceId},
   {type:'refill'},
   {type:'advance',afterId:plan.originalSellerId}
 ],{labOnly:true,fixtureDrawDefinitionId});
 return {...result,plan:Object.freeze({
  kind:'singleMirrorSale',price:plan.price,
  itemDefinitionId:plan.itemDefinitionId
 })};
}
