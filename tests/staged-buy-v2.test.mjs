import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {previewBuyOfferFixture} from '../v2/trade-buy.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const lab={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(A=['t002','d001'],B=['d005'],C=null,seed=83){
 const seats=[{id:'A',handDefinitionIds:A},{id:'B',handDefinitionIds:B}];
 if(C)seats.push({id:'C',handDefinitionIds:C});
 return createStagingRoom({seats,firstSeatId:'A',rngSeed:seed},catalog);
}
function cmd(s,type,actorId,fields={},id=type+'-'+s.revision){
 return {type,actorId,commandId:id,expectedRevision:s.revision,...fields};
}
function send(s,command,authorizedSeatId=command.actorId){
 return submitAndResolveFixture(s,command,catalog,{
  ...lab,authorizedSeatId
 });
}
const declare=s=>cmd(s,'declareBuy','A',{
 targetId:'B',buyInstanceId:s.players[0].hand[0].instanceId
});
const pass=s=>cmd(s,'respondBuy','B');
const decide=(s,accept=true)=>cmd(s,'decideBuy','A',{accept});
function offeredBy(s){
 return previewBuyOfferFixture({...s,phase:'turn',activePlayerId:'A',pending:null},
   catalog,{buyerId:'A',targetId:'B'});
}

test('Buy declaration is authenticated, preserves cards, and does not reveal item before response',()=>{
 const s=room(),snapshot=JSON.stringify(s);
 const out=send(s,declare(s)),n=out.state;
 assert.equal(out.autoResolved,false);
 assert.equal(n.phase,'buyDefense');
 assert.equal(n.activePlayerId,'B');
 assert.equal(n.revision,1);
 assert.equal(n.turnCount,0);
 assert.equal(n.rngSeed,s.rngSeed);
 assert.equal(n.pending.offer,null);
 assert.equal(n.players[0].hand.length,2);
 assert.equal(n.players[1].hand.length,1);
 for(const id of ['A','B']){
   const view=viewStagingRoom(n,id);
   assert.equal(view.pending.type,'buy');
   assert.equal(view.pending.stage,'awaitingTradeResponse');
   assert.equal(Object.hasOwn(view.pending,'offer'),false);
   assert.equal(Object.hasOwn(view,'rngSeed'),false);
   assert.equal(Object.hasOwn(view,'processedCommands'),false);
 }
 assert.equal(JSON.stringify(s),snapshot);
});

test('target passes; only buyer sees item and price, never physical seller instance ID',()=>{
 const s=room(['t002'],['w003','d005']);
 const a=send(s,declare(s)).state;
 const raw=offeredBy(a),n=send(a,pass(a)).state;
 assert.equal(n.phase,'buyDecision');
 assert.equal(n.activePlayerId,'A');
 assert.equal(n.revision,2);
 assert.equal(n.rngSeed,s.rngSeed);
 assert.equal(n.pending.offer.itemInstanceId,raw.itemInstanceId);
 assert.equal(n.pending.offer.nextSeed,raw.nextSeed);
 const owner=viewStagingRoom(n,'A'),seller=viewStagingRoom(n,'B');
 assert.deepEqual(owner.pending.offer,{
   definitionId:raw.itemDefinitionId,price:raw.price
 });
 assert.equal(Object.hasOwn(seller.pending,'offer'),false);
 assert.equal(JSON.stringify(owner).includes(raw.itemInstanceId),false);
 assert.equal(JSON.stringify(seller).includes(raw.itemInstanceId),true,
   'seller sees its own card only, not the staged offer');
 assert.equal(Object.hasOwn(owner.players[1],'hand'),false);
});

