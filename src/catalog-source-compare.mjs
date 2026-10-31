/**
 * Diagnostic comparison of SOURCE claims, not the live-deck validator.
 *
 * The official game has NOT confirmed which source version applies.
 * Do not substitute either candidate for auditCatalog() or createAuditedDraw().
 *
 * 2025 wiki (353 kinds, 500 slots, typed 8x7 matrix):
 * https://w.atwiki.jp/piong/pages/16.html
 * 2024 player study (237 kinds, 500 slots, category totals only):
 * https://note.com/penspin_act/n/n0bde7586d68e
 * Independently, a 2026-05 player wiki reports 237 kinds:
 * https://w.atwiki.jp/gfprobab/pages/10.html
 */
import {CATEGORY_DISTRIBUTION,ELEMENTS} from './rules.mjs';

const sum=a=>a.reduce((x,y)=>x+y,0);
export const HISTORICAL_DECK_CLAIMS=Object.freeze([
 Object.freeze({
  key:'wiki-2025-09-19',kinds:353,slots:500,
  groups:Object.freeze({trade:60,weapon:170,armor:148,miracle:30,item:92}),
  source:'https://w.atwiki.jp/piong/pages/16.html'
 }),
 Object.freeze({
  key:'player-study-2024-11-06',kinds:237,slots:500,
  groups:Object.freeze({trade:60,weapon:181,armor:147,miracle:30,item:82}),
  source:'https://note.com/penspin_act/n/n0bde7586d68e'
 })
]);

/**
 * Classify DRAW-POOL probability cells, not game play modes.
 * Rainbow Curtain and Super Mirror are defense_item for interaction,
 * but the 2025 source distribution puts their 3+1 slots under
 * "その他防具" rather than the "雑貨" draw group.
 */
export function probabilityCellOf(card){
 if(!card||typeof card!=='object')throw new TypeError('Card required');
 const category=card.kind==='defense_item'?'armor_other':card.category;
 if(!Object.hasOwn(CATEGORY_DISTRIBUTION,category))
  throw new Error('Unknown probability group '+category);
 if(!ELEMENTS.includes(card.element))
  throw new Error('Unknown probability element '+card.element);
 return Object.freeze({category,element:card.element});
}

/**
 * Compare the SAME partial, version-mixed source catalog against both
 * independently published deck profiles. Do NOT claim 2024 or 2025 is correct.
 * "kindCountPossible" is necessary, NOT sufficient, for authenticity.
 */
export function compareHistoricalDeckClaims(cards,{claims=HISTORICAL_DECK_CLAIMS}={}){
 if(!Array.isArray(cards))throw new TypeError('Card list required');
 const ids=new Set(),actualGroups={trade:0,weapon:0,armor:0,miracle:0,item:0};
 const typed=Object.fromEntries(Object.keys(CATEGORY_DISTRIBUTION).map(
  k=>[k,Object.fromEntries(ELEMENTS.map(e=>[e,0]))]));
 let slots=0;
 for(const card of cards){
  if(typeof card?.id!=='string'||!card.id||ids.has(card.id))
   throw new Error('Empty or duplicate source card ID');
  ids.add(card.id);
  if(!Number.isSafeInteger(card.weight)||card.weight<1)
   throw new Error('Invalid source card weight: '+card.id);
  const {category,element}=probabilityCellOf(card);
  typed[category][element]+=card.weight;
  const group=category.startsWith('weapon_')?'weapon':
   category.startsWith('armor_')?'armor':category;
  actualGroups[group]+=card.weight;
  slots+=card.weight;
 }
 const cellOverflows=[];
 for(const [category,weights] of Object.entries(CATEGORY_DISTRIBUTION))
  for(let i=0;i<ELEMENTS.length;i++){
   const element=ELEMENTS[i],expected=weights[i],actual=typed[category][element];
   if(actual>expected)
    cellOverflows.push(Object.freeze({category,element,expected,actual,
     excess:actual-expected}));
  }
 const comparisons=claims.map(profile=>{
  const remainingSlots=profile.slots-slots;
  const missingKinds=profile.kinds-cards.length;
  const groupRows=Object.entries(profile.groups).map(([group,expected])=>
   Object.freeze({group,actual:actualGroups[group],expected,
    remaining:expected-actualGroups[group]}));
  return Object.freeze({
   key:profile.key,source:profile.source,kinds:profile.kinds,slots:profile.slots,
   missingKinds,remainingSlots,
   maxPossibleKinds:cards.length+Math.max(remainingSlots,0),
   kindCountPossible:missingKinds>=0&&remainingSlots>=missingKinds,
   groupOverflows:Object.freeze(groupRows.filter(r=>r.remaining<0)),
   groupRows:Object.freeze(groupRows),
   ...(profile.key==='wiki-2025-09-19'?
    {typedCellOverflows:Object.freeze(cellOverflows)}:{})
  });
 });
 return Object.freeze({unique:cards.length,slots,
  actualGroups:Object.freeze(actualGroups),
  categoryCells:typed,comparisons:Object.freeze(comparisons)});
}
