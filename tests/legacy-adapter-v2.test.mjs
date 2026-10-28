import test from 'node:test';
import assert from 'node:assert/strict';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';
import {convertLegacyCard,migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {createInstance} from '../v2/foundation.mjs';

const get=(id)=>VERIFIED_BASIC_CARDS.find(c=>c.id===id);
test('entire current current-card partial catalog migrates with exact reference-slot total and no duplicate IDs',()=>{
 const out=migrateLegacyCatalog();
 assert.equal(out.summary.unique,RESEARCH_CATALOG_CONTRACT.unique);assert.equal(out.summary.slots,RESEARCH_CATALOG_CONTRACT.slots);assert.equal(out.summary.complete,false);
 assert.equal(out.byId.size,RESEARCH_CATALOG_CONTRACT.unique);assert.equal(out.definitions.length,RESEARCH_CATALOG_CONTRACT.unique);
});
test('base attack, guard, MP, price, element, weight are preserved for every card',()=>{
 const out=migrateLegacyCatalog();
 for(const c of VERIFIED_BASIC_CARDS){
   const mapped=out.byId.get(c.id);
   assert.equal(mapped.element,c.element,c.id);
   assert.equal(mapped.drawWeight,c.weight,c.id);
   assert.equal(mapped.stats.price,c.price,c.id);
   assert.equal(mapped.stats.mpCost,c.mpCost??0,c.id);
   assert.equal(mapped.stats.attack,c.attack??c.attackBonus??0,c.id);
   assert.equal(mapped.stats.guard,c.guard??0,c.id);
   assert.equal(mapped.source.confidence,'secondary');
 }
});
test('same-type drawn cards have different instance IDs and identical definitions',()=>{
 const migrated=migrateLegacyCatalog();
 const a=createInstance('w006',1,migrated.byId),b=createInstance('w006',2,migrated.byId);
 assert.equal(a.definitionId,b.definitionId);assert.notEqual(a.instanceId,b.instanceId);
});
test('main/extra weapon play mode plus hybrid defending are preserved',()=>{
 assert.deepEqual(convertLegacyCard(get('w016')).playModes,['mainAttack']);
 assert.deepEqual(convertLegacyCard(get('a001')).playModes,['addAttack']);
 assert.deepEqual(convertLegacyCard(get('w005')).playModes,['mainAttack','defend']);
});
test('armor attack bonuses remain additive and do not turn into a main weapon',()=>{
 const c=convertLegacyCard(get('d010'));
 assert.deepEqual(c.playModes,['defend','addAttack']);assert.equal(c.stats.attack,5);assert.equal(c.stats.guard,3);
});
test('reflect/deflect, strip, angel stop and wall effects are typed and sourced',()=>{
 const ref=convertLegacyCard(get('w027')),def=convertLegacyCard(get('w026'));
 assert.deepEqual(ref.effects[0].params,{mode:'reflect',scope:'neutralWeapon'});
 assert.deepEqual(def.effects[0].params,{mode:'deflect',scope:'neutralWeapon'});
 assert.equal(convertLegacyCard(get('i002')).effects[0].params.scope,'any');
 assert.equal(convertLegacyCard(get('i001')).effects[0].type,'stripElement');
 assert.equal(convertLegacyCard(get('d018')).effects[0].params.scope,'miracle');
 assert.equal(convertLegacyCard(get('m001')).effects[0].params.scope,'neutralWeapon');
 assert.deepEqual(convertLegacyCard(get('m007')).effects[0].params,{mode:'deflect',scope:'miracle'});
 assert.deepEqual(convertLegacyCard(get('m007')).playModes,['defend']);
 for(const id of ['d022','d023','d024','d025','d026']){
   assert.deepEqual(convertLegacyCard(get(id)).effects[0].params,{mode:'deflect',scope:'miracle'},id);
 }
 for(const id of ['d027','d028','d029']){
   assert.deepEqual(convertLegacyCard(get(id)).effects[0].params,{mode:'reflect',scope:'miracle'},id);
 }
 assert.throws(()=>convertLegacyCard({...get('d022'),reactionScope:'neutral_weapon'}),/Unmapped armor miracle reaction/);
});
test('miracles can support double weapon, plus attack, casting, and spirit effects',()=>{
 const aura=convertLegacyCard(get('m004'));assert.equal(aura.stats.mpCost,6);
 assert.equal(aura.effects[0].params.factor,2);
 assert.deepEqual(convertLegacyCard(get('m005')).playModes,['cast','addAttack']);
 const spirit=convertLegacyCard(get('i003'));
 assert.equal(spirit.effects[0].type,'waivePreviousMp');
 assert.deepEqual(spirit.playModes,['support']);
});
test('unknown legacy effect or field raises error rather than silently dropping it',()=>{
 assert.throws(()=>convertLegacyCard({...get('w006'),newAbility:'stealHp'}),/Unmapped legacy fields/);
 assert.throws(()=>convertLegacyCard({...get('d018'),stopScope:'unknown'}),/Unmapped armor stop scope/);
 assert.throws(()=>convertLegacyCard({...get('i003'),effect:'executeCode'}),/Unmapped support item effect/);
});
test('malformed cards and duplicate source IDs cannot enter the migrated catalog',()=>{
 assert.throws(()=>migrateLegacyCatalog([{...get('w006')},{...get('w006')}]),/Duplicate definition ID/);
 assert.throws(()=>convertLegacyCard({...get('w006'),weight:-2}),/weight/);
 assert.throws(()=>convertLegacyCard({...get('w006'),attack:-1}),/Malformed weapon/);
 assert.throws(()=>convertLegacyCard({...get('m002'),mpCost:-1}),/Malformed miracle/);
});
test('catalog data remains frozen and audited subset is explicitly not the full game',()=>{
 const out=migrateLegacyCatalog();
 assert.ok(Object.isFrozen(out.definitions));
 assert.ok(Object.isFrozen(out.byId.get('w006')));
 assert.equal(out.summary.complete,false);
 assert.equal(out.summary.source.length>0,true);
});