test('three-step authenticated purchase settles via common effect queue',()=>{
 const s=room(['t002','d001'],['d005']);
 const initialItem=s.players[1].hand[0].instanceId;
 const expected=offeredBy(s);
 const before=JSON.stringify(s);
 const first=send(s,declare(s)).state;
 const second=send(first,pass(first)).state;
 const result=send(second,decide(second,true)),n=result.state;
 assert.equal(result.autoResolved,true);
 assert.equal(result.plan.type,'stagedBuy');
 assert.equal(result.plan.decision,'accepted');
 assert.equal(n.phase,'turn');
 assert.equal(n.activePlayerId,'B');
 assert.equal(n.revision,4);
 assert.equal(n.turnCount,1);
 assert.equal(n.pending,null);
 assert.equal(n.rngSeed,expected.nextSeed);
 assert.equal(n.players[0].money,15);
 assert.equal(n.players[1].money,25);
 assert.equal(n.players[0].hand.filter(c=>c.instanceId===initialItem).length,1);
 assert.equal(n.players[1].hand.length,0);
 assert.deepEqual(n.players[0].hand.map(x=>x.definitionId),
   ['d001','d005','d001']);
 assert.deepEqual(result.events.map(e=>e.type),
   ['spend','uncontestedBuy','refill','turnAdvance']);
 assert.equal(JSON.stringify(s),before);
});

test('buyer may decline without changing seller hand or money',()=>{
 const s=room(['t002'],['w003']);
 const first=send(s,declare(s)).state;
 const second=send(first,pass(first)).state;
 const result=send(second,decide(second,false));
 assert.equal(result.plan.decision,'declined');
 assert.equal(result.state.players[0].money,20);
 assert.equal(result.state.players[1].money,20);
 assert.deepEqual(result.state.players[1].hand,s.players[1].hand);
 assert.equal(result.state.players[0].hand[0].definitionId,'d001');
 assert.equal(result.state.rngSeed,offeredBy(s).nextSeed);
 assert.equal(result.state.turnCount,1);
});

test('buyer cannot spend MP/HP as money; failed accepted choice is atomic',()=>{
 const s=room(['t002'],['w003']);
 s.players[0].money=0;
 const d=send(s,declare(s)).state;
 const o=send(d,pass(d)).state,snapshot=JSON.stringify(o);
 assert.throws(()=>send(o,decide(o,true)),/Poor/);
 assert.equal(JSON.stringify(o),snapshot);
 const no=send(o,decide(o,false));
 assert.equal(no.state.phase,'turn');
 assert.equal(no.state.players[0].money,0);
});

test('target may possess a real Super Mirror but unverified reflection never silently resolves',()=>{
 const s=room(['t002'],['i002','d005']);
 const d=send(s,declare(s)).state;
 const mirror=d.players[1].hand[0].instanceId;
 const snapshot=JSON.stringify(d);
 assert.throws(()=>send(d,cmd(d,'respondBuy','B',{mirrorInstanceId:mirror})),
  /requires original verification/);
 assert.equal(JSON.stringify(d),snapshot);
 const nonMirror=d.players[1].hand[1].instanceId;
 assert.throws(()=>send(d,cmd(d,'respondBuy','B',{mirrorInstanceId:nonMirror})),
  /Only Super Mirror/);
 assert.equal(JSON.stringify(d),snapshot);
 const passed=send(d,pass(d)).state;
 assert.equal(passed.phase,'buyDecision');
});

test('all three phases enforce authorization and reject off-turn commands',()=>{
 const s=room(),d=declare(s);
 assert.throws(()=>send(s,d,'B'),/not authenticated/);
 const first=send(s,d).state;
 const wrong=pass(first);
 assert.throws(()=>send(first,wrong,'A'),/not authenticated/);
 assert.throws(()=>send(first,decide(first,true)));
 const second=send(first,wrong).state;
 assert.throws(()=>send(second,cmd(second,'respondBuy','B')));
 assert.throws(()=>send(second,decide(second,true),'B'),/not authenticated/);
 assert.equal(second.phase,'buyDecision');
});

