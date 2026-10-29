import test from 'node:test';
import assert from 'node:assert/strict';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {runEffectQueueFixture} from '../v2/effect-runner.mjs';
import {previewBuyOfferFixture} from '../v2/trade-buy.mjs';
import {settleUncontestedBuyFixture} from '../v2/trade-buy-settlement.mjs';
const {byId:catalog,summary}=migrateLegacyCatalog();
const opts={labOnly:true,fixtureDrawDefinitionId:'d001',authorizedSeatId:'A'};
function room(A=['t002','d001'],B=['d005'],seed=59,C=null){
 const seats=[{id:'A',handDefinitionIds:A},{id:'B',handDefinitionIds:B}];
 if(C)seats.push({id:'C',handDefinitionIds:C});
 return createStagingRoom({seats,firstSeatId:'A',rngSeed:seed},catalog);
}
const selection=s=>({buyerId:'A',targetId:'B',
 buyInstanceId:s.players[0].hand[0].instanceId,accept:true});
const settle=(s,accept=true,config=opts)=>settleUncontestedBuyFixture(
 s,catalog,{...selection(s),accept},config
);
test('Buy definition has source-backed 20/500 weight, ¥5 price and strict requestBuy effect',()=>{
 const card=catalog.get('t002');
 assert.equal(card.family,'trade');
 assert.deepEqual(card.playModes,['trade']);
 assert.deepEqual(card.stats.price,5);
 assert.equal(card.drawWeight,20);
 assert.deepEqual(card.effects.map(e=>[e.when,e.type,e.params.kind]),
  [['onDeclare','requestBuy','buy']]);
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
 assert.equal(summary.complete,false);
});
test('uncontested Buy pays money and moves exact random item; action card alone refills',()=>{
 const s=room(),before=JSON.stringify(s),serial=s.nextInstanceSerial;
 const item=s.players[1].hand[0].instanceId;
 const result=settle(s),n=result.state;
 assert.equal(n.revision,2);
 assert.equal(n.phase,'turn');
 assert.equal(n.activePlayerId,'B');
 assert.equal(n.turnCount,1);
 assert.equal(n.players[0].money,15);
 assert.equal(n.players[1].money,25);
 assert.equal(n.players[0].hp,40);
 assert.equal(n.players[0].mp,10);
 assert.deepEqual(n.players[0].hand.map(x=>x.definitionId),['d001','d005','d001']);
 assert.equal(n.players[0].hand[1].instanceId,item);
 assert.equal(n.players[1].hand.length,0);
 assert.equal(n.nextInstanceSerial,serial+1);
 assert.deepEqual(result.events.map(x=>x.type),
  ['spend','uncontestedBuy','refill','turnAdvance']);
 assert.equal(result.events[2].added,1);
 assert.equal(n.rngSeed,previewBuyOfferFixture(s,catalog,{
   buyerId:'A',targetId:'B'
 }).nextSeed);
 assert.equal(JSON.stringify(s),before);
});
test('no purchase still spends/refills Buy, keeps money and seller item unchanged',()=>{
 const s=room(),before=JSON.stringify(s);
 const out=settle(s,false),n=out.state;
 assert.equal(n.players[0].money,20);
 assert.equal(n.players[1].money,20);
 assert.deepEqual(n.players[0].hand.map(x=>x.definitionId),['d001','d001']);
 assert.equal(n.players[1].hand[0].instanceId,s.players[1].hand[0].instanceId);
 assert.equal(out.plan.decision,'declined');
 assert.deepEqual(out.events.map(x=>x.type),
  ['spend','buyDeclined','refill','turnAdvance']);
 assert.equal(JSON.stringify(s),before);
});
test('zero-yen unused miracle is transferred with no money spent',()=>{
 const s=room(['t002'],['m002']);
 s.players[0].money=0;
 const out=settle(s),n=out.state;
 assert.equal(out.plan.price,0);
 assert.equal(n.players[0].money,0);
 assert.equal(n.players[1].money,20);
 assert.equal(n.players[0].hand[0].instanceId,s.players[1].hand[0].instanceId);
 assert.equal(n.players[0].hand[0].definitionId,'m002');
 assert.equal(n.players[0].hand[1].definitionId,'d001');
});
test('Poor may decline but never spend MP/HP to purchase',()=>{
 const s=room(['t002'],['w003']);
 s.players[0].money=24;s.players[0].mp=100;s.players[0].hp=100;
 const snapshot=JSON.stringify(s);
 assert.throws(()=>settle(s,true),/Poor/);
 assert.equal(JSON.stringify(s),snapshot);
 const out=settle(s,false);
 assert.equal(out.state.players[0].money,24);
 assert.equal(out.state.players[0].mp,100);
 assert.equal(out.state.players[0].hp,100);
});
test('full physical hand choice is gated rather than assuming refill/overflow order',()=>{
 const s=room(['t002',...Array(17).fill('d001')],['d005']);
 const before=JSON.stringify(s);
 assert.throws(()=>settle(s,true),/Full-hand Buy settlement/);
 assert.equal(JSON.stringify(s),before);
 const out=settle(s,false);
 assert.equal(out.state.players[0].hand.length,18);
});
test('buyer at 17 cards receives the exact item plus one replacement to reach 18',()=>{
 const s=room(['t002',...Array(16).fill('d001')],['d005']);
 const out=settle(s),n=out.state;
 assert.equal(n.players[0].hand.length,18);
 assert.equal(n.players[0].hand.filter(x=>x.definitionId==='d005').length,1);
 assert.equal(n.players[1].hand.length,0);
 assert.equal(out.events.some(x=>x.type==='handOverflow'),false);
});
test('learned miracles involving hand cap remain fail-closed until observed in original',()=>{
 const s=room(['t002',...Array(16).fill('d001')],['d005']);
 s.players[0].learned=['m002'];
 const before=JSON.stringify(s);
 assert.throws(()=>settle(s,true),/Learned miracle overflow/);
 assert.equal(JSON.stringify(s),before);
 assert.equal(settle(s,false).state.players[0].hand.length,17);
});
test('three-player Buy leaves uninvolved C unchanged; advances after buyer A',()=>{
 const s=room(['t002'],['d005'],53,['w003','d001']);
 const c=JSON.stringify(s.players[2]);
 const n=settle(s).state;
 assert.equal(n.activePlayerId,'B');
 assert.equal(JSON.stringify(n.players[2]),c);
});
test('missing ownership, impersonation and duplicate settlement fail without modifying source',()=>{
 const s=room(),before=JSON.stringify(s);
 assert.throws(()=>settle(s,true,{...opts,authorizedSeatId:'B'}),/not authenticated/);
 assert.throws(()=>settle(s,true,{...opts,labOnly:false}),/lab fixture mode/);
 const other=room(['t001'],['d005']);
 assert.throws(()=>settle(other,true),/authentic Buy/);
 assert.equal(JSON.stringify(s),before);
 const n=settle(s).state;
 assert.throws(()=>settle(n),/authentic Buy|requires a V2 laboratory turn/);
});
test('forged internal queue cannot move a Buy item without its real spent card',()=>{
 const s=room();
 const target=s.players[1].hand[0].instanceId;
 const buyId=s.players[0].hand[0].instanceId;
 const staged={...s,revision:1,phase:'resolving',activePlayerId:null,
  pending:{type:'uncontestedBuy',originalAttackerId:'A',targetId:'B',
   buyInstanceId:buyId,itemInstanceId:target,accept:true}};
 const action={type:'uncontestedBuy',buyerId:'A',sellerId:'B',
   buyInstanceId:buyId,itemInstanceId:target,accept:true};
 const before=JSON.stringify(s);
 for(const queue of [
  [action,{type:'refill'},{type:'advance',afterId:'A'}],
  [{type:'spend',playerId:'A',instanceIds:[s.players[0].hand[1].instanceId]},
   action,{type:'refill'},{type:'advance',afterId:'A'}],
  [{type:'spend',playerId:'A',instanceIds:[buyId]},
   {...action,itemInstanceId:'ci-fake'},{type:'refill'},{type:'advance',afterId:'A'}]
 ]){
   assert.throws(()=>runEffectQueueFixture(staged,catalog,queue,opts));
   assert.equal(JSON.stringify(s),before);
 }
});
test('catalog price is authoritative and seller money overflow fails atomically',()=>{
 const s=room(['t002'],['w003']);s.players[0].money=25;
 s.players[1].money=Number.MAX_SAFE_INTEGER-1;
 const snapshot=JSON.stringify(s);
 assert.throws(()=>settle(s),/Seller money overflow/);
 assert.equal(JSON.stringify(s),snapshot);
});
test('projection after research Buy does not disclose opponent hand or RNG',()=>{
 const n=settle(room()).state;
 const view=viewStagingRoom(n,'A');
 assert.equal(Object.hasOwn(view.players[1],'hand'),false);
 assert.equal(Object.hasOwn(view,'rngSeed'),false);
 assert.equal(Object.hasOwn(view,'processedCommands'),false);
});
