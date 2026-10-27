import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {resolveStagedFixture,submitAndResolveFixture} from '../v2/room-transition.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const options={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(hands,{first='A',mp={},hp={},learned={}}={}){
 const s=createStagingRoom({
   seats:Object.entries(hands).map(([id,handDefinitionIds])=>({id,handDefinitionIds})),
   firstSeatId:first
 },catalog);
 for(const p of s.players) {
   if(mp[p.id]!==undefined)p.mp=mp[p.id];
   if(hp[p.id]!==undefined)p.hp=hp[p.id];
   if(learned[p.id])p.learned=[...learned[p.id]];
 }
 return s;
}
function step(s,actorId,type,{indices=[],targetId,learnedDefinitionId,orderedPlays,deflectRng}={}){
 const actor=s.players.find(p=>p.id===actorId);
 const command={
   type,actorId,commandId:'c-'+String(s.revision)+'-'+actorId,
   expectedRevision:s.revision,
   ...(type==='playSequence'?{targetId,orderedPlays}:{}),
   ...(type==='castLearned'?{targetId,learnedDefinitionId}:{}),
   ...(['playCards','defend'].includes(type)?
      {orderedInstanceIds:indices.map(i=>actor.hand[i].instanceId)}:{}),
   ...(type==='playCards'?{targetId}:{}),
   ...(type==='defend'&&learnedDefinitionId?{learnedDefinitionId}:{})
 };
 return submitAndResolveFixture(s,command,catalog,{
   authorizedSeatId:actorId,...options,...(deflectRng?{deflectRng}:{})
 });
}
const card=(s,id,position)=>({instanceId:s.players.find(p=>p.id===id).hand[position].instanceId});
const recast=id=>({learnedDefinitionId:id});

