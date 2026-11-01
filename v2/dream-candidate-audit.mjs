/**
 * V2 Dream research taxonomy / audit only. Not a draw or disguise RNG.
 *
 * Source: https://macarongamemo.com/entry/godfield-dream (2026-04-05)
 * The FULL deck, usable-timing rules and candidate weights are required
 * before the original's ~50% disguise chance can be simulated.
 *
 * Per the source, these known reference cards are immune to Dream's
 * misidentification even when their generic playModes resemble others.
 * IDs are stable definitions in the researched PARTIAL catalog, not card
 * names or runtime battle-effect branches.
 */
const SOURCE_IMMUNE_IDS=Object.freeze({
 'w020':'source-unique-timing', // ほむら巻き
 'i001':'source-unique-timing', // 虹のカーテン
 'i002':'source-unique-timing', // スーパーミラー
 'i003':'source-unique-timing', // 精霊のぬいぐるみ
 'i004':'source-unique-timing'  // ちからの粉
});
function fail(m){throw new Error(m);}
function valid(def){
 if(!def||typeof def.id!=='string'||!Array.isArray(def.playModes)||
    !Array.isArray(def.effects)||!def.stats||
    !Number.isSafeInteger(def.drawWeight)||def.drawWeight<1)
   fail('Invalid Dream candidate card definition');
}
/**
 * Conservative lab signature: an upper bound on which cards may be
 * manually disguised in a research fixture. The original can have broader
 * groups sharing *timing* but not their reaction *effect*, e.g. stop/reflect.
 */
export function dreamLabTimingSignatureFixture(def){
 valid(def);
 const effects=def.effects.filter(e=>e.when==='onDefense')
   .map(e=>[e.type,e.params?.mode??null,e.params?.scope??null])
   .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return JSON.stringify({
  family:def.family,
  playModes:[...def.playModes].sort(),
  guardUsable:def.stats.guard>0,
  defenseEffects:effects,
  discardPolicy:def.discardPolicy
 });
}
/** Not a claim of a complete original disguise candidate group. */
export function dreamSourceExclusionFixture(def){
 valid(def);
 if(def.family==='trade'||def.family==='miracle')
   return 'source-trade-or-miracle';
 return SOURCE_IMMUNE_IDS[def.id]??null;
}
export function dreamResearchClassificationFixture(def){
 valid(def);
 const reason=dreamSourceExclusionFixture(def);
 if(reason)return Object.freeze({id:def.id,status:'source-excluded',reason,
    labTimingSignature:null});
 if(def.playModes.includes('passive')||def.family==='item'||
    def.playModes.some(x=>!['mainAttack','addAttack','defend','support'].includes(x)))
   return Object.freeze({id:def.id,status:'needs-rule-review',
     reason:'nonstandard-or-passive-timing',labTimingSignature:null});
 return Object.freeze({id:def.id,status:'lab-classifiable',reason:null,
   labTimingSignature:dreamLabTimingSignatureFixture(def)});
}
/**
 * Catalog-wide deterministic RESEARCH REPORT. "has-paired-fixture" means
 * multiple partial definitions share an intentionally strict signature; it
 * does not establish source-original probabilities, eligible true pairs, or
 * that a singleton is truly immune. No sampling / random state is used.
 */
export function auditDreamResearchCatalogFixture(catalog){
 if(!(catalog instanceof Map)||catalog.size===0)
   fail('Dream research audit requires a nonempty catalog');
 const rows=[],groupMap=new Map();
 for(const [id,def] of catalog){
  if(id!==def?.id)fail('Dream research catalog key mismatch');
  const result=dreamResearchClassificationFixture(def);
  const row={...result,drawWeight:def.drawWeight};
  rows.push(row);
  if(result.status==='lab-classifiable'){
   let list=groupMap.get(result.labTimingSignature);
   if(!list){list=[];groupMap.set(result.labTimingSignature,list);}
   list.push(row);
  }
 }
 const groups=[...groupMap.entries()].map(([signature,entries])=>Object.freeze({
    signature,memberIds:Object.freeze(entries.map(x=>x.id)),
    partialWeight:entries.reduce((n,x)=>n+x.drawWeight,0),
    partialMemberCount:entries.length
 })).sort((a,b)=>a.signature.localeCompare(b.signature));
 const byId=new Map();
 const groupBySignature=new Map(groups.map(x=>[x.signature,x]));
 let excluded=0,needsReview=0,grouped=0,unpaired=0;
 for(const row of rows){
  if(row.status==='source-excluded')excluded++;
  else if(row.status==='needs-rule-review')needsReview++;
  else {
   const group=groupBySignature.get(row.labTimingSignature);
   if(!group)fail('Missing Dream research timing group');
   if(group.partialMemberCount>1)grouped++;else unpaired++;
  }
  byId.set(row.id,Object.freeze({
    ...row,
    partialPeerCount:row.labTimingSignature?
      groupBySignature.get(row.labTimingSignature).partialMemberCount-1:0
  }));
 }
 const resultRows=Object.freeze([...byId.values()]);
 const partialWeight=rows.reduce((n,x)=>n+x.drawWeight,0);
 if(!Number.isSafeInteger(partialWeight))fail('Dream research weight overflow');
 return Object.freeze({
   complete:false,randomizationReady:false,
   kind:'partial-reference-audit-only',cardCount:rows.length,
   partialWeight,sourceExcluded:excluded,needsRuleReview:needsReview,
   pairedLabCards:grouped,unpairedLabCards:unpaired,
   groups:Object.freeze(groups),rows:resultRows
 });
}
