import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const lab={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(A=['t001','w003','d001'],B=['i002','d005'],C=null){
 const seats=[{id:'A',handDefinitionIds:A},{id:'B',handDefinitionIds:B}];
 if(C!==null)seats.push({id:'C',handDefinitionIds:C});
 return createStagingRoom({seats,firstSeatId:'A',rngSeed:83},catalog);
}
const who=(s,id)=>s.players.find(p=>p.id===id);
function sale(s,{targetId='B',itemIndex=1}={}){
 return {type:'declareSale',commandId:'sale-'+s.revision,actorId:'A',
   expectedRevision:s.revision,targetId,
   saleInstanceId:who(s,'A').hand[0].instanceId,
   soldInstanceId:who(s,'A').hand[itemIndex].instanceId};
}
function respond(s,{actorId='B',mirror=false}={}){
 const command={type:'respondSale',commandId:'response-'+s.revision,
   actorId,expectedRevision:s.revision};
 if(mirror)command.mirrorInstanceId=who(s,actorId).hand[0].instanceId;
 return command;
}
function send(s,command){return submitAndResolveFixture(s,command,catalog,
 {...lab,authorizedSeatId:command.actorId});}
test('two separate authenticated commands stage a Sell before the buyer accepts',()=>{
 const s=room(),unchanged=JSON.stringify(s),r=send(s,sale(s));
 assert.equal(r.autoResolved,false);
 assert.equal(r.state.revision,1);
 assert.equal(r.state.phase,'tradeDefense');
 assert.equal(r.state.activePlayerId,'B');
 assert.equal(r.state.turnCount,0);
 assert.equal(who(r.state,'A').hand.length,3);
 assert.equal(who(r.state,'B').hand.length,2);
 assert.equal(JSON.stringify(s),unchanged);
 const viewA=viewStagingRoom(r.state,'A');
 const viewB=viewStagingRoom(r.state,'B');
 assert.equal(viewA.pending.type,'sale');
 assert.equal(viewA.pending.stage,'awaitingTradeResponse');
 assert.deepEqual(viewB.pending.offer,{definitionId:'w003',price:25});
 assert.equal(Object.hasOwn(viewB.players[0],'hand'),false);
 assert.equal(JSON.stringify(viewB).includes('soldInstanceId'),false);
 assert.equal(JSON.stringify(viewB).includes('saleInstanceId'),false);
 assert.equal(JSON.stringify(viewB).includes('ci-'),true,
  'the receiver may see own physical cards only');
});
test('accepted staged sale transfers the exact item and charges the correct stats',()=>{
 const s=room(),originalItem=who(s,'A').hand[1].instanceId;
 Object.assign(who(s,'B'),{hp:15,mp:10,money:5});
 const first=send(s,sale(s));
 const second=send(first.state,respond(first.state));
 assert.equal(second.autoResolved,true);
 const n=second.state;
 assert.equal(n.revision,3);
 assert.equal(n.phase,'turn');
 assert.equal(n.activePlayerId,'B');
 assert.equal(n.turnCount,1);
 assert.equal(n.pending,null);
 assert.deepEqual(n.players.map(p=>[p.hp,p.mp,p.money]),[
  [40,10,45],[5,0,0]
 ]);
 assert.equal(who(n,'B').hand.at(-1).instanceId,originalItem);
 assert.deepEqual(who(n,'A').hand.map(c=>c.definitionId),['d001','d001']);
 assert.deepEqual(second.events.map(e=>e.type),[
  'spend','uncontestedSale','refill','turnAdvance'
 ]);
});
test('authenticated Super Mirror response reverses payments and never moves sold card',()=>{
 const s=room(),sold=who(s,'A').hand[1].instanceId;
 const first=send(s,sale(s));
 const view=viewStagingRoom(first.state,'B');
 assert.equal(view.players[0].handCount,3);
 const second=send(first.state,respond(first.state,{mirror:true})),n=second.state;
 assert.equal(second.plan.reaction,'singleMirror');
 assert.equal(n.revision,3);
 assert.equal(n.phase,'turn');
 assert.equal(n.activePlayerId,'B');
 assert.equal(n.turnCount,1);
 assert.deepEqual(n.players.map(p=>[p.hp,p.mp,p.money]),[
  [40,5,0],[40,10,45]
 ]);
 assert.equal(who(n,'A').hand[0].instanceId,sold);
 assert.equal(who(n,'B').hand.some(c=>c.instanceId===sold),false);
 assert.equal(second.events.filter(e=>e.type==='refill').length,2);
 assert.deepEqual(second.events.filter(e=>e.type==='refill').map(e=>e.added),[1,1]);
});
test('mirror may rescue a sale that is impossible to settle without reflection',()=>{
 const s=room();
 Object.assign(who(s,'B'),{hp:1,mp:0,money:0});
 const start=send(s,sale(s));
 assert.equal(start.state.phase,'tradeDefense');
 const initial=JSON.stringify(start.state);
 assert.throws(()=>send(start.state,respond(start.state)),
  /Lethal forced sale requires original verification/);
 assert.equal(JSON.stringify(start.state),initial);
 const mirrored=send(start.state,respond(start.state,{mirror:true}));
 assert.equal(mirrored.state.phase,'turn');
 assert.equal(who(mirrored.state,'B').hp,1);
 assert.equal(who(mirrored.state,'B').money,25);
});
test('if no researched outcome is possible, declaration fails atomically before defense',()=>{
 const s=room(['t001','w003'],['d005']);
 Object.assign(who(s,'B'),{hp:1,mp:0,money:0});
 const snapshot=JSON.stringify(s);
 assert.throws(()=>send(s,sale(s)),/Lethal forced sale requires original zero-HP settlement verification/);
 assert.equal(JSON.stringify(s),snapshot);
});
test('wrong type of defensive card, off-turn commands and forged response are rejected',()=>{
 const s=room();
 const first=send(s,sale(s)),pending=first.state,before=JSON.stringify(pending);
 const forged=respond(pending,{mirror:true});
 for(const command of [
  {...forged,mirrorInstanceId:who(pending,'B').hand[1].instanceId},
  {...forged,mirrorInstanceId:who(pending,'A').hand[0].instanceId},
  {...forged,mirrorInstanceId:'ci-forged'},
  {...forged,actorId:'A'},
  {...forged,extra:true},
  {...forged,expectedRevision:0},
  {...respond(pending),type:'defend',orderedInstanceIds:[]},
  {...respond(pending),type:'pray'}
 ]){
  assert.throws(()=>send(pending,command));
  assert.equal(JSON.stringify(pending),before);
 }
});
test('a same-command retry is idempotent and conflicting reuse is rejected',()=>{
 const s=room(),firstCommand=sale(s);
 const first=send(s,firstCommand);
 const duplicate=send(first.state,firstCommand);
 assert.equal(duplicate.duplicate,true);
 assert.strictEqual(duplicate.state,first.state);
 assert.deepEqual(duplicate.events,[]);
 assert.throws(()=>send(first.state,{...firstCommand,targetId:'A'}),
  /Conflicting commandId reuse/);
 const secondCommand=respond(first.state,{mirror:true});
 const second=send(first.state,secondCommand);
 const repeat=send(second.state,secondCommand);
 assert.equal(repeat.duplicate,true);
 assert.strictEqual(repeat.state,second.state);
 assert.deepEqual(repeat.events,[]);
 assert.throws(()=>send(second.state,{...secondCommand,mirrorInstanceId:'ci-fake'}),
  /Conflicting commandId reuse/);
});
test('three seats: a target C may buy while unrelated B hand and money stay unchanged',()=>{
 const s=room(['t001','w016'],['w016'],['d005']);
 const before=JSON.stringify(who(s,'B'));
 const first=send(s,sale(s,{targetId:'C'}));
 assert.equal(first.state.activePlayerId,'C');
 const n=send(first.state,respond(first.state,{actorId:'C'})).state;
 assert.equal(n.activePlayerId,'B','turn advances after A, not after targeted C');
 assert.deepEqual(who(n,'B'),who(s,'B'));
 assert.equal(who(n,'C').money,16);
 assert.equal(who(n,'A').money,24);
 assert.equal(JSON.stringify(who(s,'B')),before);
});
test('a responder can submit only an owned source-verified Super Mirror',()=>{
 const s=room(['t001','w003'],['w027','d005']);
 const d=send(s,sale(s));
 const snapshot=JSON.stringify(d.state);
 const response=respond(d.state,{mirror:true});
 assert.throws(()=>send(d.state,response),/Only Super Mirror/);
 assert.equal(JSON.stringify(d.state),snapshot);
 const accepted=send(d.state,respond(d.state));
 assert.equal(accepted.state.phase,'turn');
});
test('the staging and settlement cannot be used without server-supplied seat authentication',()=>{
 const s=room(),command=sale(s);
 for(const opts of [{...lab},{...lab,authorizedSeatId:'B'},
  {...lab,authorizedSeatId:'A',labOnly:false}]){
  assert.throws(()=>submitAndResolveFixture(s,command,catalog,opts));
 }
 const pending=applyStagingCommand(s,command,catalog,{authorizedSeatId:'A'});
 assert.equal(pending.state.phase,'tradeDefense');
 assert.throws(()=>applyStagingCommand(pending.state,respond(pending.state),
  catalog,{authorizedSeatId:'A'}),/not authenticated/);
});
test('partial catalog and fixture draw stay inaccessible to opponent projected views',()=>{
 const s=room(),first=send(s,sale(s));
 for(const id of ['A','B']){
  const view=viewStagingRoom(first.state,id);
  assert.equal(Object.hasOwn(view,'rngSeed'),false);
  assert.equal(Object.hasOwn(view,'processedCommands'),false);
  assert.equal(Object.hasOwn(view,'pending')&&view.pending.type==='sale',true);
  const other=view.players.find(p=>p.id!=='A'&&p.id!=='B');
  assert.equal(other,undefined);
 }
});
