/**
 * G3/G4 redirect cost/refill boundary contract.
 *
 * Source: https://w.atwiki.jp/piong/pages/16.html
 * - Spent artifacts are replaced in the hand.
 * Source: https://w.atwiki.jp/piong/pages/17.html
 * - Reflect sends an attack back; deflect can land on self with no defense.
 * Source: https://w.atwiki.jp/gfplusa/pages/19.html
 * - Miracle MP, learned recast, and directly adjacent Spirit discount.
 *
 * These tests exercise the LAB's exact-resolution machinery, NOT proof of
 * full original-game fidelity (card pool and draws are still incomplete).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const lab={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(hands,{mp={},learned={},hp={}}={}){
 const state=createStagingRoom({seats:Object.entries(hands).map(
  ([id,handDefinitionIds])=>({id,handDefinitionIds})),
  firstSeatId:'A',rngSeed:31},catalog);
 for(const p of state.players){
  if(mp[p.id]!==undefined)p.mp=mp[p.id];
  if(learned[p.id])p.learned=[...learned[p.id]];
  if(hp[p.id]!==undefined)p.hp=hp[p.id];
 }
 return state;
}
function who(state,id){return state.players.find(p=>p.id===id);}
function send(state,actorId,type,{indices=[],targetId='B',learnedDefinitionId,plays,deflectRng=null}={}){
 const actor=who(state,actorId);
 const orderedInstanceIds=indices.map(index=>actor.hand[index].instanceId);
 const command={
  actorId,type,commandId:'cost-contract-'+actorId+'-'+state.revision,
  expectedRevision:state.revision,
  ...(['playCards','castLearned'].includes(type)?{targetId}:{}),
  ...(type==='playCards'||type==='defend'?{orderedInstanceIds}:{}),
  ...(type==='castLearned'?{learnedDefinitionId}:{}),
  ...(type==='defendSequence'?{orderedPlays:plays}: {})
 };
 return submitAndResolveFixture(state,command,catalog,{
  ...lab,authorizedSeatId:actorId,deflectRng
 });
}
function countEvents(events,type,pid){
 return events.filter(e=>e.type===type&&(pid===undefined||
  e.playerId===pid||e.targetId===pid)).length;
}
function assertNoEarlyRefill(result,expectedOriginal){
 assert.equal(result.state.phase,'defense');
 assert.equal(result.state.pending.originalAttackerId,expectedOriginal);
 assert.equal(result.state.turnCount,0);
 assert.equal(countEvents(result.events,'refill'),0);
 assert.equal(countEvents(result.events,'turnAdvance'),0);
 assert.equal(result.state.pending.defense,null,
  'redirect must preserve unresolved attack without a premature defender action');
}
function assertNormalFinish(result,next='B'){
 const s=result.state;
 assert.equal(s.phase,'turn');
 assert.equal(s.pending,null);
 assert.equal(s.turnCount,1);
 assert.equal(s.activePlayerId,next);
 assert.equal(countEvents(result.events,'turnAdvance'),1);
 assert.equal(countEvents(result.events,'refill'),s.players.length);
}
function allInitialIds(state){
 return new Set(state.players.flatMap(p=>p.hand.map(c=>c.instanceId)));
}
function hasOnlyFreshReplacement(state,initial,id,expected){
 const hand=who(state,id).hand;
 assert.equal(hand.length,expected);
 assert.equal(hand.every(c=>c.definitionId==='d001'),true);
 assert.equal(hand.every(c=>!initial.has(c.instanceId)),true,
  'all original selected physical instances were consumed exactly once');
}
test('weapon + Aura + Spirit: reflection pays zero MP once, refills only after final hit',()=>{
 const initial=room({A:['w016','m004','i003','d001'],B:['i002','d005']});
 const snapshot=JSON.stringify(initial);
 const attack=send(initial,'A','playCards',{indices:[0,1,2]});
 assert.equal(attack.state.phase,'defense');
 assert.equal(who(attack.state,'A').mp,10);
 const first=send(attack.state,'B','defend',{indices:[0]});
 assertNoEarlyRefill(first,'A');
 assert.deepEqual(first.state.pending.spentByPlayer,{A:3,B:1});
 assert.equal(who(first.state,'A').hand.length,1);
 assert.equal(who(first.state,'B').hand.length,1);
 assert.equal(who(first.state,'A').mp,10);
 assert.deepEqual(who(first.state,'A').learned,['m004']);
 const final=send(first.state,'A','defend',{indices:[]});
 assertNormalFinish(final);
 assert.deepEqual(final.state.players.map(p=>p.hp),[20,40]);
 assert.deepEqual(final.state.players.map(p=>p.mp),[10,10]);
 assert.deepEqual(final.state.players.map(p=>p.hand.length),[4,2]);
 assert.deepEqual(final.state.players.map(p=>p.learned),[['m004'],[]]);
 assert.deepEqual(final.events.filter(x=>x.type==='refill').map(x=>x.added),[3,1]);
 assert.equal(final.events.some(x=>x.type==='payMp'&&x.cost>0),false);
 assert.equal(JSON.stringify(initial),snapshot);
});
test('two Fireballs + Spirit and two physical mirrors charge once, refill every seat once',()=>{
 const initial=room({A:['w016','m005','m005','i003','i002'],B:['i002','d005']});
 const initialIds=allInitialIds(initial),snapshot=JSON.stringify(initial);
 const a=send(initial,'A','playCards',{indices:[0,1,2,3]});
 const b=send(a.state,'B','defend',{indices:[0]});
 assertNoEarlyRefill(b,'A');
 assert.equal(who(b.state,'A').mp,8);
 assert.deepEqual(b.state.pending.spentByPlayer,{A:4,B:1});
 const c=send(b.state,'A','defend',{indices:[0]});
 assertNoEarlyRefill(c,'A');
 assert.deepEqual(c.state.pending.spentByPlayer,{A:5,B:1});
 assert.equal(who(c.state,'A').mp,8);
 assert.equal(who(c.state,'B').mp,10);
 const final=send(c.state,'B','defend',{indices:[0]});
 assertNormalFinish(final);
 assert.deepEqual(final.state.players.map(p=>p.hp),[40,31]);
 assert.deepEqual(final.state.players.map(p=>p.mp),[8,10]);
 assert.deepEqual(who(final.state,'A').learned,['m005']);
 assert.deepEqual(final.events.filter(e=>e.type==='refill').map(e=>e.added),[5,2]);
 hasOnlyFreshReplacement(final.state,initialIds,'A',5);
 hasOnlyFreshReplacement(final.state,initialIds,'B',2);
 assert.equal(JSON.stringify(initial),snapshot);
});
test('learned Ice versus learned Turbulence + Spirit: both draw credits persist across redirect',()=>{
 const initial=room({A:['d014'],B:['i003']},{
  learned:{A:['m002'],B:['m007']}
 });
 const snapshot=JSON.stringify(initial),old=initial.players[0].hand[0].instanceId;
 const a=send(initial,'A','castLearned',{learnedDefinitionId:'m002'});
 assert.equal(a.state.phase,'defense');
 const spirit=who(a.state,'B').hand[0].instanceId;
 const b=send(a.state,'B','defendSequence',{
  plays:[{learnedDefinitionId:'m007'},{instanceId:spirit}],deflectRng:()=>0
 });
 assertNoEarlyRefill(b,'A');
 assert.equal(who(b.state,'A').mp,8);
 assert.equal(who(b.state,'B').mp,10,'Spirit waives the defensive miracle cost');
 assert.deepEqual(b.state.pending.spentByPlayer,{A:1,B:2});
 assert.deepEqual(b.state.players.map(p=>p.hand.length),[1,0]);
 assert.deepEqual(b.state.players.map(p=>p.learned),[['m002'],['m007']]);
 const final=send(b.state,'A','defend',{indices:[0]});
 assertNormalFinish(final);
 assert.deepEqual(final.state.players.map(p=>p.hp),[39,40]);
 assert.deepEqual(final.state.players.map(p=>p.mp),[8,10]);
 assert.deepEqual(final.state.players.map(p=>p.hand.length),[2,2]);
 assert.equal(who(final.state,'A').hand.some(c=>c.instanceId===old),false);
 assert.equal(final.events.filter(e=>e.type==='refill').map(e=>e.added).join(','),'2,2');
 assert.equal(JSON.stringify(initial),snapshot);
});
test('three-seat Sky -> Moonlight -> ordinary guard: all retained credits refill once',()=>{
 const initial=room({A:['m002'],B:['d024','d014'],C:['d027']});
 const before=JSON.stringify(initial),ids=allInitialIds(initial);
 const a=send(initial,'A','playCards',{indices:[0]});
 const b=send(a.state,'B','defend',{indices:[0],deflectRng:()=>0.9});
 assertNoEarlyRefill(b,'A');
 assert.equal(b.state.activePlayerId,'C');
 assert.deepEqual(b.state.pending.spentByPlayer,{A:1,B:1});
 const c=send(b.state,'C','defend',{indices:[0]});
 assertNoEarlyRefill(c,'A');
 assert.equal(c.state.activePlayerId,'B');
 assert.deepEqual(c.state.pending.spentByPlayer,{A:1,B:1,C:1});
 const final=send(c.state,'B','defend',{indices:[0]});
 assertNormalFinish(final);
 assert.deepEqual(final.state.players.map(p=>p.hp),[40,39,40]);
 assert.deepEqual(final.state.players.map(p=>p.mp),[8,10,10]);
 assert.deepEqual(final.state.players.map(p=>p.hand.length),[1,2,1]);
 assert.deepEqual(final.events.filter(e=>e.type==='refill').map(e=>e.added),[1,2,1]);
 for(const [id,length] of [['A',1],['B',2],['C',1]])
  hasOnlyFreshReplacement(final.state,ids,id,length);
 assert.equal(JSON.stringify(initial),before);
});
test('Aura weapon self-deflection hits immediately: receiver gets no second defense',()=>{
 const initial=room({A:['w016','m004'],B:['w026','d005']});
 const originalGuard=who(initial,'B').hand[1].instanceId;
 const a=send(initial,'A','playCards',{indices:[0,1]});
 const final=send(a.state,'B','defend',{indices:[0],deflectRng:()=>0.99});
 assert.equal(final.immediate,true);
 assertNormalFinish(final);
 assert.deepEqual(final.state.players.map(p=>p.hp),[40,20]);
 assert.deepEqual(final.state.players.map(p=>p.mp),[4,10]);
 assert.deepEqual(final.state.players.map(p=>p.hand.length),[2,2]);
 assert.deepEqual(who(final.state,'A').learned,['m004']);
 assert.equal(who(final.state,'B').hand[0].instanceId,originalGuard);
 assert.equal(final.events.filter(e=>e.type==='refill').map(e=>e.added).join(','),'2,1');
});
test('invalid final defense after redirect is atomic; pause credits are not spent twice on retry',()=>{
 const initial=room({A:['m002'],B:['d029']});
 const first=send(initial,'A','playCards',{indices:[0]});
 const bounced=send(first.state,'B','defend',{indices:[0]});
 assertNoEarlyRefill(bounced,'A');
 const pending=bounced.state,snapshot=JSON.stringify(pending);
 const guard=who(pending,'A').hand;
 assert.equal(guard.length,0,'attacker already spent hand miracle');
 // Cannot choose an invented instance after the reflect. The valid empty
 // defense still resolves and only once applies stored spend and MP cost.
 assert.throws(()=>submitAndResolveFixture(pending,{
  actorId:'A',type:'defend',commandId:'forged-defense-after-redirect',
  expectedRevision:pending.revision,orderedInstanceIds:['ci-forged']
 },catalog,{...lab,authorizedSeatId:'A'}),/hand|instance|selected|card/i);
 assert.equal(JSON.stringify(pending),snapshot);
 const final=send(pending,'A','defend',{indices:[]});
 assertNormalFinish(final);
 assert.equal(who(final.state,'A').mp,8);
 assert.equal(who(final.state,'A').hp,36);
 assert.equal(who(final.state,'A').hand.length,1);
 assert.equal(who(final.state,'B').hand.length,1);
 const view=viewStagingRoom(bounced.state,'A');
 assert.equal(JSON.stringify(view).includes('spentByPlayer'),false);
 assert.equal(JSON.stringify(view).includes('attackContext'),false);
});

test('unused third-seat hand is untouched and receives no replacement cards',()=>{
 const original=room({A:['m002'],B:['d029'],C:['d001','w016']});
 const originalC=who(original,'C').hand.map(c=>({...c}));
 const before=JSON.stringify(original);
 const outgoing=send(original,'A','playCards',{indices:[0]});
 const redirected=send(outgoing.state,'B','defend',{indices:[0]});
 assertNoEarlyRefill(redirected,'A');
 assert.equal(redirected.state.activePlayerId,'A');
 const result=send(redirected.state,'A','defend',{indices:[]});
 assert.equal(result.state.phase,'turn');
 assert.equal(result.state.activePlayerId,'B');
 assert.equal(result.state.turnCount,1);
 assert.deepEqual(who(result.state,'C').hand,originalC);
 assert.deepEqual(result.events.filter(e=>e.type==='refill').map(e=>[e.playerId,e.added]),[
  ['A',1],['B',1]
 ]);
 assert.equal(JSON.stringify(original),before);
});
