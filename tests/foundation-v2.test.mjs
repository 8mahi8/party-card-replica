import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defineCard,buildCatalog,createInstance,selectInstances,
  projectPlayerView,validateCommandEnvelope,drawRandom32
} from '../v2/foundation.mjs';

const sword=()=>({
  id:'w.demo.01',family:'weapon',element:'none',
  stats:{attack:10,guard:0,price:4,mpCost:0},
  playModes:['mainAttack'],drawWeight:7,effects:[],
  source:{ruleset:'wiki-2025',confidence:'secondary'}
});

test('new card definitions have normalized frozen data, not arbitrary executable effects',()=>{
  const card=defineCard(sword());
  assert.equal(card.stats.attack,10);
  assert.equal(card.stats.guard,0);
  assert.ok(Object.isFrozen(card));
  assert.ok(Object.isFrozen(card.stats));
  assert.ok(Object.isFrozen(card.effects));
});
test('unknown effect type and invalid values fail before being registered',()=>{
  assert.throws(()=>defineCard({...sword(),effects:[{when:'onDefense',type:'arbitraryScript',params:{}}]}),/Unknown effect type/);
  assert.throws(()=>defineCard({...sword(),drawWeight:0}),/draw weight/);
  assert.throws(()=>defineCard({...sword(),stats:{attack:-5}}),/stat attack/);
  assert.throws(()=>defineCard({...sword(),source:null}),/Versioned evidence/);
});
test('known complex reaction can be expressed as a tagged declarative effect',()=>{
  const spec={...sword(),effects:[{when:'onDefense',type:'redirectAttack',
    params:{mode:'reflect',scope:'neutralWeapon'}}]};
  const registered=defineCard(spec);
  assert.equal(registered.effects[0].type,'redirectAttack');
  assert.equal(registered.effects[0].params.scope,'neutralWeapon');
});
test('catalog rejects duplicate definition IDs',()=>{
  assert.throws(()=>buildCatalog([sword(),sword()]),/Duplicate definition ID/);
});
test('two drawn copies of same card use distinct physical instance IDs',()=>{
  const catalog=buildCatalog([sword()]);
  const one=createInstance('w.demo.01',1,catalog),two=createInstance('w.demo.01',2,catalog);
  assert.equal(one.definitionId,two.definitionId);
  assert.notEqual(one.instanceId,two.instanceId);
  assert.equal(catalog.size,1);
});
test('selection preserves sender order and rejects duplicates/stale instances',()=>{
  const catalog=buildCatalog([sword()]);
  const hand=[createInstance('w.demo.01',1,catalog),createInstance('w.demo.01',2,catalog)];
  assert.deepEqual(selectInstances(hand,['ci-2','ci-1']).map(x=>x.instanceId),['ci-2','ci-1']);
  assert.throws(()=>selectInstances(hand,['ci-1','ci-1']),/Repeated/);
  assert.throws(()=>selectInstances(hand,['ci-100']),/not held/);
  assert.throws(()=>selectInstances(hand,[]),/Missing hand/);
});
test('viewer projection reveals only own hand, never rival hand or draw state',()=>{
  const state={revision:4,phase:'turn',activePlayerId:'A',secretDeck:['topSecret'],
    players:[
      {id:'A',hp:40,mp:10,money:20,hand:[{instanceId:'ci-1',definitionId:'w.demo.01'}]},
      {id:'B',hp:30,mp:5,money:2,hand:[{instanceId:'secret-card',definitionId:'secret-card-type'}]}
    ]};
  const view=projectPlayerView(state,'A');
  assert.deepEqual(view.players[0].hand.map(x=>x.instanceId),['ci-1']);
  assert.equal(view.players[1].handCount,1);
  assert.equal(Object.hasOwn(view.players[1],'hand'),false);
  assert.equal(JSON.stringify(view).includes('secret'),false);
  assert.equal(Object.hasOwn(view,'secretDeck'),false);
  assert.throws(()=>projectPlayerView(state,'C'),/Unknown viewer/);
});
test('stale revision, unknown actor and non-held card commands are rejected',()=>{
  const state={revision:4,players:[{id:'A',hand:[{instanceId:'ci-1',definitionId:'w.demo.01'}]}]};
  const command={commandId:'command-01',actorId:'A',expectedRevision:4,
    type:'playCards',orderedInstanceIds:['ci-1']};
  assert.equal(validateCommandEnvelope(state,command),true);
  assert.throws(()=>validateCommandEnvelope(state,{...command,expectedRevision:3}),/Stale/);
  assert.throws(()=>validateCommandEnvelope(state,{...command,actorId:'B'}),/Unknown actor/);
  assert.throws(()=>validateCommandEnvelope(state,{...command,orderedInstanceIds:['ci-4']}),/not held/);
});
test('seeded draws are reproducible and do not depend on Math.random',()=>{
  let a=123456,b=123456;const ra=[],rb=[];
  for(let i=0;i<5;i++){
    const nextA=drawRandom32(a),nextB=drawRandom32(b);
    a=nextA.nextSeed;b=nextB.nextSeed;ra.push(nextA.value);rb.push(nextB.value);
  }
  assert.deepEqual(ra,rb);
  assert.ok(ra.every(n=>n>=0&&n<1));
  assert.throws(()=>drawRandom32(0),/seed/);
});
