/**
 * LAB-ONLY G4: bridge authenticated two-step trade commands to the reusable
 * single-outcome sale engine. The original client's repeated mirror timing,
 * hand-cap and lethal settlement are NOT inferred here.
 */
import {previewUncontestedSale} from './trade-sale.mjs';
import {previewSingleMirrorSale} from './trade-reflection.mjs';
import {runEffectQueueFixture} from './effect-runner.mjs';
function fail(msg){throw new Error(msg);}
function selection(p){
 return {sellerId:p.originalAttackerId,targetId:p.targetId,
   saleInstanceId:p.saleInstanceId,soldInstanceId:p.soldInstanceId};
}
function turnPreview(state,p){
 return {...state,phase:'turn',activePlayerId:p.originalAttackerId,pending:null};
}
/** Validate at least one researched resolution BEFORE the other seat is asked. */
export function validateSaleDeclarationFixture(state,catalog){
 if(state?.schemaVersion!==2||state.phase!=='tradeDefense'||
    state.pending?.type!=='sale'||state.pending.defense!==null)
   fail('No newly declared sale');
 const p=state.pending,asTurn=turnPreview(state,p),s=selection(p);
 let hasOutcome=false;
 try{previewUncontestedSale(asTurn,catalog,s);hasOutcome=true;}catch{}
 const buyer=state.players.find(x=>x.id===p.targetId);
 for(const card of buyer?.hand??[]){
  try{
   previewSingleMirrorSale(asTurn,catalog,s,{mirrorInstanceId:card.instanceId});
   hasOutcome=true;break;
  }catch{}
 }
 if(!hasOutcome)
   fail('No source-verified sale response available for these resources');
 return true;
}
/**
 * Deal only a recorded pass OR a single Super Mirror; importantly, use
 * current state revision, already-recorded command fingerprints and the
 * original sale item ID. No extra auto-created command / rollback hazard.
 */
export function resolveStagedSaleFixture(state,catalog,{
 labOnly=false,fixtureDrawDefinitionId
}={}){
 if(labOnly!==true)fail('Only available in lab fixture mode');
 if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
   fail('Unknown fixture draw card');
 if(state?.schemaVersion!==2||state.phase!=='resolving'||
    state.pending?.type!=='sale'||!state.pending.defense)
   fail('No sale response waiting for resolution');
 const p=state.pending,s=selection(p),response=p.defense;
 if(response.playerId!==p.targetId)fail('Invalid trade response seat');
 if(!Object.hasOwn(response,'mirrorInstanceId'))
   fail('Missing trade response type');
 const asTurn=turnPreview(state,p);
 let plan,queue;
 if(response.mirrorInstanceId===null){
   plan=previewUncontestedSale(asTurn,catalog,s);
   queue=[
     {type:'spend',playerId:s.sellerId,instanceIds:[s.saleInstanceId]},
     {type:'uncontestedSale',sellerId:s.sellerId,buyerId:s.targetId,
       soldInstanceId:s.soldInstanceId},
     {type:'refill'},{type:'advance',afterId:s.sellerId}
   ];
 }else{
   plan=previewSingleMirrorSale(asTurn,catalog,s,{
     mirrorInstanceId:response.mirrorInstanceId
   });
   queue=[
     {type:'spend',playerId:s.sellerId,instanceIds:[s.saleInstanceId]},
     {type:'spend',playerId:s.targetId,instanceIds:[response.mirrorInstanceId]},
     {type:'reflectedSale',originalSellerId:s.sellerId,mirrorOwnerId:s.targetId,
       soldInstanceId:s.soldInstanceId},
     {type:'refill'},{type:'advance',afterId:s.sellerId}
   ];
 }
 const result=runEffectQueueFixture(state,catalog,queue,{
   labOnly:true,fixtureDrawDefinitionId
 });
 return {...result,plan:Object.freeze({
   type:'sale',reaction:response.mirrorInstanceId?'singleMirror':'accepted',
   itemDefinitionId:plan.itemDefinitionId,price:plan.price
 })};
}
