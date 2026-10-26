/**
 * Versioned card-data audit. This module does NOT contain the real 353 cards.
 * Default reference matrix is from the 2025-09-19 AtWiki table, which
 * disagrees with other community sources; never infer 2026 live odds from it.
 */
import {CATEGORY_DISTRIBUTION, ELEMENTS, totalSlots, drawWeighted} from './rules.mjs';

export const REFERENCE_DISTRIBUTION_VERSION = 'atwiki-2025-09-19';

/**
 * Each card record must have {id,category,element,weight}; category keys
 * match CATEGORY_DISTRIBUTION and weight is an integer number of 500 slots.
 * Empty and partial arrays are valid audits; complete is true only if
 * card count, aggregate weight, and every matrix cell match the reference.
 */
export function auditCatalog(cards, {
  distribution=CATEGORY_DISTRIBUTION,
  expectedUnique=353,
  expectedSlots=500,
}={}) {
  if(!Array.isArray(cards))throw new TypeError('cards must be an array');
  if(!Number.isInteger(expectedUnique)||expectedUnique<1||!Number.isInteger(expectedSlots)||expectedSlots<1)throw new RangeError('invalid expected totals');
  const categories=Object.keys(distribution);
  const counts=Object.fromEntries(categories.map(c=>[c,new Array(ELEMENTS.length).fill(0)]));
  const ids=new Set();
  let slots=0;
  for(const card of cards) {
    if(!card || typeof card.id!=='string'||!card.id || ids.has(card.id))throw new Error('empty or duplicate card id');
    ids.add(card.id);
    if(!categories.includes(card.category)) throw new Error(`Unknown category: ${card.category}`);
    const col=ELEMENTS.indexOf(card.element);
    if(col<0) throw new Error(`Unknown element: ${card.element}`);
    if(!Number.isInteger(card.weight)||card.weight<1) throw new Error(`Invalid weight for ${card.id}`);
    counts[card.category][col]+=card.weight;
    slots+=card.weight;
  }
  const mismatches=[];
  for(const category of categories) {
    const expected=distribution[category];
    if(!Array.isArray(expected)||expected.length!==ELEMENTS.length || expected.some(n=>!Number.isInteger(n)||n<0)) throw new Error('Invalid reference matrix');
    for(let i=0;i<ELEMENTS.length;i++) {
      if(counts[category][i]!==expected[i])
        mismatches.push({category,element:ELEMENTS[i],expected:expected[i],actual:counts[category][i],delta:counts[category][i]-expected[i]});
    }
  }
  const refSlots=totalSlots(distribution);
  return {
    source:REFERENCE_DISTRIBUTION_VERSION,
    unique:cards.length,
    slots,
    referenceSlots:refSlots,
    expectedUnique,
    expectedSlots,
    complete:cards.length===expectedUnique && slots===expectedSlots &&
      refSlots===expectedSlots && mismatches.length===0,
    mismatches
  };
}
export function assertCompleteCatalog(cards,options={}) {
  const audit=auditCatalog(cards,options);
  if(!audit.complete)
    throw new Error(`Catalog incomplete: ${audit.unique}/${audit.expectedUnique} kinds, ${audit.slots}/${audit.expectedSlots} slots, ${audit.mismatches.length} matrix differences`);
  return audit;
}

/** Never normalize incomplete card sets into an apparently "real" deck.
 * This checks structural totals, not authenticity of each source value.
 */
export function createAuditedDraw(cards, options={}) {
  assertCompleteCatalog(cards,options);
  return (rng=Math.random)=>drawWeighted(cards,rng);
}