test('idempotent retries and conflicting command fingerprints across all phases',()=>{
 const s=room(),d=declare(s),first=send(s,d).state;
 const duplicate=send(first,d);
 assert.equal(duplicate.duplicate,true);
 assert.strictEqual(duplicate.state,first);
 assert.throws(()=>send(first,{...d,targetId:'A'}),/Conflicting commandId reuse/);
 const passCmd=pass(first),second=send(first,passCmd).state;
 assert.equal(send(second,passCmd).duplicate,true);
 assert.throws(()=>send(second,{...passCmd,mirrorInstanceId:'ci-fake'}),
  /Conflicting commandId reuse/);
 const choice=decide(second,false),third=send(second,choice).state;
 assert.equal(send(third,choice).duplicate,true);
 assert.throws(()=>send(third,{...choice,accept:true}),/Conflicting commandId reuse/);
 assert.throws(()=>send(third,cmd(third,'decideBuy','A',{accept:true})),
  /Not the active seat/);
});

test('self-target, empty target, counterfeit Buy and repeated cards are rejected early',()=>{
 const s=room();
 for(const changed of [
   {targetId:'A'},{targetId:'Z'},{buyInstanceId:s.players[0].hand[1].instanceId},
   {buyInstanceId:'ci-fake'}
 ]){
   assert.throws(()=>send(s,{...declare(s),...changed}));
 }
 const empty=room(['t002'],[]);
 assert.throws(()=>send(empty,declare(empty)),/empty hand/);
 assert.equal(empty.phase,'turn');
});

test('full physical hand refuses accepted Buy rather than inventing timing',()=>{
 const s=room(['t002',...Array(17).fill('d001')],['d005']);
 const d=send(s,declare(s)).state;
 const o=send(d,pass(d)).state,snapshot=JSON.stringify(o);
 assert.throws(()=>send(o,decide(o,true)),/Full-hand Buy settlement/);
 assert.equal(JSON.stringify(o),snapshot);
 assert.equal(send(o,decide(o,false)).state.players[0].hand.length,18);
});

test('learned miracle cap is explicitly gated while declining still works',()=>{
 const s=room(['t002',...Array(16).fill('d001')],['d005']);
 s.players[0].learned=['m002'];
 const d=send(s,declare(s)).state,o=send(d,pass(d)).state;
 const snapshot=JSON.stringify(o);
 assert.throws(()=>send(o,decide(o,true)),/Learned miracle overflow/);
 assert.equal(JSON.stringify(o),snapshot);
 assert.equal(send(o,decide(o,false)).state.players[0].learned.length,1);
});

test('three-seat Buy does not change uninvolved player or force a turn skip',()=>{
 const s=room(['t002'],['d005'],['w003','d001']);
 const unchanged=JSON.stringify(s.players[2]);
 const d=send(s,declare(s)).state;
 const o=send(d,pass(d)).state;
 const n=send(o,decide(o,true)).state;
 assert.equal(n.activePlayerId,'B');
 assert.equal(JSON.stringify(n.players[2]),unchanged);
});

test('tampers to pending offer or original item are rejected atomically',()=>{
 const s=room(['t002'],['w003','d005']);
 const d=send(s,declare(s)).state;
 const o=send(d,pass(d)).state;
 const wrong={...o,pending:{...o.pending,offer:{...o.pending.offer,price:0}}};
 assert.throws(()=>send(wrong,decide(wrong,true)),/Staged Buy item was changed/);
 assert.equal(JSON.stringify(o.players),JSON.stringify(s.players));
});

test('no staging command works outside lab or without trusted seat binding',()=>{
 const s=room(),d=declare(s);
 assert.throws(()=>submitAndResolveFixture(s,d,catalog,{...lab}),
   /not authenticated/);
 assert.throws(()=>submitAndResolveFixture(s,d,catalog,{
   ...lab,authorizedSeatId:'A',labOnly:false
 }),/lab fixture mode/);
});
