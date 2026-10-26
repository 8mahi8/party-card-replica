import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch, playAttack, defend} from '../src/match.mjs';
import {findVerifiedBasicCard as card} from '../src/verified-basic-cards.mjs';
const draw=()=>card('d001');
const scenario=(hands, firstPlayerId='A')=>{
  const ids=Object.keys(hands);
  const s=createMatch({playerIds:ids,firstPlayerId,rng:()=>0,draw});
  s.players.forEach(p=>p.hand=hands[p.id].map(x=>typeof x==='string'?card(x):x));
  return s;
};
test('deflection and reflection source cards, weights, and types match documented subset',()=>{
  assert.deepEqual([card('w026').attack,card('w026').price,card('w026').weight,card('w026').reaction],[5,10,7,'deflect']);
  assert.deepEqual([card('w027').attack,card('w027').price,card('w027').weight,card('w027').reaction],[10,5,3,'reflect']);
  assert.deepEqual([card('i002').kind,card('i002').effect,card('i002').weight,card('i002').price],['defense_item','reflect_any',1,10]);
});
test('reflect normal weapon attack back; original attacker defends; original turn still advances',()=>{
  const s=scenario({A:['w016','d003'],B:['w027','d001']});
  const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
  const red=defend(p,{playerId:'B',handIndices:[0]},draw);
  assert.equal(red.phase,'defense');assert.equal(red.activePlayerId,'A');
  assert.equal(red.pending.sourceId,'B');assert.equal(red.pending.originalAttackerId,'A');
  assert.equal(red.players[0].hand.length,1);assert.equal(red.players[1].hand.length,1);
  const after=defend(red,{playerId:'A',handIndices:[0]},draw);
  assert.equal(after.players[0].hp,33);
  assert.equal(after.players[1].hp,40);
  assert.equal(after.players[0].hand.length,2);
  assert.equal(after.players[1].hand.length,2);
  assert.equal(after.phase,'turn');assert.equal(after.activePlayerId,'B');
  assert.equal(after.turnCount,1);
});
test('deflect to self causes unavoidable damage and no extra defense phase',()=>{
  const s=scenario({A:['w016'],B:['w026','d009']});
  const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
  const after=defend(p,{playerId:'B',handIndices:[0]},draw,()=>0.99);
  assert.equal(after.players[1].hp,30);
  assert.equal(after.pending,null);assert.equal(after.phase,'turn');
  assert.equal(after.activePlayerId,'B');
  assert.equal(after.events.filter(e=>e.type==='defense').length,0);
  assert.equal(after.events.find(e=>e.type==='redirect').to,'B');
});
test('deflect to a third person draws from all living players and may be defended',()=>{
  const s=scenario({A:['w016'],B:['w026'],C:['d005']});
  const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
  const red=defend(p,{playerId:'B',handIndices:[0]},draw,()=>0.80);
  assert.equal(red.activePlayerId,'C');assert.equal(red.pending.sourceId,'B');
  const after=defend(red,{playerId:'C',handIndices:[0]},draw);
  assert.deepEqual(after.players.map(p=>p.hp),[40,40,35]);
  assert.deepEqual(after.players.map(p=>p.hand.length),[1,1,1]);
  assert.equal(after.activePlayerId,'B');
});
test('reflections can chain and consume exactly one card per hop',()=>{
  const s=scenario({A:['w016','w027','d001'],B:['w027','d001']});
  const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
  const p2=defend(p,{playerId:'B',handIndices:[0]},draw);
  const p3=defend(p2,{playerId:'A',handIndices:[0]},draw);
  const fin=defend(p3,{playerId:'B',handIndices:[0]},draw);
  assert.equal(fin.players[1].hp,31);
  assert.deepEqual(fin.players.map(p=>p.hand.length),[3,2]);
  assert.equal(fin.events.filter(e=>e.type==='redirect').length,2);
  assert.equal(fin.activePlayerId,'B');
});
test('super mirror reflects any element; normal neutral-weapon reflector cannot reflect light',()=>{
  const s=scenario({A:['w024'],B:['i002','w027']});
  const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
  assert.throws(()=>defend(p,{playerId:'B',handIndices:[1]},draw),/cannot redirect/);
  assert.equal(p.players[1].hand.length,2);
  const red=defend(p,{playerId:'B',handIndices:[0]},draw);
  const fin=defend(red,{playerId:'A',handIndices:[]},draw);
  assert.equal(fin.players[0].hp,37);assert.equal(fin.players[1].hp,40);
});
test('reflection card must be selected alone; invalid action does not mutate state',()=>{
  const s=scenario({A:['w006'],B:['w027','d001']});
  const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
  assert.throws(()=>defend(p,{playerId:'B',handIndices:[0,1]},draw),/selected alone/);
  assert.deepEqual(p.players[1].hand.map(c=>c.id),['w027','d001']);
});
test('original turn owner killed by reflection ends round, no replenishment for dead',()=>{
  const s=scenario({A:['w016'],B:['i002']});
  s.players[0].hp=5;
  const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
  const red=defend(p,{playerId:'B',handIndices:[0]},draw);
  const fin=defend(red,{playerId:'A',handIndices:[]},draw);
  assert.equal(fin.phase,'finished');assert.equal(fin.winnerId,'B');
  assert.equal(fin.players[0].hand.length,0);
  assert.equal(fin.players[1].hand.length,1);
});
test('unknown or spoofed reaction is rejected',()=>{
  const invalid={...card('w026'),reaction:'random_effect'};
  const s=scenario({A:['w016'],B:[invalid]});
  const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
  assert.throws(()=>defend(p,{playerId:'B',handIndices:[0]},draw),/Unknown weapon reaction/);
});
