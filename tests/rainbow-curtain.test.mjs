import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,playAttack,defend} from '../src/match.mjs';
import {findVerifiedBasicCard as card} from '../src/verified-basic-cards.mjs';
const draw=()=>card('d001');
const state=(attackCard,shields)=>{
  const s=createMatch({playerIds:['A','B'],firstPlayerId:'A',rng:()=>0,draw});
  s.players[0].hand=[card(attackCard)];
  s.players[1].hand=shields.map(card);
  return playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
};
test('rainbow curtain is 0.6% item with source-backed price 15',()=>{
 assert.deepEqual((({kind,effect,price,weight})=>({kind,effect,price,weight}))(card('i001')),
  {kind:'defense_item',effect:'strip_element',price:15,weight:3});
});
test('light attack cannot normally be shielded even with neutral armor',()=>{
 const s=state('w024',['d001']);
 assert.throws(()=>defend(s,{playerId:'B',handIndices:[0]},draw),/Illegal shield/);
});
test('rainbow curtain removes light element so neutral shield becomes legal',()=>{
 const s=state('w024',['d001','i001']);
 const r=defend(s,{playerId:'B',handIndices:[0,1]},draw);
 assert.equal(r.players[1].hp,38); // attack 3 - shield 1
 assert.equal(r.events.find(e=>e.type==='defense').stripElement,true);
 assert.equal(r.players[1].hand.length,2);
});
test('rainbow curtain cancels dark instant death but not ordinary damage',()=>{
 const s=state('w025',['i001']);
 const r=defend(s,{playerId:'B',handIndices:[0]},draw);
 assert.equal(r.players[1].hp,39);
 assert.equal(r.events.find(e=>e.type==='damage').instantDefeat,false);
});
test('defense item alone can be used on other colored attacks',()=>{
 const s=state('w018',['i001']);
 const r=defend(s,{playerId:'B',handIndices:[0]},draw);
 assert.equal(r.players[1].hp,39);
 assert.equal(r.events.find(e=>e.type==='defense').stripElement,true);
});
test('rainbow curtain is not a weapon and cannot attack',()=>{
 const s=createMatch({playerIds:['A','B'],firstPlayerId:'A',rng:()=>0,draw});
 s.players[0].hand=[card('i001')];
 assert.throws(()=>playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw),/needs weapon/);
});
