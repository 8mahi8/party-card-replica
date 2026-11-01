import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {convertLegacyCard,migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
let seq=0;
function fixture({disease='fever',mp=25,learned=[],a=['m017','m018','i003','w016']}={}){
 const state=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:a},
  {id:'B',handDefinitionIds:['w016','d003','d018','i002']}
 ],firstSeatId:'A',rngSeed:71,rulesetId:'partial-reference-v2-lab'},catalog);
 state.players[0].mp=mp;
 state.players[0].disease=disease;
 state.players[0].learned=[...learned];
 const h=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:h.connectSeatFixture('A'),B:h.connectSeatFixture('B')};
}
function submit(seat,actorId,type,fields={}){
 return seat.submit({type,actorId,expectedRevision:seat.read().revision,
  commandId:'cleansing-'+(++seq),...fields});
}
function cast(A,id,{targetId='A',spirit=false}={}){
 const hand=A.read().players[0].hand;
 const orderedInstanceIds=[hand.find(c=>c.definitionId===id).instanceId];
 if(spirit)orderedInstanceIds.push(hand.find(c=>c.definitionId==='i003').instanceId);
 return submit(A,'A','playCards',{targetId,orderedInstanceIds});
}
test('sourced MP2/MP5 minor/all cure miracles are typed and leave the deck incomplete',()=>{
 for(const [id,name,mp,scope] of [
  ['m017','音色',2,'minor'],['m018','歌声',5,'all']]){
  const raw=VERIFIED_BASIC_CARDS.find(c=>c.id===id);
  assert.deepEqual([raw.referenceName,raw.role,raw.cleanseScope,
    raw.mpCost,raw.element,raw.weight],[name,'cleanse',scope,mp,'none',1]);
  const def=catalog.get(id);
  assert.equal(def.stats.attack,0);
  assert.deepEqual(def.playModes,['cast']);
  assert.deepEqual(def.effects,[{when:'onDeclare',type:'cleanseAfflictions',
   params:{scope}}]);
  assert.throws(()=>convertLegacyCard({...raw,mpCost:7}),
   /Unverified cleansing miracle definition/);
  assert.throws(()=>convertLegacyCard({...raw,cleanseScope:'fictional'}),
   /Unverified cleansing miracle definition/);
 }
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[184,445,false]);
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
});
test('Melody cures fever without turn-end damage, spends 2 MP, learns and refills',()=>{
 const {A,B}=fixture({disease:'fever'});
 cast(A,'m017');
 const v=A.read(),own=v.players[0];
 assert.equal(own.disease,null);
 assert.equal(own.hp,40);
 assert.equal(own.mp,23);
 assert.deepEqual(own.learned,['m017']);
 assert.equal(own.hand.length,4);
 assert.equal(v.activePlayerId,'B');
 assert.equal(B.read().players[0].disease,null);
 assert.equal(B.read().players[0].hand,undefined);
});
test('Melody removes cold but does not falsely clear heaven or hell sickness',()=>{
 for(const disease of ['cold','fever']){
  const {A}=fixture({disease});
  cast(A,'m017');
  assert.equal(A.read().players[0].disease,null,disease);
 }
 for(const disease of ['heaven','hell']){
  const {A}=fixture({disease});
  cast(A,'m017');
  // The end-of-turn disease engine can progress hell to heaven. Melody
  // must leave severe illness active, rather than silently cure it.
  assert.equal(A.read().players[0].disease,disease==='hell'?'heaven':disease);
 }
});
test('Song removes heaven and hell, whereas minor Melody does not',()=>{
 for(const disease of ['heaven','hell']){
  const {A}=fixture({disease});
  cast(A,'m018');
  const p=A.read().players[0];
  assert.equal(p.disease,null,disease);
  assert.equal(p.hp,40,disease);
  assert.equal(p.mp,20);
  assert.equal(A.read().activePlayerId,'B');
 }
});
test('a cure spell without a present disease still spends MP and ends the turn',()=>{
 const {A}=fixture({disease:null});
 cast(A,'m017');
 assert.equal(A.read().players[0].disease,null);
 assert.equal(A.read().players[0].mp,23);
 assert.equal(A.read().activePlayerId,'B');
});
test('a learned Song can cast with no physical card and gains one new card',()=>{
 const {A}=fixture({learned:['m018'],disease:'hell'});
 submit(A,'A','castLearned',{learnedDefinitionId:'m018',targetId:'A'});
 const p=A.read().players[0];
 assert.equal(p.disease,null);
 assert.equal(p.mp,20);
 assert.deepEqual(p.learned,['m018']);
 assert.equal(p.hand.length,5);
 assert.equal(A.read().activePlayerId,'B');
});
test('Spirit immediately after Melody waives its MP cost and refills both physical cards',()=>{
 const {A}=fixture({mp:0});
 cast(A,'m017',{spirit:true});
 const p=A.read().players[0];
 assert.equal(p.disease,null);
 assert.equal(p.mp,0);
 assert.equal(p.hand.length,4);
 assert.deepEqual(p.learned,['m017']);
});
test('invalid other-person target refuses physical or learned cures without state changes',()=>{
 const {A}=fixture({learned:['m018']});
 const snapshot=JSON.stringify(A.read());
 assert.throws(()=>cast(A,'m017',{targetId:'B'}),/Cleansing miracle must be cast on its owner/);
 assert.throws(()=>submit(A,'A','castLearned',{targetId:'B',learnedDefinitionId:'m018'}),
  /Cleansing miracle must be cast on its owner/);
 assert.equal(JSON.stringify(A.read()),snapshot);
});
test('insufficient MP for Melody or learned Song rejects without taking a turn',()=>{
 const {A}=fixture({mp:0,learned:['m018']});
 const start=JSON.stringify(A.read());
 assert.throws(()=>cast(A,'m017'),/Not enough MP/);
 assert.throws(()=>submit(A,'A','castLearned',{learnedDefinitionId:'m018',targetId:'A'}),/Not enough MP/);
 assert.equal(JSON.stringify(A.read()),start);
});
