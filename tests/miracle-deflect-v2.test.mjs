import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand,viewStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture,resolveStagedFixture} from '../v2/room-transition.mjs';
import {resolveSoloMiracleFixture} from '../v2/miracle-resolution.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001'};
const instance=(s,id,i)=>s.players.find(p=>p.id===id).hand[i].instanceId;
const learned=id=>({learnedDefinitionId:id});
const inHand=id=>({instanceId:id});
function room(hands,{mp={},learned:learns={},rngSeed=1234}={}){
 const s=createStagingRoom({
   seats:Object.entries(hands).map(([id,handDefinitionIds])=>({id,handDefinitionIds})),
   firstSeatId:'A',rngSeed
 },catalog);
 for(const p of s.players){
   if(mp[p.id]!==undefined)p.mp=mp[p.id];
   if(learns[p.id])p.learned=[...learns[p.id]];
 }
 return s;
}
function command(s,actor,type,more={}){
 return {commandId:'deflect-'+s.revision+'-'+actor,expectedRevision:s.revision,
   actorId:actor,type,...more};
}
function send(s,actor,type,more={}){
 return applyStagingCommand(s,command(s,actor,type,more),catalog,
   {authorizedSeatId:actor}).state;
}
function attack(s,spell='m002'){
 const attackId=s.players[0].hand.find(x=>x.definitionId===spell).instanceId;
 return send(s,'A','playCards',{targetId:'B',orderedInstanceIds:[attackId]});
}
function defend(s,actor,ids=[]){
 return send(s,actor,'defend',{orderedInstanceIds:ids});
}
function resolve(s,rng){
 return resolveStagedFixture(s,catalog,{...fixture,deflectRng:rng});
}
test('hand Turbulence transfers water miracle to caster, preserving payments until final defense',()=>{
 const s=attack(room({A:['m002','d014'],B:['m007']}));
 const d=defend(s,'B',[instance(s,'B',0)]);
 const first=resolve(d,()=>0);
 assert.equal(first.redirected,true);
 assert.equal(first.state.phase,'defense');
 assert.equal(first.state.activePlayerId,'A');
 assert.equal(first.state.players[0].mp,8);
 assert.equal(first.state.players[1].mp,5);
 assert.deepEqual(first.state.players[1].learned,['m007']);
 assert.equal(first.state.players[1].hand.length,0);
 const response=defend(first.state,'A',[instance(first.state,'A',0)]);
 const finished=resolve(response,()=>0.7).state;
 assert.equal(finished.players[0].hp,39);
 assert.equal(finished.players[0].mp,8);
 assert.equal(finished.players[1].mp,5);
 assert.equal(finished.players[0].hand.length,2);
 assert.equal(finished.players[1].hand.length,1);
 assert.equal(finished.activePlayerId,'B');
});
test('self-deflection applies dark defeat immediately with no chance to guard again',()=>{
 const s=attack(room({A:['m003'],B:['m007','d005']}, {rngSeed:32}),'m003');
 const d=defend(s,'B',[instance(s,'B',0)]);
 const result=resolve(d,()=>0.99);
 assert.equal(result.redirected,true);
 assert.equal(result.immediate,true);
 assert.equal(result.state.phase,'finished');
 assert.equal(result.state.winnerId,'A');
 assert.equal(result.state.players[1].hp,0);
 assert.equal(result.state.players[1].mp,5);
 assert.ok(result.events.some(x=>x.type==='damage'&&x.targetId==='B'));
});
test('three-player deflection picks third living seat and allows its legal defense',()=>{
 const s=attack(room({A:['m002'],B:['m007'],C:['d014']}));
 const first=resolve(defend(s,'B',[instance(s,'B',0)]),()=>0.9);
 assert.equal(first.state.activePlayerId,'C');
 assert.equal(first.state.pending.targetId,'C');
 const settled=resolve(defend(first.state,'C',[instance(first.state,'C',0)]),()=>0.5).state;
 assert.equal(settled.players[2].hp,39);
 assert.equal(settled.activePlayerId,'B');
 assert.equal(settled.players[0].mp,8);
 assert.equal(settled.players[1].mp,5);
 assert.equal(settled.players[0].hand.length,1);
 assert.equal(settled.players[1].hand.length,1);
 assert.equal(settled.players[2].hand.length,1);
});
test('learned Turbulence then Spirit is free at MP0 and grants the repeat-use draw',()=>{
 const s=attack(room({A:['m002'],B:['i003']},{
   learned:{B:['m007']},mp:{B:0}
 }));
 const d=send(s,'B','defendSequence',{orderedPlays:[
   learned('m007'),inHand(instance(s,'B',0))
 ]});
 const first=resolve(d,()=>0);
 assert.equal(first.state.players[1].mp,0);
 assert.deepEqual(first.state.players[1].learned,['m007']);
 assert.equal(first.state.players[1].hand.length,0);
 const finish=resolve(defend(first.state,'A'),()=>0.4).state;
 assert.equal(finish.players[1].hand.length,2);
 assert.equal(finish.players[1].mp,0);
});
test('first-use Turbulence followed by Spirit is free and learns the miracle',()=>{
 const s=attack(room({A:['m002'],B:['m007','i003']},{mp:{B:0}}));
 const d=send(s,'B','defendSequence',{orderedPlays:[
   inHand(instance(s,'B',0)),inHand(instance(s,'B',1))
 ]});
 const first=resolve(d,()=>0);
 assert.equal(first.state.players[1].mp,0);
 assert.deepEqual(first.state.players[1].learned,['m007']);
 const finish=resolve(defend(first.state,'A'),()=>0.2).state;
 assert.equal(finish.players[1].hand.length,2);
});
test('a learned Turbulence alone requires MP5 and still produces one replacement draw',()=>{
 const s=attack(room({A:['m002'],B:[]},{mp:{B:5},learned:{B:['m007']}}));
 const first=resolve(send(s,'B','defendSequence',{orderedPlays:[learned('m007')]}),()=>0);
 assert.equal(first.state.players[1].mp,0);
 const finish=resolve(defend(first.state,'A'),()=>0).state;
 assert.equal(finish.players[1].hand.length,1);
});
test('MP shortage fails before spending cards or modifying the original state',()=>{
 const s=attack(room({A:['m002'],B:['m007']},{mp:{B:4}}));
 const d=defend(s,'B',[instance(s,'B',0)]);
 const frozen=JSON.stringify(d);
 assert.throws(()=>resolve(d,()=>0),/Not enough MP/);
 assert.equal(JSON.stringify(d),frozen);
});
test('invalid deflection RNG returns no state mutation, including rngSeed',()=>{
 const s=attack(room({A:['m002'],B:['m007']}));
 const d=defend(s,'B',[instance(s,'B',0)]);
 const frozen=JSON.stringify(d);
 assert.throws(()=>resolve(d,()=>1),/bad rng/);
 assert.equal(JSON.stringify(d),frozen);
});
test('default seeded deflection is deterministic for the same room snapshot',()=>{
 const s=attack(room({A:['m002'],B:['m007']},{rngSeed:777}));
 const d=defend(s,'B',[instance(s,'B',0)]);
 const x=resolve(d),y=resolve(d);
 assert.deepEqual(x.state,y.state);
 assert.equal(JSON.stringify(d.pending.attackContext??null),'null');
 assert.notEqual(x.state.rngSeed,d.rngSeed);
});
test('Spirit cannot be selected before a defensive miracle',()=>{
 const s=attack(room({A:['m002'],B:['i003','m007']}));
 assert.throws(()=>send(s,'B','defendSequence',{orderedPlays:[
   inHand(instance(s,'B',0)),inHand(instance(s,'B',1))
 ]}),/Defensive sequence must start/);
});
test('unrelated armor after Turbulence is rejected atomically',()=>{
 const s=attack(room({A:['m002'],B:['m007','d014']}));
 const d=defend(s,'B',[instance(s,'B',0),instance(s,'B',1)]);
 const before=JSON.stringify(d);
 assert.throws(()=>resolve(d,()=>0),/Redirect must be used alone/);
 assert.equal(JSON.stringify(d),before);
});
test('weapon attacks cannot be deflected by a miracle-only effect',()=>{
 const s=room({A:['w016'],B:['m007']});
 const attackState=send(s,'A','playCards',{targetId:'B',orderedInstanceIds:[instance(s,'A',0)]});
 const defState=defend(attackState,'B',[instance(attackState,'B',0)]);
 assert.throws(()=>resolve(defState,()=>0),/Unmapped redirect scope|Reaction cannot redirect|Unsupported defense item without guard/);
});
test('authenticated command and public projection stay private during deflection',()=>{
 const s=attack(room({A:['m002'],B:['m007','i003']}));
 const action=command(s,'B','defendSequence',{
   orderedPlays:[inHand(instance(s,'B',0)),inHand(instance(s,'B',1))]
 });
 assert.throws(()=>applyStagingCommand(s,action,catalog,{authorizedSeatId:'A'}),/authenticated/);
 const first=applyStagingCommand(s,action,catalog,{authorizedSeatId:'B'});
 assert.equal(applyStagingCommand(first.state,action,catalog,
   {authorizedSeatId:'B'}).duplicate,true);
 const projected=viewStagingRoom(first.state,'A');
 assert.equal(Object.hasOwn(projected.players[1],'hand'),false);
 assert.equal(JSON.stringify(projected).includes(instance(s,'B',0)),false);
});
test('shared submit path performs immediate self-deflection and closes match',()=>{
 let s=room({A:['m003'],B:['m007']});
 let a=submitAndResolveFixture(s,command(s,'A','playCards',{
   targetId:'B',orderedInstanceIds:[instance(s,'A',0)]
 }),catalog,{...fixture,authorizedSeatId:'A',deflectRng:()=>.99});
 assert.equal(a.state.phase,'defense');
 s=a.state;
 const b=submitAndResolveFixture(s,command(s,'B','defend',{
   orderedInstanceIds:[instance(s,'B',0)]
 }),catalog,{...fixture,authorizedSeatId:'B',deflectRng:()=>.99});
 assert.equal(b.state.phase,'finished');
 assert.equal(b.state.winnerId,'A');
});

test('UI controller can tap Turbulence then Spirit and complete redirected defense',()=>{
 const lab=createV2LabController({hands:{A:['m002'],B:['m007','i003']}});
 const a=lab.reveal();
 lab.toggle({instanceId:a.hand[0].instanceId});
 assert.equal(lab.submit().ok,true);
 const b=lab.reveal();
 assert.equal(b.hand.some(x=>x.definitionId==='m007'),true);
 lab.toggle({instanceId:b.hand[0].instanceId});
 lab.toggle({instanceId:b.hand[1].instanceId});
 const first=lab.submit();
 assert.equal(first.ok,true,first.error);
 assert.equal(first.view.phase,'defense');
 assert.equal(first.view.actorId,'A');
 assert.equal(lab.labSnapshot().players[1].mp,10);
 assert.deepEqual(lab.labSnapshot().players[1].learned,['m007']);
 lab.reveal();
 const result=lab.submit();
 assert.equal(result.ok,true,result.error);
 assert.equal(result.view.phase,'turn');
 assert.equal(lab.labSnapshot().players[0].hp,36);
 assert.equal(lab.labSnapshot().players[1].hand.length,2);
});
