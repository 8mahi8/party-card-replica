import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {convertLegacyCard,migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
let serial=0;
function match({a=['w063','w016','d003','i006'],
 b=['d003','d001','i002','w016'],hpA=40,hpB=40}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:71,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]},catalog);
 state.players[0].hp=hpA;state.players[1].hp=hpB;
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function send(c,who,type,props={}){
 return c.submit({actorId:who,type,commandId:'g7-recoil-'+(++serial),
  expectedRevision:c.read().revision,...props});
}
function held(c,who,def){
 const x=c.read().players.find(p=>p.id===who).hand.find(v=>v.definitionId===def);
 assert(x,'Missing '+who+' '+def);return x.instanceId;
}
function attack(A,ids=[held(A,'A','w063')]){
 return send(A,'A','playCards',{targetId:'B',orderedInstanceIds:ids});
}
function defend(B,ids=[]){
 return send(B,'B','defend',{orderedInstanceIds:ids.map(x=>held(B,'B',x))});
}
test('source-backed Devil Sword is neutral 14, yen1, 1/500, recoils actual dealt damage',()=>{
 const c=VERIFIED_BASIC_CARDS.find(x=>x.id==='w063');
 assert.deepEqual([c.referenceName,c.kind,c.slot,c.attack,c.price,c.weight,c.element,c.hpRecoil],
  ['邪神の大剣','weapon','main',14,1,1,'none',true]);
 assert.deepEqual(catalog.get('w063').effects,
  [{when:'afterHit',type:'recoilHp',params:{amount:'damage'}}]);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],
  [RESEARCH_CATALOG_CONTRACT.unique,RESEARCH_CATALOG_CONTRACT.slots,false]);
 for(const change of [{hpRecoil:false},{element:'dark'},{repeatHits:2},
  {afflictionOnHit:'mist'},{slot:'addon'}])
  assert.throws(()=>convertLegacyCard({...c,...change}),/Unverified HP recoil/);
});
test('plain unguarded 14 damages target AND source 14 after defense resolution',()=>{
 const {A,B}=match();attack(A);
 assert.deepEqual([A.read().players[0].hp,B.read().players[1].hp],[40,40]);
 defend(B);
 assert.deepEqual(A.read().players.map(p=>p.hp),[26,26]);
 assert.equal(A.read().activePlayerId,'B');
 assert.equal(A.read().players[0].hand.length,4);
});
test('normal guard3 reduces both target damage and actual recoil to 11',()=>{
 const {A,B}=match();attack(A);defend(B,['d003']);
 assert.deepEqual(A.read().players.map(p=>p.hp),[29,29]);
});
test('a full guard 30 from multiple defenses prevents recoil entirely',()=>{
 const {A,B}=match({b:['d009','d003','d001','i002']});
 attack(A);defend(B,['d009']);
 assert.deepEqual(A.read().players.map(p=>p.hp),[40,40]);
});
test('Super Mirror preserves original source result: mirror user takes backlash, original attacker takes hit',()=>{
 const {A,B}=match();attack(A);defend(B,['i002']);
 assert.equal(A.read().phase,'defense');
 send(A,'A','defend',{orderedInstanceIds:[]});
 assert.deepEqual(A.read().players.map(p=>p.hp),[26,26]);
 assert.equal(A.read().activePlayerId,'B');
});
test('if both low-HP opponents are eliminated by strike and backlash, match draws',()=>{
 const {A,B}=match({hpA:10,hpB:10});attack(A);defend(B);
 assert.deepEqual(A.read().players.map(p=>p.hp),[0,0]);
 assert.equal(A.read().phase,'finished');
 assert.equal(A.read().activePlayerId,null);
});
test('Sun Charm revives source of lethal backlash using existing recovery routine',()=>{
 const {A,B}=match({a:['w063','i005','d003','w016'],hpA:9});
 attack(A);defend(B);
 assert.deepEqual(A.read().players.map(p=>p.hp),[10,26]);
 assert.equal(A.read().phase,'turn');
 assert.equal(A.read().activePlayerId,'B');
 assert.equal(A.read().players[0].hand.length,4);
});
test('unknown stacked bonus combination declines atomically',()=>{
 const {A}=match({a:['w063','a001','d003','i006']});
 const before=JSON.stringify(A.read());
 assert.throws(()=>attack(A,[held(A,'A','w063'),held(A,'A','a001')]),
  /Recoil sword combinations need original verification/);
 assert.equal(JSON.stringify(A.read()),before);
});
test('existing ordinary weapon remains free from HP recoil',()=>{
 const {A,B}=match();attack(A,[held(A,'A','w016')]);defend(B);
 assert.deepEqual(A.read().players.map(p=>p.hp),[40,30]);
});
