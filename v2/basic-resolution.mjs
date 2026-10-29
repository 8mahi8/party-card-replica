/**
 * V2 G3, PART 1: pure compile/resolve for reference-backed BASIC weapon combat.
 *
 * Deliberately restricted to a laboratory fixture-draw mode. This code NEVER
 * claims that drawing a constant card models the original 353/500 distribution.
 * Do not expose the draw ID as a live player's option.
 *
 * Combat effects outside this small supported subset are rejected, not silently
 * ignored: miracles, reflection/deflection, angel-stoppers vs miracles,
 * statuses, currencies, wider attack, and any unreviewed effect combos.
 */
import {sumLegalArmor, calculateHit, MAX_HAND_SIZE} from '../src/rules.mjs';
import {runEffectQueueFixture} from './effect-runner.mjs';
import {compileOrderedWeaponAttack,queuedAttackCosts} from './ordered-attack.mjs';

function fail(message) { throw new Error(message); }
function catalogDef(catalog,instance) {
  if(!instance || typeof instance.instanceId!=='string')
    fail('Malformed card instance');
  const d=catalog.get(instance.definitionId);
  if(!d)fail('Unknown card definition');
  return d;
}
function locateHandCards(player,orderedIds,catalog) {
  if(!Array.isArray(orderedIds)||new Set(orderedIds).size!==orderedIds.length)
    fail('Invalid ordered selection');
  return orderedIds.map(instanceId=>{
    const instance=player.hand.find(c=>c.instanceId===instanceId);
    if(!instance)fail('Card not present in hand');
    return {instance,def:catalogDef(catalog,instance)};
  });
}
function getPlayer(state,id) {
  const player=state.players.find(p=>p.id===id);
  if(!player)fail('Unknown player');
  return player;
}
function explainDefenseEffect(def) {
  for(const e of def.effects) {
    if(e.when==='onDefense'&&
       (e.type==='redirectAttack'||e.type==='stopAttack')&&
       e.params.scope==='miracle'){
      // Armor with a printed guard still has numeric protection. A weapon
      // whose ONLY defense is a miracle reaction is not a physical shield.
      if(def.family==='weapon'&&def.stats.guard===0)
        fail('Miracle-only weapon reaction cannot guard an ordinary weapon');
      continue;
    }
    if(e.type==='redirectAttack')fail('Redirect reactions require G3 reaction resolver');
    if(e.type==='stripElement')continue;
    if(e.type==='stopAttack'&&e.params.scope==='miracle')continue; // numeric guard against weapon
    fail('Unsupported defense effect: '+e.type);
  }
}
function explainAttackEffects(def) {
  for(const e of def.effects) {
    // These special effects are only used in defense, and do not activate in attack.
    if(e.type==='redirectAttack'&&e.when==='onDefense')continue;
    if(e.type==='stopAttack'&&e.when==='onDefense')continue;
    fail('Unsupported attack effect: '+e.type);
  }
}
/**
 * Pure weapon attack compiler. Chained reflections preserve this calculated
 * immutable payload rather than reselecting cards already consumed.
 */
export function compileBasicWeaponAttack(state,catalog) {
  return compileOrderedWeaponAttack(state,catalog);
}

/**
 * Compile an already-staged order of card instances into a deterministic plan.
 * Compiling DOES NOT spend cards or roll RNG. Can be called to validate legal
 * actions after defending, before committing any state changes.
 */
export function compileBasicResolution(state,catalog) {
  if(!(catalog instanceof Map)||!catalog.size)fail('Missing catalog');
  if(!state||state.schemaVersion!==2||state.phase!=='resolving'||!state.pending||
     state.pending.type!=='attack')fail('Not a pending basic attack');
  const p=state.pending;
  const attacker=getPlayer(state,p.originalAttackerId),defender=getPlayer(state,p.targetId);
  if(attacker.hp<=0||defender.hp<=0)fail('Actor or target is dead');
  const attackContext=p.attackContext??compileBasicWeaponAttack(state,catalog);
  const {attack,element}=attackContext;
  if(attackContext.attackKind!=='weapon'||!Number.isSafeInteger(attack)||attack<0)
    fail('Unsupported cached attack payload');
  const isSelf=(p.sourceId??p.originalAttackerId)===defender.id;
  let defending=[];
  if(isSelf) {
    if(p.defense!==null)fail('Self-target cannot defend');
  } else {
    if(!p.defense||p.defense.playerId!==defender.id)fail('Defense not submitted');
    if(p.defense.learnedDefinitionId!==undefined)fail('Learned defensive miracle requires dedicated resolver');
    defending=locateHandCards(defender,p.defense.instanceIds,catalog);
  }
  let stripElement=false;
  const physicalShields=[];
  for(let i=0;i<defending.length;i++) {
    const {def}=defending[i];
    if(!def.playModes.includes('defend'))fail('Unsupported defense selection');
    explainDefenseEffect(def);
    const strip=def.effects.some(e=>e.type==='stripElement');
    if(strip&&i!==0)fail('Attribute remover must be first');
    if(strip){stripElement=true;continue;}
    if(!['weapon','armor'].includes(def.family))
      fail('Unsupported defense item without guard');
    physicalShields.push({guard:def.stats.guard,element:def.element});
  }
  // All ordinary shield arithmetic and element legality lives in ONE
  // source-backed pure rules helper (also used for solo miracles).
  const armor=sumLegalArmor(element,physicalShields,{rainbowCurtain:stripElement});
  const hit=calculateHit({attack,element,armor,hp:defender.hp,rainbowCurtain:stripElement});
  // Exact lethality-vs-charm ordering is not confirmed for absorbing weapons.
  if(attackContext.absorbsHp && !isSelf && hit.hpAfter===0 &&
     defender.hand.some(c=>catalog.get(c.definitionId)?.effects.some(e=>
       e.when==='onZeroHp'&&e.type==='reviveAtZeroHp')))
    fail('Absorption against a fatal Sun Charm recovery requires original timing verification');
  const queue=Object.freeze([
    ...(p.attackContext?[]:queuedAttackCosts(attackContext,attacker.id)),
    ...(isSelf?[]:[Object.freeze({type:'spend',playerId:defender.id,instanceIds:Object.freeze(defending.map(x=>x.instance.instanceId))})]),
    Object.freeze({type:'hit',targetId:defender.id,damage:hit.damage,hpAfter:hit.hpAfter,instantDefeat:hit.instantDefeat,
       ...(attackContext.absorbsHp?{lifeSteal:true}:{})}),
    Object.freeze({type:'refill',order:'seating',maxHand:MAX_HAND_SIZE}),
    Object.freeze({type:'advance',afterId:attacker.id})
  ]);
  return Object.freeze({
    originalAttackerId:attacker.id,targetId:defender.id,
    attack,element,armor,stripElement,
    hit,queue
  });
}
/**
 * Resolve the already validated basic plan through the same effect runner
 * used by miracle casts. Draws remain fixed only in explicit test mode.
 */
export function resolveBasicFixture(state,catalog,options={}) {
  if(options.labOnly!==true)fail('Only available in lab fixture mode');
  if(!catalog.has(options.fixtureDrawDefinitionId))fail('Unknown fixture draw card');
  const plan=compileBasicResolution(state,catalog);
  const result=runEffectQueueFixture(state,catalog,plan.queue,options);
  return {...result,plan};
}
