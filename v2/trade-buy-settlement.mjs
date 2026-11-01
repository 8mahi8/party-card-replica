/**
 * G4 LAB-ONLY uncontested Buy outcome (NOT a live Buy command).
 * Source-backed: seller's RANDOM physical item offered, only buyer MONEY may
 * pay, seller gains that money, purchased card's physical instance moves,
 * the spent Buy action refills once; declining buys nothing.
 *
 * Sources:
 * https://w.atwiki.jp/piong/pages/19.html
 * https://w.atwiki.jp/aniwotawiki/pages/47010.html
 * https://note.com/hixiragi/n/n47365b74f372
 *
 * A defender can use Super Mirror. The original timing is still unknown.
 * This fixture explicitly presupposes that no one countered the Buy; it may
 * not silently be promoted to a live command, multiplayer API or school UI.
 */
import {previewBuyOfferFixture,previewBuyChoiceFixture} from './trade-buy.mjs';
import {runEffectQueueFixture} from './effect-runner.mjs';
import {MAX_HAND_SIZE} from '../src/rules.mjs';

function fail(message){throw new Error(message);}

export function settleUncontestedBuyFixture(state,catalog,{
 buyerId,targetId,buyInstanceId,accept
}={},{
 labOnly=false,fixtureDrawDefinitionId,authorizedSeatId
}={}){
 if(labOnly!==true)fail('Only available in lab fixture mode');
 if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
   fail('Unknown fixture draw card');
 if(authorizedSeatId!==buyerId)
   fail('Sender seat is not authenticated');
 if(typeof accept!=='boolean')fail('Buy choice must be explicit');
 const buyer=state?.players?.find(p=>p.id===buyerId);
 const source=buyer?.hand.find(x=>x.instanceId===buyInstanceId);
 const def=catalog.get(source?.definitionId);
 if(!source||def?.family!=='trade'||
    !def.effects.some(e=>e.type==='requestBuy'&&
      e.when==='onDeclare'&&e.params.kind==='buy'))
   fail('Only a held authentic Buy card may declare purchase');
 const offer=previewBuyOfferFixture(state,catalog,{buyerId,targetId});
 // This is a standalone, explicitly uncontested laboratory path. Since
 // a Buy spends its own card before adding the purchased item, physical
 // 18-card timing requires a fresh direct-source observation.
 if(accept&&buyer.hand.length===MAX_HAND_SIZE)
   fail('Full-hand Buy settlement requires original timing verification');
 const choice=previewBuyChoiceFixture(state,catalog,offer,{accept});
 const staged={...state,revision:state.revision+1,phase:'resolving',
   activePlayerId:null,pending:{
     type:'uncontestedBuy',originalAttackerId:buyerId,targetId,
     buyInstanceId,itemInstanceId:offer.itemInstanceId,accept
   }};
 const result=runEffectQueueFixture(staged,catalog,[
   {type:'spend',playerId:buyerId,instanceIds:[buyInstanceId]},
   {type:'uncontestedBuy',buyerId,sellerId:targetId,buyInstanceId,
     itemInstanceId:offer.itemInstanceId,accept},
   {type:'refill'},
   {type:'advance',afterId:buyerId}
 ],{labOnly:true,fixtureDrawDefinitionId});
 return {...result,plan:Object.freeze({type:'uncontestedBuyFixture',
   decision:choice.decision,itemDefinitionId:offer.itemDefinitionId,
   price:offer.price})};
}
