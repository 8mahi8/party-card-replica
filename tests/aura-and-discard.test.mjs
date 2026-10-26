import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,playAuraWeaponAttack,defend,discardCards} from '../src/match.mjs';
import {findVerifiedBasicCard as card, VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {auditCatalog} from '../src/catalog-audit.mjs';
const draw=()=>card('d001');
function setup(a,b){
 const state=createMatch({playerIds:['A','B'],firstPlayerId:'A',rng:()=>0,draw});
 state.players[0].hand=a.map(card);state.players[1].hand=b.map(card);
 return state;
}
test('Aura has MP6 and 0.2% reference weight; catalog remains incomplete',()=>{
 const aura=card('m004');
 assert.equal(aura.kind,'miracle');assert.equal(aura.role,'boost_weapon');
 assert.equal(aura.mpCost,6);assert.equal(aura.weight,1);
 assert.equal(VERIFIED_BASIC_CARDS.length,67);
 const audit=auditCatalog(VERIFIED_BASIC_CARDS);
 assert.equal(audit.slots,184);assert.equal(audit.complete,false);
});
test('Aura doubles selected main and additional weapons together',()=>{
 const s=setup(['w016','a003','m004'],['d005']); // 10+3, shield5
 const pending=playAuraWeaponAttack(s,{playerId:'A',targetId:'B',handIndices:[0,1],auraHandIndex:2},draw);
 assert.equal(pending.pending.attack,26);
 assert.equal(pending.pending.attackKind,'weapon');
 assert.equal(pending.players[0].mp,4);
 assert.deepEqual(pending.players[0].learned.map(c=>c.id),['m004']);
 const after=defend(pending,{playerId:'B',handIndices:[0]},draw);
 assert.equal(after.players[1].hp,19);
 assert.equal(after.players[0].hand.length,3);
});
test('learned Aura casts without requiring Aura in current hand',()=>{
 const s=setup(['w016'],['d001']);
 s.players[0].learned=[card('m004')];
 const p=playAuraWeaponAttack(s,{playerId:'A',targetId:'B',handIndices:[0],learnedAuraId:'m004'},draw);
 const r=defend(p,{playerId:'B'},draw);
 assert.equal(r.players[1].hp,20);
 assert.equal(r.players[0].mp,4);
 assert.equal(r.players[0].hand.length,2);
});
test('Aura refuses insufficient MP and leaves original state untouched',()=>{
 const s=setup(['w016','m004'],['d001']);
 s.players[0].mp=5;
 assert.throws(()=>playAuraWeaponAttack(s,{playerId:'A',targetId:'B',handIndices:[0],auraHandIndex:1},draw),/Not enough MP/);
 assert.equal(s.players[0].mp,5);
 assert.equal(s.players[0].hand.length,2);
 assert.equal(s.pending,null);
});
test('Aura rejects unsupported combinations rather than guessing rule priority',()=>{
 const s=setup(['w016','d010','m004'],['d001']);
 assert.throws(()=>playAuraWeaponAttack(s,{playerId:'A',targetId:'B',handIndices:[0,1],auraHandIndex:2},draw),/not verified/);
 assert.throws(()=>playAuraWeaponAttack(s,{playerId:'A',targetId:'A',handIndices:[0],auraHandIndex:2},draw),/self-target/);
 assert.throws(()=>playAuraWeaponAttack(s,{playerId:'A',targetId:'B',handIndices:[0],auraHandIndex:0},draw),/Invalid aura/);
});
test('Aura-boosted neutral weapon is still stoppable with Wall',()=>{
 const s=setup(['w016','m004'],['m001']);
 const p=playAuraWeaponAttack(s,{playerId:'A',targetId:'B',handIndices:[0],auraHandIndex:1},draw);
 const end=defend(p,{playerId:'B',wallHandIndex:0},draw);
 assert.equal(end.players[1].hp,40);
 assert.equal(end.events.find(e=>e.type==='damage').stopped,true);
});
test('normal discard removes selected cards without replacement and ends turn',()=>{
 const s=setup(['w016','d005','a003'],['d001']);
 const result=discardCards(s,{playerId:'A',handIndices:[0,2]});
 assert.deepEqual(result.players[0].hand.map(c=>c.id),['d005']);
 assert.equal(result.players[1].hand.length,1);
 assert.equal(result.activePlayerId,'B');assert.equal(result.turnCount,1);
 assert.deepEqual(result.events.at(-1).cardIds,['w016','a003']);
 assert.equal(s.players[0].hand.length,3);
});
test('normal discard rejects wrong turn, repeated indices, and empty selection',()=>{
 const s=setup(['w016','d005'],['d001']);
 assert.throws(()=>discardCards(s,{playerId:'B',handIndices:[0]}),/Not active/);
 assert.throws(()=>discardCards(s,{playerId:'A',handIndices:[0,0]}),/Repeated/);
 assert.throws(()=>discardCards(s,{playerId:'A',handIndices:[]}),/Invalid/);
 assert.equal(s.turnCount,0);
});
test('discard works even when a hand contains only armor, unlike praying',()=>{
 const s=setup(['d001','d002'],['w016']);
 const result=discardCards(s,{playerId:'A',handIndices:[1]});
 assert.deepEqual(result.players[0].hand.map(c=>c.id),['d001']);
});
