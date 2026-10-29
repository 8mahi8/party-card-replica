/**
 * G4 research-only lethal forced-sale inspector.
 *
 * The original's money -> MP -> HP debit and HP-zero outcome are sourced.
 * A full lethal sale still needs the precise original ordering of card
 * transfer, the spend/refill, any Sun Charm revival, and seller payout when
 * insufficient resources remain. This helper never settles those outcomes.
 *
 * https://w.atwiki.jp/aniwotawiki/pages/47010.html
 * https://idea427.hatenablog.com/entry/2023/07/31/192159
 * https://note.com/hixiragi/n/n47365b74f372
 */
import {planForcedSalePayment} from './trade-payment.mjs';

function fail(message){throw new Error(message);}
function active(state,id){
 const p=state.players.find(x=>x.id===id);
 if(!p||!Number.isSafeInteger(p.hp)||p.hp<=0)
   fail('Forced sale requires a living player');
 return p;
}
/**
 * Examine a genuine Sell action without playing it.
 *
 * NEVER pass the result through the normal effect queue when buyerEliminated:
 * all zero-HP aftermath requires additional evidence, even if full nominal
 * payment could be covered exactly.
 */
export function inspectForcedSaleLethalityFixture(state,catalog,{
 sellerId,targetId,saleInstanceId,soldInstanceId
}={}){
 if(!state||state.schemaVersion!==2||state.phase!=='turn'||
   !Array.isArray(state.players)||!(catalog instanceof Map))
   fail('Lethal preview requires a V2 research turn');
 if(sellerId!==state.activePlayerId||sellerId===targetId)
   fail('Only the current seller can inspect another player');
 if(typeof saleInstanceId!=='string'||typeof soldInstanceId!=='string'||
   saleInstanceId===soldInstanceId)
   fail('Sell and offered artifact must have distinct physical IDs');
 const seller=active(state,sellerId),buyer=active(state,targetId);
 const sale=seller.hand.find(x=>x.instanceId===saleInstanceId);
 const item=seller.hand.find(x=>x.instanceId===soldInstanceId);
 const action=catalog.get(sale?.definitionId);
 const offered=catalog.get(item?.definitionId);
 if(!sale||!item||action?.family!=='trade'||!action.effects.some(e=>
    e.when==='onDeclare'&&e.type==='forceSale'&&e.params.kind==='sell'))
   fail('Lethal preview requires an authentic held Sell card and offered item');
 if(!offered)fail('Unknown offered card definition');
 const payment=planForcedSalePayment({price:offered.stats.price,buyer});
 const consequence=payment.buyerEliminated?
   (payment.unpaid>0?'hp-zero-shortfall':'hp-zero-exact'):'survives';
 const unresolved=payment.buyerEliminated?
   ['zeroHpRecoveryOrResurrection','lethalCardTransferAndRefill',
     ...(payment.unpaid>0?['sellerCreditWithUnpaidAmount']:[])] :[];
 return Object.freeze({
   kind:'saleLethalityPreview',
   sellerId,targetId,
   saleInstanceId,soldInstanceId,
   itemDefinitionId:item.definitionId,price:offered.stats.price,
   payment,consequence,
   canSettleWithExistingLab:!payment.buyerEliminated,
   unresolved:Object.freeze(unresolved)
 });
}
