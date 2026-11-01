import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {defineCard} from '../v2/foundation.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
let serial=0;
function room({a=['w060','w016','d001','i017'],
 b=['i017','d058','w016','i002'],flashA=false,flashB=false,hpB=40}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:71,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]},catalog);
 state.players[0].afflictions=flashA?['flash']:[];
 state.players[1].afflictions=flashB?['flash']:[];
 state.players[1].hp=hpB;
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function submit(conn,who,type,props={}){
 return conn.submit({commandId:'g7-flash-dagger-'+(++serial),
  expectedRevision:conn.read().revision,actorId:who,type,...props});
}
function card(conn,seat,id){
 const held=conn.read().players.find(p=>p.id===seat).hand;
 const found=held.find(c=>c.definitionId===id);
 assert(found,'missing '+id);
 return found.instanceId;
}
function declare(A){
 submit(A,'A','playCards',{targetId:'B',
  orderedInstanceIds:[card(A,'A','w060')]});
}
function defend(B,ids=[]){
 submit(B,'B','defend',{orderedInstanceIds:ids.map(id=>card(B,'B',id))});
}
test('Flash Dagger is one sourced light main weapon, not a full-deck approval',()=>{
 const raw=VERIFIED_BASIC_CARDS.find(x=>x.id==='w060');
 assert.deepEqual([raw.referenceName,raw.attack,raw.price,raw.element,raw.weight,
  raw.afflictionOnHit],['フラッシュダガー',2,15,'light',1,'flash']);
 const def=catalog.get('w060');
 assert.deepEqual(def.playModes,['mainAttack']);
 assert.deepEqual(def.effects,[{when:'afterHit',type:'inflictAffliction',
  params:{affliction:'flash'}}]);
 assert.equal(summary.complete,false);
 assert.deepEqual([summary.unique,summary.slots],
  [RESEARCH_CATALOG_CONTRACT.unique,RESEARCH_CATALOG_CONTRACT.slots]);
 for(const invalid of ['dream','mist','hell'])
  assert.throws(()=>convertLegacyCard({...raw,afflictionOnHit:invalid}),
   /Unverified on-hit affliction weapon definition/);
 for(const params of [{affliction:'mist'},{affliction:'flash',x:1},{}])
  assert.throws(()=>defineCard({id:'invalid',family:'weapon',element:'light',
    drawWeight:1,stats:{attack:2,price:15},playModes:['mainAttack'],
    effects:[{when:'afterHit',type:'inflictAffliction',params}],
    source:{ruleset:'test',confidence:'test'}}),/Invalid inflictAffliction/);
});
test('declaration alone cannot inflict Flash; unguarded damaging hit does',()=>{
 const {A,B}=room();
 declare(A);
 assert.deepEqual(A.read().players[1].afflictions,[]);
 assert.deepEqual(B.read().players[1].afflictions,[]);
 defend(B);
 assert.deepEqual(A.read().players[1].afflictions,['flash']);
 assert.deepEqual(B.read().players[1].afflictions,['flash']);
 assert.equal(B.read().players[1].hp,38);
 assert.equal(B.read().activePlayerId,'B');
 assert.equal(B.read().players[0].hand,undefined);
 assert.equal(A.read().players[1].hand,undefined);
});
test('a completely blocked light attack does not apply Flash',()=>{
 const {A,B}=room();
 declare(A);defend(B,['d058']);
 assert.equal(B.read().players[1].hp,40);
 assert.deepEqual(B.read().players[1].afflictions,[]);
});
test('repeat dagger attack on a Flash target does not duplicate the status',()=>{
 const {A,B}=room({flashB:true});
 declare(A);defend(B);
 assert.deepEqual(B.read().players[1].afflictions,['flash']);
});
test('Super Mirror reflects light dagger; the actual recipient gains Flash',()=>{
 const {A,B}=room();
 declare(A);defend(B,['i002']);
 assert.equal(A.read().phase,'defense');
 assert.equal(A.read().activePlayerId,'A');
 assert.deepEqual(A.read().players[1].afflictions,[]);
 submit(A,'A','defend',{orderedInstanceIds:[]});
 assert.equal(A.read().players[0].hp,38);
 assert.deepEqual(A.read().players[0].afflictions,['flash']);
 assert.deepEqual(B.read().players[0].afflictions,['flash']);
 assert.deepEqual(B.read().players[1].afflictions,[]);
});
test('damage, Flash and Smile Shell cure chain across both online seat views',()=>{
 const {A,B}=room({b:['i017','d001','w016','i002']});
 declare(A);defend(B);
 assert.deepEqual(B.read().players[1].afflictions,['flash']);
 submit(B,'B','useItem',{instanceId:card(B,'B','i017'),targetId:'B'});
 assert.deepEqual(A.read().players[1].afflictions,[]);
 assert.equal(B.read().players[1].hp,38);
 assert.equal(B.read().activePlayerId,'B');
 submit(B,'B','playCards',{targetId:'A',orderedInstanceIds:[card(B,'B','w016')]});
 submit(A,'A','defend',{orderedInstanceIds:[]});
 assert.deepEqual(B.read().players[1].afflictions,[]);
});
test('fatal dagger attack does not attach a status to a defeated player',()=>{
 const {A,B}=room({hpB:1});
 declare(A);defend(B);
 assert.equal(A.read().players[1].hp,0);
 assert.deepEqual(A.read().players[1].afflictions,[]);
 assert.equal(A.read().phase,'finished');
});
