import test from 'node:test';
import assert from 'node:assert/strict';
import {priceMiracleSequence} from '../src/spirit-sequence.mjs';
import {createMatch,playMiracleAttack,defend,playAttack} from '../src/match.mjs';
import {playStackedPlusMiracles} from '../src/plus-miracle.mjs';
import {findVerifiedBasicCard as card,VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {auditCatalog,createAuditedDraw} from '../src/catalog-audit.mjs';
const draw=()=>card('d001');
function match(a,b) {
  const s=createMatch({playerIds:['A','B'],draw,rng:()=>0,firstPlayerId:'A'});
  s.players[0].hand=a.map(card);
  s.players[1].hand=b.map(card);
  return s;
}
test('Spirit doll keeps 0.4% reference weight and price 5; partial deck stays blocked',()=>{
  assert.equal(card('i003').referenceName,'精霊のぬいぐるみ');
  assert.equal(card('i003').price,5);assert.equal(card('i003').weight,2);
  assert.equal(VERIFIED_BASIC_CARDS.length,86);
  assert.equal(auditCatalog(VERIFIED_BASIC_CARDS).slots,205);
  assert.throws(()=>createAuditedDraw(VERIFIED_BASIC_CARDS),/incomplete/);
});
test('single miracle followed immediately by spirit is free',()=>{
  assert.deepEqual(priceMiracleSequence([{type:'miracle',mpCost:7},{type:'spirit'}]),
    {payableMP:0,discountedPositions:[0]});
});
test('spirit discounts only immediately preceding miracle, not every earlier miracle',()=>{
  const out=priceMiracleSequence([{type:'weapon'},{type:'miracle',mpCost:2},
    {type:'miracle',mpCost:7},{type:'spirit'}]);
  assert.equal(out.payableMP,2);assert.deepEqual(out.discountedPositions,[2]);
});
test('spirit is rejected if delayed by weapon or another spirit',()=>{
  assert.throws(()=>priceMiracleSequence([{type:'miracle',mpCost:2},{type:'weapon'},{type:'spirit'}]),/immediately follow/);
  assert.throws(()=>priceMiracleSequence([{type:'spirit'},{type:'miracle',mpCost:2}]),/immediately follow/);
  assert.throws(()=>priceMiracleSequence([{type:'miracle',mpCost:2},{type:'spirit'},{type:'spirit'}]),/immediately follow/);
});
test('empty selections and invalid miracle costs reject',()=>{
  assert.throws(()=>priceMiracleSequence([]),/Empty/);
  assert.throws(()=>priceMiracleSequence([{type:'miracle',mpCost:-1},{type:'spirit'}]),/cost/);
  assert.throws(()=>priceMiracleSequence([{type:'miracle',mpCost:2.3},{type:'spirit'}]),/cost/);
});
test('spirit offsets MP for first-time hand miracle, consumes both and draws twice',()=>{
  const s=match(['m006','i003'],['d001']);s.players[0].mp=0;
  const p=playMiracleAttack(s,{playerId:'A',targetId:'B',handIndex:0,spiritHandIndex:1},draw);
  assert.equal(p.players[0].mp,0);assert.equal(p.players[0].hand.length,0);
  assert.deepEqual(p.players[0].learned.map(c=>c.id),['m006']);
  assert.equal(p.pending.spentByPlayer.A,2);
  const f=defend(p,{playerId:'B'},draw);
  assert.equal(f.players[0].hand.length,2);assert.equal(f.players[1].hp,30);
  assert.equal(s.players[0].hand.length,2);
});
test('learned miracle with spirit is also free and hand grows by one',()=>{
  const s=match(['i003'],['d001']);s.players[0].mp=0;s.players[0].learned=[card('m006')];
  const p=playMiracleAttack(s,{playerId:'A',targetId:'B',learnedId:'m006',spiritHandIndex:0},draw);
  const f=defend(p,{playerId:'B'},draw);
  assert.equal(f.players[0].hand.length,2);assert.equal(f.players[0].mp,0);
});
test('wrong spirit and invalid indices leave state unchanged',()=>{
  const s=match(['m002','d001'],['d001']);
  assert.throws(()=>playMiracleAttack(s,{playerId:'A',targetId:'B',handIndex:0,spiritHandIndex:1},draw),/Not a spirit/);
  assert.throws(()=>playMiracleAttack(s,{playerId:'A',targetId:'B',handIndex:0,spiritHandIndex:0},draw),/Invalid spirit/);
  assert.equal(s.players[0].mp,10);assert.equal(s.players[0].hand.length,2);
});
test('spirit doll alone cannot initiate an attack',()=>{
  const s=match(['i003'],['i003']);
  assert.throws(()=>playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw),/needs weapon/);
});
test('stacked two Fireballs plus spirit discounts only the last Fireball',()=>{
  const s=match(['w016','m005','m005','i003'],['d001']);s.players[0].mp=2;
  const p=playStackedPlusMiracles(s,{playerId:'A',targetId:'B',handIndices:[0],plusHandIndices:[1,2],spiritHandIndex:3},draw);
  assert.equal(p.pending.attack,14);assert.equal(p.players[0].mp,0);
  assert.equal(p.pending.spentByPlayer.A,4);
  const f=defend(p,{playerId:'B'},draw);
  assert.equal(f.players[0].hand.length,4);assert.equal(f.players[1].hp,26);
});
test('insufficient MP for earlier miracle is not forgiven by spirit after last miracle',()=>{
  const s=match(['w016','m005','m006','i003'],['d001']);s.players[0].mp=0;
  assert.throws(()=>playStackedPlusMiracles(s,{playerId:'A',targetId:'B',handIndices:[0],plusHandIndices:[1,2],spiritHandIndex:3},draw),/Not enough MP/);
  assert.equal(s.players[0].hand.length,4);
});
test('stacked combo rejects reusing a miracle index as spirit index',()=>{
  const s=match(['w016','m005','m005','i003'],['d001']);
  assert.throws(()=>playStackedPlusMiracles(s,{playerId:'A',targetId:'B',handIndices:[0],plusHandIndices:[1,2],spiritHandIndex:2},draw),/Invalid spirit/);
});
