/**
 * G4, LAB-ONLY research primitive for the original "買う" trade.
 *
 * Documented facts:
 * - randomly expose ONE physical artifact from the chosen opponent;
 * - current buyer chooses whether to pay its listed price;
 * - insufficient MONEY means "貧乏" (MP and HP cannot cover a purchase);
 * - an unused miracle has price 0.
 *
 * https://w.atwiki.jp/aniwotawiki/pages/47010.html
 * https://godfield-beginner.game-info.wiki/
 * https://toroccowars.jp/21551/
 *
 * Internal offer/choice primitives shared by a LAB-ONLY Buy card and staged
 * command path. Original reflected-Buy outcome / empty target hand /
 * learned-slot overflow need stronger evidence. No public view may expose the
 * opponent's full hand or this authoritative offer before a pass response.
 * xorshift32 is an explicit deterministic test surrogate, NOT original RNG.
 */
import {drawRandom32} from './foundation.mjs';
import {planIncomingHandTransfer} from './hand-overflow.mjs';
import {MAX_HAND_SIZE} from '../src/rules.mjs';

function fail(message){throw new Error(message);}
function money(value){
 if(!Number.isSafeInteger(value)||value<0)
   fail('Invalid purchase money');
 return value;
}
function member(state,id){
 return state.players.find(p=>p.id===id);
}
function ready(state,catalog,buyerId,targetId){
 if(!state||state.schemaVersion!==2||state.phase!=='turn'||
    !Array.isArray(state.players)||!(catalog instanceof Map))
   fail('Buy research requires a V2 laboratory turn');
 if(typeof buyerId!=='string'||buyerId!==state.activePlayerId||
    typeof targetId!=='string'||buyerId===targetId)
   fail('Invalid research Buy target');
 const buyer=member(state,buyerId),seller=member(state,targetId);
 if(!buyer||!seller||buyer.hp<=0||seller.hp<=0)
   fail('Buy requires living buyer and target');
 money(buyer.money);money(seller.money);
 if(!Array.isArray(buyer.hand)||!Array.isArray(seller.hand)||
    !Array.isArray(buyer.learned)||
    buyer.hand.length>MAX_HAND_SIZE||seller.hand.length>MAX_HAND_SIZE)
   fail('Invalid Buy research hands');
 if(!seller.hand.length)
   fail('Buy from empty hand needs original verification');
 return {buyer,seller};
}
/**
 * Internal-only deterministic random offer. Never publish to opponents.
 * A server may eventually record the sampled item and seed in a staged room,
 * but must not trust an offer or seed supplied by a client.
 */
export function previewBuyOfferFixture(state,catalog,{buyerId,targetId}={}){
 const {buyer,seller}=ready(state,catalog,buyerId,targetId);
 const seen=new Set();
 for(const card of seller.hand){
   if(typeof card?.instanceId!=='string'||!card.instanceId||
      seen.has(card.instanceId)||!catalog.has(card.definitionId))
     fail('Invalid target hand item');
   seen.add(card.instanceId);
 }
 const draw=drawRandom32(state.rngSeed);
 const selected=seller.hand[Math.floor(draw.value*seller.hand.length)];
 const definition=catalog.get(selected.definitionId);
 const price=money(definition.stats?.price);
 return Object.freeze({
   type:'buyOfferFixture',buyerId,targetId,originRevision:state.revision,
   originSeed:state.rngSeed,
   itemInstanceId:selected.instanceId,itemDefinitionId:selected.definitionId,
   price,canAfford:buyer.money>=price,nextSeed:draw.nextSeed
 });
}
/**
 * Pure choice preview, with a strict recomputation of the offer. Both branches
 * merely describe an eventual transaction; no item, money, or RNG is changed.
 */
export function previewBuyChoiceFixture(state,catalog,offer,{accept}={}){
 if(typeof accept!=='boolean')fail('Buy choice must be explicit');
 if(!offer||typeof offer!=='object'||Array.isArray(offer))
   fail('Invalid Buy offer');
 const fresh=previewBuyOfferFixture(state,catalog,{
   buyerId:offer.buyerId,targetId:offer.targetId
 });
 const keys=Object.keys(fresh);
 if(Object.keys(offer).length!==keys.length||
    keys.some(key=>!Object.hasOwn(offer,key)||offer[key]!==fresh[key]))
   fail('Stale or forged Buy offer');
 const {buyer,seller}=ready(state,catalog,offer.buyerId,offer.targetId);
 if(!accept)
   return Object.freeze({
     decision:'declined',buyerId:offer.buyerId,targetId:offer.targetId,
     price:offer.price,itemInstanceId:offer.itemInstanceId,
     buyerMoneyAfter:buyer.money,sellerMoneyAfter:seller.money,
     overflow:null,nextSeed:offer.nextSeed
   });
 if(!offer.canAfford)fail('Poor: Buy cannot spend MP or HP');
 if(buyer.learned.length>0&&
    buyer.hand.length+buyer.learned.length>=MAX_HAND_SIZE)
   fail('Learned miracle overflow at hand cap needs original verification');
 if(!Number.isSafeInteger(seller.money+offer.price))
   fail('Seller money overflow');
 const overflow=planIncomingHandTransfer(buyer.hand,offer.nextSeed);
 return Object.freeze({
   decision:'accepted',buyerId:offer.buyerId,targetId:offer.targetId,
   price:offer.price,itemInstanceId:offer.itemInstanceId,
   buyerMoneyAfter:buyer.money-offer.price,
   sellerMoneyAfter:seller.money+offer.price,
   overflow,nextSeed:overflow.nextSeed
 });
}
