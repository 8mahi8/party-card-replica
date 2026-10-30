import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {drawRandom32,defineCard} from '../v2/foundation.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {planDiseaseExposure,planDiseaseTurnEnd} from '../v2/disease-rules.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';
const {byId:catalog,summary}=migrateLegacyCatalog();
function room({a=['i016','w016','d003','i005'],b=['i002','i016','w027','d003'],
 seed=12345,diseaseA=null,diseaseB=null,mpA=10,mpB=10,hpA=40,hpB=40}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:seed,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]
 },catalog);
 state.players[0].disease=diseaseA;state.players[1].disease=diseaseB;
 state.players[0].mp=mpA;state.players[1].mp=mpB;
 state.players[0].hp=hpA;state.players[1].hp=hpB;
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function use(A,target='A',key='herb-a'){
 const v=A.read(),herb=v.players[0].hand.find(c=>c.definitionId==='i016');
 const cmd={type:'useItem',actorId:'A',commandId:key,expectedRevision:v.revision,
  instanceId:herb.instanceId,targetId:target};
 return {cmd,result:A.submit(cmd)};
}
function respond(B,mirror=false,key='herb-b'){
 const v=B.read(),c=v.players[1].hand.find(c=>c.definitionId==='i002');
 const cmd={type:'respondItem',actorId:'B',commandId:key,expectedRevision:v.revision,
  ...(mirror?{mirrorInstanceId:c.instanceId}:{})};
 return {cmd,result:B.submit(cmd)};
}
function attack(A,B,key='after-herb'){
 const v=A.read(),w=v.players[0].hand.find(c=>c.definitionId==='w016');
 A.submit({type:'playCards',actorId:'A',commandId:key,expectedRevision:v.revision,
  orderedInstanceIds:[w.instanceId],targetId:'B'});
 const defend=B.read();
 if(defend.phase==='defense')B.submit({
  type:'defend',actorId:'B',commandId:key+'-def',expectedRevision:defend.revision,
  orderedInstanceIds:[]});
}
test('Heaven Grass: MP+20, Heaven Disease, price20, 0.2%, deck stays partial',()=>{
 const c=VERIFIED_BASIC_CARDS.find(x=>x.id==='i016');
 assert.deepEqual([c.referenceName,c.price,c.weight,c.effect,c.restoreAmount],
  ['天国草',20,1,'heaven_herb',20]);
 const def=catalog.get('i016');
 assert.deepEqual(def.playModes,['use']);
 assert.deepEqual(def.effects,[{when:'onDeclare',type:'heavenHerb',params:{mp:20,disease:'heaven'}}]);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[172,433,false]);
 assert.equal(RESEARCH_CATALOG_CONTRACT.unique,summary.unique);
 assert.equal(RESEARCH_CATALOG_CONTRACT.slots,summary.slots);
 assert.throws(()=>convertLegacyCard({...c,price:10}),/Invalid source-backed heaven grass/);
 for(const params of [{mp:10,disease:'heaven'},{mp:20,disease:'cold'},{mp:20,disease:'heaven',x:true}])
  assert.throws(()=>defineCard({id:'bad-heaven',family:'item',element:'none',
   drawWeight:1,stats:{price:20},playModes:['use'],
   effects:[{when:'onDeclare',type:'heavenHerb',params}],
   source:{ruleset:'test',confidence:'test'}}),/Invalid heavenHerb/);
});
test('all four illnesses have sourced end-of-turn deltas and 5% progression',()=>{
 const rows=[['cold',-1,'fever'],['fever',-2,'hell'],['hell',-5,'heaven'],['heaven',5,'heaven']];
 for(const [stage,delta,next] of rows){
  const regular=planDiseaseTurnEnd(stage,40,0.5);
  assert.deepEqual([regular.disease,regular.hpAfter,regular.advanced,regular.fatal],
   [stage,40+delta,false,false],stage);
  const progressed=planDiseaseTurnEnd(stage,40,0.01);
  assert.deepEqual([progressed.disease,progressed.hpAfter,progressed.advanced,progressed.fatal],
   [next,stage==='heaven'?0:40+delta,true,stage==='heaven'],stage);
 }
 assert.deepEqual(planDiseaseTurnEnd(null,40).hpAfter,40);
 assert.equal(planDiseaseTurnEnd('heaven',98,0.5).hpAfter,99);
 assert.equal(planDiseaseTurnEnd('hell',3,0.5).hpAfter,0);
});
test('additional disease exposure escalates existing stage including fatal heaven fit',()=>{
 assert.deepEqual(planDiseaseExposure(null),{disease:'heaven',fatal:false,escalated:false});
 for(const [before,after] of [['cold','fever'],['fever','hell'],['hell','heaven']]){
  assert.deepEqual(planDiseaseExposure(before),{disease:after,fatal:false,escalated:true});
 }
 assert.deepEqual(planDiseaseExposure('heaven'),{disease:'heaven',fatal:true,escalated:true});
 assert.throws(()=>planDiseaseTurnEnd('imaginary',40,0.2),/Unknown illness stage/);
 assert.throws(()=>planDiseaseExposure('poison'),/Unknown illness stage/);
});
test('self-used Heaven Grass restores MP immediately, but heals HP only when TURN ends',()=>{
 const {A,B}=room();
 const before=A.read();
 const {cmd}=use(A);
 const current=A.read();
 assert.equal(current.players[0].mp,30);
 assert.equal(current.players[0].hp,40);
 assert.equal(current.players[0].disease,'heaven');
 assert.equal(current.phase,'turn');
 assert.equal(current.activePlayerId,'A');
 assert.equal(current.players[0].hand.length,4);
 assert.equal(current.players[0].hand.some(c=>c.definitionId==='i016'),false);
 assert.equal(A.submit(cmd).duplicate,true);
 assert.deepEqual(A.read(),current);
 assert.equal(B.read().players[0].disease,'heaven','illness is publicly visible');
 assert.equal(B.read().players[0].hand,undefined);
 assert.equal(before.players[1].disease,null);
 attack(A,B);
 const after=A.read();
 assert.equal(after.players[0].hp,45);
 assert.equal(after.players[0].disease,'heaven');
 assert.equal(after.activePlayerId,'B');
});
test('targeted Heaven Grass announces itself before Mirror/pass and heals only after response',()=>{
 const {A,B}=room();
 use(A,'B');
 const pre=A.read(),other=B.read();
 assert.equal(pre.phase,'itemDefense');assert.equal(pre.activePlayerId,'B');
 assert.equal(pre.pending.declaredItem.definitionId,'i016');
 assert.equal(other.players[1].mp,10);
 assert.equal(other.players[1].disease,null);
 assert.equal(pre.players[1].hand,undefined);
 assert.equal(other.players[0].hand,undefined);
 const {cmd}=respond(B);
 const a=A.read(),b=B.read();
 assert.equal(a.players[0].mp,10);
 assert.equal(b.players[1].mp,30);
 assert.equal(b.players[1].disease,'heaven');
 assert.equal(a.phase,'turn');
 assert.equal(B.submit(cmd).duplicate,true);
 assert.deepEqual(B.read(),b);
});
test('Super Mirror returns full Heaven Grass effect to user, consumes only Mirror',()=>{
 const {A,B}=room();
 use(A,'B');respond(B,true);
 const a=A.read(),b=B.read();
 assert.equal(a.players[0].mp,30);assert.equal(a.players[0].disease,'heaven');
 assert.equal(b.players[1].mp,10);assert.equal(b.players[1].disease,null);
 assert.equal(b.players[1].hand.some(c=>c.definitionId==='i002'),false);
 assert.equal(b.players[1].hand.filter(c=>c.definitionId==='d001').length,1);
 assert.equal(a.activePlayerId,'A');
});
test('Heaven Grass while already in Heaven Disease causes immediate death',()=>{
 const {A}=room({diseaseA:'heaven',a:['i016','w016','d003']});
 use(A);
 assert.equal(A.read().players[0].hp,0);
 assert.equal(A.read().phase,'finished');
 assert.equal(A.read().winnerId,undefined,'winner is intentionally not exposed in seat view');
});
test('Sun Charm revives immediate Heaven Grass fit but does not cure the disease',()=>{
 const {A}=room({diseaseA:'heaven'});
 use(A);
 const v=A.read();
 assert.equal(v.players[0].hp,10);
 assert.equal(v.players[0].disease,'heaven');
 assert.equal(v.players[0].hand.some(c=>c.definitionId==='i005'),false);
 assert.equal(v.activePlayerId,'A');
 assert.equal(v.players[0].hand.filter(c=>c.definitionId==='d001').length,2);
});
test('turn-end illness fatal damage can consume Sun Charm, illness remains',()=>{
 const {A,B}=room({diseaseA:'hell',hpA:3});
 attack(A,B);
 const a=A.read();
 assert.equal(a.players[0].hp,10);
 assert.equal(a.players[0].disease,'hell');
 assert.equal(a.players[0].hand.some(c=>c.definitionId==='i005'),false);
 assert.equal(a.players[0].hand.filter(c=>c.definitionId==='d001').length,2);
 assert.equal(a.activePlayerId,'B');
});
test('without charm, fatal end-of-turn illness finishes match after usual attack',()=>{
 const {A,B}=room({diseaseA:'hell',hpA:3,a:['w016','d003']});
 attack(A,B);
 const a=A.read();
 assert.equal(a.players[0].hp,0);
 assert.equal(a.phase,'finished');
 assert.equal(a.activePlayerId,null);
});
test('seeded 5% disease progression occurs once at turn end, not on item use',()=>{
 const {A,B}=room({seed:71,diseaseA:'cold'});
 use(A);
 assert.equal(A.read().players[0].disease,'fever','disease exposure advances cold');
 assert.equal(A.read().players[0].hp,40);
 attack(A,B);
 assert.equal(A.read().players[0].disease,'hell','seed 71 progression advances fever at turn end');
 assert.equal(A.read().players[0].hp,38);
});
test('unaffected turns do NOT advance disease RNG or change HP at end',()=>{
 const {A,B}=room({seed:71,a:['w016','d003']});
 attack(A,B);
 assert.equal(A.read().players[0].hp,40);
 assert.equal(A.read().players[0].disease,null);
});
