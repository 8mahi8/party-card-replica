import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
const sourced=[
 ['i006','スマイルのしずく','hp',5,1,12],
 ['i007','ハートのしずく','hp',10,3,8],
 ['i008','ロマンスウォーター','hp',15,5,4],
 ['i009','天の川のおいしい水','hp',20,20,1],
 ['i010','スマイルの花','mp',5,1,12],
 ['i011','ハートの花','mp',10,3,8],
 ['i012','ロマンスの香木','mp',15,5,4]
];
function room(a=['i006','i010','w016'],b=['d001'],hp=40,mp=20){
 const initialState=createStagingRoom({
  firstSeatId:'A',rngSeed:71,rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]
 },catalog);
 initialState.players[0].hp=hp;initialState.players[0].mp=mp;
 const host=createLocalRoomHostFixture({initialState,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function action(endpoint,type,id=null,override={}){
 const view=endpoint.read(),actor=view.activePlayerId;
 const cmd={commandId:'g7-'+actor+'-'+type+'-'+view.revision,
   expectedRevision:view.revision,actorId:actor,type,
   ...(type==='useItem'?{instanceId:id}:{}),
   ...(type==='playCards'?{targetId:actor==='A'?'B':'A',orderedInstanceIds:[id]}:{}),
   ...(type==='defend'?{orderedInstanceIds:id?[id]:[]}:{}),
   ...override};
 return {cmd,result:endpoint.submit(cmd)};
}
test('seven plain HP/MP artifacts are individually sourced, typed and leave deck incomplete',()=>{
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
 assert.equal(summary.unique,164);
 assert.equal(summary.slots,409);
 assert.equal(summary.complete,false);
 for(const [id,name,resource,amount,price,weight] of sourced){
  const src=VERIFIED_BASIC_CARDS.find(c=>c.id===id),def=catalog.get(id);
  assert.equal(src.referenceName,name);
  assert.equal(src.restoreAmount,amount);
  assert.equal(src.effect,'restore_'+resource);
  assert.equal(src.weight,weight);
  assert.equal(src.price,price);
  assert.equal(def.drawWeight,weight);
  assert.equal(def.stats.price,price);
  assert.equal(def.family,'item');
  assert.deepEqual(def.playModes,['use']);
  assert.deepEqual(def.effects,[{when:'onDeclare',type:'restoreResource',params:{resource,amount}}]);
 }
});
test('every sourced restorative independently restores exactly its printed amount',()=>{
 for(const [id,,resource,amount] of sourced){
  const {A}=room([id,'w016'],['d001'],20,10);
  const idInstance=A.read().players[0].hand[0].instanceId;
  const before=A.read();
  action(A,'useItem',idInstance);
  const after=A.read();
  assert.equal(after.players[0][resource],before.players[0][resource]+amount,id);
  assert.equal(after.activePlayerId,'A',id+' must not end the same attack turn');
  assert.equal(after.phase,'turn',id);
  assert.equal(after.turnCount,before.turnCount,id);
  assert.equal(after.players[0].hand.length,2,id);
  assert.equal(after.players[0].hand[0].definitionId,'w016',id);
  assert.equal(after.players[0].hand[1].definitionId,'d001',id+' fixed research draw');
  assert.equal(after.players[1].hand,undefined,id+' guest hand hidden');
 }
});
test('resources cap at 99 and recovery at cap still consumes only that physical card',()=>{
 const {A}=room(['i009','i012','w016'],[],98,97);
 const first=A.read().players[0].hand[0].instanceId;
 const {cmd}=action(A,'useItem',first);
 assert.equal(A.read().players[0].hp,99);
 const after=A.read();
 assert.equal(A.submit(cmd).duplicate,true,'repeated command ID cannot duplicate recovery');
 const other=A.read().players[0].hand.find(x=>x.definitionId==='i012');
 assert.throws(()=>A.submit({...cmd,instanceId:other.instanceId}),
  /Conflicting commandId reuse/,'same command ID may not change the used item');
 assert.deepEqual(A.read(),after,'receipt retry is idempotent');
 const next=A.read().players[0].hand.find(c=>c.definitionId==='i012').instanceId;
 action(A,'useItem',next);
 assert.equal(A.read().players[0].mp,99);
 assert.equal(A.read().players[0].hp,99);
});
test('HP and MP recovery can precede an attack in the same player turn',()=>{
 const {A,B}=room(['i006','i010','w016'],['d003'],30,15);
 for(const res of ['i006','i010']){
  const held=A.read().players[0].hand.find(x=>x.definitionId===res);
  action(A,'useItem',held.instanceId);
  assert.equal(A.read().activePlayerId,'A');
 }
 assert.equal(A.read().players[0].hp,35);
 assert.equal(A.read().players[0].mp,20);
 const sword=A.read().players[0].hand.find(c=>c.definitionId==='w016');
 action(A,'playCards',sword.instanceId);
 assert.equal(B.read().phase,'defense');
 const shield=B.read().players[1].hand[0];
 action(B,'defend',shield.instanceId);
 assert.equal(A.read().activePlayerId,'B');
 assert.equal(A.read().players[0].hp,35);
 assert.equal(A.read().players[1].hp,33);
});
test('recovery rejects non-items, opponent cards, already consumed cards and an out-of-turn player',()=>{
 const {A,B}=room(['w016','i006'],['i010']);
 const initial=A.read(),weapon=initial.players[0].hand[0].instanceId;
 assert.throws(()=>action(A,'useItem',weapon),/Only a plain owned recovery item/);
 assert.deepEqual(A.read(),initial);
 assert.throws(()=>action(A,'useItem','ci-999'),/Only a plain owned recovery item/);
 assert.deepEqual(A.read(),initial);
 const healing=initial.players[0].hand[1].instanceId;
 action(A,'useItem',healing);
 const before=A.read();
 assert.throws(()=>action(A,'useItem',healing),/Only a plain owned recovery item/);
 assert.deepEqual(A.read(),before);
 const guest=B.read().players[1].hand[0].instanceId;
 assert.throws(()=>B.submit({
  commandId:'guest-wrong-turn',expectedRevision:B.read().revision,actorId:'B',
  type:'useItem',instanceId:guest
 }),/Not the active seat/);
});
test('typed resource effects reject impossible resource keys and unsafe magnitudes',async()=>{
 const {defineCard}=await import('../v2/foundation.mjs');
 for(const params of [
  {resource:'money',amount:5},{resource:'hp',amount:0},
  {resource:'mp',amount:-2},{resource:'hp',amount:100},
  {resource:'hp',amount:5,secret:'extra'}
 ]){
  assert.throws(()=>defineCard({id:'bad',family:'item',element:'none',
   drawWeight:1,playModes:['use'],stats:{price:1},
   effects:[{when:'onDeclare',type:'restoreResource',params}],
   source:{ruleset:'test',confidence:'test'}}),/Invalid restoreResource/);
 }
});
