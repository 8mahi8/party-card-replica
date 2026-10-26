import test from 'node:test';
import assert from 'node:assert/strict';
import {createStagingRoom,applyStagingCommand,viewStagingRoom} from '../v2/staging-room.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const room=()=>createStagingRoom({
  seats:[
    {id:'A',handDefinitionIds:['w016','w016','a003','m005','d001']},
    {id:'B',handDefinitionIds:['d005','d005','i001','w027']}
  ],
  firstSeatId:'A',rulesetId:'wiki-2025-lab',rngSeed:456789
},catalog);
const attack=(state,extra={})=>({
  commandId:'cmd-attack',actorId:'A',expectedRevision:state.revision,
  type:'playCards',targetId:'B',orderedInstanceIds:[state.players[0].hand[0].instanceId],...extra
});
const response=(state,extra={})=>({
  commandId:'cmd-defend',actorId:'B',expectedRevision:state.revision,
  type:'defend',orderedInstanceIds:[state.players[1].hand[0].instanceId],...extra
});
const send=(state,cmd,auth=cmd.actorId)=>applyStagingCommand(state,cmd,catalog,{authorizedSeatId:auth});

test('G2 room has unique physical IDs for duplicates and JSON-only state',()=>{
 const s=room();
 assert.equal(s.schemaVersion,2);assert.equal(s.rulesetId,'wiki-2025-lab');
 assert.equal(s.phase,'turn');assert.equal(s.activePlayerId,'A');
 assert.equal(s.players[0].hand.length,5);assert.equal(s.players[1].hand.length,4);
 assert.equal(s.nextInstanceSerial,10);
 assert.equal(new Set(s.players.flatMap(p=>p.hand.map(c=>c.instanceId))).size,9);
 assert.equal(s.players[0].hand[0].definitionId,s.players[0].hand[1].definitionId);
 assert.notEqual(s.players[0].hand[0].instanceId,s.players[0].hand[1].instanceId);
 assert.deepEqual(JSON.parse(JSON.stringify(s)),s);
});
test('validated attack advances to defender without changing hands yet',()=>{
 const s=room(),r=send(s,attack(s));
 assert.equal(r.applied,true);assert.equal(r.duplicate,false);
 assert.equal(r.state.revision,1);assert.equal(r.state.phase,'defense');
 assert.equal(r.state.activePlayerId,'B');
 assert.deepEqual(r.state.pending.attackInstanceIds,[s.players[0].hand[0].instanceId]);
 assert.equal(s.revision,0);assert.equal(s.phase,'turn');
 assert.equal(r.state.players[0].hand.length,5);
});
test('defense staging moves into resolving without claiming damage was applied',()=>{
 const r1=send(room(),attack(room()));
 const r2=send(r1.state,response(r1.state));
 assert.equal(r2.state.revision,2);assert.equal(r2.state.phase,'resolving');
 assert.equal(r2.state.activePlayerId,null);
 assert.equal(r2.state.players[0].hp,40);assert.equal(r2.state.players[1].hp,40);
 assert.deepEqual(r2.state.pending.defense.instanceIds,[r1.state.players[1].hand[0].instanceId]);
 assert.throws(()=>send(r2.state,{...response(r2.state),commandId:'later'}),/Awaiting G3/);
});
test('defender may accept damage with an empty defensive selection',()=>{
 const s=send(room(),attack(room())).state;
 const r=send(s,response(s,{orderedInstanceIds:[]}));
 assert.deepEqual(r.state.pending.defense.instanceIds,[]);
 assert.equal(r.state.phase,'resolving');
});
test('duplicate delivery is idempotent across revision changes',()=>{
 const s=room(),cmd=attack(s),first=send(s,cmd),retry=send(first.state,cmd);
 assert.equal(retry.applied,false);assert.equal(retry.duplicate,true);
 assert.strictEqual(retry.state,first.state);
 assert.equal(retry.state.revision,1);assert.equal(retry.state.processedCommands.length,1);
});
test('the same ID with changed order or target fails even if revision is updated',()=>{
 const s=room(),cmd=attack(s),first=send(s,cmd);
 assert.throws(()=>send(first.state,{...cmd,orderedInstanceIds:[s.players[0].hand[1].instanceId]}),/Conflicting commandId/);
 assert.throws(()=>send(first.state,{...cmd,targetId:'A'}),/Conflicting commandId/);
});
test('retries with old revision but different command ID fail as stale',()=>{
 const s=room(),cmd=attack(s),first=send(s,cmd);
 assert.throws(()=>send(first.state,{...cmd,commandId:'cmd-another'}),/Stale room revision/);
});
test('sender seat authentication is required before idempotency check',()=>{
 const s=room(),cmd=attack(s);
 assert.throws(()=>applyStagingCommand(s,cmd,catalog),/not authenticated/);
 assert.throws(()=>send(s,cmd,'B'),/not authenticated/);
 const first=send(s,cmd);
 assert.throws(()=>send(first.state,cmd,'B'),/not authenticated/);
});
test('wrong seat and dead target cannot attack',()=>{
 const s=room();
 assert.throws(()=>send(s,{...attack(s),actorId:'B'},'B'),/Not the active seat/);
 s.players[1].hp=0;
 assert.throws(()=>send(s,attack(s)),/Invalid G2 target/);
});
test('self-target attacks are staged without defense; foreign or duplicate instances are rejected',()=>{
 const s=room();
 const self=send(s,attack(s,{targetId:'A'}));
 assert.equal(self.state.phase,'resolving');assert.equal(self.state.activePlayerId,null);
 assert.equal(self.state.pending.targetId,'A');assert.equal(self.state.players[0].hp,40);
 assert.throws(()=>send(s,attack(s,{targetId:'unknown-seat'})),/Unknown seat/);
 assert.throws(()=>send(s,attack(s,{orderedInstanceIds:[s.players[1].hand[0].instanceId]})),/not held/);
 const cid=s.players[0].hand[0].instanceId;
 assert.throws(()=>send(s,attack(s,{orderedInstanceIds:[cid,cid]})),/Repeated card instance/);
});
test('structural attack rejects armor-only and two main weapons but allows add-ons',()=>{
 const s=room();
 assert.throws(()=>send(s,attack(s,{orderedInstanceIds:[s.players[0].hand[4].instanceId]})),/Attack must start/);
 assert.throws(()=>send(s,attack(s,{orderedInstanceIds:[s.players[0].hand[0].instanceId,s.players[0].hand[1].instanceId]})),/Not a structural attack/);
 const add=send(s,attack(s,{orderedInstanceIds:[s.players[0].hand[2].instanceId]}));
 assert.equal(add.state.pending.attackInstanceIds.length,1);
});
test('structural defense rejects attack-only items and enforces rainbow-first order',()=>{
 const original=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['w016']},
  {id:'B',handDefinitionIds:['d005','d005','i001','w016']}
 ],firstSeatId:'A'},catalog);
 const s=send(original,attack(original)).state;
 const hand=s.players[1].hand;
 assert.throws(()=>send(s,response(s,{orderedInstanceIds:[hand[3].instanceId]})),/Not a defensive card/);
 assert.throws(()=>send(s,response(s,{orderedInstanceIds:[hand[0].instanceId,hand[2].instanceId]})),/Attribute remover must be first/);
 const good=send(s,response(s,{orderedInstanceIds:[hand[2].instanceId,hand[0].instanceId]}));
 assert.equal(good.state.phase,'resolving');
});
test('defense is only accepted from the targeted seat in defense phase',()=>{
 const s=room();
 assert.throws(()=>send(s,{...response(s),actorId:'B'},'B'),/Not the active seat/);
 const a=send(s,attack(s)).state;
 assert.throws(()=>send(a,{...response(a),actorId:'A'},'A'),/Not the active seat/);
});
test('unexpected command fields are rejected and original state stays immutable',()=>{
 const s=room(),before=JSON.stringify(s);
 assert.throws(()=>send(s,attack(s,{clientPretendsToBeHost:true})),/Unexpected command property/);
 assert.throws(()=>send(s,attack(s,{expectedRevision:-1})),/Invalid expected revision/);
 assert.equal(JSON.stringify(s),before);
});
test('projected view contains own cards, but not rival hidden card identities',()=>{
 const s=send(room(),attack(room())).state;
 const viewA=viewStagingRoom(s,'A'),viewB=viewStagingRoom(s,'B');
 assert.equal(viewA.players[0].hand.length,5);
 assert.equal(Object.hasOwn(viewA.players[1],'hand'),false);
 assert.equal(viewA.players[1].handCount,4);
 assert.equal(viewB.players[1].hand.length,4);
 assert.equal(Object.hasOwn(viewB.players[0],'hand'),false);
 assert.equal(Object.hasOwn(viewA,'processedCommands'),false);
 assert.equal(Object.hasOwn(viewA,'rngSeed'),false);
 assert.equal(viewA.pending.type,'attack');
 assert.equal(Object.hasOwn(viewA.pending,'attackInstanceIds'),false);
 const hiddenB=s.players[1].hand[0].instanceId;
 assert.equal(JSON.stringify(viewA).includes(hiddenB),false);
});
test('after defense neither party sees opponents selection or private command ledger',()=>{
 const state=send(room(),attack(room())).state;
 const end=send(state,response(state)).state;
 const v=viewStagingRoom(end,'A');
 assert.equal(v.pending.stage,'awaitingResolution');
 assert.equal(JSON.stringify(v).includes('cmd-defend'),false);
 assert.equal(JSON.stringify(v).includes(end.players[1].hand[0].instanceId),false);
 assert.equal(Object.hasOwn(v.pending,'defense'),false);
});
test('serialized room can accept next request with matching revision',()=>{
 const state=send(room(),attack(room())).state;
 const restored=JSON.parse(JSON.stringify(state));
 const next=send(restored,response(restored));
 assert.equal(next.state.phase,'resolving');
 assert.equal(next.state.revision,2);
});
test('seat validation and hand cap reject invalid room creation',()=>{
 const s={seats:[{id:'A',handDefinitionIds:['w006']},{id:'A',handDefinitionIds:['w006']}],firstSeatId:'A'};
 assert.throws(()=>createStagingRoom(s,catalog),/Duplicate seat/);
 assert.throws(()=>createStagingRoom({seats:[{id:'A',handDefinitionIds:Array(19).fill('w006')},{id:'B',handDefinitionIds:[]}],firstSeatId:'A'},catalog),/starting hand/);
 assert.throws(()=>createStagingRoom({seats:[{id:'A',handDefinitionIds:['nonexistent']},{id:'B',handDefinitionIds:[]}],firstSeatId:'A'},catalog),/Unknown card definition/);
});

