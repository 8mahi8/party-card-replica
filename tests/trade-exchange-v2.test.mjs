import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {previewExchangeFixture} from '../v2/trade-exchange.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {runEffectQueueFixture} from '../v2/effect-runner.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
const auth={authorizedSeatId:'A',labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(hand=['t003','d005'],other=['w003'],third=null){
 const seats=[{id:'A',handDefinitionIds:hand},{id:'B',handDefinitionIds:other}];
 if(third)seats.push({id:'C',handDefinitionIds:third});
 return createStagingRoom({seats,firstSeatId:'A',rngSeed:53},catalog);
}
function command(s,allocation={hp:50,mp:10,money:10}){
 return {type:'exchange',commandId:'exchange-1',expectedRevision:s.revision,
 actorId:'A',exchangeInstanceId:s.players[0].hand[0].instanceId,allocation};
}
const submit=(s,c=command(s),context=auth)=>
 submitAndResolveFixture(s,c,catalog,context);

test('Exchange definition uses price ¥5 and research probability 20 / 500',()=>{
 const card=catalog.get('t003');
 assert.equal(card.family,'trade');
 assert.deepEqual(card.playModes,['trade']);
 assert.equal(card.stats.price,5);
 assert.equal(card.drawWeight,20);
 assert.deepEqual(card.effects.map(e=>[e.when,e.type,e.params.kind]),
   [['onDeclare','reallocateResources','exchange']]);
 assert.equal(summary.unique,94);
 assert.equal(summary.slots,270);
 assert.equal(summary.complete,false);
});
test('pure preview conserves exact HP:MP:money 1:1 and cannot mutate callers',()=>{
 const source={hp:40,mp:10,money:20};
 const allocation={hp:50,mp:10,money:10};
 const before=JSON.stringify(source),after=JSON.stringify(allocation);
 const p=previewExchangeFixture(source,allocation);
 assert.equal(p.total,70);
 assert.equal(p.changed,true);
 assert.deepEqual(p.before,source);
 assert.deepEqual(p.after,allocation);
 assert.equal(Object.isFrozen(p),true);
 assert.equal(Object.isFrozen(p.after),true);
 assert.equal(JSON.stringify(source),before);
 assert.equal(JSON.stringify(allocation),after);
});
test('reallocation can favor money or MP and need not change resources',()=>{
 assert.deepEqual(previewExchangeFixture(
  {hp:40,mp:10,money:20},{hp:1,mp:0,money:69}).after,
  {hp:1,mp:0,money:69});
 assert.deepEqual(previewExchangeFixture(
  {hp:40,mp:10,money:20},{hp:10,mp:60,money:0}).after,
  {hp:10,mp:60,money:0});
 assert.equal(previewExchangeFixture(
  {hp:40,mp:10,money:20},{hp:40,mp:10,money:20}).changed,false);
});
test('HP0 manual allocation remains gated; forced random self-death is separate',()=>{
 assert.throws(()=>previewExchangeFixture(
  {hp:40,mp:10,money:20},{hp:0,mp:10,money:60}),/allocation HP/);
 assert.throws(()=>previewExchangeFixture(
  {hp:0,mp:10,money:20},{hp:1,mp:10,money:19}),/origin HP/);
});
test('negative fractional missing extra noninteger allocations are rejected',()=>{
 const source={hp:40,mp:10,money:20};
 for(const choice of [
  {hp:40,mp:-1,money:31},
  {hp:40.5,mp:9.5,money:20},
  {hp:40,mp:10},
  {hp:40,mp:10,money:20,bonus:0},
  {hp:39,mp:10,money:20},
  {hp:41,mp:10,money:20},
  {hp:'40',mp:10,money:20},
  {hp:40,mp:10,money:NaN},
  {hp:40,mp:10,money:Infinity},
  [],
  null
 ])assert.throws(()=>previewExchangeFixture(source,choice));
});
test('safe-integer overflow is rejected even when sum would round back',()=>{
 assert.throws(()=>previewExchangeFixture(
  {hp:Number.MAX_SAFE_INTEGER,mp:1,money:0},
  {hp:Number.MAX_SAFE_INTEGER,mp:1,money:0}),/safe integer/);
 assert.throws(()=>previewExchangeFixture(
  {hp:40,mp:10,money:20},
  {hp:Number.MAX_SAFE_INTEGER,mp:10,money:20}),/safe integer|conserve total/);
});
test('authenticated Exchange spends its own card, reallocates then refills one',()=>{
 const s=room(),snapshot=JSON.stringify(s),serial=s.nextInstanceSerial;
 const out=submit(s),n=out.state;
 assert.equal(out.applied,true);
 assert.equal(out.autoResolved,true);
 assert.equal(out.plan.type,'exchange');
 assert.equal(out.plan.allocation.hp,50);
 assert.equal(n.revision,2);
 assert.equal(n.turnCount,1);
 assert.equal(n.activePlayerId,'B');
 assert.equal(n.phase,'turn');
 assert.deepEqual([n.players[0].hp,n.players[0].mp,n.players[0].money],[50,10,10]);
 assert.deepEqual([n.players[1].hp,n.players[1].mp,n.players[1].money],[40,10,20]);
 assert.deepEqual(n.players[0].hand.map(x=>x.definitionId),['d005','d001']);
 assert.equal(n.nextInstanceSerial,serial+1);
 assert.deepEqual(out.events.map(x=>x.type),['spend','exchange','refill','turnAdvance']);
 assert.equal(n.processedCommands.length,1);
 assert.equal(JSON.stringify(s),snapshot);
});
test('same allocation is a legal Exchange action; it still spends and refills',()=>{
 const s=room();
 const out=submit(s,command(s,{hp:40,mp:10,money:20}));
 assert.equal(out.events[1].type,'exchange');
 assert.deepEqual([out.state.players[0].hp,out.state.players[0].mp,out.state.players[0].money],[40,10,20]);
 assert.equal(out.events[2].added,1);
});
test('full 18 physical hand spends then refills with no unrelated deletion',()=>{
 const s=room(['t003',...Array(17).fill('d001')]);
 const original=s.players[0].hand.map(x=>x.instanceId);
 const out=submit(s),n=out.state;
 assert.equal(n.players[0].hand.length,18);
 assert.deepEqual(n.players[0].hand.slice(0,17).map(x=>x.instanceId),original.slice(1));
 assert.equal(n.players[0].hand.at(-1).definitionId,'d001');
 assert.equal(n.rngSeed,s.rngSeed);
 assert.equal(out.events.some(e=>e.type==='handOverflow'),false);
});
test('third living seat untouched; order advances from owner A to B',()=>{
 const s=room(['t003'],['w003'],['m002','d001']);
 const original=JSON.stringify(s.players[2]);
 const n=submit(s).state;
 assert.equal(n.activePlayerId,'B');
 assert.equal(JSON.stringify(n.players[2]),original);
});
test('unauthenticated caller, incorrect card instance and other trade denied atomically',()=>{
 const s=room(),before=JSON.stringify(s),c=command(s);
 assert.throws(()=>submit(s,c,{...auth,authorizedSeatId:'B'}),/not authenticated/);
 assert.throws(()=>submit(s,{...c,exchangeInstanceId:s.players[0].hand[1].instanceId}),/cannot declare Exchange/);
 const other=room(['t001']);
 assert.throws(()=>submit(other,command(other)),/cannot declare Exchange/);
 assert.equal(JSON.stringify(s),before);
});
test('reused commandId with changed allocation must conflict, retry is idempotent',()=>{
 const s=room(),c=command(s),first=submit(s,c).state;
 const retry=submit(first,c);
 assert.equal(retry.duplicate,true);
 assert.strictEqual(retry.state,first);
 assert.throws(()=>submit(first,{...c,allocation:{hp:40,mp:20,money:10}}),/Conflicting commandId reuse/);
 assert.throws(()=>submit(first,{...command(first),commandId:'fresh-2'}),/Not the active seat/);
});
test('same semantic allocation with reordered keys is idempotent',()=>{
 const s=room(),c=command(s),n=submit(s,c).state;
 const reverse={money:10,mp:10,hp:50};
 const retry=submit(n,{...c,allocation:reverse});
 assert.equal(retry.duplicate,true);
});
test('forged queue cannot perform Exchange without a matching authentic spent card',()=>{
 const s=room();
 const physical=s.players[0].hand[0].instanceId;
 const staged={...s,phase:'resolving',activePlayerId:null,pending:{
   type:'exchange',originalAttackerId:'A',
   exchangeInstanceId:physical,allocation:{hp:50,mp:10,money:10}
 }};
 const step={type:'exchange',playerId:'A'};
 const goodSpend={type:'spend',playerId:'A',instanceIds:[physical]};
 for(const q of [
  [step,{type:'advance',afterId:'A'}],
  [{type:'spend',playerId:'A',instanceIds:[s.players[0].hand[1].instanceId]},step],
  [goodSpend,{...step,playerId:'B'}],
  [goodSpend,{...step,allocation:{hp:60,mp:10,money:0}}]
 ]){
   assert.throws(()=>runEffectQueueFixture(staged,catalog,q,auth));
 }
 assert.equal(s.players[0].money,20);
});
test('view never includes allocation from another player, RNG or command ledger',()=>{
 const s=room(),n=submit(s).state;
 const view=viewStagingRoom(n,'B');
 assert.equal(Object.hasOwn(view,'rngSeed'),false);
 assert.equal(Object.hasOwn(view,'processedCommands'),false);
 assert.equal(Object.hasOwn(view.players[0],'hand'),false);
 assert.equal(Object.hasOwn(view.players[0],'learned'),false);
 assert.deepEqual([view.players[0].hp,view.players[0].mp,view.players[0].money],[50,10,10]);
});
