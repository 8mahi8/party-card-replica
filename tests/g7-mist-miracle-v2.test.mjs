import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {convertLegacyCard,migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
let seq=0;
function room({a=['m020','i003','w016','d003'],b=['i017','d018','w016','i002'],
 mpA=10,learnedA=[],mistB=false}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:71,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]},catalog);
 state.players[0].mp=mpA;
 state.players[0].learned=learnedA;
 if(mistB)state.players[1].afflictions=['mist'];
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function send(conn,actorId,type,more={}){
 return conn.submit({actorId,type,commandId:'g7-mist-'+(++seq),
  expectedRevision:conn.read().revision,...more});
}
function held(conn,who,id){
 const p=conn.read().players.find(x=>x.id===who);
 const x=p.hand.find(c=>c.definitionId===id);
 assert(x,'missing '+id);
 return x.instanceId;
}
function cast(A,{learned=false,spirit=false,targetId='B'}={}){
 if(learned)return send(A,'A','castLearned',{targetId,learnedDefinitionId:'m020'});
 return send(A,'A','playCards',{targetId,orderedInstanceIds:[
  held(A,'A','m020'),...(spirit?[held(A,'A','i003')]:[])]});
}
function defend(B,ids=[]){return send(B,'B','defend',{
 orderedInstanceIds:ids.map(id=>held(B,'B',id))});}

test('Piong/Macaron: Mist is a 0.2%-weight water MP3 no-damage miracle, distinct from disease',()=>{
 const raw=VERIFIED_BASIC_CARDS.find(x=>x.id==='m020'),m=catalog.get('m020');
 assert.deepEqual([raw.referenceName,raw.kind,raw.element,raw.role,raw.mpCost,raw.weight],
  ['霧','miracle','water','afflictOther',3,1]);
 assert.equal(m.stats.attack,0);
 assert.deepEqual(m.effects,[{when:'onDeclare',type:'inflictAffliction',
  params:{affliction:'mist'}}]);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[RESEARCH_CATALOG_CONTRACT.unique,RESEARCH_CATALOG_CONTRACT.slots,false]);
 assert.deepEqual([summary.unique,summary.slots],
  [RESEARCH_CATALOG_CONTRACT.unique,RESEARCH_CATALOG_CONTRACT.slots]);
 for(const changes of [{mpCost:4},{element:'none'},{otherAffliction:'dream'},
  {attack:1},{role:'attack'}]){
  assert.throws(()=>convertLegacyCard({...raw,...changes}));
 }
});
test('Mist casting only reveals the original declaration; on accept, opponent stats are hidden',()=>{
 const {A,B}=room();
 cast(A);
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.equal(B.read().players[0].hp,40);
 defend(B);
 const av=A.read(),bv=B.read();
 assert.deepEqual(av.players[1].afflictions,['mist']);
 assert.deepEqual(bv.players[1].afflictions,['mist']);
 assert.equal(av.players[1].hp,40,'caster can still see opponent status');
 assert.equal(bv.players[0].hp,null);
 assert.equal(bv.players[0].mp,null);
 assert.equal(bv.players[0].money,null);
 assert.equal(bv.players[0].handCount,4);
 assert.equal(bv.players[1].hp,40,'owner still sees own state');
 assert.equal(bv.players[1].disease,null);
 assert.equal(av.players[0].mp,7,'MP paid exactly once');
 assert.deepEqual(av.players[0].learned,['m020']);
 assert.equal(av.activePlayerId,'B');
});
test('mist hides statuses in room projection, not in host combat resolution',()=>{
 const {A,B}=room({mistB:true});
 const b=B.read();assert.equal(b.players[0].hp,null);
 assert.equal(A.read().players[0].hp,40);
 cast(A);defend(B);
 send(B,'B','playCards',{targetId:'A',orderedInstanceIds:[held(B,'B','w016')]});
 send(A,'A','defend',{orderedInstanceIds:[]});
 assert.equal(A.read().players[0].hp,30);
 assert.equal(B.read().players[0].hp,null);
 assert.equal(B.read().players[1].hp,40);
});
test('Smile Shell cures Mist on the victim turn and restores correct opponent stats',()=>{
 const {A,B}=room();cast(A);defend(B);
 assert.equal(B.read().players[0].hp,null);
 send(B,'B','useItem',{instanceId:held(B,'B','i017'),targetId:'B'});
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.equal(B.read().players[0].hp,40);
 assert.equal(B.read().players[0].mp,7);
 assert.equal(B.read().activePlayerId,'B','self-care does not lose turn');
});
test('learned Mist is reusable, draws an artifact, pays MP3, still changes visibility',()=>{
 const {A,B}=room({a:['d001','i003','w016','d003'],learnedA:['m020']});
 cast(A,{learned:true});defend(B);
 assert.deepEqual(B.read().players[1].afflictions,['mist']);
 assert.equal(A.read().players[0].mp,7);
 assert.equal(A.read().players[0].hand.length,5);
});
test('Spirit waives MP3 without changing scope and prevents extra MP debit',()=>{
 const {A,B}=room({mpA:0});cast(A,{spirit:true});defend(B);
 assert.equal(A.read().players[0].mp,0);
 assert.deepEqual(B.read().players[1].afflictions,['mist']);
});
test('Angel armor completely stops Mist, so no affliction is attached',()=>{
 const {A,B}=room();
 cast(A);defend(B,['d018']);
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.equal(B.read().players[0].hp,40);
 assert.equal(A.read().players[0].mp,7);
});
test('Super Mirror reassigns Mist to original caster, without changing miracle cost',()=>{
 const {A,B}=room();
 cast(A);defend(B,['i002']);
 assert.equal(A.read().phase,'defense');
 send(A,'A','defend',{orderedInstanceIds:[]});
 assert.deepEqual(A.read().players[0].afflictions,['mist']);
 assert.deepEqual(B.read().players[1].afflictions,[]);
 assert.equal(A.read().players[1].hp,null,'original caster is now fogged');
 assert.equal(B.read().players[0].mp,7,'opponent sees true MP');
 assert.equal(A.read().players[0].mp,7,'owner sees own MP');
});
test('invalid MP cannot create a pending defense or hide status',()=>{
 const {A}=room({mpA:2});const before=JSON.stringify(A.read());
 assert.throws(()=>cast(A),/Not enough MP/);
 assert.equal(JSON.stringify(A.read()),before);
});
test('existing minor and all cures both clear Mist, without changing Flash or disease API',()=>{
 for(const id of ['i017','i018']){
  const {B}=room({mistB:true,b:[id,'w016','i002','d018']});
  // B must have the active turn to test self-care without touching engine internals.
  // Start with a valid weapon attack by A, then defend.
  const {A:caller,B:target}=room({
   a:['w016','d001','d003','i003'],mistB:true,
   b:[id,'w016','i002','d018']});
  send(caller,'A','playCards',{targetId:'B',orderedInstanceIds:[held(caller,'A','w016')]});
  defend(target);
  send(target,'B','useItem',{instanceId:held(target,'B',id),targetId:'B'});
  assert.deepEqual(target.read().players[1].afflictions,[]);
  assert.equal(target.read().players[0].hp,40);
 }
});
