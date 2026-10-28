/**
 * V2 ISOLATED SPIKE — no replacement for the production rules engine.
 * Strict card definitions, distinct physical card instances, ordered input,
 * privacy-projected views, revision checks and deterministic RNG.
 * Actual effect resolution and network authentication are NOT implemented.
 */
const FAMILIES = new Set(['weapon','armor','miracle','item','trade']);
const ELEMENTS = new Set(['none','fire','water','wood','earth','light','dark']);
const MODES = new Set(['mainAttack','addAttack','defend','cast','support','trade']);
// Some original artifacts return to the hand and cost HP when discarded.
// Until sourced effects are implemented, explicitly gate those definitions.
const DISCARD_POLICIES = new Set(['ordinary','forbidden','requiresSpecialResolution']);
const EFFECT_TRIGGERS = new Set(['onDeclare','onCost','beforeHit','onDefense','afterHit','onTurnEnd']);
const EFFECT_TYPES = new Set(['redirectAttack','stripElement','multiplyAttack','addAttack','stopAttack','waivePreviousMp','setAttackElement']);

function plainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonnegative(n) { return Number.isSafeInteger(n) && n >= 0; }
function requiredId(id,label='id') {
  if(typeof id !== 'string' || !/^[a-zA-Z0-9._:-]{1,80}$/.test(id))
    throw new TypeError('Invalid '+label);
  return id;
}
function assertAllowed(value,set,label) {
  if(!set.has(value)) throw new Error('Unknown '+label+': '+String(value));
}
function freezeEffect(effect) {
  if(!plainObject(effect)) throw new TypeError('Invalid effect');
  assertAllowed(effect.when,EFFECT_TRIGGERS,'effect timing');
  assertAllowed(effect.type,EFFECT_TYPES,'effect type');
  if(effect.params!==undefined && !plainObject(effect.params))
    throw new TypeError('Invalid effect params');
  // Plain JSON effect parameters. Reject executable values in data.
  const params = effect.params ?? {};
  if(effect.type==='setAttackElement' &&
     (effect.when!=='onDeclare'||Object.keys(params).length!==1||
      !['fire','water'].includes(params.element)))
    throw new Error('Invalid setAttackElement data');
  const json = JSON.stringify(params);
  if(json===undefined || json.length>4000)throw new Error('Effect parameters not serializable');
  const copy = JSON.parse(json);
  if(Object.keys(copy).some(k=>k==='__proto__'||k==='constructor'))
    throw new Error('Unsafe effect params');
  return Object.freeze({when:effect.when,type:effect.type,params:Object.freeze(copy)});
}
/** Normalize and freeze a card definition. Catalog entries are never physical hand cards. */
export function defineCard(spec) {
  if(!plainObject(spec)) throw new TypeError('Card must be object');
  const id=requiredId(spec.id,'definition ID');
  assertAllowed(spec.family,FAMILIES,'card family');
  assertAllowed(spec.element,ELEMENTS,'element');
  if(!Number.isSafeInteger(spec.drawWeight) || spec.drawWeight<1)throw new Error('Invalid draw weight');
  if(!Array.isArray(spec.playModes) || spec.playModes.length===0 ||
     new Set(spec.playModes).size!==spec.playModes.length ||
     spec.playModes.some(mode=>!MODES.has(mode)))throw new Error('Invalid play modes');
  if(!plainObject(spec.stats))throw new TypeError('Missing stats');
  const stats={};
  for(const field of ['attack','guard','mpCost','price']) {
    const value=spec.stats[field] ?? 0;
    if(!nonnegative(value))throw new Error('Invalid stat '+field);
    stats[field]=value;
  }
  if(!plainObject(spec.source)||!spec.source.ruleset || !spec.source.confidence)
    throw new Error('Versioned evidence required');
  const effects=(spec.effects??[]);
  if(!Array.isArray(effects))throw new TypeError('Effects must be array');
  // Hands-on 2025 original-game report: physical weapons cannot be discarded.
  // Special items can also be forbidden or require a sourced resolution.
  const discardPolicy=spec.discardPolicy??(spec.family==='weapon'?'forbidden':'ordinary');
  assertAllowed(discardPolicy,DISCARD_POLICIES,'discard policy');
  if(spec.family==='weapon' && discardPolicy==='ordinary')
    throw new Error('Weapons cannot have ordinary discard policy');
  const normalized={
    id, family:spec.family, element:spec.element, drawWeight:spec.drawWeight,
    discardPolicy,
    stats:Object.freeze(stats), playModes:Object.freeze([...spec.playModes]),
    effects:Object.freeze(effects.map(freezeEffect)),
    source:Object.freeze({ruleset:String(spec.source.ruleset),confidence:String(spec.source.confidence)})
  };
  return Object.freeze(normalized);
}
export function buildCatalog(cards) {
  if(!Array.isArray(cards))throw new TypeError('Card list required');
  const map=new Map();
  for(const input of cards) {
    const def=defineCard(input);
    if(map.has(def.id))throw new Error('Duplicate definition ID '+def.id);
    map.set(def.id,def);
  }
  return map;
}
export function createInstance(definitionId,serial,catalog) {
  requiredId(definitionId,'definition ID');
  if(!Number.isSafeInteger(serial)||serial<1)throw new Error('Invalid instance serial');
  if(!catalog.has(definitionId))throw new Error('Unknown card definition');
  return Object.freeze({instanceId:'ci-'+serial,definitionId});
}
/** Card order is an explicit gameplay input. Indexes are never accepted. */
export function selectInstances(hand,orderedIds) {
  if(!Array.isArray(hand) || !Array.isArray(orderedIds)||!orderedIds.length)
    throw new Error('Missing hand selection');
  if(new Set(orderedIds).size!==orderedIds.length)throw new Error('Repeated card instance');
  return orderedIds.map(id=>{
    requiredId(id,'instance ID');
    const hit=hand.find(x=>x.instanceId===id);
    if(!hit)throw new Error('Selected card not held');
    return hit;
  });
}
/** Strip other players' hands AND internal draw state from the payload. */
export function projectPlayerView(state,viewerId) {
  if(!plainObject(state)||!Array.isArray(state.players))throw new TypeError('Invalid state');
  if(!state.players.some(p=>p.id===viewerId))throw new Error('Unknown viewer');
  return {
    revision:state.revision,phase:state.phase,activePlayerId:state.activePlayerId,
    players:state.players.map(p=>{
      const publicStats={id:p.id,hp:p.hp,mp:p.mp,money:p.money,handCount:p.hand.length};
      return p.id===viewerId
        ? {...publicStats,hand:p.hand.map(c=>({instanceId:c.instanceId,definitionId:c.definitionId}))}
        : publicStats;
    })
  };
}
/** Transport will authenticate the caller and deduplicate command IDs later. */
export function validateCommandEnvelope(state,command) {
  if(!plainObject(command))throw new TypeError('Invalid command');
  requiredId(command.commandId,'command ID');
  requiredId(command.actorId,'actor ID');
  if(!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision!==state.revision)
    throw new Error('Stale room revision');
  if(!state.players.some(p=>p.id===command.actorId))
    throw new Error('Unknown actor');
  if(command.type!=='playCards')throw new Error('Unsupported command');
  const actor=state.players.find(p=>p.id===command.actorId);
  selectInstances(actor.hand,command.orderedInstanceIds);
  return true;
}
/** Pure PRNG sample with state that can be serialized (NOT secret/secure RNG). */
export function drawRandom32(seed) {
  if(!Number.isSafeInteger(seed)||seed<=0||seed>0xffffffff)throw new Error('Invalid RNG seed');
  let x=seed>>>0;
  x^=(x<<13); x^=(x>>>17); x^=(x<<5);
  x>>>=0;
  return Object.freeze({nextSeed:x || 1,value:x/0x100000000});
}
