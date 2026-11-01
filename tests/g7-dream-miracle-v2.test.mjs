import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {convertLegacyCard,migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {attachDreamAppearanceFixture} from '../v2/dream-appearance.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';
import {planOtherAfflictionCure} from '../v2/disease-rules.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
let serial=0;
function room({a=['m021','i003','w016','d003'],
 b=['i018','i017','d018','i002'],mpA=10,learnedA=[],
 initialB=null}={}){
 let state=createStagingRoom({firstSeatId:'A',rngSeed:71,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]},catalog);
 state.players[0].mp=mpA;
 state.players[0].learned=[...learnedA];
 if(initialB)state.players[1].afflictions=[...initialB];
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function send(c,who,type,args={}){
 return c.submit({actorId:who,type,commandId:'g7-dream-'+(++serial),
  expectedRevision:c.read().revision,...args});
}
function held(c,who,definitionId){
 const x=c.read().players.find(p=>p.id===who).hand.find(x=>x.definitionId===definitionId);
 assert(x,'Missing '+definitionId);return x.instanceId;
}
function cast(A,{learned=false,spirit=false}={}){
 return learned?send(A,'A','castLearned',{targetId:'B',learnedDefinitionId:'m021'}):
  send(A,'A','playCards',{targetId:'B',orderedInstanceIds:
   [held(A,'A','m021'),...(spirit?[held(A,'A','i003')]:[])]});
}
function respond(B,ids=[]){
 return send(B,'B','defend',{orderedInstanceIds:ids.map(x=>held(B,'B',x))});
}
test('Piong/Macaron: Dream miracle wood MP6, weight1; no damage',()=>{
 const raw=VERIFIED_BASIC_CARDS.find(c=>c.id==='m021');
 assert.deepEqual([raw.referenceName,raw.kind,raw.role,raw.element,
  raw.otherAffliction,raw.mpCost,raw.weight],
  ['夢','miracle','afflictOther','wood','dream',6,1]);
 assert.deepEqual(catalog.get('m021').effects,[{when:'onDeclare',
  type:'inflictAffliction',params:{affliction:'dream'}}]);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],
  [RESEARCH_CATALOG_CONTRACT.unique,RESEARCH_CATALOG_CONTRACT.slots,false]);
 for(const bad of [{mpCost:5},{element:'none'},{otherAffliction:'mist'},{attack:5}])
  assert.throws(()=>convertLegacyCard({...raw,...bad}),/Unverified other-affliction/);
});
test('Dream adds status on completed defense, not declaration, and preserves already held cards',()=>{
 const {A,B}=room();cast(A);
 assert.deepEqual(B.read().players[1].afflictions,[]);
 respond(B);
 assert.deepEqual(B.read().players[1].afflictions,['dream']);
 assert.deepEqual(B.read().players[1].hand.map(x=>x.definitionId),
  ['i018','i017','d018','i002']);
 assert.equal(B.read().players[0].mp,4);
 assert.deepEqual(A.read().players[0].learned,['m021']);
 assert.equal(A.read().players[1].hp,40);
 assert.equal(B.read().activePlayerId,'B');
});
test('Dream is major: Smile/Melody do not cure; Heart/Song do',()=>{
 assert.deepEqual(planOtherAfflictionCure(['dream','mist','flash'],'minor').after,['dream']);
 assert.deepEqual(planOtherAfflictionCure(['dream','mist','flash'],'all').after,[]);
 const {A,B}=room();
 cast(A);respond(B);
 send(B,'B','useItem',{instanceId:held(B,'B','i017'),targetId:'B'});
 assert.deepEqual(B.read().players[1].afflictions,['dream']);
 send(B,'B','useItem',{instanceId:held(B,'B','i018'),targetId:'B'});
 assert.deepEqual(B.read().players[1].afflictions,[]);
});
test('Angel miracle defense stops Dream rather than applying an illusion',()=>{
 const {A,B}=room();cast(A);respond(B,['d018']);
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.equal(A.read().players[0].mp,4);
});
test('Super Mirror redirects Dream to the original caster without double MP debit',()=>{
 const {A,B}=room();cast(A);respond(B,['i002']);
 assert.equal(A.read().phase,'defense');
 send(A,'A','defend',{orderedInstanceIds:[]});
 assert.deepEqual(A.read().players[0].afflictions,['dream']);
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.equal(A.read().players[0].mp,4);
});
test('Spirit waives MP cost; learned Dream can be re-used',()=>{
 const s=room({mpA:0});cast(s.A,{spirit:true});respond(s.B);
 assert.equal(s.A.read().players[0].mp,0);
 assert.deepEqual(s.B.read().players[1].afflictions,['dream']);
 const l=room({a:['d003','i003','w016','i006'],learnedA:['m021']});
 cast(l.A,{learned:true});respond(l.B);
 assert.deepEqual(l.B.read().players[1].afflictions,['dream']);
 assert.equal(l.A.read().players[0].mp,4);
 assert.equal(l.A.read().players[0].hand.length,5);
});
test('insufficient MP cannot enter a defense, mutate the room or fake a curse',()=>{
 const {A}=room({mpA:5});const prior=JSON.stringify(A.read());
 assert.throws(()=>cast(A),/Not enough MP/);
 assert.equal(JSON.stringify(A.read()),prior);
});
test('all cure immediately reveals host-chosen Dream aliases and keeps physical definitions',()=>{
 let state=createStagingRoom({firstSeatId:'A',rngSeed:71,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:['w016','d003','i006','i003']},
   {id:'B',handDefinitionIds:['w003','i018','i017','d003']}]},catalog);
 state.players[1].afflictions=['dream'];
 // Explicit controlled alias standing in for an artifact drawn AFTER Dream.
 // Not a claimed reproduction of original 50% weighted disguise distribution.
 state=attachDreamAppearanceFixture(state,catalog,{
  seatId:'B',instanceId:state.players[1].hand[0].instanceId,
  appearsAsDefinitionId:'w016'
 });
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 const A=host.connectSeatFixture('A'),B=host.connectSeatFixture('B');
 assert.equal(B.read().players[1].hand[0].definitionId,'w016');
 send(A,'A','playCards',{targetId:'B',
  orderedInstanceIds:[held(A,'A','w016')]});
 respond(B);
 send(B,'B','useItem',{instanceId:held(B,'B','i017'),targetId:'B'});
 assert.deepEqual(B.read().players[1].afflictions,['dream']);
 assert.equal(B.read().players[1].hand[0].definitionId,'w016');
 send(B,'B','useItem',{instanceId:held(B,'B','i018'),targetId:'B'});
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.equal(B.read().players[1].hand[0].definitionId,'w003');
});
