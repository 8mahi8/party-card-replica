import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {migrateLegacyCatalog,convertLegacyCard} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
let serial=0;
function match({a=['m019','i003','w016','d003'],b=['d003','d018','i002','w016'],
 mpA=25,hpA=20,hpB=40,learnedA=[]}={}){
 const state=createStagingRoom({firstSeatId:'A',rngSeed:71,
  rulesetId:'partial-reference-v2-lab',
  seats:[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}]},catalog);
 state.players[0].mp=mpA;state.players[0].hp=hpA;
 state.players[1].hp=hpB;state.players[0].learned=[...learnedA];
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function send(conn,actorId,type,extra={}){
 return conn.submit({actorId,type,commandId:'absorb-miracle-'+(++serial),
  expectedRevision:conn.read().revision,...extra});
}
function instance(conn,playerId,definitionId){
 const p=conn.read().players.find(x=>x.id===playerId);
 const c=p.hand.find(x=>x.definitionId===definitionId);
 assert(c,'No '+definitionId+' in '+playerId+' hand');
 return c.instanceId;
}
function declare(A,{learned=false,spirit=false}={}){
 if(learned)
  return send(A,'A','castLearned',{targetId:'B',learnedDefinitionId:'m019'});
 const ids=[instance(A,'A','m019')];
 if(spirit)ids.push(instance(A,'A','i003'));
 return send(A,'A','playCards',{targetId:'B',orderedInstanceIds:ids});
}
function answer(B,ids=[]){
 return send(B,'B','defend',{orderedInstanceIds:ids.map(x=>instance(B,'B',x))});
}

test('one source-backed light Absorb miracle costs MP10 and uses existing absorbHp effect',()=>{
 const src=VERIFIED_BASIC_CARDS.find(x=>x.id==='m019'),def=catalog.get('m019');
 assert.deepEqual([src.referenceName,src.kind,src.role,src.element,
  src.attack,src.mpCost,src.hpAbsorb,src.weight],
  ['吸収','miracle','attack','light',10,10,true,1]);
 assert.deepEqual(def.playModes,['cast']);
 assert.deepEqual(def.effects,[{when:'afterHit',type:'absorbHp',params:{amount:'damage'}}]);
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[184,445,false]);
 assert.equal(RESEARCH_CATALOG_CONTRACT.unique,summary.unique);
 assert.equal(RESEARCH_CATALOG_CONTRACT.slots,summary.slots);
 for(const mutation of [{mpCost:9},{attack:9},{element:'fire'},{hpAbsorb:'yes'}])
  assert.throws(()=>convertLegacyCard({...src,...mutation}),
   /Unverified absorbing miracle definition/);
});
test('hand cast deals 10, heals exactly damage, learns, pays MP, refills and advances',()=>{
 const {A,B}=match();
 declare(A);assert.equal(B.read().phase,'defense');
 answer(B);
 const state=A.read();
 assert.deepEqual([state.players[0].hp,state.players[0].mp,state.players[1].hp],
  [30,15,30]);
 assert.deepEqual(state.players[0].learned,['m019']);
 assert.equal(state.players[0].hand.length,4);
 assert.equal(state.activePlayerId,'B');
 assert.equal(B.read().players[0].hand,undefined);
 assert.equal(B.read().players[0].learned,undefined);
});
test('normal guards do not block light; Rainbow Curtain + guard3 heals only seven',()=>{
 const {A,B}=match({b:['i001','d003','i002','w016']});
 declare(A);
 answer(B,['i001','d003']);
 const after=A.read();
 assert.equal(after.players[1].hp,33);
 assert.equal(after.players[0].hp,27);
});
test('Angel stop defense produces no damage and no HP absorption',()=>{
 const {A,B}=match();
 declare(A);answer(B,['d018']);
 assert.equal(A.read().players[0].hp,20);
 assert.equal(A.read().players[1].hp,40);
 assert.equal(A.read().players[0].mp,15);
});
test('Super Mirror returns miracle to original caster and gives reflected beneficiary HP',()=>{
 const {A,B}=match({hpA:40,hpB:20});
 declare(A);answer(B,['i002']);
 const pending=A.read();
 assert.equal(pending.phase,'defense');
 assert.equal(pending.activePlayerId,'A');
 send(A,'A','defend',{orderedInstanceIds:[]});
 const state=A.read();
 assert.equal(state.players[0].hp,30,'caster takes the reflected 10');
 assert.equal(state.players[1].hp,30,'mirror user absorbs 10 from caster');
 assert.equal(state.players[0].mp,15,'original MP paid exactly once');
 assert.equal(state.players[1].mp,10);
 assert.deepEqual(state.players[0].learned,['m019']);
});
test('learned recast consumes MP10, retains hand and grants draw credit',()=>{
 const {A,B}=match({a:['w016','i003','d003','d001'],learnedA:['m019'],mpA:20,hpA:80});
 declare(A,{learned:true});answer(B);
 assert.equal(A.read().players[0].hp,90);
 assert.equal(A.read().players[0].mp,10);
 assert.equal(A.read().players[0].hand.length,5);
 assert.deepEqual(A.read().players[0].learned,['m019']);
});
test('spirit after Absorb waives MP even if caster has zero',()=>{
 const {A,B}=match({mpA:0,hpA:30});
 declare(A,{spirit:true});answer(B);
 assert.equal(A.read().players[0].hp,40);
 assert.equal(A.read().players[0].mp,0);
 assert.deepEqual(A.read().players[0].learned,['m019']);
});
test('MP insufficient rejects before pending defense mutation',()=>{
 const {A}=match({mpA:9}),before=JSON.stringify(A.read());
 assert.throws(()=>declare(A),/Not enough MP/);
 assert.equal(JSON.stringify(A.read()),before);
});
test('Absorb heals to HP99 maximum while dealing all damage',()=>{
 const {A,B}=match({hpA:95});
 declare(A);answer(B);
 assert.equal(A.read().players[0].hp,99);
 assert.equal(A.read().players[1].hp,30);
});
test('caster cannot append a second unrelated effect to a solo Absorb miracle',()=>{
 const {A}=match(),before=JSON.stringify(A.read());
 const ids=[instance(A,'A','m019'),instance(A,'A','w016')];
 assert.throws(()=>send(A,'A','playCards',{targetId:'B',orderedInstanceIds:ids}),
  /Only spirit directly after miracle is supported|Not a structural attack selection|Only one miracle/);
 assert.equal(JSON.stringify(A.read()),before);
});
