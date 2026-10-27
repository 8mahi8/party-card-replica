import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,playAttack,playMiracleAttack,defend} from '../src/match.mjs';
import {findVerifiedBasicCard as card,VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {auditCatalog,createAuditedDraw} from '../src/catalog-audit.mjs';
const draw=()=>card('d001');
const setup=(a,b)=>{
 const s=createMatch({playerIds:['A','B'],firstPlayerId:'A',rng:()=>0,draw});
 s.players[0].hand=a.map(card);s.players[1].hand=b.map(card);
 return s;
};
const attack=(a,b)=>playAttack(setup(a,b),{playerId:'A',targetId:'B',handIndices:[0]},draw);
const cast=(a,b,handIndex=0)=>playMiracleAttack(setup(a,b),{playerId:'A',targetId:'B',handIndex},draw);

test('seven research-backed stopper and miracle cards bring subset to 77, not full deck',()=>{
 assert.equal(VERIFIED_BASIC_CARDS.length,77);
 const audit=auditCatalog(VERIFIED_BASIC_CARDS);
 assert.equal(audit.slots,195);assert.equal(audit.complete,false);
 assert.throws(()=>createAuditedDraw(VERIFIED_BASIC_CARDS),/incomplete/);
 for (const [id,guard] of [['d018',9],['d019',11],['d020',13],['d021',15]]){
  assert.equal(card(id).guard,guard);assert.equal(card(id).stopScope,'miracle');
  assert.equal(card(id).weight,1);
 }
 assert.deepEqual([card('m001').role,card('m001').mpCost,card('m001').weight],['stop',6,1]);
 assert.deepEqual([card('m002').attack,card('m002').element,card('m002').mpCost],[4,'water',2]);
 assert.deepEqual([card('m003').attack,card('m003').element,card('m003').mpCost],[5,'dark',5]);
});
test('wall miracle from hand stops neutral weapon, costs MP and stays learned',()=>{
 const p=attack(['w016'],['m001']);
 const fin=defend(p,{playerId:'B',wallHandIndex:0},draw);
 assert.equal(fin.players[1].hp,40);
 assert.equal(fin.players[1].mp,4);
 assert.deepEqual(fin.players[1].learned.map(c=>c.id),['m001']);
 assert.equal(fin.players[1].hand.length,1);
 assert.equal(fin.events.at(-1).type,'damage');
 assert.equal(fin.events.at(-1).stopped,true);
 assert.equal(fin.events.some(e=>e.type==='stop'&&e.source==='wall'),true);
});
test('learned wall can be recast without the original hand card',()=>{
 const p=attack(['w016'],['d001']);
 p.players[1].learned=[card('m001')];
 const f=defend(p,{playerId:'B',wallLearnedId:'m001'},draw);
 assert.equal(f.players[1].hp,40);assert.equal(f.players[1].mp,4);
 assert.equal(f.players[1].hand.length,2);
});
test('wall refuses colored weapon without attribute removal and preserves state',()=>{
 const p=attack(['w018'],['m001']);
 assert.throws(()=>defend(p,{playerId:'B',wallHandIndex:0},draw),/only stops neutral/);
 assert.equal(p.players[1].mp,10);assert.equal(p.players[1].hand.length,1);
});
test('wall plus rainbow curtain stops colored weapon and uses both defensive effects',()=>{
 const p=attack(['w018'],['m001','i001']);
 const f=defend(p,{playerId:'B',wallHandIndex:0,handIndices:[1]},draw);
 assert.equal(f.players[1].hp,40);assert.equal(f.players[1].mp,4);
 assert.equal(f.players[1].hand.length,2);
});
test('wall cannot stop miracle attack even after stripping its attribute',()=>{
 const p=cast(['m002'],['m001','i001']);
 assert.throws(()=>defend(p,{playerId:'B',wallHandIndex:0,handIndices:[1]},draw),/only stops neutral/);
});
test('wall needs MP and rejects unsupported mixed cards',()=>{
 const p=attack(['w016'],['m001','d001']);
 p.players[1].mp=5;
 assert.throws(()=>defend(p,{playerId:'B',wallHandIndex:0},draw),/Not enough MP/);
 p.players[1].mp=10;
 assert.throws(()=>defend(p,{playerId:'B',wallHandIndex:0,handIndices:[1]},draw),/only be paired/);
});
test('an angel shield stops a water miracle regardless of its guard amount',()=>{
 const p=cast(['m002'],['d018']);
 const f=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(f.players[1].hp,40);
 assert.equal(f.players[0].mp,8);
 assert.deepEqual(f.players[0].learned.map(c=>c.id),['m002']);
 assert.equal(f.players[0].hand.length,1);
 assert.equal(f.events.some(e=>e.type==='stop'&&e.source==='angel'),true);
});
test('angel shield stops dark miracle before instant defeat',()=>{
 const p=cast(['m003'],['d021']);
 const f=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(f.players[1].hp,40);
 assert.equal(f.events.find(e=>e.type==='damage').instantDefeat,false);
});
test('angel shield is ordinary guard when defending against normal weapon',()=>{
 const p=attack(['w016'],['d018']);
 const f=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(f.players[1].hp,39);
 assert.equal(f.events.some(e=>e.type==='stop'),false);
});
test('a compatible elemental armor reduces miracle hit, without stopping it',()=>{
 const p=cast(['m002'],['d014']);
 const f=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(f.players[1].hp,39);
});
test('neutral-weapon reaction cannot reflect a miracle attack',()=>{
 const p=cast(['m002'],['w027']);
 assert.throws(()=>defend(p,{playerId:'B',handIndices:[0]},draw),/cannot redirect/);
});
test('miracle insufficient MP does not mutate state',()=>{
 const s=setup(['m003'],['d001']);s.players[0].mp=4;
 assert.throws(()=>playMiracleAttack(s,{playerId:'A',targetId:'B',handIndex:0},draw),/Not enough MP/);
 assert.equal(s.players[0].mp,4);assert.equal(s.players[0].learned.length,0);
});
test('offensive miracle can be used from learned list and draws one more card',()=>{
 const s=setup(['d001'],['d001']);s.players[0].learned=[card('m002')];
 const p=playMiracleAttack(s,{playerId:'A',targetId:'B',learnedId:'m002'},draw);
 const f=defend(p,{playerId:'B'},draw);
 assert.equal(f.players[1].hp,36);
 assert.equal(f.players[0].hand.length,2);
 assert.equal(f.players[0].mp,8);
});
test('self-cast dark miracle without defense causes self defeat',()=>{
 const s=setup(['m003'],['d001']);
 const f=playMiracleAttack(s,{playerId:'A',targetId:'A',handIndex:0},draw);
 assert.equal(f.winnerId,'B');assert.equal(f.phase,'finished');
});
test('learnt miracles only keep last six distinct IDs',()=>{
 const s=setup(['m002'],['d001']);
 s.players[0].learned=Array.from({length:6},(_,i)=>({...card('m002'),id:'old'+i}));
 const p=playMiracleAttack(s,{playerId:'A',targetId:'B',handIndex:0},draw);
 assert.deepEqual(p.players[0].learned.map(x=>x.id),['old1','old2','old3','old4','old5','m002']);
});
