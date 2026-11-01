import test from 'node:test';
import assert from 'node:assert/strict';
import {drawRandom32} from '../v2/foundation.mjs';
import {planAreaAccuracyResearchFixture as plan} from '../v2/area-accuracy-research.mjs';

const players=()=>[
 {id:'A',hp:40},{id:'B',hp:40},{id:'C',hp:0},
 {id:'D',hp:10},{id:'E',hp:30}
];

test('Flash 25%-per-opponent: each living target gets its own RNG sample',()=>{
 const before=players(),copy=JSON.stringify(before);
 const result=plan({players:before,sourceId:'A',accuracyPercent:25,rngSeed:71});
 let seed=71;const expected=[];
 for(const id of ['B','D','E']){
  const sample=drawRandom32(seed);seed=sample.nextSeed;
  expected.push({targetId:id,hit:sample.value<0.25});
 }
 assert.deepEqual(result.outcomes,expected);
 assert.equal(result.nextSeed,seed);
 assert.equal(JSON.stringify(before),copy,'planner cannot mutate host state');
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.outcomes),true);
 assert.equal(Object.isFrozen(result.outcomes[0]),true);
 assert.deepEqual(plan({players:before,sourceId:'A',accuracyPercent:25,rngSeed:71}),result,
  'same seed and seats must be replayable');
});
test('only source-backed 25/50/75 rates accepted; results stay per recipient',()=>{
 const ps=players();
 const twentyFive=plan({players:ps,sourceId:'A',accuracyPercent:25,rngSeed:12345});
 const fifty=plan({players:ps,sourceId:'A',accuracyPercent:50,rngSeed:12345});
 const seventyFive=plan({players:ps,sourceId:'A',accuracyPercent:75,rngSeed:12345});
 assert.equal(twentyFive.nextSeed,fifty.nextSeed);
 assert.equal(twentyFive.nextSeed,seventyFive.nextSeed);
 for(let i=0;i<3;i++){
  if(twentyFive.outcomes[i].hit)assert.equal(fifty.outcomes[i].hit,true);
  if(fifty.outcomes[i].hit)assert.equal(seventyFive.outcomes[i].hit,true);
 }
});
test('a two-seat Flash trial rolls once, not once for the entire room',()=>{
 const result=plan({players:[{id:'A',hp:40},{id:'B',hp:40}],
  sourceId:'A',accuracyPercent:25,rngSeed:2026});
 assert.equal(result.outcomes.length,1);
 assert.equal(result.outcomes[0].targetId,'B');
 assert.equal(result.nextSeed,drawRandom32(2026).nextSeed);
});
test('invalid source, rate, seed, team metadata and seating fail before effects',()=>{
 const valid={players:players(),sourceId:'A',accuracyPercent:25,rngSeed:71};
 for(const changes of [
  {accuracyPercent:0},{accuracyPercent:1},{accuracyPercent:100},
  {rngSeed:0},{rngSeed:2**32},{sourceId:'C'}, {sourceId:'wrong'},
  {players:[{id:'A',hp:40},{id:'A',hp:40}]},
  {players:[{id:'A',hp:40},{id:'B',hp:40,teamId:'blue'}]},
  {players:[{id:'A',hp:40},{id:'B',hp:-1}]},
  {players:[{id:'A',hp:40},{id:'B',hp:0}]}
 ])assert.throws(()=>plan({...valid,...changes}),/Area accuracy research:/);
});
test('sampling cannot inflict Flash or bypass defense by itself',()=>{
 const ps=[{id:'A',hp:40,afflictions:[]},{id:'B',hp:40,afflictions:[]}];
 const before=structuredClone(ps);
 const rolled=plan({players:ps,sourceId:'A',accuracyPercent:25,rngSeed:71});
 assert.ok(typeof rolled.outcomes[0].hit==='boolean');
 assert.deepEqual(ps,before,'no HP/status/MP/hand changes from pure accuracy');
 assert.equal(Object.hasOwn(rolled,'damage'),false);
 assert.equal(Object.hasOwn(rolled.outcomes[0],'affliction'),false);
});
