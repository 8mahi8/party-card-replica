import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {drawRandom32,defineCard} from '../v2/foundation.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
const triple=['m005','m008','m009'];
function fixture({aHand=['i015','w016','d003','i006'],
 bHand=['i002','m005','w027','d003'],aLearned=triple,bLearned=triple,seed=71}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:seed,
  rulesetId:'partial-reference-v2-lab',seats:[
    {id:'A',handDefinitionIds:aHand},{id:'B',handDefinitionIds:bHand}
  ]},catalog);
 state.players[0].learned=[...aLearned];
 state.players[1].learned=[...bLearned];
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function declare(A,target='B',id='soap-a'){
 const v=A.read(),card=v.players[0].hand.find(c=>c.definitionId==='i015');
 const cmd={type:'useItem',actorId:'A',commandId:id,
  expectedRevision:v.revision,instanceId:card.instanceId,targetId:target};
 return {cmd,result:A.submit(cmd)};
}
function response(B,{mirror=false,id='soap-b'}={}){
 const v=B.read(),card=v.players[1].hand.find(c=>c.definitionId==='i002');
 const cmd={type:'respondItem',actorId:'B',commandId:id,
  expectedRevision:v.revision,...(mirror?{mirrorInstanceId:card.instanceId}:{})};
 return {cmd,result:B.submit(cmd)};
}
function sampleUnique(list,seed,n=2){
 const pool=[...list],picked=[];
 let next=seed;
 while(pool.length&&picked.length<n){
  const sample=drawRandom32(next);
  next=sample.nextSeed;
  picked.push(pool.splice(Math.floor(sample.value*pool.length),1)[0]);
 }
 return {picked,remaining:pool,next};
}
test('Goddess Soap source card is strictly typed, ¥10/0.2%, reference deck incomplete',()=>{
 const src=VERIFIED_BASIC_CARDS.find(c=>c.id==='i015');
 assert.deepEqual([src.referenceName,src.price,src.weight,src.effect],
  ['女神の石けん',10,1,'forget_learned']);
 const def=catalog.get('i015');
 assert.deepEqual(def.playModes,['use']);
 assert.deepEqual(def.effects,[{type:'forgetLearned',when:'onDeclare',params:{count:2}}]);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[168,429,false]);
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
 assert.throws(()=>convertLegacyCard({...src,price:5}),/Invalid source-backed soap/);
 for(const params of [{count:1},{count:3},{count:'2'},{count:2,other:true}]){
  assert.throws(()=>defineCard({id:'invalid-soap',family:'item',element:'none',
   drawWeight:1,stats:{price:10},playModes:['use'],
   effects:[{when:'onDeclare',type:'forgetLearned',params}],
   source:{ruleset:'test',confidence:'test'}}),/Invalid forgetLearned/);
 }
});
test('soap is declared publicly but zero miracles are removed before Mirror/pass',()=>{
 const {A,B}=fixture();
 const before=A.read();
 const {cmd}=declare(A);
 const av=A.read(),bv=B.read();
 assert.equal(bv.phase,'itemDefense');
 assert.equal(bv.activePlayerId,'B');
 assert.equal(bv.pending.declaredItem.definitionId,'i015');
 assert.deepEqual(bv.players[1].learned,triple);
 assert.equal(av.players[1].learned,undefined);
 assert.equal(bv.players[0].learned,undefined);
 assert.equal(av.players[1].hand,undefined);
 assert.equal(bv.players[0].hand,undefined);
 assert.equal(A.submit(cmd).duplicate,true);
 assert.deepEqual(A.read(),av);
 assert.throws(()=>A.submit({...cmd,targetId:'A'}),/Conflicting commandId reuse/);
 assert.equal(before.players[1].handCount,bv.players[1].handCount);
});
test('accepting soap permanently removes two unique learned miracles, not hand miracles',()=>{
 const {A,B}=fixture({seed:71});
 const expected=sampleUnique(triple,71);
 declare(A);
 const {cmd}=response(B);
 const a=A.read(),b=B.read();
 assert.deepEqual(b.players[1].learned,expected.remaining);
 assert.equal(b.players[1].hand.some(c=>c.definitionId==='m005'),true,
  'unplayed miracle card remains physically in hand');
 assert.equal(b.players[1].hand.length,4,'learned miracle removal never consumes hand slots');
 assert.equal(a.players[0].hand.length,4,'used Soap gets one replacement');
 assert.equal(a.players[0].hand.some(c=>c.definitionId==='i015'),false);
 assert.equal(a.activePlayerId,'A');
 assert.equal(a.phase,'turn');
 assert.equal(B.submit(cmd).duplicate,true);
 assert.deepEqual(B.read(),b);
});
test('Super Mirror reflects soap so only the ORIGINAL attacker forgets two miracles',()=>{
 const {A,B}=fixture();
 declare(A);
 const {cmd}=response(B,{mirror:true});
 const a=A.read(),b=B.read();
 assert.deepEqual(a.players[0].learned,sampleUnique(triple,71).remaining);
 assert.deepEqual(b.players[1].learned,triple);
 assert.equal(b.players[1].hand.length,4,'used Mirror gets one replacement');
 assert.equal(b.players[1].hand.some(c=>c.definitionId==='i002'),false);
 assert.equal(a.players[0].hand.length,4);
 assert.equal(a.activePlayerId,'A');
 assert.equal(B.submit(cmd).duplicate,true);
 assert.deepEqual(B.read(),b);
});
test('soap may target an opponent with zero learned miracles and consumes no RNG',()=>{
 const {A,B}=fixture({bLearned:[]});
 const before=A.read();
 declare(A);response(B);
 const a=A.read(),b=B.read();
 assert.deepEqual(b.players[1].learned,[]);
 assert.equal(a.rngSeed,undefined,'private RNG never transmitted');
 assert.equal(b.players[1].hand.length,4);
 assert.equal(a.activePlayerId,'A');
 assert.equal(a.players[0].hand.length,4);
 assert.equal(before.players[0].hp,a.players[0].hp);
});
test('soap with only one learned miracle forgets exactly one and never draws replacement',()=>{
 const {A,B}=fixture({bLearned:['m008']});
 declare(A);response(B);
 assert.deepEqual(B.read().players[1].learned,[]);
 assert.equal(B.read().players[1].hand.length,4);
});
test('self-used soap forgets only own learned miracles and does not offer Mirror response',()=>{
 const {A,B}=fixture({aLearned:['m008','m009','m010']});
 declare(A,'A');
 assert.deepEqual(A.read().players[0].learned,
  sampleUnique(['m008','m009','m010'],71).remaining);
 assert.deepEqual(B.read().players[1].learned,triple);
 assert.equal(A.read().phase,'turn');
 assert.equal(A.read().activePlayerId,'A');
});
test('soap action is followed by an ordinary attack in the same player turn',()=>{
 const {A,B}=fixture();
 declare(A);response(B);
 const v=A.read();
 const weapon=v.players[0].hand.find(c=>c.definitionId==='w016');
 A.submit({type:'playCards',actorId:'A',commandId:'soap-next-attack',
  expectedRevision:v.revision,targetId:'B',orderedInstanceIds:[weapon.instanceId]});
 assert.equal(B.read().phase,'defense');
});
test('non-Mirror and foreign item IDs fail before any permanent mutation',()=>{
 const {A,B}=fixture();
 const before=A.read();
 assert.throws(()=>A.submit({type:'useItem',actorId:'A',commandId:'bad-soap',
  expectedRevision:before.revision,targetId:'B',
  instanceId:before.players[0].hand.find(c=>c.definitionId==='w016').instanceId}),
  /Only a plain owned recovery item/);
 assert.deepEqual(A.read(),before);
 declare(A);
 const staged=B.read();
 const other=staged.players[1].hand.find(c=>c.definitionId==='d003');
 assert.throws(()=>B.submit({type:'respondItem',actorId:'B',commandId:'bad-reflect',
  expectedRevision:staged.revision,mirrorInstanceId:other.instanceId}),/Only Super Mirror/);
 assert.deepEqual(B.read(),staged);
});
