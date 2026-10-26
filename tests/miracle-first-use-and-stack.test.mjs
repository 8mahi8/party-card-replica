import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,playMiracleAttack,playAuraWeaponAttack,playAttack,defend} from '../src/match.mjs';
import {playPlusMiracleAttack,playStackedPlusMiracles} from '../src/plus-miracle.mjs';
import {findVerifiedBasicCard as card} from '../src/verified-basic-cards.mjs';
const draw=()=>card('d001');
function setup(a,b) {
 const s=createMatch({playerIds:['A','B'],firstPlayerId:'A',draw,rng:()=>0});
 s.players[0].hand=a.map(card);s.players[1].hand=b.map(card);
 return s;
}
test('first miracle becomes learned, first draw replaces it, recast grows hand',()=>{
 const s=setup(['m002'],['d001']);
 const p=playMiracleAttack(s,{playerId:'A',targetId:'B',handIndex:0},draw);
 assert.equal(p.players[0].hand.length,0);
 const f=defend(p,{playerId:'B'},draw);
 assert.deepEqual(f.players[0].hand.map(c=>c.id),['d001']);
 assert.deepEqual(f.players[0].learned.map(c=>c.id),['m002']);
 f.activePlayerId='A';
 const recast=playMiracleAttack(f,{playerId:'A',targetId:'B',learnedId:'m002'},draw);
 const fin=defend(recast,{playerId:'B'},draw);
 assert.equal(fin.players[0].hand.length,2);
});
test('wall first use moves from hand, learned wall recast adds a card',()=>{
 const s=setup(['w016','w016'],['m001','d001']);
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const f=defend(p,{playerId:'B',wallHandIndex:0},draw);
 assert.deepEqual(f.players[1].hand.map(c=>c.id),['d001','d001']);
 f.activePlayerId='A';f.players[1].mp=10;
 const next=playAttack(f,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const fin=defend(next,{playerId:'B',wallLearnedId:'m001'},draw);
 assert.equal(fin.players[1].hand.length,3);
});
test('Aura first use removes hand card while learned recast increases hand',()=>{
 const s=setup(['w016','m004'],['d001']);
 const p=playAuraWeaponAttack(s,{playerId:'A',targetId:'B',handIndices:[0],auraHandIndex:1},draw);
 const f=defend(p,{playerId:'B'},draw);
 assert.equal(f.players[0].hand.length,2);
 assert.equal(f.players[0].hand.some(c=>c.id==='m004'),false);
 f.activePlayerId='A';f.players[0].mp=10;
 f.players[0].hand=[card('w016')];
 const recast=playAuraWeaponAttack(f,{playerId:'A',targetId:'B',handIndices:[0],learnedAuraId:'m004'},draw);
 assert.equal(defend(recast,{playerId:'B'},draw).players[0].hand.length,2);
});
test('first Fireball plus weapon uses hand Fireball, second learned Fireball adds a card',()=>{
 const s=setup(['w016','m005'],['d001']);
 const p=playPlusMiracleAttack(s,{playerId:'A',targetId:'B',handIndices:[0],plusHandIndex:1},draw);
 const f=defend(p,{playerId:'B'},draw);
 assert.deepEqual(f.players[0].hand.map(c=>c.id),['d001','d001']);
 assert.deepEqual(f.players[0].learned.map(c=>c.id),['m005']);
 f.activePlayerId='A';f.players[0].hand=[card('w016')];
 const recast=playPlusMiracleAttack(f,{playerId:'A',targetId:'B',handIndices:[0],learnedPlusId:'m005'},draw);
 assert.equal(defend(recast,{playerId:'B'},draw).players[0].hand.length,2);
});
test('weapon then two Fireballs combines attack and consumes both hand miracles',()=>{
 const s=setup(['w016','m005','m005'],['d001']);
 const p=playStackedPlusMiracles(s,{playerId:'A',targetId:'B',handIndices:[0],plusHandIndices:[1,2]},draw);
 assert.equal(p.pending.attack,14);assert.equal(p.pending.element,'none');
 assert.equal(p.players[0].mp,6);
 assert.deepEqual(p.players[0].learned.map(c=>c.id),['m005']);
 assert.equal(p.players[0].hand.length,0);
 const f=defend(p,{playerId:'B'},draw);
 assert.equal(f.players[0].hand.length,3);
 assert.equal(f.players[1].hp,26);
});
test('stack refuses miracle-first, repeated indexes, MP deficit without mutating input',()=>{
 const s=setup(['m005','m005','w016'],['d001']);
 assert.throws(()=>playStackedPlusMiracles(s,{playerId:'A',targetId:'B',handIndices:[0],plusHandIndices:[1,2]},draw),/Weapons/);
 assert.throws(()=>playStackedPlusMiracles(s,{playerId:'A',targetId:'B',handIndices:[2],plusHandIndices:[0,0]},draw),/Repeated/);
 s.players[0].mp=3;
 assert.throws(()=>playStackedPlusMiracles(s,{playerId:'A',targetId:'B',handIndices:[2],plusHandIndices:[0,1]},draw),/Not enough MP/);
 assert.equal(s.players[0].hand.length,3);
});
