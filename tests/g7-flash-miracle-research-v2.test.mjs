import test from 'node:test';
import assert from 'node:assert/strict';
import {planFlashMiracleResearchFixture as plan,
 FLASH_MIRACLE_RESEARCH as ref} from '../v2/flash-miracle-research.mjs';
import {drawRandom32} from '../v2/foundation.mjs';

const players=()=>[
 {id:'A',hp:40,mp:10},{id:'B',hp:40,mp:10},
 {id:'C',hp:18,mp:10},{id:'D',hp:0,mp:10}
];
function sample(hit){
 for(let seed=1;seed<=1000;seed++){
   if((drawRandom32(seed).value<.25)===hit)return seed;
 }
 throw Error('No deterministic seed found');
}
test('Flash spell metadata is sourced and exactly 25%-attack1 light MP3',()=>{
 assert.deepEqual(ref,{referenceName:'閃光',attack:1,element:'light',
   mpCost:3,accuracyPercent:25,effect:'flash',scope:'allOpponents'});
 assert(Object.isFrozen(ref));
});
test('live target: accuracy hit with 0 guard previews HP-1 and Flash',()=>{
 const seed=sample(true),seats=players(),before=structuredClone(seats);
 const result=plan({players:seats,sourceId:'A',rngSeed:seed});
 assert.deepEqual(result.outcomes[0],{
   targetId:'B',accuracyHit:true,damage:1,hpAfter:39,wouldInflictFlash:true
 });
 assert.deepEqual(result.outcomes.map(x=>x.targetId),['B','C']);
 assert.equal(result.mpRequirement,3);
 assert.deepEqual(seats,before,'preview cannot pay MP or change health');
});
test('accuracy miss cannot deal damage or inflict Flash',()=>{
 const result=plan({players:players(),sourceId:'A',rngSeed:sample(false)});
 assert.deepEqual(result.outcomes[0],{
   targetId:'B',accuracyHit:false,damage:0,hpAfter:40,wouldInflictFlash:false
 });
});
test('a preselected Rainbow Curtain plus legal guard can stop a hit',()=>{
 const result=plan({players:players(),sourceId:'A',rngSeed:sample(true),
   defenses:{B:{rainbowCurtain:true,shields:[{element:'none',guard:3}]}}});
 assert.deepEqual(result.outcomes[0],{
   targetId:'B',accuracyHit:true,damage:0,hpAfter:40,wouldInflictFlash:false
 });
});
test('light attacks cannot be defended by ordinary shields without a Curtain',()=>{
 assert.throws(()=>plan({players:players(),sourceId:'A',rngSeed:sample(true),
   defenses:{B:{shields:[{element:'light',guard:3}]}}}),/incompatible shield/);
});
test('defender at HP1 can be defeated, but no surviving Flash to attach',()=>{
 const ps=players();ps[1].hp=1;
 const result=plan({players:ps,sourceId:'A',rngSeed:sample(true)});
 assert.equal(result.outcomes[0].hpAfter,0);
 assert.equal(result.outcomes[0].wouldInflictFlash,false);
});
test('multiple living targets each use one different seeded roll',()=>{
 const ps=players(),seed=71,result=plan({players:ps,sourceId:'A',rngSeed:seed});
 let cursor=seed;
 for(const outcome of result.outcomes){
   const r=drawRandom32(cursor);
   assert.equal(outcome.accuracyHit,r.value<.25);
   cursor=r.nextSeed;
 }
 assert.equal(result.nextSeed,cursor);
 assert.equal(result.outcomes.length,2);
});
test('no MP or invalid fake defense data is rejected before any mutation',()=>{
 const ps=players(),original=structuredClone(ps);
 ps[0].mp=2;
 assert.throws(()=>plan({players:ps,sourceId:'A',rngSeed:71}),/MP3/);
 ps[0].mp=3;
 for(const defenses of [
  {D:{shields:[]}},{A:{shields:[]}}, {B:{shields:[],rainbowCurtain:'yes'}},
  {B:{shields:[{element:'none',guard:-1}]}},
  {B:{shields:[{element:'none',guard:1,attack:3}]}},
  null
 ])assert.throws(()=>plan({players:ps,sourceId:'A',rngSeed:71,defenses}));
 assert.deepEqual(ps,{...original[0],mp:3}&&
  [ {...original[0],mp:3},...original.slice(1)]);
});
