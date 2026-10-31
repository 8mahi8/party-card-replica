import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {previewUncontestedSale,settleUncontestedSaleFixture} from '../v2/trade-sale.mjs';
import {previewSingleMirrorSale,settleSingleMirrorSaleFixture} from '../v2/trade-reflection.mjs';
import {runEffectQueueFixture} from '../v2/effect-runner.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001',authorizedSeatId:'A'};
function room(A=['t001','w003','d001'],B=['i002','d005'],C=null){
 const seats=[{id:'A',handDefinitionIds:A},{id:'B',handDefinitionIds:B}];
 if(C)seats.push({id:'C',handDefinitionIds:C});
 return createStagingRoom({seats,firstSeatId:'A',rngSeed:777},catalog);
}
function selection(s,targetId='B'){
 return {sellerId:'A',targetId,saleInstanceId:s.players[0].hand[0].instanceId,
  soldInstanceId:s.players[0].hand[1].instanceId};
}
function mirror(s,params=selection(s),index=0,opts={}){
 const player=s.players.find(p=>p.id===params.targetId);
 const mirrorInstanceId=player.hand[index].instanceId;
 return settleSingleMirrorSaleFixture(s,catalog,params,{...fixture,
  mirrorInstanceId,...opts});
}

test('the original target can reflect Sell using Super Mirror only',()=>{
 const s=room(),params=selection(s),mirrorInstanceId=s.players[1].hand[0].instanceId;
 const before=JSON.stringify(s);
 const plan=previewSingleMirrorSale(s,catalog,params,{mirrorInstanceId});
 assert.deepEqual([plan.originalSellerId,plan.mirrorOwnerId,plan.price],['A','B',25]);
 assert.deepEqual(plan.payment.debit,{money:20,mp:5,hp:0});
 assert.equal(plan.itemDefinitionId,'w003');
 assert.equal(JSON.stringify(s),before);
 assert.equal(Object.isFrozen(plan),true);
 assert.equal(Object.isFrozen(plan.payment),true);
});

test('mirror reverses ¥25 gold club sale: original seller pays, retains card, both draw',()=>{
 const s=room(),params=selection(s),snapshot=JSON.stringify(s);
 const soldId=params.soldInstanceId,serial=s.nextInstanceSerial;
 const r=mirror(s,params),n=r.state;
 assert.equal(n.revision,2);
 assert.equal(n.turnCount,1);
 assert.equal(n.phase,'turn');
 assert.equal(n.activePlayerId,'B');
 assert.equal(n.pending,null);
 assert.deepEqual(n.players.map(p=>[p.hp,p.mp,p.money]),[
  [40,5,0],[40,10,45]
 ]);
 assert.deepEqual(n.players[0].hand.map(c=>c.definitionId),['w003','d001','d001']);
 assert.deepEqual(n.players[1].hand.map(c=>c.definitionId),['d005','d001']);
 assert.equal(n.players[0].hand[0].instanceId,soldId);
 assert.equal(n.nextInstanceSerial,serial+2);
 assert.deepEqual(r.events.map(e=>e.type),[
  'spend','spend','reflectedSale','refill','refill','turnAdvance'
 ]);
 assert.deepEqual(r.events.filter(e=>e.type==='refill').map(e=>[e.playerId,e.added]),[
  ['A',1],['B',1]
 ]);
 assert.equal(JSON.stringify(s),snapshot);
});

test('reflected sale may charge original seller HP after money and MP exactly once',()=>{
 const s=room(),params=selection(s);
 Object.assign(s.players[0],{hp:15,mp:10,money:5});
 const r=mirror(s,params).state;
 assert.deepEqual([r.players[0].hp,r.players[0].mp,r.players[0].money],
  [5,0,0]);
 assert.equal(r.players[1].money,45);
 assert.equal(r.players[0].hand[0].definitionId,'w003');
 assert.equal(s.players[0].hp,15);
});

test('zero-price miracle reflection spends the two action cards with no stat changes',()=>{
 const s=room(['t001','m002'],['i002']);
 const oldId=s.players[0].hand[1].instanceId;
 const result=mirror(s),n=result.state;
 assert.deepEqual(n.players.map(p=>[p.hp,p.mp,p.money]),[
  [40,10,20],[40,10,20]
 ]);
 assert.equal(n.players[0].hand[0].instanceId,oldId);
 assert.deepEqual(n.players[0].hand.map(c=>c.definitionId),['m002','d001']);
 assert.deepEqual(n.players[1].hand.map(c=>c.definitionId),['d001']);
});

