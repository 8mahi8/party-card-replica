import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCatalog,assertCompleteCatalog,REFERENCE_DISTRIBUTION_VERSION} from '../src/catalog-audit.mjs';
import {CATEGORY_DISTRIBUTION,ELEMENTS} from '../src/rules.mjs';
const fixture=()=>{
 const cards=[];
 for(const [category,weights] of Object.entries(CATEGORY_DISTRIBUTION))
   weights.forEach((weight,i)=>{if(weight)cards.push({id:`c${cards.length}`,category,element:ELEMENTS[i],weight});});
 while(cards.length<353) {
   const card=cards.find(c=>c.weight>1);
   if(!card) throw new Error('cannot split reference matrix into 353 entries');
   card.weight--;
   cards.push({id:`c${cards.length}`,category:card.category,element:card.element,weight:1});
 }
 return cards;
};
test('auditor labels source version and accepts partial audit without pretending complete',()=>{
 const report=auditCatalog([]);
 assert.equal(report.source,REFERENCE_DISTRIBUTION_VERSION);
 assert.equal(report.unique,0);assert.equal(report.slots,0);assert.equal(report.complete,false);
 assert.equal(report.referenceSlots,500);
});
test('valid partial data records its exact cell and total',()=>{
 const r=auditCatalog([{id:'X',category:'trade',element:'none',weight:20}]);
 assert.equal(r.unique,1);assert.equal(r.slots,20);
 assert.equal(r.mismatches.find(x=>x.category==='trade'&&x.element==='none').actual,20);
});
test('duplicate or empty IDs are not allowed',()=>{
 const x={id:'a',category:'trade',element:'none',weight:20};
 assert.throws(()=>auditCatalog([x,x]),/duplicate/);
 assert.throws(()=>auditCatalog([{...x,id:''}]),/empty/);
});
test('invalid slot weights or categories fail loudly',()=>{
 const x={id:'a',category:'trade',element:'none',weight:1};
 assert.throws(()=>auditCatalog([{...x,weight:0}]),/weight/);
 assert.throws(()=>auditCatalog([{...x,weight:0.2}]),/weight/);
 assert.throws(()=>auditCatalog([{...x,category:'fake'}]),/category/);
 assert.throws(()=>auditCatalog([{...x,element:'air'}]),/element/);
});
test('353 synthetic records accurately accounting for 500 slots pass audit (not real cards)',()=>{
 const cards=fixture();
 const report=assertCompleteCatalog(cards);
 assert.equal(report.unique,353);assert.equal(report.slots,500);assert.equal(report.mismatches.length,0);
});
test('same count and total cannot hide a category/attribute mismatch',()=>{
 const cards=fixture();
 cards[0].category='item';
 const report=auditCatalog(cards);
 assert.equal(report.slots,500);assert.equal(report.unique,353);
 assert.equal(report.complete,false);assert.ok(report.mismatches.length>=2);
 assert.throws(()=>assertCompleteCatalog(cards),/Catalog incomplete/);
});
test('incomplete item count is rejected even when current cells still match',()=>{
 const cards=fixture();
 // Keep category-cell totals while merging two records in the same cell.
 const i=cards.findIndex(c=>c.weight===1);
 const target=cards.findIndex((c,j)=>j!==i&&c.category===cards[i].category&&c.element===cards[i].element);
 assert.notEqual(target,-1);
 cards[target].weight+=cards[i].weight;cards.splice(i,1);
 const report=auditCatalog(cards);
 assert.equal(report.slots,500);assert.equal(report.unique,352);
 assert.equal(report.mismatches.length,0);assert.equal(report.complete,false);
});