test('offensive miracle may open an attack, while Aura alone may not',()=>{
 const source=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['m002','m004','m005']},
  {id:'B',handDefinitionIds:['d001']}
 ],firstSeatId:'A'},catalog);
 const hand=source.players[0].hand;
 const good=send(source,attack(source,{orderedInstanceIds:[hand[0].instanceId]}));
 assert.equal(good.state.phase,'defense');
 assert.deepEqual(good.state.pending.attackInstanceIds,[hand[0].instanceId]);
 assert.throws(()=>send(source,attack(source,{orderedInstanceIds:[hand[1].instanceId]})),/Attack must start/);
 assert.throws(()=>send(source,attack(source,{orderedInstanceIds:[hand[2].instanceId,hand[0].instanceId]})),/Not a structural attack/);
});
test('ordered weapon, plus miracle and spirit selections survive staging untouched',()=>{
 const source=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['w016','m005','i003']},
  {id:'B',handDefinitionIds:['d001']}
 ],firstSeatId:'A'},catalog);
 const ids=source.players[0].hand.map(x=>x.instanceId);
 const staged=send(source,attack(source,{orderedInstanceIds:ids}));
 assert.deepEqual(staged.state.pending.attackInstanceIds,ids);
 assert.equal(staged.state.phase,'defense');
});
