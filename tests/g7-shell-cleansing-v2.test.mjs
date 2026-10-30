import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {defineCard} from '../v2/foundation.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {planDiseaseCure} from '../v2/disease-rules.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
function room({a=['i017','i018','w016','d003'],
 b=['i002','i016','w027','d003'],diseaseA='heaven',
 diseaseB='fever',seed=12345}={}){
 const initial=createStagingRoom({firstSeatId:'A',rngSeed:seed,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]},catalog);
 initial.players[0].disease=diseaseA;
 initial.players[1].disease=diseaseB;
 const host=createLocalRoomHostFixture({initialState:initial,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function use(A,id,target='A',commandId='shell-use'){
 const v=A.read(),card=v.players[0].hand.find(c=>c.definitionId===id);
 assert(card,'expected a physical shell');
 const cmd={type:'useItem',actorId:'A',expectedRevision:v.revision,
  commandId,instanceId:card.instanceId,targetId:target};
 return {cmd,result:A.submit(cmd)};
}
function respond(B,mirror=false,commandId='shell-answer'){
 const v=B.read();
 const mirrorCard=v.players[1].hand.find(c=>c.definitionId==='i002');
 const cmd={type:'respondItem',actorId:'B',expectedRevision:v.revision,
  commandId,...(mirror?{mirrorInstanceId:mirrorCard.instanceId}:{})};
 return {cmd,result:B.submit(cmd)};
}
test('both shells are source-backed, typed, and do not turn on incomplete weighted deck',()=>{
 const smile=VERIFIED_BASIC_CARDS.find(c=>c.id==='i017');
 const heart=VERIFIED_BASIC_CARDS.find(c=>c.id==='i018');
 assert.deepEqual([smile.referenceName,smile.price,smile.weight,smile.effect],
  ['スマイルの貝がら',5,12,'cleanse_minor']);
 assert.deepEqual([heart.referenceName,heart.price,heart.weight,heart.effect],
  ['ハートの貝がら',15,6,'cleanse_all']);
 for(const [id,scope] of [['i017','minor'],['i018','all']]){
  assert.deepEqual(catalog.get(id).effects,
   [{when:'onDeclare',type:'cleanseAfflictions',params:{scope}}]);
  assert.deepEqual(catalog.get(id).playModes,['use']);
 }
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[168,429,false]);
 assert.equal(RESEARCH_CATALOG_CONTRACT.unique,summary.unique);
 assert.equal(RESEARCH_CATALOG_CONTRACT.slots,summary.slots);
 assert.throws(()=>convertLegacyCard({...smile,weight:6}),/Invalid source-backed shell/);
 assert.throws(()=>convertLegacyCard({...heart,price:5}),/Invalid source-backed shell/);
 for(const scope of ['unknown',null,4]){
  assert.throws(()=>defineCard({id:'invalid-shell',family:'item',element:'none',
   drawWeight:1,stats:{price:5},playModes:['use'],
   effects:[{when:'onDeclare',type:'cleanseAfflictions',params:{scope}}],
   source:{ruleset:'test',confidence:'test'}}),/Invalid cleanseAfflictions/);
 }
});
test('Smile cures ONLY cold and fever; Heart cures every modeled illness',()=>{
 for(const disease of [null,'cold','fever','hell','heaven']){
  const minor=planDiseaseCure(disease,'minor'),all=planDiseaseCure(disease,'all');
  const minorCured=['cold','fever'].includes(disease);
  assert.equal(minor.disease,minorCured?null:disease);
  assert.equal(all.disease,null);
  assert.equal(minor.cured,minorCured);
  assert.equal(all.cured,disease!==null);
 }
 assert.throws(()=>planDiseaseCure('cloud','all'),/Unknown illness stage/);
 assert.throws(()=>planDiseaseCure('cold','other'),/Invalid affliction cure scope/);
});
test('self-use Smile cures fever, then causes no illness tick after ordinary attack',()=>{
 const {A,B}=room({diseaseA:'fever'});
 const first=A.read();
 const {cmd}=use(A,'i017');
 const after=A.read();
 assert.equal(after.players[0].disease,null);
 assert.equal(after.players[0].hp,40);
 assert.equal(after.phase,'turn');
 assert.equal(after.players[0].hand.length,4);
 assert.equal(after.players[0].hand.some(c=>c.definitionId==='i017'),false);
 assert.equal(A.submit(cmd).duplicate,true);
 assert.deepEqual(A.read(),after);
 const sword=after.players[0].hand.find(c=>c.definitionId==='w016');
 A.submit({type:'playCards',actorId:'A',commandId:'attack-after-cure',
  expectedRevision:after.revision,targetId:'B',orderedInstanceIds:[sword.instanceId]});
 const defending=B.read();
 B.submit({type:'defend',actorId:'B',commandId:'pass-after-cure',
  expectedRevision:defending.revision,orderedInstanceIds:[]});
 assert.equal(A.read().players[0].hp,40);
 assert.equal(A.read().players[0].disease,null);
 assert.equal(A.read().activePlayerId,'B');
 assert.equal(first.players[0].hp,40);
});
test('self-use Smile cannot cure hell or heaven; the disease is not downgraded',()=>{
 for(const disease of ['hell','heaven']){
  const {A}=room({diseaseA:disease});
  use(A,'i017');
  const view=A.read();
  assert.equal(view.players[0].disease,disease);
  assert.equal(view.players[0].hp,40);
  assert.equal(view.activePlayerId,'A');
 }
});
test('self-use Heart cures hell and heaven without HP/MP change or RNG',()=>{
 for(const disease of ['cold','fever','hell','heaven']){
  const {A}=room({diseaseA:disease});
  use(A,'i018');
  const view=A.read();
  assert.equal(view.players[0].disease,null);
  assert.equal(view.players[0].hp,40);
  assert.equal(view.players[0].mp,10);
  assert.equal(view.players[0].hand.length,4);
  assert.equal(view.activePlayerId,'A');
 }
});
test('other-target Smile is announced, awaits response, then cures only fever',()=>{
 const {A,B}=room();
 const {cmd}=use(A,'i017','B');
 const pending=A.read(),other=B.read();
 assert.equal(other.phase,'itemDefense');
 assert.equal(other.pending.declaredItem.definitionId,'i017');
 assert.equal(other.players[1].disease,'fever','no effect before defender reply');
 assert.equal(pending.players[1].hand,undefined);
 assert.equal(other.players[0].hand,undefined);
 assert.equal(A.submit(cmd).duplicate,true);
 const {cmd:answer}=respond(B);
 assert.equal(B.read().players[1].disease,null);
 assert.equal(A.read().players[0].disease,'heaven');
 assert.equal(A.read().activePlayerId,'A');
 assert.equal(B.submit(answer).duplicate,true);
});
test('Super Mirror sends Smile back, but Smile cannot cure the attacker heaven disease',()=>{
 const {A,B}=room();
 use(A,'i017','B');
 respond(B,true);
 assert.equal(A.read().players[0].disease,'heaven');
 assert.equal(B.read().players[1].disease,'fever');
 assert.equal(B.read().players[1].hand.some(c=>c.definitionId==='i002'),false);
 assert.equal(B.read().players[1].hand.length,4);
});
test('other-target Heart cures fever, reflected Heart cures attacker Heaven Disease',()=>{
 for(const mirror of [false,true]){
  const {A,B}=room();
  use(A,'i018','B','heart-'+mirror);
  const waiting=B.read();
  assert.equal(waiting.players[1].disease,'fever');
  assert.equal(waiting.pending.declaredItem.definitionId,'i018');
  const {cmd}=respond(B,mirror,'heart-answer-'+mirror);
  assert.equal(A.read().players[0].disease,mirror?null:'heaven');
  assert.equal(B.read().players[1].disease,mirror?'fever':null);
  assert.equal(B.read().players[1].hand.length,4);
  assert.equal(A.read().players[0].hand.length,4);
  assert.equal(A.read().activePlayerId,'A');
  assert.equal(B.submit(cmd).duplicate,true);
 }
});
test('unafflicted target may use a Shell normally without touching illness RNG',()=>{
 const {A,B}=room({diseaseA:null,diseaseB:null});
 use(A,'i017','B');respond(B);
 assert.equal(A.read().players[0].disease,null);
 assert.equal(B.read().players[1].disease,null);
 assert.equal(A.read().activePlayerId,'A');
});
test('forged Shell or invalid Mirror cannot change illness or advance phase',()=>{
 const {A,B}=room();
 const first=A.read();
 const fake=first.players[0].hand.find(c=>c.definitionId==='w016');
 assert.throws(()=>A.submit({type:'useItem',actorId:'A',
  commandId:'bad-shell',expectedRevision:first.revision,
  instanceId:fake.instanceId,targetId:'B'}),/Only a plain owned recovery item/);
 assert.deepEqual(A.read(),first);
 use(A,'i018','B');
 const pending=B.read(),nonMirror=pending.players[1].hand.find(c=>c.definitionId==='w027');
 assert.throws(()=>B.submit({type:'respondItem',actorId:'B',
  commandId:'false-mirror',expectedRevision:pending.revision,
  mirrorInstanceId:nonMirror.instanceId}),/Only Super Mirror/);
 assert.deepEqual(B.read(),pending);
});
