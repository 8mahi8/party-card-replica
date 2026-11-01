import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {convertLegacyCard,migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
let nextCommand=0;
function room({a=['w061','w016','d001','i006'],
 b=['i017','d043','w016','i002']}={}){
 const state=createStagingRoom({
  firstSeatId:'A',rngSeed:71,rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]
 },catalog);
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function send(conn,actorId,type,extra={}){
 return conn.submit({actorId,type,commandId:'g7-mist-gun-'+(++nextCommand),
  expectedRevision:conn.read().revision,...extra});
}
function held(conn,who,id){
 const card=conn.read().players.find(p=>p.id===who).hand.find(c=>c.definitionId===id);
 assert(card,'Missing '+who+' '+id);
 return card.instanceId;
}
function shoot(A){
 return send(A,'A','playCards',{targetId:'B',
  orderedInstanceIds:[held(A,'A','w061')]});
}
function defend(B,ids=[]){
 return send(B,'B','defend',{orderedInstanceIds:ids.map(id=>held(B,'B',id))});
}
test('Piong/Macaron: Mist Gun is water attack 3, yen 10, 0.2%, on-hit Mist only',()=>{
 const card=VERIFIED_BASIC_CARDS.find(c=>c.id==='w061');
 assert.deepEqual([card.referenceName,card.kind,card.slot,card.attack,
  card.price,card.weight,card.element,card.afflictionOnHit],
  ['霧鉄砲','weapon','main',3,10,1,'water','mist']);
 assert.deepEqual(catalog.get('w061').effects,
  [{when:'afterHit',type:'inflictAffliction',params:{affliction:'mist'}}]);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[185,446,false]);
 assert.deepEqual([summary.unique,summary.slots],
  [RESEARCH_CATALOG_CONTRACT.unique,RESEARCH_CATALOG_CONTRACT.slots]);
 for(const bad of [{afflictionOnHit:'dream'},{afflictionOnHit:'flash-mist'},
  {slot:'addon',afflictionOnHit:'mist'},{repeatHits:2}]){
  assert.throws(()=>convertLegacyCard({...card,...bad}),/Unverified/);
 }
});
test('Mist Gun does not curse on declaration; actual water hit both hurts and hides opponent stats',()=>{
 const {A,B}=room();
 shoot(A);
 assert.equal(B.read().players[1].afflictions.length,0);
 assert.equal(B.read().players[0].hp,40);
 defend(B);
 assert.equal(A.read().players[1].hp,37);
 assert.deepEqual(B.read().players[1].afflictions,['mist']);
 for(const key of ['hp','mp','money'])assert.equal(B.read().players[0][key],null);
 assert.equal(B.read().players[1].hp,37);
 assert.equal(A.read().players[1].hp,37);
});
test('Matching high-water armor prevents the hit, and never applies Mist',()=>{
 const {A,B}=room();
 shoot(A);defend(B,['d043']);
 assert.equal(A.read().players[1].hp,40);
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.equal(B.read().players[0].hp,40);
});
test('Super Mirror redirects damage and Mist to the actual final target',()=>{
 const {A,B}=room();
 shoot(A);defend(B,['i002']);
 assert.equal(A.read().phase,'defense');
 send(A,'A','defend',{orderedInstanceIds:[]});
 assert.equal(A.read().players[0].hp,37);
 assert.deepEqual(A.read().players[0].afflictions,['mist']);
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.equal(A.read().players[1].hp,null);
 assert.equal(B.read().players[0].hp,37);
});
test('Smile Shell cures gun-applied Mist and reveals real opponent values immediately',()=>{
 const {A,B}=room();
 shoot(A);defend(B);
 assert.equal(B.read().players[0].hp,null);
 send(B,'B','useItem',{instanceId:held(B,'B','i017'),targetId:'B'});
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.equal(B.read().players[0].hp,40);
 assert.equal(B.read().players[0].mp,10);
 assert.equal(B.read().activePlayerId,'B');
});
test('Original Flash Dagger still applies Flash, not Mist',()=>{
 const {A,B}=room({a:['w060','w016','d001','i006']});
 send(A,'A','playCards',{targetId:'B',
  orderedInstanceIds:[held(A,'A','w060')]});
 defend(B);
 assert.deepEqual(B.read().players[1].afflictions,['flash']);
 assert.equal(B.read().players[0].hp,40);
});
