import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectHitOutcomeBoundaryFixture as inspect} from '../v2/hit-outcome-boundary.mjs';

test('ordinary hit preserves printed damage and actual HP loss separately',()=>{
 const r=inspect({beforeHp:40,damage:7,hpAfter:33,instantDefeat:false});
 assert.deepEqual(r,{
  beforeHp:40,damage:7,hpAfter:33,hpLost:7,overkill:0,
  instantDefeat:false,revived:false,revivedHp:null,hitKind:'ordinary-hit',
  requiresSpecialEffectTimingReview:false
 });
 assert.equal(Object.isFrozen(r),true);
});
test('perfect block is not a hit for downstream status conditions',()=>{
 const r=inspect({beforeHp:40,damage:0,hpAfter:40,instantDefeat:false});
 assert.equal(r.hitKind,'zero-damage');
 assert.equal(r.hpLost,0);
});
test('overkill is not identical to the actual HP lost',()=>{
 const r=inspect({beforeHp:3,damage:12,hpAfter:0,instantDefeat:false});
 assert.equal(r.damage,12);assert.equal(r.hpLost,3);assert.equal(r.overkill,9);
 assert.equal(r.hitKind,'overkill');
 assert.equal(r.requiresSpecialEffectTimingReview,true);
});
test('exact lethal damage is not overkill',()=>{
 const r=inspect({beforeHp:8,damage:8,hpAfter:0,instantDefeat:false});
 assert.equal(r.hitKind,'ordinary-hit');assert.equal(r.overkill,0);
 assert.equal(r.requiresSpecialEffectTimingReview,false);
});
test('dark instant defeat can lose more HP than attack value',()=>{
 const r=inspect({beforeHp:40,damage:1,hpAfter:0,instantDefeat:true});
 assert.equal(r.hitKind,'instant-defeat');
 assert.equal(r.hpLost,40);
 assert.equal(r.overkill,null); // ordinary HP subtraction does not apply
 assert.equal(r.requiresSpecialEffectTimingReview,true);
});
test('passive revival is a distinct event after zero HP',()=>{
 const r=inspect({beforeHp:4,damage:7,hpAfter:0,instantDefeat:false,revivedHp:10});
 assert.equal(r.hpAfter,0);assert.equal(r.revivedHp,10);
 assert.equal(r.revived,true);
 assert.equal(r.requiresSpecialEffectTimingReview,true);
});
test('an instant defeat followed by revival keeps both flags',()=>{
 const r=inspect({beforeHp:40,damage:5,hpAfter:0,instantDefeat:true,revivedHp:10});
 assert.equal(r.instantDefeat,true);assert.equal(r.revived,true);
});
test('a living player can take a zero-damage attack at 1 HP',()=>{
 const r=inspect({beforeHp:1,damage:0,hpAfter:1,instantDefeat:false});
 assert.equal(r.hitKind,'zero-damage');
});
test('nonlethal HP math inconsistency fails closed',()=>{
 assert.throws(()=>inspect({beforeHp:40,damage:5,hpAfter:38,instantDefeat:false}),/disagree/);
 assert.throws(()=>inspect({beforeHp:40,damage:5,hpAfter:0,instantDefeat:false}),/disagree/);
});
test('instant defeat cannot claim zero damage or a surviving HP',()=>{
 assert.throws(()=>inspect({beforeHp:40,damage:0,hpAfter:0,instantDefeat:true}),/Instant defeat/);
 assert.throws(()=>inspect({beforeHp:40,damage:2,hpAfter:38,instantDefeat:true}),/Instant defeat/);
});
test('passive recovery must follow zero HP',()=>{
 assert.throws(()=>inspect({beforeHp:40,damage:1,hpAfter:39,instantDefeat:false,revivedHp:10}),/Recovery/);
 assert.throws(()=>inspect({beforeHp:40,damage:40,hpAfter:0,instantDefeat:false,revivedHp:0}),/Recovery/);
 assert.throws(()=>inspect({beforeHp:40,damage:40,hpAfter:0,instantDefeat:false,revivedHp:-1}),/Recovery/);
});
test('malformed, fractional, negative and overflow input is rejected',()=>{
 const normal={beforeHp:40,damage:4,hpAfter:36,instantDefeat:false};
 for(const bad of [
  {beforeHp:0},{beforeHp:-1},{beforeHp:NaN},{beforeHp:1.5},
  {damage:-1},{damage:1.5},{damage:Number.MAX_SAFE_INTEGER+1},
  {hpAfter:-1},{hpAfter:NaN},{hpAfter:41},{instantDefeat:'false'}
 ])assert.throws(()=>inspect({...normal,...bad}));
});
