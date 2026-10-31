/**
 * G4 LAB-ONLY source-backed Buy state machine, NON-REFLECTED path.
 *
 * Buyer declares Buy -> target can pass -> a private item is revealed only
 * to the buyer -> buyer chooses Buy or decline -> common effect queue settles.
 *
 * Super Mirror is source-backed as a response but its *outcome and priority*
 * remain unverified. The LAB refuses that branch (without mutating the room),
 * rather than inventing its reversed purchase mechanics.
 */
import {previewBuyOfferFixture,previewBuyChoiceFixture} from './trade-buy.mjs';
import {runEffectQueueFixture} from './effect-runner.mjs';
import {MAX_HAND_SIZE} from '../src/rules.mjs';
function fail(msg){throw new Error(msg);}
function turn(state,p){
 return {...state,phase:'turn',activePlayerId:p.originalAttackerId,pending:null};
}
export function resolveStagedBuyFixture(state,catalog,{
 labOnly=false,fixtureDrawDefinitionId
}={}){
 if(labOnly!==true)fail('Only available in lab fixture mode');
 if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
   fail('Unknown fixture draw card');
 const p=state?.pending;
 if(state?.schemaVersion!==2||state.phase!=='resolving'||
    p?.type!=='buy'||typeof p.accept!=='boolean'||
    p.defense?.playerId!==p.targetId||
    p.defense?.mirrorInstanceId!==null||!p.offer)
   fail('Buy response sequence is incomplete or unverified');
 const basis=turn(state,p);
 const offer=previewBuyOfferFixture(basis,catalog,{
   buyerId:p.originalAttackerId,targetId:p.targetId
 });
 if(offer.itemInstanceId!==p.offer.itemInstanceId||
    offer.itemDefinitionId!==p.offer.itemDefinitionId||
    offer.price!==p.offer.price||offer.nextSeed!==p.offer.nextSeed)
   fail('Staged Buy item was changed after target response');
 // No source confirms which item is lost when a Buy action is spent from
 // an initially full physical hand, acquired item arrives and refill occurs.
 const buyer=state.players.find(x=>x.id===p.originalAttackerId);
 if(p.accept&&buyer?.hand.length===MAX_HAND_SIZE)
   fail('Full-hand Buy settlement requires original timing verification');
 const choice=previewBuyChoiceFixture(basis,catalog,offer,{accept:p.accept});
 const queue=[
   {type:'spend',playerId:p.originalAttackerId,instanceIds:[p.buyInstanceId]},
   {type:'uncontestedBuy',buyerId:p.originalAttackerId,sellerId:p.targetId,
     buyInstanceId:p.buyInstanceId,itemInstanceId:offer.itemInstanceId,
     accept:p.accept},
   {type:'refill'},
   {type:'advance',afterId:p.originalAttackerId}
 ];
 const output=runEffectQueueFixture(state,catalog,queue,{
   labOnly:true,fixtureDrawDefinitionId
 });
 return {...output,plan:Object.freeze({type:'stagedBuy',
   decision:choice.decision,itemDefinitionId:offer.itemDefinitionId,
   price:offer.price})};
}
