import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {attachDreamAppearanceFixture,validateDreamOwnershipFixture} from '../v2/dream-appearance.mjs';
import {auditDreamResearchCatalogFixture,dreamLabTimingSignatureFixture,
 dreamResearchClassificationFixture,dreamSourceExclusionFixture} from '../v2/dream-candidate-audit.mjs';
const {byId:catalog,summary}=migrateLegacyCatalog();
const get=id=>catalog.get(id);
const sourceImmunes=['w020','i001','i002','i003','i004'];
test('2026-source listed unique artifacts are excluded even if modes match',()=>{
 for(const id of sourceImmunes){
  assert.equal(dreamSourceExclusionFixture(get(id)),'source-unique-timing',id);
  assert.equal(dreamResearchClassificationFixture(get(id)).status,'source-excluded');
 }
});
test('all researched trades and miracles are source-excluded from Dream',()=>{
 for(const def of catalog.values()){
  if(['trade','miracle'].includes(def.family)){
   assert.equal(dreamSourceExclusionFixture(def),'source-trade-or-miracle',def.id);
   assert.equal(dreamResearchClassificationFixture(def).status,'source-excluded');
  }
 }
});
test('passive Sun Charm stays under further review rather than falsely called immune',()=>{
 const info=dreamResearchClassificationFixture(get('i005'));
 assert.equal(info.status,'needs-rule-review');
 assert.equal(info.reason,'nonstandard-or-passive-timing');
 assert.equal(dreamSourceExclusionFixture(get('i005')),null);
});
test('ordinary weapon group is a conservative signature, not an original draw pool',()=>{
 assert.equal(dreamLabTimingSignatureFixture(get('w003')),
   dreamLabTimingSignatureFixture(get('w016')));
 assert.equal(dreamLabTimingSignatureFixture(get('w018')),
   dreamLabTimingSignatureFixture(get('w003')));
 assert.notEqual(dreamLabTimingSignatureFixture(get('w020')),
   dreamLabTimingSignatureFixture(get('w003')));
 assert.notEqual(dreamLabTimingSignatureFixture(get('a001')),
   dreamLabTimingSignatureFixture(get('w003')));
});
test('2026-source immune Homura artifact cannot be disguised as an ordinary guard-weapon',()=>{
 const s=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['w020','w005']},
  {id:'B',handDefinitionIds:['d001']}
 ],firstSeatId:'A'},catalog);
 // Legacy conservative signature alone did not know that the unique-timing
 // Homura artifact was source-immune. This is a regression guard.
 assert.equal(dreamLabTimingSignatureFixture(get('w020')),
   dreamLabTimingSignatureFixture(get('w005')));
 for(const [index,visual] of [[0,'w005'],[1,'w020']])
  assert.throws(()=>attachDreamAppearanceFixture(s,catalog,{
    seatId:'A',instanceId:s.players[0].hand[index].instanceId,
    appearsAsDefinitionId:visual
  }),/verified usable timing/);
});
test('forged Dream reference to source-immune Homura is rejected on both view and settlement audit',()=>{
 const s=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['w020']},
  {id:'B',handDefinitionIds:['d001']}
 ],firstSeatId:'A'},catalog);
 const forged={...s,players:s.players.map(p=>p.id==='A'?{
   ...p,dreamDisguises:[{instanceId:p.hand[0].instanceId,
     appearsAsDefinitionId:'w005'}]
 }:p)};
 assert.throws(()=>viewStagingRoom(forged,'A',catalog),/Dream presentation timing mismatch/);
 assert.throws(()=>validateDreamOwnershipFixture(forged,catalog),/Dream appearance timing mismatch/);
 assert.equal(s.players[0].hand[0].definitionId,'w020');
});
test('catalog audit is deterministic, frozen and labels all 118 cards without claiming completion',()=>{
 const a=auditDreamResearchCatalogFixture(catalog),b=auditDreamResearchCatalogFixture(catalog);
 assert.deepEqual(a,b);
 assert.equal(a.complete,false);
 assert.equal(a.randomizationReady,false);
 assert.equal(a.kind,'partial-reference-audit-only');
 assert.equal(a.cardCount,summary.unique);
 assert.equal(a.partialWeight,summary.slots);
 assert.equal(a.cardCount,118);
 assert.equal(a.partialWeight,307);
 assert.equal(a.sourceExcluded,19);
 assert.equal(a.needsRuleReview,1);
 assert.equal(a.sourceExcluded+a.needsRuleReview+a.pairedLabCards+a.unpairedLabCards,118);
 assert.equal(Object.isFrozen(a),true);
 assert.equal(Object.isFrozen(a.rows),true);
 assert.equal(Object.isFrozen(a.groups),true);
 assert.equal(JSON.stringify(a).includes('probability'),false);
});
test('subset singleton is not evidence that original artifact is Dream immune',()=>{
 const a=auditDreamResearchCatalogFixture(catalog);
 assert.ok(a.unpairedLabCards>=1);
 const singleton=a.rows.find(r=>r.status==='lab-classifiable'&&r.partialPeerCount===0);
 assert.ok(singleton);
 assert.equal(singleton.status,'lab-classifiable');
 assert.equal(singleton.reason,null);
 assert.equal(singleton.drawWeight,get(singleton.id).drawWeight);
});
test('partial group weights are only audit totals; group includes each source id at most once',()=>{
 const a=auditDreamResearchCatalogFixture(catalog);
 const seen=new Set();
 for(const group of a.groups){
  assert.equal(group.memberIds.length,group.partialMemberCount);
  assert.equal(group.partialWeight,group.memberIds.reduce(
   (sum,id)=>sum+get(id).drawWeight,0));
  assert.equal(Object.isFrozen(group),true);
  for(const id of group.memberIds){
   assert.equal(seen.has(id),false,id);
   seen.add(id);
  }
 }
 assert.equal(seen.size,a.pairedLabCards+a.unpairedLabCards);
 const typical=a.groups.find(g=>g.memberIds.includes('w003'));
 assert.ok(typical.memberIds.includes('w016'));
 assert.ok(!typical.memberIds.includes('w020'));
});
test('including more catalog entries changes group count but never changes source-exempt policy',()=>{
 const clone=new Map(catalog);
 const extra={...get('w003'),id:'source-test-extra'};
 clone.set(extra.id,extra);
 const before=auditDreamResearchCatalogFixture(catalog);
 const after=auditDreamResearchCatalogFixture(clone);
 assert.equal(after.cardCount,before.cardCount+1);
 assert.equal(after.partialWeight,before.partialWeight+get('w003').drawWeight);
 assert.equal(after.sourceExcluded,before.sourceExcluded);
 assert.equal(after.rows.find(x=>x.id==='w020').status,'source-excluded');
});
test('audit fails closed for bad keys, absent catalog and bad weights',()=>{
 assert.throws(()=>auditDreamResearchCatalogFixture(null),/nonempty catalog/);
 assert.throws(()=>auditDreamResearchCatalogFixture(new Map()),/nonempty catalog/);
 assert.throws(()=>auditDreamResearchCatalogFixture(new Map([
  ['incorrect',get('w003')]])),/key mismatch/);
 assert.throws(()=>dreamResearchClassificationFixture({
   ...get('w003'),drawWeight:0
 }),/Invalid Dream candidate/);
});
test('report never mutates catalog definitions, RNG, card instances or original room',()=>{
 const s=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['w003','w016']},
  {id:'B',handDefinitionIds:['d001']}
 ],firstSeatId:'A',rngSeed:157},catalog);
 const before=JSON.stringify(s);
 const weight=summary.slots;
 const snapshot=JSON.stringify([...catalog].map(([id,d])=>[id,d]));
 for(let i=0;i<3;i++)auditDreamResearchCatalogFixture(catalog);
 assert.equal(JSON.stringify(s),before);
 assert.equal(JSON.stringify([...catalog].map(([id,d])=>[id,d])),snapshot);
 assert.equal(summary.slots,weight);
});
