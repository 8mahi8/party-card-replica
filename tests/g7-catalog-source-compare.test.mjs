import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {CATEGORY_DISTRIBUTION,ELEMENTS} from '../src/rules.mjs';
import {auditCatalog,createAuditedDraw} from '../src/catalog-audit.mjs';
import {compareHistoricalDeckClaims,probabilityCellOf,HISTORICAL_DECK_CLAIMS} from '../src/catalog-source-compare.mjs';

const report=compareHistoricalDeckClaims(VERIFIED_BASIC_CARDS);
const old=report.comparisons.find(p=>p.key==='wiki-2025-09-19');
const newerStudy=report.comparisons.find(p=>p.key==='player-study-2024-11-06');

test('two independently sourced incompatible full-deck reference totals are recorded without choosing a winner',()=>{
 assert.deepEqual(HISTORICAL_DECK_CLAIMS.map(p=>[p.kinds,p.slots]),
  [[353,500],[237,500]]);
 for(const claim of HISTORICAL_DECK_CLAIMS)
  assert.equal(Object.values(claim.groups).reduce((a,b)=>a+b,0),500);
 assert.deepEqual([report.unique,report.slots],[179,440]);
 assert.deepEqual(report.actualGroups,
  {trade:60,weapon:154,armor:133,miracle:16,item:77});
});

test('2025 353-kind claim has an impossible remaining count even ignoring categories',()=>{
 assert.equal(old.remainingSlots,60);
 assert.equal(old.missingKinds,174);
 assert.equal(old.maxPossibleKinds,239);
 assert.equal(old.kindCountPossible,false);
 assert.equal(newerStudy.remainingSlots,60);
 assert.equal(newerStudy.missingKinds,58);
 assert.equal(newerStudy.maxPossibleKinds,239);
 assert.equal(newerStudy.kindCountPossible,true,
  '237 is arithmetically plausible, not authenticated');
 assert.equal(newerStudy.groupOverflows.length,0);
 assert.equal(old.groupOverflows.length,0,
  'aggregate-only checks miss the actual typed matrix mismatch');
});

test('Rainbow Curtain and Super Mirror are other ARMOR in probability table despite item-kind gameplay',()=>{
 const rainbow=VERIFIED_BASIC_CARDS.find(c=>c.id==='i001');
 const mirror=VERIFIED_BASIC_CARDS.find(c=>c.id==='i002');
 assert.equal(rainbow.category,'item','retain original gameplay category');
 assert.equal(mirror.category,'item','retain original gameplay category');
 assert.deepEqual(probabilityCellOf(rainbow),
  {category:'armor_other',element:'none'});
 assert.deepEqual(probabilityCellOf(mirror),
  {category:'armor_other',element:'none'});
 assert.equal(report.categoryCells.armor_other.none,4);
 assert.equal(report.categoryCells.item.none,77);
 assert.equal(report.categoryCells.trade.none,60);
});

test('2025 typed reference already overflows neutral weapon single-slot budget by 12',()=>{
 assert.deepEqual(old.typedCellOverflows,[
  {category:'weapon_single',element:'none',expected:110,actual:122,excess:12}
 ]);
 const row=CATEGORY_DISTRIBUTION.weapon_single;
 assert.equal(ELEMENTS.length,7);
 assert.equal(row.reduce((a,b)=>a+b,0),152);
 assert.equal(Object.values(report.categoryCells.weapon_single).reduce((a,b)=>a+b,0),154);
 assert.deepEqual(newerStudy.groupRows.map(r=>[r.group,r.remaining]),
  [['trade',0],['weapon',27],['armor',14],['miracle',14],['item',5]]);
});

test('diagnostic never authorizes fake weighted draws or mutates audited source definitions',()=>{
 const before=JSON.stringify(VERIFIED_BASIC_CARDS);
 assert.equal(auditCatalog(VERIFIED_BASIC_CARDS).complete,false);
 assert.throws(()=>createAuditedDraw(VERIFIED_BASIC_CARDS),/Catalog incomplete/);
 assert.equal(JSON.stringify(VERIFIED_BASIC_CARDS),before);
 assert.equal(Object.isFrozen(VERIFIED_BASIC_CARDS[0]),true);
});

test('source comparison refuses duplicated or malformed probability definitions',()=>{
 const sample=VERIFIED_BASIC_CARDS[0];
 assert.throws(()=>compareHistoricalDeckClaims([sample,sample]),/duplicate/);
 assert.throws(()=>compareHistoricalDeckClaims([{...sample,weight:0}]),/weight/);
 assert.throws(()=>compareHistoricalDeckClaims([{...sample,element:'void'}]),/element/);
});
