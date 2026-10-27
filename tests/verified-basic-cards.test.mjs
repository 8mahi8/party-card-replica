import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS,findVerifiedBasicCard,PARTIAL_CARD_SOURCE} from '../src/verified-basic-cards.mjs';
import {auditCatalog,createAuditedDraw} from '../src/catalog-audit.mjs';
import {createMatch,playAttack,defend,pray} from '../src/match.mjs';

const draw=()=>VERIFIED_BASIC_CARDS[0];
const start=()=>createMatch({playerIds:['A','B'],firstPlayerId:'A',rng:()=>0,draw});

test('catalog is a fixed 85-entry partial research sample, never a complete deck',()=>{
 assert.equal(VERIFIED_BASIC_CARDS.length,85);
 assert.equal(new Set(VERIFIED_BASIC_CARDS.map(c=>c.id)).size,85);
 assert.equal(PARTIAL_CARD_SOURCE,'piong-atwiki-and-macaron-2026-02-28');
 assert.equal(auditCatalog(VERIFIED_BASIC_CARDS).complete,false);
 assert.ok(auditCatalog(VERIFIED_BASIC_CARDS).slots<500);
});

test('data records the original slots as whole multiples of 0.2 percent',()=>{
 const named=(name)=>VERIFIED_BASIC_CARDS.find(c=>c.referenceName===name);
 assert.equal(named('銅のこん棒').weight,3); // 0.6%
 assert.equal(named('ムチ').weight,4); // 0.8%
 assert.equal(named('革の帽子').weight,10); // 2.0%
 assert.equal(named('アイアンアーマー').weight,8); // 1.6%
 assert.equal(named('神の盾').weight,1); // 0.2%
});

test('card numbers, price, attributes, slot and combined guard are source-backed',()=>{
 const {attack,guard,price,slot}=findVerifiedBasicCard('w005');
 assert.deepEqual({attack,guard,price,slot},{attack:2,guard:6,price:10,slot:'main'});
 assert.equal(findVerifiedBasicCard('w018').element,'fire');
 assert.equal(findVerifiedBasicCard('a005').attack,5);
 assert.equal(findVerifiedBasicCard('a005').slot,'addon');
 assert.equal(findVerifiedBasicCard('d009').guard,30);
});

test('cards and catalog array are immutable, unknown lookup returns null',()=>{
 assert.ok(Object.isFrozen(VERIFIED_BASIC_CARDS));
 assert.ok(VERIFIED_BASIC_CARDS.every(Object.isFrozen));
 assert.equal(findVerifiedBasicCard('w999'),null);
});

test('normal main weapon plus simple add-on from data deals accumulated damage',()=>{
 const s=start();
 s.players[0].hand=[findVerifiedBasicCard('w006'),findVerifiedBasicCard('a003')]; // 3+3
 s.players[1].hand=[findVerifiedBasicCard('d001')]; // 1 guard
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0,1]},draw);
 assert.equal(p.pending.attack,6);
 const r=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(r.players[1].hp,35);
 assert.equal(r.activePlayerId,'B');
});

test('saber rod is a weapon that can defend using its 6 guard',()=>{
 const s=start();
 s.players[0].hand=[findVerifiedBasicCard('w016')]; // 10 attack
 s.players[1].hand=[findVerifiedBasicCard('w005')]; // 6 guard
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const r=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(r.players[1].hp,36);
 assert.equal(r.players[1].hand.length,1);
});

test('hybrid weapon still counts as weapon for prayer restriction',()=>{
 const s=start();
 s.players[0].hand=[findVerifiedBasicCard('w005')];
 assert.throws(()=>pray(s,{playerId:'A'},draw),/only when no weapons/);
});

test('weapon without defense stat cannot be selected as a shield',()=>{
 const s=start();
 s.players[0].hand=[findVerifiedBasicCard('w016')];
 s.players[1].hand=[findVerifiedBasicCard('w006')];
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 assert.throws(()=>defend(p,{playerId:'B',handIndices:[0]},draw),/Illegal shield/);
});

test('combined guard values on two mixed armor/weapon cards stack as expected',()=>{
 const s=start();
 s.players[0].hand=[findVerifiedBasicCard('w016')]; // 10
 s.players[1].hand=[findVerifiedBasicCard('w008'),findVerifiedBasicCard('d005')]; // 2+5
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const r=defend(p,{playerId:'B',handIndices:[0,1]},draw);
 assert.equal(r.players[1].hp,37);
});

test('partial catalog is rejected by audited production-oriented draw factory',()=>{
 assert.throws(()=>createAuditedDraw(VERIFIED_BASIC_CARDS),/Catalog incomplete/);
});
