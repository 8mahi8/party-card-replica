import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand,viewStagingRoom} from '../v2/staging-room.mjs';
import {resolveRedirectFixture} from '../v2/redirect-resolution.mjs';
import {compileWallResolution} from '../v2/wall-resolution.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const options={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(hands,{learned={},mp={}}={}){
 const state=createStagingRoom({
  seats:Object.entries(hands).map(([id,handDefinitionIds])=>({id,handDefinitionIds})),
  firstSeatId:'A'
 },catalog);
 for(const p of state.players){
  if(learned[p.id])p.learned=[...learned[p.id]];
  if(mp[p.id]!==undefined)p.mp=mp[p.id];
 }
 return state;
}
const card=(state,owner,index)=>({instanceId:state.players.find(p=>p.id===owner).hand[index].instanceId});
const cast=(id='m001')=>({learnedDefinitionId:id});
function send(s,type,actor,extra={}){
 return applyStagingCommand(s,{
  commandId:'cmd-'+s.revision+'-'+actor,type,
  expectedRevision:s.revision,actorId:actor,...extra
 },catalog,{authorizedSeatId:actor}).state;
}
function attack(s,index=0){
 return send(s,'playCards','A',{
  targetId:'B',orderedInstanceIds:[card(s,'A',index).instanceId]
 });
}
function response(s,sequence,{legacy=false}={}){
 if(legacy){
  return send(s,'defend','B',{
   orderedInstanceIds:sequence.filter(x=>x.instanceId).map(x=>x.instanceId)
  });
 }
 return send(s,'defendSequence','B',{orderedPlays:sequence});
}
function finish(state){
 return resolveRedirectFixture(state,catalog,options);
}
test('hand Wall -> Spirit stops neutral attack at MP0, draws 2 and learns Wall',()=>{
 const s=attack(room({A:['w016'],B:['m001','i003']},{mp:{B:0}}));
 const d=response(s,[card(s,'B',0),card(s,'B',1)]);
 assert.equal(compileWallResolution(d,catalog).spiritUsed,true);
 const r=finish(d).state;
 assert.equal(r.players[1].hp,40);assert.equal(r.players[1].mp,0);
 assert.deepEqual(r.players[1].learned,['m001']);
 assert.equal(r.players[1].hand.length,2);
 assert.equal(r.players[0].hand.length,1);
 assert.equal(r.activePlayerId,'B');
});
test('old defend command can still use Wall -> Spirit in hand without new format',()=>{
 const s=attack(room({A:['w016'],B:['m001','i003']},{mp:{B:0}}));
 const d=response(s,[card(s,'B',0),card(s,'B',1)],{legacy:true});
 const r=finish(d);
 assert.equal(r.plan.spiritUsed,true);
 assert.equal(r.state.players[1].mp,0);
});
test('learned Wall -> Spirit explicitly ordered is free and gives 1 bonus draw',()=>{
 const s=attack(room({A:['w016'],B:['i003']},{
  learned:{B:['m001']},mp:{B:0}
 }));
 const d=response(s,[cast(),card(s,'B',0)]);
 assert.deepEqual(d.pending.defense.sequence,[cast(),card(s,'B',0)]);
 const r=finish(d);
 assert.equal(r.plan.spiritUsed,true);
 assert.equal(r.plan.learnedCast,true);
 assert.equal(r.state.players[1].mp,0);
 assert.equal(r.state.players[1].hp,40);
 assert.equal(r.state.players[1].hand.length,2);
 assert.deepEqual(r.state.players[1].learned,['m001']);
});
test('Rainbow Curtain -> hand Wall -> Spirit blocks elemental weapon for MP0',()=>{
 const s=attack(room({A:['w018'],B:['i001','m001','i003']},{mp:{B:0}}));
 const d=response(s,[card(s,'B',0),card(s,'B',1),card(s,'B',2)]);
 const r=finish(d);
 assert.equal(r.plan.stripElement,true);
 assert.equal(r.plan.spiritUsed,true);
 assert.equal(r.state.players[1].hp,40);
 assert.equal(r.state.players[1].mp,0);
 assert.equal(r.state.players[1].hand.length,3);
});
test('Rainbow Curtain -> learned Wall -> Spirit blocks elemental weapon for MP0',()=>{
 const s=attack(room({A:['w018'],B:['i001','i003']},{
  learned:{B:['m001']},mp:{B:0}
 }));
 const d=response(s,[card(s,'B',0),cast(),card(s,'B',1)]);
 const r=finish(d);
 assert.equal(r.plan.stripElement,true);
 assert.equal(r.plan.learnedCast,true);
 assert.equal(r.state.players[1].hp,40);
 assert.equal(r.state.players[1].hand.length,3);
});
test('Wall without Spirit at MP0 fails atomically',()=>{
 const s=attack(room({A:['w016'],B:['m001']},{mp:{B:0}}));
 const d=response(s,[card(s,'B',0)]);
 const snapshot=JSON.stringify(d);
 assert.throws(()=>finish(d),/Not enough MP/);
 assert.equal(JSON.stringify(d),snapshot);
});
test('Spirit positioned before Wall is structurally invalid',()=>{
 const s=attack(room({A:['w016'],B:['m001','i003']},{mp:{B:0}}));
 assert.throws(()=>response(s,[card(s,'B',1),card(s,'B',0)]),
  /Defensive sequence must start with a defense/);
});
test('Spirit before learned Wall cannot waive it',()=>{
 const s=attack(room({A:['w016'],B:['i001','i003']},{
  learned:{B:['m001']},mp:{B:0}
 }));
 const d=response(s,[card(s,'B',0),card(s,'B',1),cast()]);
 const before=JSON.stringify(d);
 assert.throws(()=>finish(d),/Spirit must immediately follow Wall|Wall must follow/);
 assert.equal(JSON.stringify(d),before);
});
test('Rainbow Curtain after a learned Wall is rejected before resolution',()=>{
 const s=attack(room({A:['w018'],B:['i001','i003']},{
  learned:{B:['m001']},mp:{B:0}
 }));
 assert.throws(()=>response(s,[cast(),card(s,'B',0),card(s,'B',1)]),
   /Attribute remover must be first/);
});
test('Two spirits for one Wall are rejected without consuming cards',()=>{
 const s=attack(room({A:['w016'],B:['m001','i003','i003']},{mp:{B:0}}));
 const d=response(s,[card(s,'B',0),card(s,'B',1),card(s,'B',2)]);
 const before=JSON.stringify(d);
 assert.throws(()=>finish(d),/Only one spirit per Wall/);
 assert.equal(JSON.stringify(d),before);
});
test('Non-support defense card after Wall is rejected',()=>{
 const s=attack(room({A:['w016'],B:['m001','d005']}));
 const d=response(s,[card(s,'B',0),card(s,'B',1)]);
 assert.throws(()=>finish(d),/Wall may only combine/);
});
test('Spirit alone or a learned miracle with an unrelated card cannot be smuggled',()=>{
 const s=attack(room({A:['w016'],B:['i003','d005']},{learned:{B:['m001']}}));
 assert.throws(()=>response(s,[card(s,'B',0)]),/Defensive sequence must start/);
 const d=response(s,[cast(),card(s,'B',1)]);
 assert.throws(()=>finish(d),/Wall may only combine/);
});
test('Defense sequence rejects unlearned wall, repeated cards, forged keys and two learned spells',()=>{
 const s=attack(room({A:['w016'],B:['i001','m001','i003']}));
 assert.throws(()=>response(s,[cast()]),/Defensive miracle not learned/);
 assert.throws(()=>response(s,[card(s,'B',1),card(s,'B',1)]),/Repeated defense card instance/);
 assert.throws(()=>response(s,[{instanceId:card(s,'B',1).instanceId,learnedDefinitionId:'m001'}]),
  /Malformed defense sequence step/);
 const prepared=attack(room({A:['w016'],B:['i003']},{learned:{B:['m001']}}));
 assert.throws(()=>response(prepared,[cast(),cast()]),/Only one learned defensive miracle/);
});
test('DefendSequence is idempotent, conflict-checks exact order and stays private',()=>{
 const s=attack(room({A:['w016'],B:['i003','i001']},{learned:{B:['m001']}}));
 const ordered=[cast(),card(s,'B',0)];
 const cmd={commandId:'defend-1',expectedRevision:s.revision,type:'defendSequence',
  actorId:'B',orderedPlays:ordered};
 const first=applyStagingCommand(s,cmd,catalog,{authorizedSeatId:'B'});
 const retry=applyStagingCommand(first.state,cmd,catalog,{authorizedSeatId:'B'});
 assert.equal(retry.duplicate,true);
 assert.strictEqual(retry.state,first.state);
 assert.throws(()=>applyStagingCommand(first.state,{
  ...cmd,orderedPlays:[card(s,'B',0),cast()]
 },catalog,{authorizedSeatId:'B'}),/Conflicting commandId/);
 const publicView=viewStagingRoom(first.state,'A');
 assert.equal(JSON.stringify(publicView).includes('defenseSequence'),false);
 assert.equal(JSON.stringify(publicView).includes('orderedPlays'),false);
 assert.equal(Object.hasOwn(publicView.players[1],'hand'),false);
 assert.equal(Object.hasOwn(publicView.players[0],'hand'),true);
});
test('Wall-Spirit reacts safely after redirect to original attacker',()=>{
 const s=room({A:['w016','i003'],B:['w027']},{
  learned:{A:['m001']},mp:{A:0}
 });
 let pending=send(s,'playCards','A',{
  targetId:'B',orderedInstanceIds:[card(s,'A',0).instanceId]
 });
 pending=send(pending,'defend','B',{
  orderedInstanceIds:[card(pending,'B',0).instanceId]
 });
 const redirected=finish(pending).state;
 assert.equal(redirected.activePlayerId,'A');
 const resolved=send(redirected,'defendSequence','A',{
  orderedPlays:[cast(),card(redirected,'A',0)]
 });
 const r=finish(resolved).state;
 assert.equal(r.players[0].hp,40);
 assert.equal(r.players[0].mp,0);
 assert.equal(r.players[0].hand.length,3);
 assert.equal(r.players[1].hand.length,1);
});
test('Hotseat first learns Wall, then uses learned Wall -> Spirit in a later defense',()=>{
 const lab=createV2LabController({hands:{
  A:['w016','w016'],B:['m001','i003','i003','w016']
 }});
 const first=lab.reveal();
 lab.toggle({instanceId:first.hand[0].instanceId});
 assert.equal(lab.submit().ok,true); // A attacks B
 let view=lab.reveal();
 lab.toggle({instanceId:view.hand[0].instanceId}); // first-use Wall
 lab.toggle({instanceId:view.hand[1].instanceId}); // adjacent Spirit
 assert.equal(lab.submit().ok,true); // B learned Wall; no MP cost
 assert.deepEqual(lab.labSnapshot().players[1].learned,['m001']);
 assert.equal(lab.labSnapshot().players[1].mp,10);
 view=lab.reveal(); // B turn
 const weapon=view.hand.find(x=>x.definitionId==='w016');
 lab.toggle({instanceId:weapon.instanceId});
 assert.equal(lab.submit().ok,true);
 lab.reveal();assert.equal(lab.submit().ok,true); // A takes hit
 view=lab.reveal(); // A turn again
 lab.toggle({instanceId:view.hand.find(x=>x.definitionId==='w016').instanceId});
 assert.equal(lab.submit().ok,true);
 view=lab.reveal(); // B defends with learned Wall followed by Spirit
 assert.equal(view.learned.some(x=>x.definitionId==='m001'),true);
 lab.toggle({learnedDefinitionId:'m001'});
 const spirit=view.hand.find(x=>x.definitionId==='i003');
 lab.toggle({instanceId:spirit.instanceId});
 assert.deepEqual(lab.view().selection,[
  {learnedDefinitionId:'m001'},{instanceId:spirit.instanceId}
 ]);
 const outcome=lab.submit();
 assert.equal(outcome.ok,true,outcome.error);
 assert.equal(outcome.view.phase,'turn');
 assert.equal(lab.labSnapshot().players[1].hp,40);
 assert.equal(lab.labSnapshot().players[1].mp,10);
 assert.equal(lab.labSnapshot().players[1].hand.length,5);
});
