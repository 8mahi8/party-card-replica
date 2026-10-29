/**
 * Self-directed Sell in the G4 offline lab.
 *
 * Evidence from 2015 self-Sell play and 2023 UI reports:
 * - The target may be the acting player.
 * - The selected item remains in the player's hand.
 * - The Sell artifact is consumed; HP+MP+money total is unchanged.
 *
 * Since the actor is both payer and recipient, the money paid is credited
 * back to the same actor; any money shortage is collected from MP then HP.
 * The resulting math is therefore a special 1:1 reallocation.
 *
 * Unresolved: hallucination clearing (no hallucination system yet), selling
 * at HP-zero, full-hand cap interactions, and any older-client differences.
 * Do not call this an authoritative online rule.
 *
 * https://ameblo.jp/godfield-tactics/entry-12100951333.html
 * https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q14275381654
 */
import {planForcedSalePayment} from './trade-payment.mjs';
function fail(message){throw new Error(message);}
export function previewSelfSaleFixture(state,catalog,{
 sellerId,saleInstanceId,soldInstanceId
}={}){
 if(state?.schemaVersion!==2||state.phase!=='turn'||
    state.activePlayerId!==sellerId||!(catalog instanceof Map))
   fail('Self Sale requires the current V2 research turn');
 const actor=state.players?.find(p=>p.id===sellerId);
 if(!actor||actor.hp<=0)fail('Self Sale requires a living player');
 if(typeof saleInstanceId!=='string'||typeof soldInstanceId!=='string'||
    saleInstanceId===soldInstanceId)
   fail('Self Sale requires distinct physical cards');
 const sale=actor.hand.find(c=>c.instanceId===saleInstanceId);
 const item=actor.hand.find(c=>c.instanceId===soldInstanceId);
 const saleDef=catalog.get(sale?.definitionId),itemDef=catalog.get(item?.definitionId);
 if(!sale||!item||saleDef?.family!=='trade'||
    !saleDef.effects.some(e=>e.when==='onDeclare'&&
      e.type==='forceSale'&&e.params.kind==='sell')||!itemDef)
   fail('Self Sale requires authentic held Sell and offered item');
 const payment=planForcedSalePayment({price:itemDef.stats.price,buyer:actor});
 if(payment.buyerEliminated||payment.unpaid)
   fail('Lethal self Sale requires original verification');
 const money=payment.buyerAfter.money+payment.sellerCredit;
 if(!Number.isSafeInteger(money))fail('Self Sale money overflow');
 const before=actor.hp+actor.mp+actor.money;
 const after=payment.buyerAfter.hp+payment.buyerAfter.mp+money;
 if(!Number.isSafeInteger(before)||!Number.isSafeInteger(after)||before!==after)
   fail('Self Sale must preserve total resources');
 return Object.freeze({
   type:'selfSale',sellerId,
   saleInstanceId,soldInstanceId,itemDefinitionId:item.definitionId,
   price:itemDef.stats.price,payment,
   after:Object.freeze({hp:payment.buyerAfter.hp,
     mp:payment.buyerAfter.mp,money}),
   total:before
 });
}
