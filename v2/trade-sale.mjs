/**
 * G3/G4 UNCONTESTED SALE FIXTURE. NOT A LIVE trade command.
 *
 * Original-game sources:
 * https://w.atwiki.jp/aniwotawiki/pages/47010.html
 * https://w.atwiki.jp/piong/pages/19.html
 * https://note.com/hixiragi/n/n47365b74f372
 *
 * A Super Mirror can reflect a trade. Rather than silently make forced
 * sales unblockable, this research fixture models only a sale after
 * the defender has NOT countered it. Lethal cases remain gated.
 * Full-hand overflow follows sourced random existing-card loss, with only
 * the seeded lab PRNG serving as a stand-in for the original RNG.
 * No live UI/online integration.
 */
import {runEffectQueueFixture} from './effect-runner.mjs';
import {planForcedSalePayment} from './trade-payment.mjs';
import {MAX_HAND_SIZE} from '../src/rules.mjs';

function fail(message){throw new Error(message);}
function seat(state,id){return state.players.find(p=>p.id===id);}
function held(player,instanceId){
 if(typeof instanceId!=='string')fail('Invalid sale instance ID');
 const card=player.hand.find(c=>c.instanceId===instanceId);
 if(!card)fail('Sale card not held');
 return card;
}
/** A pure input-validation preview: useful for UI staging later. */
export function previewUncontestedSale(state,catalog,{
 sellerId,targetId,saleInstanceId,soldInstanceId
}={}){
 if(!state||state.schemaVersion!==2||state.phase!=='turn'||
    !Array.isArray(state.players)||!(catalog instanceof Map))
   fail('Sale preview needs a live turn in a V2 lab');
 if(sellerId!==state.activePlayerId||sellerId===targetId)
   fail('Only current seller may offer sale to another seat');
 const seller=seat(state,sellerId),buyer=seat(state,targetId);
 if(!seller||!buyer||seller.hp<=0||buyer.hp<=0)
   fail('Invalid alive trade parties');
 if(saleInstanceId===soldInstanceId)fail('Trade and sold card must differ');
 const saleCard=held(seller,saleInstanceId),offer=held(seller,soldInstanceId);
 const saleDef=catalog.get(saleCard.definitionId),itemDef=catalog.get(offer.definitionId);
 if(!saleDef||saleDef.family!=='trade'||
    !saleDef.effects.some(e=>e.when==='onDeclare'&&
      e.type==='forceSale'&&e.params.kind==='sell'))
   fail('Selected source is not a Sell card');
 if(!itemDef)
   fail('Unknown offered card definition');
 if(buyer.hand.length>MAX_HAND_SIZE)
   fail('Receiver hand is above original hand cap');
 // A player report says active/learned miracles may share the 18-card cap.
 // Whether an overflow can eject a learned miracle is not yet verified.
 if(buyer.learned.length>0 &&
    buyer.hand.length+buyer.learned.length>=MAX_HAND_SIZE)
   fail('Learned miracle overflow at hand cap needs original verification');
 const payment=planForcedSalePayment({price:itemDef.stats.price,buyer});
 if(payment.buyerEliminated||payment.unpaid)
   fail('Lethal forced sale requires original verification');
 if(!Number.isSafeInteger(seller.money+payment.sellerCredit))
   fail('Seller money overflow');
 return Object.freeze({sellerId,targetId,saleInstanceId,soldInstanceId,
  itemDefinitionId:offer.definitionId,price:itemDef.stats.price,payment,
  willOverflow:buyer.hand.length===MAX_HAND_SIZE});
}
/** Simulate only an acknowledged, uncontested sale in a fixture-controlled turn. */
export function settleUncontestedSaleFixture(state,catalog,selection,{
 labOnly=false,fixtureDrawDefinitionId,authorizedSeatId
}={}){
 if(labOnly!==true)fail('Only available in lab fixture mode');
 if(!catalog?.has(fixtureDrawDefinitionId))
   fail('Unknown fixture draw card');
 if(authorizedSeatId!==selection?.sellerId)
   fail('Sender seat is not authenticated');
 const plan=previewUncontestedSale(state,catalog,selection);
 const staged={...state,revision:state.revision+1,phase:'resolving',
  activePlayerId:null,pending:{
   type:'uncontestedSale',originalAttackerId:plan.sellerId
  }};
 const result=runEffectQueueFixture(staged,catalog,[
  {type:'spend',playerId:plan.sellerId,instanceIds:[plan.saleInstanceId]},
  {type:'uncontestedSale',sellerId:plan.sellerId,buyerId:plan.targetId,
   soldInstanceId:plan.soldInstanceId},
  {type:'refill'},
  {type:'advance',afterId:plan.sellerId}
 ],{labOnly:true,fixtureDrawDefinitionId});
 return {...result,plan:Object.freeze({kind:'uncontestedSale',price:plan.price,
  itemDefinitionId:plan.itemDefinitionId})};
}
