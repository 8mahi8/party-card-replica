import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';
const {byId:catalog,summary}=migrateLegacyCatalog();
function match({a=['m013','m014','i003','d003'],
 b=['i002','d018','w016','i018'],mpA=25,mpB=10,
 aLearned=[],bLearned=[],diseaseA=null,diseaseB=null,seed=12345}={}){
 const init=createStagingRoom({firstSeatId:'A',rngSeed:seed,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]},catalog);
 init.players[0].mp=mpA;init.players[1].mp=mpB;
 init.players[0].learned=[...aLearned];init.players[1].learned=[...bLearned];
 init.players[0].disease=diseaseA;init.players[1].disease=diseaseB;
 const h=createLocalRoomHostFixture({initialState:init,catalog});
 return {A:h.connectSeatFixture('A'),B:h.connectSeatFixture('B')};
}
function send(client,actorId,type,fields,key){
 return client.submit({type,actorId,commandId:key,expectedRevision:client.read().revision,...fields});
}
function cast(A,B,id,{spirit=false,targetId='B',response=[]}={}){
 const v=A.read(),card=v.players[0].hand.find(c=>c.definitionId===id);
 const selected=[card.instanceId];
 if(spirit)selected.push(v.players[0].hand.find(c=>c.definitionId==='i003').instanceId);
 send(A,'A','playCards',{targetId,orderedInstanceIds:selected},'cast-'+id);
 if(targetId==='B')send(B,'B','defend',{orderedInstanceIds:response},'respond-'+id);
 return A.read();
}
test('Wind/Heaven Wind source MP, zero damage and 1/500 weight are typed, deck remains incomplete',()=>{
 for(const [id,name,mp,disease] of [['m013','風',6,'cold'],['m014','天国風',15,'heaven']]){
  const src=VERIFIED_BASIC_CARDS.find(c=>c.id===id);
  assert.deepEqual([src.referenceName,src.mpCost,src.weight,src.element,src.disease],
   [name,mp,1,'none',disease]);
  const def=catalog.get(id);
  assert.equal(def.stats.attack,0);
  assert.deepEqual(def.playModes,['cast']);
  assert.deepEqual(def.effects,[{when:'onDeclare',type:'inflictDisease',params:{disease}}]);
  assert.throws(()=>convertLegacyCard({...src,mpCost:1}),/Unverified miracle affliction/);
 }
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[179,440,false]);
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
});
test('Wind consumes 6 MP, learns once and infects without HP damage',()=>{
 const {A,B}=match();
 const before=A.read();
 const result=cast(A,B,'m013');
 assert.equal(result.players[0].mp,19);
 assert.equal(result.players[0].learned.includes('m013'),true);
 assert.equal(result.players[0].hand.length,4);
 assert.equal(result.players[1].hp,40);
 assert.equal(result.players[1].disease,'cold');
 assert.equal(result.activePlayerId,'B');
 assert.equal(before.players[1].disease,null);
 assert.equal(B.read().players[0].learned,undefined);
});
test('Heaven Wind consumes 15 MP, gives Heaven Disease, no direct HP change',()=>{
 const {A,B}=match();
 const after=cast(A,B,'m014');
 assert.equal(after.players[0].mp,10);
 assert.equal(after.players[1].disease,'heaven');
 assert.equal(after.players[1].hp,40);
 assert.equal(after.activePlayerId,'B');
});
test('already Heaven-diseased enemy has fatal fit on Wind; held Sun Charm revives',()=>{
 const {A,B}=match({b:['i005','d018','w016','i018'],diseaseB:'heaven'});
 const result=cast(A,B,'m013');
 assert.equal(result.players[1].hp,10);
 assert.equal(result.players[1].disease,'heaven');
 assert.equal(B.read().players[1].hand.some(c=>c.definitionId==='i005'),false);
});
test('Angel miracle stopper prevents any Wind infection, but spell still costs MP and is learned',()=>{
 const {A,B}=match();
 const m=B.read().players[1].hand.find(c=>c.definitionId==='d018').instanceId;
 const result=cast(A,B,'m013',{response:[m]});
 assert.equal(result.players[1].disease,null);
 assert.equal(result.players[1].hp,40);
 assert.equal(result.players[0].mp,19);
 assert.equal(result.players[0].learned.includes('m013'),true);
 assert.equal(B.read().players[1].hand.some(c=>c.instanceId===m),false);
});
test('Super Mirror bounces Wind, then caster may defend reflected spell',()=>{
 const {A,B}=match();
 const start=A.read(),wind=start.players[0].hand.find(c=>c.definitionId==='m013');
 send(A,'A','playCards',{targetId:'B',orderedInstanceIds:[wind.instanceId]},'wind-attack');
 const incoming=B.read(),mirror=incoming.players[1].hand.find(c=>c.definitionId==='i002');
 send(B,'B','defend',{orderedInstanceIds:[mirror.instanceId]},'wind-reflect');
 const bounced=A.read();
 assert.equal(bounced.phase,'defense');
 assert.equal(bounced.activePlayerId,'A');
 assert.equal(bounced.players[0].disease,null);
 send(A,'A','defend',{orderedInstanceIds:[]},'wind-reflected-hit');
 const after=A.read();
 assert.equal(after.players[1].disease,null);
 assert.equal(after.players[0].disease,'cold');
 assert.equal(after.players[0].hp,39,'cold ticks at the end of original casters turn');
 assert.equal(after.players[0].mp,19,'cost paid only once despite reflection');
 assert.equal(after.activePlayerId,'B');
});
test('Spirit immediately after Heaven Wind waives MP15, both cards replenish',()=>{
 const {A,B}=match({mpA:0});
 const after=cast(A,B,'m014',{spirit:true});
 assert.equal(after.players[0].mp,0);
 assert.equal(after.players[0].hand.length,4);
 assert.equal(after.players[0].learned.includes('m014'),true);
 assert.equal(after.players[1].disease,'heaven');
});
test('self-target Heaven Wind ticks +5 at own turn end without a response',()=>{
 const {A,B}=match({diseaseA:null});
 const before=A.read(),card=before.players[0].hand.find(c=>c.definitionId==='m014');
 send(A,'A','playCards',{targetId:'A',orderedInstanceIds:[card.instanceId]},'heaven-self');
 const result=A.read();
 assert.equal(result.players[0].hp,45);
 assert.equal(result.players[0].disease,'heaven');
 assert.equal(result.players[1].disease,null);
 assert.equal(result.players[0].mp,10);
 assert.equal(result.activePlayerId,'B');
});
test('learned Wind can be recast next turn by paying MP6 and drawing once',()=>{
 const {A,B}=match();
 cast(A,B,'m013');
 let bv=B.read(),weapon=bv.players[1].hand.find(c=>c.definitionId==='w016');
 send(B,'B','playCards',{targetId:'A',orderedInstanceIds:[weapon.instanceId]},'turn-B');
 send(A,'A','defend',{orderedInstanceIds:[]},'turn-A-defend');
 assert.equal(A.read().activePlayerId,'A');
 const before=A.read(),count=before.players[0].hand.length;
 send(A,'A','castLearned',{targetId:'B',learnedDefinitionId:'m013'},'learned-wind');
 assert.equal(B.read().phase,'defense');
 send(B,'B','defend',{orderedInstanceIds:[]},'learned-response');
 const after=A.read();
 assert.equal(after.players[0].mp,13,'Wind MP6 twice');
 assert.equal(after.players[0].hand.length,count+1,'learned miracle creates an extra draw');
 assert.equal(after.players[0].learned.filter(x=>x==='m013').length,1);
 assert.equal(after.players[1].disease,'fever','repeated Wind escalates cold to fever');
});
test('insufficient MP fails before staging a dangling defense',()=>{
 const {A}=match({mpA:5});
 const v=A.read(),card=v.players[0].hand.find(c=>c.definitionId==='m013');
 assert.throws(()=>send(A,'A','playCards',{targetId:'B',orderedInstanceIds:[card.instanceId]},'poor'),
  /Not enough MP/);
 assert.deepEqual(A.read(),v);
});
