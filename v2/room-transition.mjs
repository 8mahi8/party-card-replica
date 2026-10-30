/**
 * V2 G3 integration layer: ONE lab command entrypoint for staged attacks.
 *
 * Caller must be the room's trusted owner: authorizedSeatId comes from the
 * transport's seat authentication, never from command.actorId alone.
 * Every failure throws before returning state; the caller must persist only
 * the returned state, using an external transaction/CAS in live multiplayer.
 *
 * This module is LAB-ONLY. It uses an audited-incomplete fixture card draw
 * and must not be used for production card probability or online play.
 */
import {applyStagingCommand} from './staging-room.mjs';
import {validateSaleDeclarationFixture,resolveStagedSaleFixture} from './staged-sale.mjs';
import {resolveStagedBuyFixture} from './staged-buy.mjs';
import {resolveRedirectFixture} from './redirect-resolution.mjs';
import {resolveSoloMiracleFixture,compileSoloMiracleResolution} from './miracle-resolution.mjs';
import {compileOrderedWeaponAttack} from './ordered-attack.mjs';
import {runEffectQueueFixture} from './effect-runner.mjs';
import {drawRandom32} from './foundation.mjs';
import {MAX_HAND_SIZE} from '../src/rules.mjs';

function fail(message){throw new Error(message);}
function attackFamily(state,catalog) {
  const pending=state?.pending;
  if(!pending||pending.type!=='attack')fail('No attack queued');
  if(pending.attackContext) {
    if(!['weapon','miracle'].includes(pending.attackContext.attackKind))
      fail('Unknown compiled attack family');
    return pending.attackContext.attackKind;
  }
  if(pending.attackLearnedDefinitionId!==undefined) {
    const actor=state.players.find(p=>p.id===pending.originalAttackerId);
    const id=pending.attackLearnedDefinitionId;
    if(!actor?.learned.includes(id)||catalog.get(id)?.family!=='miracle')
      fail('Attack miracle is not learned');
    return 'miracle';
  }
  const attackSequence=pending.attackSequence;
  if(attackSequence!==undefined) {
    if(!Array.isArray(attackSequence)||!attackSequence.length)
      fail('Invalid attack sequence');
    const first=attackSequence[0];
    if(!first?.instanceId||Object.keys(first).length!==1)
      fail('Unsupported sequence opening');
  }
  const firstId=attackSequence?.[0].instanceId??pending.attackInstanceIds?.[0];
  if(typeof firstId!=='string')fail('No playable opening card');
  const caster=state.players.find(p=>p.id===pending.originalAttackerId);
  const instance=caster?.hand.find(c=>c.instanceId===firstId);
  const def=catalog.get(instance?.definitionId);
  if(!def)fail('Opening card is missing');
  if(!['weapon','miracle'].includes(def.family))
    fail('Unknown opening card family');
  return def.family;
}
/**
 * A complete, independent turn: draw one fixture card and advance.
 * With eighteen cards, the original game's prayer replaces one randomly
 * discarded existing card. RNG is advanced by the authoritative room only.
 * This uses the lab's fixed draw: NOT original drop odds or online behavior.
 */
export function resolvePrayFixture(state,catalog,options={}){
  if(options.labOnly!==true)fail('Only available in lab fixture mode');
  if(state?.schemaVersion!==2||state.phase!=='resolving'||state.pending?.type!=='pray')
    fail('No prayer waiting for resolution');
  const actorId=state.pending.originalAttackerId;
  const actor=state.players.find(p=>p.id===actorId);
  if(!actor||actor.hp<=0)fail('Invalid praying actor');
  if(actor.hand.some(c=>catalog.get(c.definitionId)?.family==='weapon'))
    fail('Cannot pray while holding a weapon');
  if(actor.hand.length>MAX_HAND_SIZE)fail('Hand exceeds cap');
  let staged=state;
  const full=actor.hand.length===MAX_HAND_SIZE;
  let drawInstruction;
  if(full){
    const random=drawRandom32(state.rngSeed);
    staged={...state,rngSeed:random.nextSeed};
    const index=Math.floor(random.value*actor.hand.length);
    drawInstruction={type:'spend',playerId:actorId,instanceIds:[actor.hand[index].instanceId]};
  }else{
    drawInstruction={type:'grantDraw',playerId:actorId,count:1};
  }
  const result=runEffectQueueFixture(staged,catalog,[
    drawInstruction,{type:'refill'},{type:'advance',afterId:actorId}
  ],options);
  return {...result,plan:Object.freeze({type:'pray',wasFull:full})};
}
/**
 * End a turn by discarding selected physical artifacts, with NO replacement.
 * Ordinary discard is a sourced rule; exceptions (return with HP penalty)
 * are intentionally not generalized until an actual special card is listed.
 */
