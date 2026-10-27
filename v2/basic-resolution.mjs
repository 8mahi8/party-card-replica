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
import {canBlock, combineElements, calculateHit, MAX_HAND_SIZE} from '../src/rules.mjs';
import {runEffectQueueFixture} from './effect-runner.mjs';

const MAX_ATTACK=Number.MAX_SAFE_INTEGER;
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
function safeAdd(a,b) {
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0||
     a>MAX_ATTACK-b)fail('Invalid accumulated attack or defense');
  return a+b;
}
function getPlayer(state,id) {
  const player=state.players.find(p=>p.id===id);
  if(!player)fail('Unknown player');
  return player;
}
function explainDefenseEffect(def) {
  for(const e of def.effects) {
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
  if(!state?.pending?.attackInstanceIds?.length)fail('No weapon selected');
  const attacker=getPlayer(state,state.pending.originalAttackerId);
  const attacking=locateHandCards(attacker,state.pending.attackInstanceIds,catalog);
  if(attacking[0].def.family!=='weapon')
    fail('Basic resolution requires weapon first');
  let attack=0,element='none',mainCount=0,weaponCount=0;
  for(const {def} of attacking) {
    const weapon=def.family==='weapon';
    if(weapon) {
      if(!def.playModes.some(m=>m==='mainAttack'||m==='addAttack'))
        fail('Weapon cannot attack');
      mainCount+=Number(def.playModes.includes('mainAttack'));
      if(mainCount>1)fail('Too many main weapons');
      element=weaponCount===0?def.element:combineElements(element,def.element);
      weaponCount++;
    } else if(!(def.family==='armor'&&def.playModes.includes('addAttack'))) {
      fail('Unsupported attack combination; miracle and special combos belong to later G3');
    }
    explainAttackEffects(def);
    attack=safeAdd(attack,def.stats.attack);
  }
  if(!weaponCount)fail('No attacking weapon');
  return Object.freeze({attack,element,attackKind:'weapon',
    instanceIds:Object.freeze(attacking.map(x=>x.instance.instanceId))});
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
    defending=locateHandCards(defender,p.defense.instanceIds,catalog);
  }
  let armor=0,stripElement=false;
  for(let i=0;i<defending.length;i++) {
    const {def}=defending[i];
    if(!def.playModes.includes('defend'))fail('Unsupported defense selection');
    explainDefenseEffect(def);
    const strip=def.effects.some(e=>e.type==='stripElement');
    if(strip&&i!==0)fail('Attribute remover must be first');
    if(strip){stripElement=true;continue;}
    if(!['weapon','armor'].includes(def.family))
      fail('Unsupported defense item without guard');
    // Defensive item's stop-against-miracle effect is inert vs ordinary weapon.
    // Element shields are computed below, after any attribute removal.
    armor=safeAdd(armor,def.stats.guard);
  }
  for(const {def} of defending) {
    if(def.effects.some(e=>e.type==='stripElement'))continue;
    if(!canBlock(element,def.element,{rainbowCurtain:stripElement}))
      fail('Illegal shield for attack element');
  }
  const hit=calculateHit({attack,element,armor,hp:defender.hp,rainbowCurtain:stripElement});
  const queue=Object.freeze([
    ...(p.attackContext?[]:[Object.freeze({type:'spend',playerId:attacker.id,instanceIds:attackContext.instanceIds})]),
    ...(isSelf?[]:[Object.freeze({type:'spend',playerId:defender.id,instanceIds:Object.freeze(defending.map(x=>x.instance.instanceId))})]),
    Object.freeze({type:'hit',targetId:defender.id,damage:hit.damage,hpAfter:hit.hpAfter,instantDefeat:hit.instantDefeat}),
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