test('unified entrypoint stages an attack, then applies defense and advances',()=>{
 const initial=room({A:['w016'],B:['d005']});
 const first=step(initial,'A','playCards',{targetId:'B',indices:[0]});
 assert.equal(first.autoResolved,false);
 assert.equal(first.state.phase,'defense');
 assert.equal(first.state.activePlayerId,'B');
 assert.equal(first.state.revision,1);
 const second=step(first.state,'B','defend',{indices:[0]});
 assert.equal(second.autoResolved,true);
 assert.equal(second.state.phase,'turn');
 assert.equal(second.state.activePlayerId,'B');
 assert.equal(second.state.players[1].hp,35);
 assert.equal(second.state.revision,3);
 assert.equal(JSON.stringify(initial.players[1].hand),JSON.stringify([{instanceId:'ci-2',definitionId:'d005'}]));
});
test('three complete rounds across three participants preserve seating turn order',()=>{
 let s=room({A:['w016','d005'],B:['w016','d005'],C:['w016','d005']});
 for(const [attacker,target] of [['A','B'],['B','C'],['C','A']]){
   assert.equal(s.activePlayerId,attacker);
   s=step(s,attacker,'playCards',{targetId:target,indices:[0]}).state;
   assert.equal(s.phase,'defense');
   s=step(s,target,'defend',{indices:[target==='A'?0:1]}).state;
   assert.equal(s.phase,'turn');
   assert.equal(s.turnCount,[['A','B'],['B','C'],['C','A']].findIndex(x=>x[0]===attacker)+1);
 }
 assert.deepEqual(s.players.map(x=>x.hp),[35,35,35]);
 assert.equal(s.activePlayerId,'A');
 assert.equal(s.revision,9);
 assert.deepEqual(s.players.map(x=>x.hand.length),[2,2,2]);
});
test('a duplicate defense request after auto-resolution cannot spend cards twice',()=>{
 let s=room({A:['w016'],B:['d005']});
 s=step(s,'A','playCards',{targetId:'B',indices:[0]}).state;
 const command={type:'defend',actorId:'B',commandId:'retransmit-B',expectedRevision:s.revision,
    orderedInstanceIds:[s.players[1].hand[0].instanceId]};
 const first=submitAndResolveFixture(s,command,catalog,{...options,authorizedSeatId:'B'});
 const retry=submitAndResolveFixture(first.state,command,catalog,{...options,authorizedSeatId:'B'});
 assert.equal(retry.duplicate,true);
 assert.equal(retry.autoResolved,false);
 assert.strictEqual(retry.state,first.state);
 assert.equal(retry.events.length,0);
});
test('invalid defense rejects whole operation, with original room still usable',()=>{
 const s=step(room({A:['w024'],B:['d001','i001']}),'A','playCards',{
   targetId:'B',indices:[0]
 }).state;
 const before=JSON.stringify(s);
 assert.throws(()=>step(s,'B','defend',{indices:[0]}),/Illegal shield/);
 assert.equal(JSON.stringify(s),before);
 const corrected=step(s,'B','defend',{indices:[1,0]});
 assert.equal(corrected.state.phase,'turn');
 assert.equal(corrected.state.activePlayerId,'B');
});
test('self-targeted attack completes immediately, without impossible defense prompt',()=>{
 const s=room({A:['w016'],B:['d001']});
 const r=step(s,'A','playCards',{targetId:'A',indices:[0]});
 assert.equal(r.autoResolved,true);
 assert.equal(r.state.phase,'turn');
 assert.equal(r.state.players[0].hp,30);
 assert.equal(r.state.activePlayerId,'B');
 assert.equal(r.state.pending,null);
});
test('unified entrypoint chooses a learned solo offensive miracle, not weapon compiler',()=>{
 const s=room({A:['d001'],B:['d001']},{learned:{A:['m002']}});
 const opening=step(s,'A','castLearned',{targetId:'B',learnedDefinitionId:'m002'});
 const result=step(opening.state,'B','defend');
 assert.equal(result.state.players[0].mp,8);
 assert.equal(result.state.players[0].hand.length,2);
 assert.equal(result.state.players[1].hp,36);
});
test('miracle cast into Angel stop remains zero damage and charges MP',()=>{
 const s=room({A:['m003'],B:['d018']});
 const opening=step(s,'A','playCards',{targetId:'B',indices:[0]});
 const result=step(opening.state,'B','defend',{indices:[0]});
 assert.equal(result.state.players[1].hp,40);
 assert.equal(result.state.players[0].mp,5);
 assert.equal(result.events.find(e=>e.type==='damage').stopped,true);
});
test('reflected weapon results in a new defense prompt, then completes on original owner',()=>{
 const s=room({A:['w016','d005'],B:['w027']});
 const incoming=step(s,'A','playCards',{targetId:'B',indices:[0]});
 const reflected=step(incoming.state,'B','defend',{indices:[0]});
 assert.equal(reflected.autoResolved,true);
 assert.equal(reflected.state.phase,'defense');
 assert.equal(reflected.state.activePlayerId,'A');
 assert.equal(reflected.state.pending.sourceId,'B');
 const completed=step(reflected.state,'A','defend',{indices:[0]});
 assert.equal(completed.state.phase,'turn');
 assert.equal(completed.state.activePlayerId,'B');
 assert.equal(completed.state.players[0].hp,35);
 assert.equal(completed.state.revision,5);
});
test('deflection to defender self deals damage without sending an extra action',()=>{
 const s=room({A:['w016'],B:['w026']});
 const first=step(s,'A','playCards',{targetId:'B',indices:[0]});
 const result=step(first.state,'B','defend',{indices:[0],deflectRng:()=>0.99});
 assert.equal(result.state.players[1].hp,30);
 assert.equal(result.state.phase,'turn');
 assert.equal(result.state.activePlayerId,'B');
});
test('mixed learned spell + weapon can reflect twice with one MP payment',()=>{
 const s=room({A:['w016','w027'],B:['w027']},{learned:{A:['m004']}});
 const first=step(s,'A','playSequence',{targetId:'B',
   orderedPlays:[card(s,'A',0),recast('m004')]});
 const second=step(first.state,'B','defend',{indices:[0]});
 assert.equal(second.state.players[0].mp,4);
 assert.equal(second.state.phase,'defense');
 const third=step(second.state,'A','defend',{indices:[0]});
 assert.equal(third.state.players[0].mp,4);
 const last=step(third.state,'B','defend');
 assert.equal(last.state.players[1].hp,20);
 assert.equal(last.state.players[0].mp,4);
 assert.equal(last.state.activePlayerId,'B');
});
test('learned Wall handles incoming weapon with shared dispatcher',()=>{
 const s=room({A:['w016'],B:['d001']},{learned:{B:['m001']}});
 const a=step(s,'A','playCards',{targetId:'B',indices:[0]});
 const b=step(a.state,'B','defend',{learnedDefinitionId:'m001'});
 assert.equal(b.state.players[1].hp,40);
 assert.equal(b.state.players[1].mp,4);
 assert.equal(b.state.players[1].hand.length,2);
});
test('counterfeit caller seat and stale revision are not accepted',()=>{
 const s=room({A:['w016'],B:['d001']});
 const cmd={type:'playCards',actorId:'A',commandId:'c1',expectedRevision:0,targetId:'B',
   orderedInstanceIds:[s.players[0].hand[0].instanceId]};
 assert.throws(()=>submitAndResolveFixture(s,cmd,catalog,{...options,authorizedSeatId:'B'}),/not authenticated/);
 const next=submitAndResolveFixture(s,cmd,catalog,{...options,authorizedSeatId:'A'}).state;
 assert.throws(()=>submitAndResolveFixture(next,{...cmd,commandId:'c2'},catalog,{
   ...options,authorizedSeatId:'A'
 }),/Stale room revision/);
});
test('unsupported attack combination rejected BEFORE opponent is asked to defend',()=>{
 const s=room({A:['w016','m004','m005'],B:['d001']});
 const snapshot=JSON.stringify(s);
 assert.throws(()=>step(s,'A','playCards',{indices:[0,1,2],targetId:'B'}),/Aura stacked/);
 assert.equal(JSON.stringify(s),snapshot);
 assert.equal(s.phase,'turn');
});
test('secret opponent cards and pending ordered sequence stay private',()=>{
 const s=room({A:['w016'],B:['i002']},{learned:{A:['m004']}});
 const attack=step(s,'A','playSequence',{targetId:'B',
   orderedPlays:[card(s,'A',0),recast('m004')]});
 const projection=viewStagingRoom(attack.state,'B');
 assert.equal(JSON.stringify(projection).includes('attackSequence'),false);
 assert.equal(JSON.stringify(projection).includes('attackContext'),false);
 assert.equal(Object.hasOwn(projection.players[0],'hand'),false);
 assert.equal(Object.hasOwn(projection,'processedCommands'),false);
});
test('single transition cannot run without explicit fixture-only gate',()=>{
 const s=room({A:['w016'],B:['d001']});
 const cmd={type:'playCards',actorId:'A',commandId:'test',expectedRevision:0,targetId:'B',
   orderedInstanceIds:[s.players[0].hand[0].instanceId]};
 assert.throws(()=>submitAndResolveFixture(s,cmd,catalog,{
   authorizedSeatId:'A',fixtureDrawDefinitionId:'d001'
 }),/lab fixture mode/);
 assert.throws(()=>resolveStagedFixture(s,catalog,options),/No attack waiting/);
});
