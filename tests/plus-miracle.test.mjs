import test from 'node:test';
import assert from 'node:assert/strict';
import {playPlusMiracleAttack} from '../src/plus-miracle.mjs';
import {createMatch,playMiracleAttack,playAttack,defend} from '../src/match.mjs';
import {findVerifiedBasicCard as card,VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';
import {auditCatalog} from '../src/catalog-audit.mjs';
const draw=()=>card('d001');
function setup(a,b){
 const s=createMatch({playerIds:['A','B'],firstPlayerId:'A',rng:()=>0,draw});
 s.players[0].hand=a.map(card);s.players[1].hand=b.map(card);return s;
}
const combo=(s,handIndices,plusHandIndex)=>playPlusMiracleAttack(s,{playerId:'A',targetId:'B',handIndices,plusHandIndex},draw);
test('Fireball and Meteor are partial source data (67 kinds, 184 slots)',()=>{
 assert.equal(VERIFIED_BASIC_CARDS.length,69);
 const audit=auditCatalog(VERIFIED_BASIC_CARDS);
 assert.equal(audit.slots,187);assert.equal(audit.complete,false);
 assert.deepEqual([card('m005').attack,card('m005').mpCost,card('m005').element,card('m005').weight],[2,2,'fire',1]);
 assert.deepEqual([card('m006').attack,card('m006').mpCost,card('m006').element,card('m006').weight],[10,7,'light',1]);
});
test('Fireball plus neutral weapon yields neutral attack and one extra draw',()=>{
 const original=setup(['w016','m005'],['d001']);
 const p=combo(original,[0],1);
 assert.equal(p.pending.attack,12);assert.equal(p.pending.element,'none');
 assert.equal(p.pending.attackKind,'weapon');assert.equal(p.players[0].mp,8);
 assert.deepEqual(p.players[0].learned.map(c=>c.id),['m005']);
 const f=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(f.players[1].hp,29);assert.equal(f.players[0].hand.length,2);
 assert.equal(original.players[0].hand.length,2);assert.equal(original.players[0].mp,10);
});
test('standalone Fireball is miracle-typed fire attack',()=>{
 const s=setup(['m005'],['d001']);
 const p=playMiracleAttack(s,{playerId:'A',targetId:'B',handIndex:0},draw);
 assert.equal(p.pending.attackKind,'miracle');assert.equal(p.pending.element,'fire');
 const f=defend(p,{playerId:'B',handIndices:[]},draw);
 assert.equal(f.players[1].hp,38);assert.equal(f.players[0].hand.length,1);
});
test('Fireball plus fire weapon remains fire and can be guarded',()=>{
 const s=setup(['w018','m005'],['d015']);
 const p=combo(s,[0],1);assert.equal(p.pending.element,'fire');
 const f=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(f.players[1].hp,40);
});
test('Meteor plus water weapon retains water (light element exception)',()=>{
 const s=setup(['w021','m006'],['d014']);
 const p=combo(s,[0],1);
 assert.equal(p.pending.attack,11);assert.equal(p.pending.element,'water');
 assert.equal(p.players[0].mp,3);
 const f=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(f.players[1].hp,32);
});
test('standalone Meteor is light miracle and not normally blockable',()=>{
 const s=setup(['m006'],['d001']);
 const p=playMiracleAttack(s,{playerId:'A',targetId:'B',handIndex:0},draw);
 assert.equal(p.pending.element,'light');
 assert.throws(()=>defend(p,{playerId:'B',handIndices:[0]},draw),/Illegal shield/);
 const f=defend(p,{playerId:'B',handIndices:[]},draw);
 assert.equal(f.players[1].hp,30);
});
test('already learned Fireball boosts weapon without being in hand',()=>{
 const s=setup(['w016'],['d001']);s.players[0].learned=[card('m005')];
 const p=playPlusMiracleAttack(s,{playerId:'A',targetId:'B',handIndices:[0],learnedPlusId:'m005'},draw);
 assert.equal(p.pending.attack,12);assert.equal(p.players[0].mp,8);
 const f=defend(p,{playerId:'B',handIndices:[]},draw);
 assert.equal(f.players[0].hand.length,2);
});
test('invalid self target and invalid miracle index leave original state untouched',()=>{
 const s=setup(['w016','m005'],['d001']);
 const action={playerId:'A',targetId:'A',handIndices:[0],plusHandIndex:1};
 assert.throws(()=>playPlusMiracleAttack(s,action,draw),/self-target/);
 assert.throws(()=>playPlusMiracleAttack(s,{...action,targetId:'B',plusHandIndex:0},draw),/Invalid plus/);
 assert.throws(()=>playPlusMiracleAttack(s,{...action,targetId:'B',handIndices:[1]},draw),/Invalid plus/);
 assert.equal(s.players[0].mp,10);assert.equal(s.pending,null);
});
test('insufficient MP and attack-boost armor combination rejected',()=>{
 const s=setup(['w016','d010','m005'],['d001']);s.players[0].mp=1;
 assert.throws(()=>playPlusMiracleAttack(s,{playerId:'A',targetId:'B',handIndices:[0],plusHandIndex:2},draw),/Not enough MP/);
 s.players[0].mp=10;
 assert.throws(()=>playPlusMiracleAttack(s,{playerId:'A',targetId:'B',handIndices:[0,1],plusHandIndex:2},draw),/Only weapons/);
 assert.equal(s.players[0].hand.length,3);
});
test('miracle extra draw still respects hand cap of eighteen',()=>{
 const s=setup(['w016','m005',...Array(16).fill('d001')],['d001']);
 const p=combo(s,[0],1);
 const f=defend(p,{playerId:'B',handIndices:[]},draw);
 assert.equal(f.players[0].hand.length,18);
});
test('neutral weapon combined with Fireball may be reflected by neutral weapon',()=>{
 const s=setup(['w016','m005','d005'],['w027']);
 const p=combo(s,[0],1);assert.equal(p.pending.element,'none');
 const red=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(red.activePlayerId,'A');
 const f=defend(red,{playerId:'A',handIndices:[0]},draw);
 assert.equal(f.players[0].hp,33);
});
test('learned miracles keep only last six unique IDs',()=>{
 const s=setup(['w016','m005'],['d001']);
 s.players[0].learned=Array.from({length:6},(_,i)=>({...card('m005'),id:'old'+i}));
 const p=combo(s,[0],1);
 assert.deepEqual(p.players[0].learned.map(c=>c.id),['old1','old2','old3','old4','old5','m005']);
});
test('rainbow curtain must be first in ordered defense selections',()=>{
 const s=setup(['w024'],['d001','i001']);
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 assert.throws(()=>defend(p,{playerId:'B',handIndices:[0,1]},draw),/selected first/);
 const f=defend(p,{playerId:'B',handIndices:[1,0]},draw);
 assert.equal(f.players[1].hp,38);
});
test('rainbow curtain alone strips dark instant death',()=>{
 const s=setup(['w025'],['i001']);
 const p=playAttack(s,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const f=defend(p,{playerId:'B',handIndices:[0]},draw);
 assert.equal(f.players[1].hp,39);
});
