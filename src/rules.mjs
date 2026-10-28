/**
 * 原作参照型カード対戦のルール検証モジュール。未実装の効果は推測で補わない。
 * データ来源: docs/SOURCE_LEDGER.md。ゲーム完成版ではありません。
 *
 * Cards are data objects. This module deliberately uses generic card IDs and
 * test-only fixtures; no third-party art/assets/text are bundled.
 */
export const STARTING_STATS = Object.freeze({hp: 40, mp: 10, money: 20});
export const INITIAL_HAND_SIZE = 9;
export const MAX_HAND_SIZE = 18;
export const MAX_RESOURCE_VALUE = 99;
export const MAX_LEARNED_MIRACLES = 6;

export const ELEMENTS = Object.freeze([
  'none', 'fire', 'water', 'wood', 'earth', 'light', 'dark'
]);

/** Wiki (2025-09-19) table. A defense's matching property is independent
 *  of its guard strength. Light attacks bypass all normal attribute shields.
 */
export const ALLOWED_SHIELD_ELEMENTS = Object.freeze({
  none: Object.freeze([...ELEMENTS]),
  fire: Object.freeze(['water', 'light']),
  water: Object.freeze(['fire', 'light']),
  wood: Object.freeze(['earth', 'light']),
  earth: Object.freeze(['wood', 'light']),
  light: Object.freeze([]),
  dark: Object.freeze([...ELEMENTS])
});

/** 500-slot 7-element/category distribution; not a complete 353-card catalog. */
export const CATEGORY_DISTRIBUTION = Object.freeze({
  trade: Object.freeze([60,0,0,0,0,0,0]),
  weapon_single: Object.freeze([110,9,7,7,5,7,7]),
  weapon_area: Object.freeze([0,4,4,3,3,3,1]),
  armor_normal: Object.freeze([101,10,8,8,7,2,0]),
  armor_ring: Object.freeze([2,1,1,1,1,1,1]),
  armor_other: Object.freeze([4,0,0,0,0,0,0]),
  miracle: Object.freeze([11,4,5,2,2,4,2]),
  item: Object.freeze([92,0,0,0,0,0,0])
});

const ELEMENTAL_FOUR = new Set(['fire','water','wood','earth']);
function assertElement(e) {
  if (!ELEMENTS.includes(e)) throw new TypeError(`Unknown element: ${e}`);
}
function nonnegativeInt(v, label) {
  if (!Number.isInteger(v) || v < 0) throw new RangeError(`${label} must be a nonnegative integer`);
}
export function canBlock(attackElement, shieldElement, {rainbowCurtain=false}={}) {
  assertElement(attackElement);
  assertElement(shieldElement);
  if (rainbowCurtain && attackElement !== 'none') attackElement='none';
  return ALLOWED_SHIELD_ELEMENTS[attackElement].includes(shieldElement);
}
/** Mixing attack elements. 'Dye' overrides if supplied; other extra-card
 * effect order is not inferred here. */
export function combineElements(a, b, {dye=null}={}) {
  assertElement(a); assertElement(b);
  if (dye !== null) { assertElement(dye); return dye; }
  if (a === b) return a;
  if (a === 'light' && ELEMENTAL_FOUR.has(b)) return b;
  if (b === 'light' && ELEMENTAL_FOUR.has(a)) return a;
  return 'none';
}
/** Calculate damage. Include armor as a sum of valid shields only.
 * No silent capping at HP or addition of unverified extra effects.
 */
