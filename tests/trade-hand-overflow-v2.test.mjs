/**
 * G4: source-backed hand limit on forced trade.
 * https://w.atwiki.jp/aniwotawiki/pages/47010.html
 * https://note.com/md_stardustman/n/nfc5dfb559f95
 *
 * 19th incoming artifact ejects ONE of the receiver's prior 18 randomly;
 * the incoming artifact survives. This suite checks all resource,
 * ownership, RNG and replay invariants using the LAB's seeded xorshift.
 * Original-client PRNG implementation remains unverified.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {drawRandom32} from '../v2/foundation.mjs';
import {planIncomingHandTransfer} from '../v2/hand-overflow.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {previewUncontestedSale,settleUncontestedSaleFixture} from '../v2/trade-sale.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
const {byId:catalog}=migrateLegacyCatalog();
const lab={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(receiverCards=18,seed=53,three=false){
 const seats=[
  {id:'A',handDefinitionIds:['t001','w003','d005']},
  {id:'B',handDefinitionIds:Array(receiverCards).fill('d001')}
 ];
 if(three)seats.push({id:'C',handDefinitionIds:['d005','w016']});
 return createStagingRoom({seats,firstSeatId:'A',rngSeed:seed},catalog);
}
const trade=s=>({sellerId:'A',targetId:'B',
 saleInstanceId:s.players[0].hand[0].instanceId,
 soldInstanceId:s.players[0].hand[1].instanceId});
const settle=s=>settleUncontestedSaleFixture(s,catalog,trade(s),{
 ...lab,authorizedSeatId:'A'
});
function submit(s,body,actorId){
 return submitAndResolveFixture(s,{...body,actorId,
  commandId:'hand-cap-'+s.revision,expectedRevision:s.revision},
  catalog,{...lab,authorizedSeatId:actorId});
}
test('planner leaves 17-card and smaller receiving hands untouched without consuming RNG',()=>{
 const s=room(17),original=JSON.stringify(s);
 const result=planIncomingHandTransfer(s.players[1].hand,s.rngSeed);
 assert.deepEqual(result,{
  willOverflow:false,evictedInstanceId:null,evictedIndex:null,nextSeed:s.rngSeed
 });
 assert.equal(Object.isFrozen(result),true);
 assert.equal(JSON.stringify(s),original);
});
test('planner chooses exactly one of the existing 18 using one seeded RNG sample',()=>{
 const s=room(18,83),original=JSON.stringify(s),ids=s.players[1].hand.map(x=>x.instanceId);
 const draw=drawRandom32(s.rngSeed),plan=planIncomingHandTransfer(s.players[1].hand,s.rngSeed);
 const expectedIndex=Math.floor(draw.value*18);
 assert.equal(plan.willOverflow,true);
 assert.equal(plan.nextSeed,draw.nextSeed);
 assert.equal(plan.evictedIndex,expectedIndex);
 assert.equal(plan.evictedInstanceId,ids[expectedIndex]);
 assert.equal(Object.isFrozen(plan),true);
 assert.equal(JSON.stringify(s),original);
});
test('different seeds can eject any of the 18 old card positions, never outside the hand',()=>{
 const s=room(18),occupied=new Set();
 for(let seed=1;seed<=20000;seed++){
  const plan=planIncomingHandTransfer(s.players[1].hand,seed);
  assert.ok(plan.evictedIndex>=0&&plan.evictedIndex<18);
  occupied.add(plan.evictedIndex);
 }
 assert.equal(occupied.size,18);
});
test('original-state and invalid hand IDs are rejected before transfer',()=>{
 const s=room(18),valid=s.players[1].hand;
 for(const hand of [
  [...valid,valid[0]], // 19
  [...valid.slice(0,-1),{...valid[0]}], // duplicate identity
  [...valid.slice(0,-1),{instanceId:null}]
 ]){
  assert.throws(()=>planIncomingHandTransfer(hand,1));
 }
 for(const seed of [-1,0,NaN,Infinity,1.5,0x100000000])
  assert.throws(()=>planIncomingHandTransfer(valid,seed),/Invalid RNG seed/);
});
test('accepted non-lethal sale into a full receiver replaces exactly one OLD card',()=>{
 const s=room(18,83),original=JSON.stringify(s),seller=s.players[0],buyer=s.players[1];
 const oldIds=buyer.hand.map(x=>x.instanceId),offered=seller.hand[1];
 const plan=previewUncontestedSale(s,catalog,trade(s));
 assert.equal(plan.willOverflow,true);
 const expected=planIncomingHandTransfer(buyer.hand,s.rngSeed);
 const out=settle(s),n=out.state,after=n.players[1];
 const overflow=out.events.find(x=>x.type==='handOverflow');
 assert.equal(after.hand.length,18);
 assert.equal(after.hand.at(-1).instanceId,offered.instanceId);
 assert.equal(after.hand.at(-1).definitionId,'w003');
 assert.deepEqual(overflow,{
  type:'handOverflow',playerId:'B',
  lostInstanceId:expected.evictedInstanceId,
  lostDefinitionId:'d001',cause:'trade'
 });
 assert.equal(after.hand.some(x=>x.instanceId===expected.evictedInstanceId),false);
 assert.equal(after.hand.filter(x=>oldIds.includes(x.instanceId)).length,17);
 assert.equal(new Set(n.players.flatMap(x=>x.hand.map(c=>c.instanceId))).size,
  n.players.reduce((sum,p)=>sum+p.hand.length,0));
 assert.equal(n.rngSeed,expected.nextSeed);
 assert.equal(n.players[0].money,45);
 assert.equal(n.players[1].money,0);
 assert.equal(n.players[1].mp,5);
 assert.equal(n.players[0].hand.length,2);
 assert.deepEqual(out.events.map(x=>x.type),[
  'spend','handOverflow','uncontestedSale','refill','turnAdvance'
 ]);
 assert.equal(JSON.stringify(s),original);
});
test('same full-hand source and seed give identical outcome; 17 cards consume no sample',()=>{
 const full=room(18,91),once=settle(full),twice=settle(full);
 assert.deepEqual(once,twice);
 assert.equal(once.state.rngSeed,drawRandom32(full.rngSeed).nextSeed);
 const partial=room(17,91),out=settle(partial);
 assert.equal(out.state.rngSeed,partial.rngSeed);
 assert.equal(out.events.some(e=>e.type==='handOverflow'),false);
 assert.equal(out.state.players[1].hand.length,18);
});
test('3-player room preserves uninvolved C and the next turn is B, not a random seat',()=>{
 const s=room(18,123,true),snapshot=JSON.stringify(s.players[2]);
 const out=settle(s).state;
 assert.equal(out.activePlayerId,'B');
 assert.equal(out.turnCount,1);
 assert.equal(JSON.stringify(out.players[2]),snapshot);
});
test('authenticated staged sale at full limit resolves without a deadlock',()=>{
 const s=room(18,83),snapshot=JSON.stringify(s);
 const ask=submit(s,{type:'declareSale',targetId:'B',
  saleInstanceId:s.players[0].hand[0].instanceId,
  soldInstanceId:s.players[0].hand[1].instanceId},'A');
 assert.equal(ask.state.phase,'tradeDefense');
 assert.equal(ask.state.revision,1);
 const yes=submit(ask.state,{type:'respondSale'},'B');
 assert.equal(yes.state.phase,'turn');
 assert.equal(yes.state.activePlayerId,'B');
 assert.equal(yes.state.players[1].hand.length,18);
 assert.equal(yes.events.filter(e=>e.type==='handOverflow').length,1);
 assert.equal(yes.state.revision,3);
 assert.equal(JSON.stringify(s),snapshot);
});
test('a full receiver can use Super Mirror; no hand-overflow sample is taken',()=>{
 const s=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['t001','w003','d005']},
  {id:'B',handDefinitionIds:['i002',...Array(17).fill('d001')]}
 ],firstSeatId:'A',rngSeed:71},catalog);
 const ask=submit(s,{type:'declareSale',targetId:'B',
  saleInstanceId:s.players[0].hand[0].instanceId,
  soldInstanceId:s.players[0].hand[1].instanceId},'A');
 const yes=submit(ask.state,{type:'respondSale',
  mirrorInstanceId:ask.state.players[1].hand[0].instanceId},'B');
 assert.equal(yes.state.players[1].hand.length,18);
 assert.equal(yes.state.rngSeed,s.rngSeed);
 assert.equal(yes.events.some(e=>e.type==='handOverflow'),false);
 assert.equal(yes.state.players[0].hand[0].definitionId,'w003');
});
test('lethal sale still fails closed, even with a full receiver hand',()=>{
 const s=room(18);
 Object.assign(s.players[1],{hp:1,mp:0,money:0});
 const snapshot=JSON.stringify(s);
 assert.throws(()=>settle(s),/Lethal forced sale requires original verification/);
 assert.equal(JSON.stringify(s),snapshot);
});

test('learned miracle card slots at cap remain gated until original overflow ordering is known',()=>{
 const s=room(17),original=JSON.stringify(s);
 s.players[1].learned=['m002'];
 const snapshot=JSON.stringify(s);
 assert.throws(()=>previewUncontestedSale(s,catalog,trade(s)),
  /Learned miracle overflow at hand cap/);
 assert.throws(()=>settle(s),/Learned miracle overflow at hand cap/);
 assert.equal(JSON.stringify(s),snapshot);
 const below=room(16);
 below.players[1].learned=['m002'];
 const result=settle(below);
 assert.equal(result.state.players[1].hand.length,17);
 assert.deepEqual(result.state.players[1].learned,['m002']);
 assert.equal(result.events.some(e=>e.type==='handOverflow'),false);
 assert.equal(JSON.stringify(room(17)),original);
});
