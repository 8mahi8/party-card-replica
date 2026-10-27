import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,playAttack,defend,pray} from '../src/match.mjs';
import {VERIFIED_BASIC_CARDS,findVerifiedBasicCard} from '../src/verified-basic-cards.mjs';
import {auditCatalog} from '../src/catalog-audit.mjs';
const card=findVerifiedBasicCard;
const draw=()=>card('d001');
const match=(a,b)=>{
  const s=createMatch({playerIds:['A','B'],firstPlayerId:'A',rng:()=>0,draw});
  s.players[0].hand=a;s.players[1].hand=b;return s;
};
test('source-backed basic subset increases from 35 to 69, never full 353',()=>{
  assert.equal(VERIFIED_BASIC_CARDS.length,69);
  assert.equal(new Set(VERIFIED_BASIC_CARDS.map(c=>c.id)).size,69);
  assert.equal(auditCatalog(VERIFIED_BASIC_CARDS).complete,false);
});
test('four demon armors are categorized armor but contribute attack bonus',()=>{
  for(const [id,guard,bonus] of [['d010',3,5],['d011',5,10],['d012',7,10],['d013',9,15]]){
    const c=card(id);
    assert.equal(c.kind,'armor');assert.equal(c.guard,guard);assert.equal(c.attackBonus,bonus);
    assert.equal(c.weight,1);
  }
});
test('basic weapon plus demon boots adds attack bonus, while retaining defense role',()=>{
  const s=match([card('w006'),card('d010')],[card('d003')]);
  const pending=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0,1]},draw);
  assert.equal(pending.pending.attack,8);
  const after=defend(pending,{playerId:'B',handIndices:[0]},draw);
  assert.equal(after.players[1].hp,35);
  assert.equal(after.players[0].hand.length,2);
});
test('armor with attack bonus cannot initiate attack by itself',()=>{
 const s=match([card('d010'),card('d013')],[card('d001')]);
 assert.throws(()=>playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw),/needs weapon/);
});
test('demon armor with add-on-only weapon is a permitted attack',()=>{
 const s=match([card('d013'),card('a001')],[card('d001')]);
 const pending=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0,1]},draw);
 assert.equal(pending.pending.attack,16);
});
test('ordinary armor cannot be used as attack bonus and remains legal defense',()=>{
 const s=match([card('w006'),card('d003')],[card('d001')]);
 assert.throws(()=>playAttack(s,{playerId:'A',targetId:'B',handIndices:[0,1]},draw),/attack-bonus armor only/);
 const s2=match([card('w006')],[card('d010')]);
 const pending=playAttack(s2,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const r=defend(pending,{playerId:'B',handIndices:[0]},draw);
 assert.equal(r.players[1].hp,40);
});
test('demon armor alone still allows prayer because it is not a weapon',()=>{
 const s=match([card('d013')],[card('w006')]);
 const next=pray(s,{playerId:'A'},draw);
 assert.equal(next.players[0].hand.length,2);
});
test('armor bonuses do not change a weapon attack element',()=>{
 const s=match([card('w018'),card('d010')],[card('d001')]);
 const pending=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0,1]},draw);
 assert.equal(pending.pending.element,'fire');
 assert.equal(pending.pending.attack,6);
});
test('new colored weapons and armor carry verified source categories and attributes',()=>{
  for(const [id,element] of [['w021','water'],['w022','wood'],['w023','earth'],['w024','light'],['w025','dark'],['a009','fire'],['a010','light'],['a011','dark'],['d014','fire'],['d015','water'],['d016','wood'],['d017','earth']]){
    assert.equal(card(id).element,element);
    assert.equal(card(id).weight,1);
  }
});
