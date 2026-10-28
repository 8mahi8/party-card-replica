import test from 'node:test';
import assert from 'node:assert/strict';
import {planRedirectRoute} from '../v2/redirect-route.mjs';
import {drawRandom32} from '../v2/foundation.mjs';

// https://w.atwiki.jp/piong/pages/17.html
// Deflect: one random living prophet (including self), self-deflect cannot
// defend again. Reflect: the previous attacker, without an RNG draw.
function room(n=3,seed=713){
 const players=Array.from({length:n},(_,i)=>({
  id:String.fromCharCode(65+i),hp:40
 }));
 return {rngSeed:seed,players};
}
for(const count of [2,3,9]){
 test(count+' seats: reflection returns exactly to prior attacker with no RNG usage',()=>{
  const s=room(count),before=JSON.stringify(s);
  const plan=planRedirectRoute(s,{mode:'reflect',sourceId:'A',targetId:'B'});
  assert.deepEqual(plan.route,{source:'B',target:'A'});
  assert.equal(plan.nextSeed,s.rngSeed);
  assert.equal(plan.immediate,false);
  assert.equal(JSON.stringify(s),before);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.route));
 });
 test(count+' seats: deflection picks each living target including owner and last seat',()=>{
  const s=room(count);
  for(let index=0;index<count;index++){
   const roll=index===0?0:(index+0.5)/count;
   const plan=planRedirectRoute(s,{
    mode:'deflect',sourceId:'A',targetId:'B',deflectRng:()=>roll
   });
   assert.equal(plan.route.source,'B');
   assert.equal(plan.route.target,s.players[index].id);
   assert.equal(plan.immediate,index===1);
   assert.equal(plan.nextSeed,s.rngSeed,'an injected RNG must not advance authoritative seed');
  }
 });
 test(count+' seats: seeded deflection consumes exactly one seeded draw',()=>{
  const s=room(count),before=JSON.stringify(s);
  const expected=drawRandom32(s.rngSeed);
  const plan=planRedirectRoute(s,{mode:'deflect',sourceId:'A',targetId:'B'});
  assert.equal(plan.nextSeed,expected.nextSeed);
  assert.equal(plan.route.target,s.players[Math.floor(expected.value*count)].id);
  assert.equal(JSON.stringify(s),before);
 });
}
test('deflection never selects a dead seat, including an eliminated prior attacker',()=>{
 const s=room(9);
 s.players[2].hp=0;s.players[6].hp=0;
 const living=s.players.filter(p=>p.hp>0).map(p=>p.id);
 for(let i=0;i<living.length;i++){
  const result=planRedirectRoute(s,{mode:'deflect',sourceId:'A',targetId:'B',
   deflectRng:()=>((i+0.5)/living.length)});
  assert.equal(result.route.target,living[i]);
 }
});
test('a deflection to current defender is an immediate unavoidable self-hit',()=>{
 const s=room(9),plan=planRedirectRoute(s,{mode:'deflect',
  sourceId:'A',targetId:'B',deflectRng:()=>1.5/s.players.length});
 assert.equal(plan.route.target,'B');
 assert.equal(plan.route.source,'B');
 assert.equal(plan.immediate,true);
});
test('reflected attacks can be reflected again by the previous attacker',()=>{
 const s=room(3);
 const first=planRedirectRoute(s,{mode:'reflect',sourceId:'A',targetId:'B'});
 const second=planRedirectRoute(s,{mode:'reflect',
  sourceId:first.route.source,targetId:first.route.target});
 assert.deepEqual(second.route,{source:'A',target:'B'});
 assert.equal(second.nextSeed,s.rngSeed);
});
test('invalid random values and malformed routing are rejected without changing room',()=>{
 const s=room(3),snapshot=JSON.stringify(s);
 for(const n of [-1,1,NaN,Infinity]){
  assert.throws(()=>planRedirectRoute(s,{mode:'deflect',
   sourceId:'A',targetId:'B',deflectRng:()=>n}),/bad rng/);
 }
 assert.throws(()=>planRedirectRoute(s,{mode:'deflect',sourceId:'A',targetId:'B',
  deflectRng:'bad'}),/Invalid deflect RNG/);
 assert.throws(()=>planRedirectRoute(s,{mode:'reflect',sourceId:'A',targetId:'X'}),
  /Redirect parties must be alive/);
 assert.throws(()=>planRedirectRoute(s,{mode:'reflect',sourceId:'C',targetId:'C'}),
  /self-hit cannot react/);
 assert.throws(()=>planRedirectRoute(s,{mode:'stop',sourceId:'A',targetId:'B'}),
  /Unsupported redirect mode/);
 assert.equal(JSON.stringify(s),snapshot);
});
