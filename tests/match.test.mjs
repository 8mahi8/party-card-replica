import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,playAttack,defend,pray} from '../src/match.mjs';
const weapon=(id='w',attack=5,element='none',slot='main')=>({id,kind:'weapon',slot,attack,element});
const armor=(id='g',guard=3,element='none')=>({id,kind:'armor',guard,element});
const deck=()=>{let n=0;return ()=>armor('draw'+n++,1)};
const fixture=()=>createMatch({playerIds:['A','B'],firstPlayerId:'A',rng:()=>0.9,draw:deck()});
const withHands=(a,b)=>{const s=fixture();s.players[0].hand=a;s.players[1].hand=b;return s;};
test('first player selected by injected RNG; nine cards each, 40 HP',()=>{
 const s=createMatch({playerIds:['A','B','C'],rng:()=>0.6,draw:deck()});
 assert.equal(s.activePlayerId,'B');assert.deepEqual(s.players.map(p=>p.hand.length),[9,9,9]);
 assert.deepEqual(s.players.map(p=>[p.hp,p.mp,p.money]),[[40,10,20],[40,10,20],[40,10,20]]);
});
test('attack then unblocked defense consumes one, draws one, advances to other player',()=>{
 const draw=deck();const before=withHands([weapon(),armor('a')],[armor('b')]);
 const pending=playAttack(before,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 assert.equal(pending.phase,'defense');assert.equal(pending.activePlayerId,'B');
 assert.equal(before.players[0].hand.length,2); // untouched original
 const after=defend(pending,{playerId:'B',handIndices:[]},draw);
 assert.equal(after.players[1].hp,35);assert.equal(after.players[0].hand.length,2);
 assert.equal(after.players[1].hand.length,1);assert.equal(after.turnCount,1);
 assert.equal(after.activePlayerId,'B');assert.equal(after.phase,'turn');
});
test('multiple shields, defense refill, correct HP',()=>{
 const before=withHands([weapon('x',8,'fire')],[armor('a',3,'water'),armor('b',4,'light')]);
 const s=playAttack(before,{playerId:'A',targetId:'B',handIndices:[0]},deck());
 const after=defend(s,{playerId:'B',handIndices:[0,1]},deck());
 assert.equal(after.players[1].hp,39);assert.equal(after.players[1].hand.length,2);
});
test('illegal shield, reused index, and wrong turn reject without modifying input',()=>{
 const s=withHands([weapon('x',9,'fire')],[armor('a',8,'none')]);
 assert.throws(()=>playAttack(s,{playerId:'B',targetId:'A',handIndices:[0]},deck()),/Not active/);
 assert.throws(()=>playAttack(s,{playerId:'A',targetId:'B',handIndices:[0,0]},deck()),/Repeated/);
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},deck());
 assert.throws(()=>defend(p,{playerId:'B',handIndices:[0]},deck()),/Illegal shield/);
 assert.equal(p.players[1].hand.length,1);assert.equal(p.pending.armor,0);
});
test('duplicate card IDs allowed by hand index, but only one main weapon allowed',()=>{
 const s=withHands([weapon('same'),weapon('same')],[armor()]);
 assert.throws(()=>playAttack(s,{playerId:'A',targetId:'B',handIndices:[0,1]},deck()),/<=1 main/);
});
test('add-on weapons may attack alone and combine attack values',()=>{
 const s=withHands([weapon('a',2,'water','addon'),weapon('b',4,'light','addon')],[armor()]);
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0,1]},deck());
 assert.equal(p.pending.attack,6);assert.equal(p.pending.element,'water');
});
test('dark damage of one is lethal; empty defense is allowed',()=>{
 const s=withHands([weapon('d',2,'dark')],[armor('g',1,'none')]);
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},deck());
 const r=defend(p,{playerId:'B',handIndices:[0]},deck());
 assert.equal(r.phase,'finished');assert.equal(r.winnerId,'A');assert.equal(r.players[1].hp,0);
});
test('self attack cannot be defended and may yield opponent winner',()=>{
 const s=withHands([weapon('self',50)],[armor()]);
 const r=playAttack(s,{playerId:'A',targetId:'A',handIndices:[0]},deck());
 assert.equal(r.phase,'finished');assert.equal(r.winnerId,'B');assert.equal(r.players[0].hp,0);
});
test('prayer only with no weapons, skips the 18-card unverified corner case',()=>{
 const s=withHands([armor('x')],[weapon()]);
 const r=pray(s,{playerId:'A'},deck());
 assert.equal(r.players[0].hand.length,2);assert.equal(r.activePlayerId,'B');
 assert.throws(()=>pray(withHands([weapon()],[armor()]),{playerId:'A'},deck()),/only when no weapons/);
 assert.throws(()=>pray(withHands(Array.from({length:18},(_,i)=>armor(String(i))),[armor()]),{playerId:'A'},deck()),/not implemented/);
});
test('nonregistered special effect deliberately rejected',()=>{
 const s=withHands([{...weapon(),effect:'reflect'}],[armor()]);
 assert.throws(()=>playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},deck()),/not implemented/);
});
test('draw callback and invalid selection are validated',()=>{
 const s=withHands([weapon()],[armor()]);
 assert.throws(()=>playAttack(s,{playerId:'A',targetId:'B',handIndices:[42]},deck()),/Invalid selection/);
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},deck());
 assert.throws(()=>defend(p,{playerId:'B',handIndices:[]},()=>({id:'invalid',kind:'unknown'})),/Unsupported card category/);
});
test('nine players can be created and active turn advances in seating order',()=>{
 const ids=Array.from({length:9},(_,i)=>String(i));const s=createMatch({playerIds:ids,firstPlayerId:'0',rng:()=>0,draw:deck()});
 assert.equal(s.players.length,9);
});