export function calculateHit({attack, element='none', armor=0, hp=STARTING_STATS.hp, rainbowCurtain=false}) {
  nonnegativeInt(attack, 'attack'); nonnegativeInt(armor,'armor');
  nonnegativeInt(hp,'hp'); assertElement(element);
  const effectiveElement = rainbowCurtain ? 'none' : element;
  const damage = Math.max(0, attack - armor);
  // Dark-element damage of at least 1 causes instant defeat.
  const instantDefeat = effectiveElement === 'dark' && damage > 0;
  const hpAfter = instantDefeat ? 0 : Math.max(0, hp - damage);
  return Object.freeze({damage, instantDefeat, hpAfter, effectiveElement});
}
/** Validate and sum the selected shields; attacks made on oneself cannot be defended. */
export function sumLegalArmor(attackElement, shields, {selfTarget=false,rainbowCurtain=false}={}) {
  assertElement(attackElement);
  if (!Array.isArray(shields)) throw new TypeError('shields must be array');
  if (selfTarget && shields.length) throw new Error('Self-target attacks cannot be defended');
  return shields.reduce((total, shield) => {
    if (!shield || typeof shield !== 'object') throw new TypeError('shield must be object');
    nonnegativeInt(shield.guard,'shield.guard');
    if (!Number.isSafeInteger(shield.guard)) throw new RangeError('shield.guard must be a safe integer');
    if (!canBlock(attackElement,shield.element,{rainbowCurtain})) {
      throw new Error(`incompatible shield: ${shield.element} against ${attackElement}`);
    }
    if (total > Number.MAX_SAFE_INTEGER - shield.guard)
      throw new RangeError('Total shield guard overflow');
    return total + shield.guard;
  }, 0);
}
/** Random draws are WITH replacement. All probabilities are integer slots, not a shrinking pile.
 * Requires fully audited card catalog to model original actual odds.
 */
export function drawWeighted(catalog, rng=Math.random) {
  if (!Array.isArray(catalog) || !catalog.length) throw new Error('catalog is empty');
  let total=0;
  for (const card of catalog) {
    if (!Number.isInteger(card.weight) || card.weight <= 0) throw new RangeError('invalid weight');
    total += card.weight;
  }
  const n = rng();
  if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError('rng must return [0,1)');
  let cursor=n*total;
  for (const card of catalog) {
    cursor -= card.weight;
    if (cursor < 0) return card;
  }
  throw new Error('unreachable draw');
}
export function totalSlots(distribution=CATEGORY_DISTRIBUTION) {
  return Object.values(distribution).flat().reduce((s,n)=>s+n,0);
}
export function refillHand(hand, count, draw) {
  if (!Array.isArray(hand) || typeof draw !== 'function') throw new TypeError('invalid refill arguments');
  nonnegativeInt(count,'count');
  if (hand.length > MAX_HAND_SIZE) throw new RangeError('hand exceeds cap');
  const next=[...hand];
  for (let i=0; i<count && next.length<MAX_HAND_SIZE; i++) next.push(draw());
  return next;
}
export function initialHand(draw) { return refillHand([], INITIAL_HAND_SIZE, draw); }
/** A newly used miracle becomes learned and may be recast with sufficient MP;
 * on the seventh learned miracle the earliest is forgotten.
 */
export function learnMiracle(learned, miracleId) {
  if (!Array.isArray(learned) || !miracleId) throw new TypeError('invalid miracle');
  if (learned.includes(miracleId)) return [...learned];
  const next=[...learned, miracleId];
  return next.slice(-MAX_LEARNED_MIRACLES);
}
export function payMiracle(mp, cost) {
  nonnegativeInt(mp,'mp'); nonnegativeInt(cost,'cost');
  if (mp < cost) throw new Error('Not enough MP');
  return mp-cost;
}
/** Paid price is taken in money -> MP -> HP order. Remaining shortfall after
 * hitting 0 HP is not represented as a negative resource. No seller rewards
 * are calculated here (max-resource and transfer corner cases unverified). */
export function payForcedSale({hp,mp,money}, price) {
  nonnegativeInt(price,'price');
  [hp,mp,money].forEach((v)=>nonnegativeInt(v,'resource'));
  let due=price;
  let paidMoney=Math.min(money,due);money-=paidMoney;due-=paidMoney;
  let paidMp=Math.min(mp,due);mp-=paidMp;due-=paidMp;
  let paidHp=Math.min(hp,due);hp-=paidHp;due-=paidHp;
  return {buyer:{hp,mp,money},paid:{hp:paidHp,mp:paidMp,money:paidMoney},unpaid:due};
}
/** Return only new attack source/target; multi-reflection engine TBD. */
export function reflectTarget({source,target,actor,mode,living,rng=Math.random}) {
  if (!Array.isArray(living) || !living.includes(actor)) throw new Error('actor must be alive');
  if (source===target && actor===target) throw new Error('self-hit cannot react');
  if (actor!==target) throw new Error('only attack target may react');
  if (mode==='reflect') return {source:actor,target:source};
  if (mode==='deflect') {
    const n=rng(); if(n<0||n>=1||!Number.isFinite(n)) throw new RangeError('bad rng');
    return {source:actor,target:living[Math.floor(n*living.length)]};
  }
  throw new Error('invalid reaction mode');
}
