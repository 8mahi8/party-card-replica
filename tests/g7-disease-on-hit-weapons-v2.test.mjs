import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {defineCard} from '../v2/foundation.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {planDiseaseExposure} from '../v2/disease-rules.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
const weapons=[
 ['w056','疾風剣',9,10,'none','cold'],
 ['w057','激烈疾風剣',13,15,'none','cold'],
 ['w058','風のカギ爪',1,10,'earth','cold'],
 ['w059','地獄のハサミ',8,15,'none','hell']
];
function room({a=['w056','i018','d003','i005'],
 b=['d003','d009','d017','i002'],
 diseaseA=null,diseaseB=null,seed=12345,hpB=40}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:seed,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]},catalog);
 state.players[0].disease=diseaseA;
 state.players[1].disease=diseaseB;
 state.players[1].hp=hpB;
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function strike(A,B,id,defenderIds=[],commandId='disease-strike'){
 const start=A.read(),w=start.players[0].hand.find(c=>c.definitionId===id);
 assert(w,'attacker lacks source weapon '+id);
 const cmd={type:'playCards',actorId:'A',commandId,expectedRevision:start.revision,
  targetId:'B',orderedInstanceIds:[w.instanceId]};
 const declared=A.submit(cmd);
 const defender=B.read();
 const ids=defenderIds.map(defId=>{
  const found=defender.players[1].hand.find(c=>c.definitionId===defId);
  assert(found,'defender missing '+defId);
  return found.instanceId;
 });
 const answer={type:'defend',actorId:'B',commandId:commandId+'-def',
  expectedRevision:defender.revision,orderedInstanceIds:ids};
 const resolved=B.submit(answer);
 return {cmd,answer,declared,resolved,before:defender,after:A.read()};
}
test('4 sourced on-hit weapons preserve exact attack, element, price and 1/500 weight',()=>{
 for(const [id,name,attack,price,element,disease] of weapons){
  const src=VERIFIED_BASIC_CARDS.find(c=>c.id===id);
  assert.deepEqual([src.referenceName,src.attack,src.price,src.element,src.weight,src.diseaseOnHit],
   [name,attack,price,element,1,disease]);
  const def=catalog.get(id);
  assert.deepEqual(def.effects,[{when:'afterHit',type:'inflictDisease',params:{disease}}]);
  assert.deepEqual(def.playModes,['mainAttack']);
  assert.throws(()=>convertLegacyCard({...src,diseaseOnHit:'fever'}),
   /Unverified disease weapon definition/);
 }
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[172,433,false]);
 assert.equal(RESEARCH_CATALOG_CONTRACT.unique,summary.unique);
 assert.equal(RESEARCH_CATALOG_CONTRACT.slots,summary.slots);
 for(const params of [{disease:'fever'},{disease:'cold',extra:1},{disease:'wrong'}])
  assert.throws(()=>defineCard({id:'invalid-disease',family:'weapon',element:'none',
   drawWeight:1,stats:{attack:5,price:10},playModes:['mainAttack'],
   effects:[{when:'afterHit',type:'inflictDisease',params}],
   source:{ruleset:'test',confidence:'test'}}),/Invalid inflictDisease/);
});
test('new disease exposure starts with source stage; any existing stage escalates just once',()=>{
 assert.equal(planDiseaseExposure(null,'cold').disease,'cold');
 assert.equal(planDiseaseExposure(null,'hell').disease,'hell');
 assert.equal(planDiseaseExposure('cold','hell').disease,'fever');
 assert.equal(planDiseaseExposure('fever','cold').disease,'hell');
 assert.equal(planDiseaseExposure('hell','cold').disease,'heaven');
 assert.equal(planDiseaseExposure('heaven','hell').fatal,true);
 assert.throws(()=>planDiseaseExposure(null,'mist'),/Unknown incoming illness/);
});
test('one damaging hit applies cold and preserves post-attack normal turn advancement',()=>{
 const {A,B}=room({a:['w056','d003'],b:['d001','d003']});
 const result=strike(A,B,'w056');
 assert.equal(result.before.players[1].disease,null);
 assert.equal(result.after.players[1].disease,'cold');
 assert.equal(result.after.players[1].hp,31);
 assert.equal(result.after.activePlayerId,'B');
 assert.equal(result.after.phase,'turn');
 assert.equal(result.after.players[0].hp,40);
 assert.equal(B.read().players[0].hand,undefined);
 assert.equal(B.submit(result.answer).duplicate,true);
 assert.deepEqual(A.read(),result.after);
});
test('each of the 4 weapons inflicts exactly its own disease when not defended',()=>{
 for(const [id,,damage,,element,disease] of weapons){
  const {A,B}=room({a:[id,'d003'],b:['d003','d009','d017','i002']});
  const {after}=strike(A,B,id);
  assert.equal(after.players[1].hp,40-damage);
  assert.equal(after.players[1].disease,disease,element);
 }
});
test('zero HP damage under a full shield never inflicts cold or hell',()=>{
 for(const [id,shield] of [['w056','d009'],['w059','d009'],['w058','d046'],['w057','d009']]){
  const {A,B}=room({a:[id,'d003'],b:[shield,'d003']});
  const {after}=strike(A,B,id,[shield]);
  assert.equal(after.players[1].hp,40);
  assert.equal(after.players[1].disease,null);
 }
});
test('positive damage through partial armor still inflicts cold',()=>{
 const {A,B}=room({a:['w056','d003'],b:['d003','d001']});
 const {after}=strike(A,B,'w056',['d003']);
 assert.equal(after.players[1].hp,34);
 assert.equal(after.players[1].disease,'cold');
});
test('repeated infection advances fever to hell by exactly one stage',()=>{
 const {A,B}=room({a:['w056','d003'],diseaseB:'fever'});
 const {after}=strike(A,B,'w056');
 assert.equal(after.players[1].disease,'hell');
});
test('a reflected neutral disease weapon infects its original attacker, not defender',()=>{
 const {A,B}=room({a:['w056','d003'],b:['i002','d003']});
 const start=A.read();
 const w=start.players[0].hand.find(c=>c.definitionId==='w056');
 A.submit({type:'playCards',actorId:'A',commandId:'reflect-illness-attack',
   expectedRevision:start.revision,targetId:'B',orderedInstanceIds:[w.instanceId]});
 const ready=B.read(),mirror=ready.players[1].hand.find(c=>c.definitionId==='i002');
 B.submit({type:'defend',actorId:'B',commandId:'reflect-illness-mirror',
  expectedRevision:ready.revision,orderedInstanceIds:[mirror.instanceId]});
 const bounced=A.read();
 assert.equal(bounced.phase,'defense');
 assert.equal(bounced.activePlayerId,'A');
 A.submit({type:'defend',actorId:'A',commandId:'reflect-illness-pass',
  expectedRevision:bounced.revision,orderedInstanceIds:[]});
 const result=A.read();
 assert.equal(result.players[1].disease,null);
 assert.equal(result.players[0].disease,'cold');
 assert.equal(result.players[0].hp,30,'9 damage + 1 own-turn illness');
 assert.equal(result.activePlayerId,'B');
});
test('a damaging disease weapon can trigger a Heaven Disease fatal fit',()=>{
 const {A,B}=room({a:['w056','d003'],b:['d003','d001'],diseaseB:'heaven'});
 const {after}=strike(A,B,'w056');
 assert.equal(after.players[1].hp,0);
 assert.equal(after.players[1].disease,'heaven');
 assert.equal(after.phase,'finished');
});
test('Sun Charm revives at 10 from infection fit but never cures Heaven Disease',()=>{
 const {A,B}=room({a:['w059','d003'],b:['i005','d003'],diseaseB:'heaven'});
 const {after}=strike(A,B,'w059');
 assert.equal(after.players[1].hp,10);
 assert.equal(after.players[1].disease,'heaven');
 assert.equal(B.read().players[1].hand.some(c=>c.definitionId==='i005'),false);
 assert.equal(after.phase,'turn');
});
test('disease weapons do not infect when healing items or no-damage actions occur',()=>{
 const {A,B}=room({a:['w056','d003'],b:['d009','d003']});
 const result=strike(A,B,'w056',['d009']);
 assert.equal(result.after.players[1].disease,null);
 assert.equal(result.after.players[0].disease,null);
});