export function resolveDiscardFixture(state,catalog,options={}){
  if(options.labOnly!==true)fail('Only available in lab fixture mode');
  if(state?.schemaVersion!==2||state.phase!=='resolving'||
     state.pending?.type!=='discard')
    fail('No discard waiting for resolution');
  const actorId=state.pending.originalAttackerId;
  const actor=state.players.find(p=>p.id===actorId);
  if(!actor||actor.hp<=0)fail('Invalid discarding actor');
  const ids=state.pending.discardInstanceIds;
  if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_HAND_SIZE||
     ids.some(x=>typeof x!=='string')||new Set(ids).size!==ids.length)
    fail('Invalid discard selection');
  for(const id of ids){
    const card=actor.hand.find(c=>c.instanceId===id);
    if(!card)fail('Discarded card not in hand');
    const policy=catalog.get(card.definitionId)?.discardPolicy;
    if(policy==='forbidden')fail('This card cannot be discarded');
    if(policy!=='ordinary')fail('Special discard effect is not yet implemented');
  }
  const result=runEffectQueueFixture(state,catalog,[
    {type:'discard',playerId:actorId,instanceIds:[...ids]},
    {type:'advance',afterId:actorId}
  ],options);
  return {...result,plan:Object.freeze({type:'discard',count:ids.length})};
}
/**
 * Resolve a complete defense response OR a direct self-targeting attack.
 * If the defender redirects, the output returns to the "defense" phase.
 */
export function resolveStagedFixture(state,catalog,{
  labOnly=false,fixtureDrawDefinitionId,deflectRng=null
}={}){
  if(labOnly!==true)fail('Only available in lab fixture mode');
  if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
    fail('Unknown fixture draw card');
  if(state?.schemaVersion!==2||state.phase!=='resolving')
    fail('No attack waiting for resolution');
  if(state.pending?.type==='useItem'){
    const p=state.pending;
    const actor=state.players.find(x=>x.id===p.originalAttackerId);
    const target=state.players.find(x=>x.id===(p.targetId??p.originalAttackerId));
    const card=actor?.hand.find(x=>x.instanceId===p.instanceId);
    const def=catalog.get(card?.definitionId);
    const effect=def?.effects.find(e=>e.when==='onDeclare'&&
      ['restoreResource','flipHpRisk'].includes(e.type));
    if(!card||!actor||actor.hp<=0||!target||target.hp<=0||
       def?.family!=='item'||!def.playModes.includes('use')||
       def.effects.length!==1||!effect)
      fail('Invalid pending recovery item');
    // Remote-targeted items pause BEFORE the random outcome is selected.
    // Only Super Mirror can turn this item back on its original user.
    let mirrorId=null,recipient=target;
    if(target.id!==actor.id){
      if(p.defense?.playerId!==target.id||
         !Object.hasOwn(p.defense,'mirrorInstanceId'))
        fail('Targeted item requires an authenticated defense response');
      mirrorId=p.defense.mirrorInstanceId;
      if(mirrorId!==null){
        const mirror=target.hand.find(c=>c.instanceId===mirrorId);
        const mirrorDef=catalog.get(mirror?.definitionId);
        if(!mirror||!mirrorDef?.effects.some(e=>
          e.when==='onDefense'&&e.type==='redirectAttack'&&
          e.params.mode==='reflect'&&e.params.scope==='any'))
          fail('Only Super Mirror reflects the item');
        recipient=actor;
      }
    }else if(p.defense!==null&&p.defense!==undefined)
      fail('Cannot defend against an item used on oneself');
    let staged=state,action,outcome=null;
    if(effect.type==='restoreResource'){
      action={type:'restoreResource',playerId:recipient.id,
        resource:effect.params.resource,amount:effect.params.amount};
    }else{
      if(effect.params.heal!==10||effect.params.damage!==10||
         effect.params.healChance!==0.5)fail('Invalid coin-flip item');
      const sample=drawRandom32(state.rngSeed);
      staged={...state,rngSeed:sample.nextSeed};
      outcome=sample.value<effect.params.healChance?'heal':'damage';
      action=outcome==='heal'?
        {type:'restoreResource',playerId:recipient.id,resource:'hp',amount:10}:
        {type:'hit',targetId:recipient.id,damage:10,
          hpAfter:Math.max(0,recipient.hp-10),instantDefeat:false};
    }
    const fatal=outcome==='damage'&&recipient.hp<=10&&
      !recipient.hand.some(c=>catalog.get(c.definitionId)?.effects.some(e=>
        e.when==='onZeroHp'&&e.type==='reviveAtZeroHp'&&e.params.hp===10));
    const queue=[
      {type:'spend',playerId:actor.id,instanceIds:[card.instanceId]},
      ...(mirrorId===null?[]:[{type:'spend',playerId:target.id,instanceIds:[mirrorId]}]),
      action,{type:'refill'},
      fatal?{type:'advance',afterId:actor.id}:{type:'resumeTurn',playerId:actor.id}
    ];
    const result=runEffectQueueFixture(staged,catalog,queue,
      {labOnly:true,fixtureDrawDefinitionId});
    return {...result,plan:Object.freeze({type:'useItem',
      playerId:actor.id,targetId:recipient.id,definitionId:def.id,
      ...(effect.type==='restoreResource'?{
        resource:effect.params.resource,amount:effect.params.amount
      }:{outcome,heal:10,damage:10,reflected:mirrorId!==null})})};
  }
  if(state.pending?.type==='pray')
    return resolvePrayFixture(state,catalog,{labOnly,fixtureDrawDefinitionId});
  if(state.pending?.type==='discard')
    return resolveDiscardFixture(state,catalog,{labOnly,fixtureDrawDefinitionId});
  if(state.pending?.type==='sale')
    return resolveStagedSaleFixture(state,catalog,{labOnly,fixtureDrawDefinitionId});
  if(state.pending?.type==='selfSale'){
    const p=state.pending;
    return {...runEffectQueueFixture(state,catalog,[
      {type:'spend',playerId:p.originalAttackerId,instanceIds:[p.saleInstanceId]},
      {type:'selfSale',playerId:p.originalAttackerId},
      {type:'refill'},
      {type:'advance',afterId:p.originalAttackerId}
    ],{labOnly:true,fixtureDrawDefinitionId}),
    plan:Object.freeze({type:'selfSale',
      itemDefinitionId:p.offeredDefinitionId,price:p.price})};
  }
  if(state.pending?.type==='buy')
    return resolveStagedBuyFixture(state,catalog,{labOnly,fixtureDrawDefinitionId});
  if(state.pending?.type==='exchange'){
    const p=state.pending;
    return {...runEffectQueueFixture(state,catalog,[
      {type:'spend',playerId:p.originalAttackerId,instanceIds:[p.exchangeInstanceId]},
      {type:'exchange',playerId:p.originalAttackerId},
      {type:'refill'},
      {type:'advance',afterId:p.originalAttackerId}
    ],{labOnly:true,fixtureDrawDefinitionId}),
      plan:Object.freeze({type:'exchange',allocation:{...p.allocation}})};
  }
  const family=attackFamily(state,catalog);
  if(family==='miracle')
    return resolveSoloMiracleFixture(state,catalog,{labOnly:true,fixtureDrawDefinitionId,deflectRng});
  return resolveRedirectFixture(state,catalog,{
    labOnly:true,fixtureDrawDefinitionId,deflectRng
  });
}
/**
 * Turn the authenticated input into a new state, resolving automatically as
 * far as possible. One call can produce a pending defense, a redirect to a new
 * defender, a completed turn, or finished match.
 *
 * IMPORTANT: events are internal audit/debug data only. A real transport must
 * use viewStagingRoom(state, authenticatedSeatId), not broadcast these events
 * or the full authoritative state.
 */