test('original non-mirrored and reflected settlement produce opposite money flow',()=>{
 const s=room(),params=selection(s),B=s.players[1];
 const without=settleUncontestedSaleFixture(s,catalog,params,fixture).state;
 const withMirror=mirror(s,params).state;
 assert.deepEqual([without.players[0].money,without.players[1].money],[45,0]);
 assert.deepEqual([withMirror.players[0].money,withMirror.players[1].money],[0,45]);
 assert.notEqual(without.players[1].hand.at(-1).definitionId,
  withMirror.players[1].hand.at(-1).definitionId);
 assert.equal(B.hand[0].definitionId,'i002');
});

test('invalid mirror card, non-target ownership and false target are rejected atomically',()=>{
 const s=room(),params=selection(s),before=JSON.stringify(s);
 for(const id of [s.players[1].hand[1].instanceId,'ci-forged',
   s.players[0].hand[0].instanceId]){
  assert.throws(()=>previewSingleMirrorSale(s,catalog,params,{mirrorInstanceId:id}),
   /Only a real Super Mirror|Mirror and sale instances must differ/);
 }
 assert.throws(()=>mirror(s,{...params,targetId:'C'}));
 assert.throws(()=>mirror(s,params,0,{authorizedSeatId:'B'}),
  /Sender seat is not authenticated/);
 assert.throws(()=>mirror(s,params,0,{labOnly:false}),/lab fixture mode/);
 assert.equal(JSON.stringify(s),before);
});

test('lethal reflected sale and seller credit overflow remain blocked',()=>{
 const s=room();
 Object.assign(s.players[0],{hp:1,mp:0,money:0});
 const before=JSON.stringify(s);
 assert.throws(()=>mirror(s),/Lethal reflected sale requires original verification/);
 assert.equal(JSON.stringify(s),before);
 const s2=room();s2.players[1].money=Number.MAX_SAFE_INTEGER-1;
 const snapshot=JSON.stringify(s2);
 assert.throws(()=>mirror(s2),/Mirror owner money overflow/);
 assert.equal(JSON.stringify(s2),snapshot);
});

test('Mirror is a trade reaction even though ordinary shield/weapon reaction is not',()=>{
 const s=room(['t001','w003'],['w027','d005']);
 assert.throws(()=>mirror(s),/Only a real Super Mirror/);
 const orig=room(['t001','w003'],['i002','w027']);
 assert.equal(mirror(orig).state.players[1].money,45);
});

test('forged reflected settlement cannot bypass Mirror spend or Sell cost',()=>{
 const s=room(),params=selection(s);
 const mirrorId=s.players[1].hand[0].instanceId;
 const stage={...s,phase:'resolving',activePlayerId:null,
   pending:{type:'singleMirrorSale',originalAttackerId:'A'}};
 const effect={type:'reflectedSale',originalSellerId:'A',
  mirrorOwnerId:'B',soldInstanceId:params.soldInstanceId};
 const wrap=q=>runEffectQueueFixture(stage,catalog,q,fixture);
 for(const forged of [
  [effect,{type:'advance',afterId:'A'}],
  [{type:'spend',playerId:'A',instanceIds:[params.saleInstanceId]},effect,
   {type:'advance',afterId:'A'}],
  [{type:'spend',playerId:'B',instanceIds:[mirrorId]},effect,
   {type:'advance',afterId:'A'}],
  [{type:'spend',playerId:'A',instanceIds:[params.saleInstanceId]},
   {type:'spend',playerId:'B',instanceIds:[mirrorId]},
   {...effect,price:0},{type:'advance',afterId:'A'}]
 ]){
  assert.throws(()=>wrap(forged));
 }
 assert.equal(s.players[0].money,20);
 assert.equal(s.players[1].money,20);
});

test('mirror response is not permitted in live/online path or as a guessed chain',()=>{
 const s=room();
 assert.throws(()=>settleSingleMirrorSaleFixture(s,catalog,selection(s),{
  labOnly:false,fixtureDrawDefinitionId:'d001',
  authorizedSeatId:'A',mirrorInstanceId:s.players[1].hand[0].instanceId
 }),/lab fixture mode/);
 const completed=mirror(s);
 assert.throws(()=>mirror(completed.state),/Only current seller|starting turn|Sale requires valid|Only a real Super Mirror/);
});