export function submitAndResolveFixture(state,command,catalog,{
  authorizedSeatId,labOnly=false,fixtureDrawDefinitionId,deflectRng=null
}={}){
  if(labOnly!==true)fail('Only available in lab fixture mode');
  if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
    fail('Unknown fixture draw card');
  const stage=applyStagingCommand(state,command,catalog,{authorizedSeatId});
  if(stage.duplicate)
    return {state:stage.state,applied:false,duplicate:true,autoResolved:false,
      events:[],plan:null};
  // Attack selection must be validated BEFORE asking another seat to defend.
  // Otherwise a bad combo or MP deficit can strand both players in a
  // pending-defense state with no way to correct the attack.
  let stagedState=stage.state;
  if(stage.state.phase==='defense' &&
    ['playCards','playSequence','castLearned'].includes(command.type)) {
    if(attackFamily(stage.state,catalog)==='weapon'){
      const compiled=compileOrderedWeaponAttack(stage.state,catalog);
      // Preview-only, not attackContext: the latter means the opening
      // cards have ALREADY been spent when the first hit resolves.
      if(stage.state.rulesetId==='mirage-multiplayer-research-fixture-v2'&&
         stage.state.players.length>2&&compiled.mirageCount>0){
        stagedState={...stage.state,pending:{...stage.state.pending,
          miragePreview:{rounds:compiled.mirageCount,
            hitsPerTarget:compiled.hitCount/compiled.mirageCount}}};
      }
    }
    else {
      // Preview the solo miracle against an empty defensive declaration.
      // It validates opening card, learned status and MP without committing
      // damage or consuming the defender's actual cards.
      const p=stage.state.pending;
      const preview={...stage.state,phase:'resolving',
        pending:{...p,defense:{playerId:p.targetId,instanceIds:[]}}};
      compileSoloMiracleResolution(preview,catalog);
    }
  }
  if(stage.state.phase==='tradeDefense'&&command.type==='declareSale')
    validateSaleDeclarationFixture(stage.state,catalog);
  if(stagedState.phase!=='resolving')
    return {state:stagedState,applied:true,duplicate:false,autoResolved:false,
      events:[],plan:null};
  const resolved=resolveStagedFixture(stage.state,catalog,{
    labOnly:true,fixtureDrawDefinitionId,deflectRng
  });
  return {...resolved,applied:true,duplicate:false,autoResolved:true};
}
