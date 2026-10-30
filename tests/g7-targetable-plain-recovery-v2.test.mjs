import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const ids=['i006','i007','i008','i009','i010','i011','i012'];
function room(cardId,{mirror=false,cap=false}={}){
 const state=createStagingRoom({
   firstSeatId:'A',rngSeed:71,rulesetId:'partial-reference-v2-lab',
   seats:[
    {id:'A',handDefinitionIds:[cardId,'w016']},
    {id:'B',handDefinitionIds:['i002','d003']}
   ]
 },catalog);
 state.players[0].hp=cap?98:20;state.players[0].mp=cap?98:10;
 state.players[1].hp=cap?98:30;state.players[1].mp=cap?98:15;
 const host=createLocalRoomHostFixture({initialState:state,catalog});
 const A=host.connectSeatFixture('A'),B=host.connectSeatFixture('B');
 const first=A.read();
 const declaration={commandId:'target-restorative',expectedRevision:first.revision,
  actorId:'A',type:'useItem',instanceId:first.players[0].hand[0].instanceId,targetId:'B'};
 const staged=A.submit(declaration);
 return {A,B,staged,declaration,mirror,cardId};
}
function respond(x){
 const {A,B,mirror}=x;
 const pending=B.read();
 const mirrorId=pending.players[1].hand.find(c=>c.definitionId==='i002').instanceId;
 const response={commandId:'accept-restorative',expectedRevision:pending.revision,
  actorId:'B',type:'respondItem',
  ...(mirror?{mirrorInstanceId:mirrorId}:{})};
 const result=B.submit(response);
 return {result,response};
}
test('seven verified HP/MP items offer target choice with one public announcement before resolution',()=>{
 for(const id of ids){
  const {A,B,declaration}=room(id);
  const a=A.read(),b=B.read();
  assert.equal(a.phase,'itemDefense',id);
  assert.equal(a.activePlayerId,'B',id);
  assert.equal(b.pending.declaredItem.definitionId,id);
  assert.equal(a.pending.declaredItem.definitionId,id);
  assert.equal(b.players[0].hand,undefined,id+' no opponent hand leak');
  assert.equal(a.players[1].hand,undefined,id+' no defender hand leak');
  assert.deepEqual(a.players.map(x=>x.hp),[20,30]);
  assert.deepEqual(a.players.map(x=>x.mp),[10,15]);
  assert.equal(A.submit(declaration).duplicate,true);
  assert.deepEqual(A.read(),a,id+' retry cannot heal before response');
  assert.throws(()=>A.submit({...declaration,targetId:'A'}),/Conflicting commandId reuse/);
 }
});
test('accepted other-player restoratives restore exactly printed HP/MP and preserve attacking turn',()=>{
 for(const id of ids){
  const {A,B,...context}=room(id);
  const effect=catalog.get(id).effects[0],{resource,amount}=effect.params;
  const {response}=respond({A,B,mirror:false,...context});
  const a=A.read(),b=B.read();
  const expected=resource==='hp'?30:15;
  assert.equal(a.players[1][resource],expected+amount,id);
  assert.equal(a.players[0][resource],resource==='hp'?20:10,id);
  assert.equal(a.activePlayerId,'A',id);
  assert.equal(a.phase,'turn',id);
  assert.equal(a.players[0].hand[0].definitionId,'w016',id);
  assert.equal(a.players[0].hand[1].definitionId,'d001',id+' spent item only replenished once');
  assert.equal(b.players[1].hand.some(c=>c.definitionId==='i002'),true,id);
  assert.equal(B.submit(response).duplicate,true,id);
  assert.deepEqual(A.read(),a,id+' cannot double heal on reply retry');
 }
});
test('all seven heal/MP restoratives can be bounced by one physically held Super Mirror',()=>{
 for(const id of ids){
  const x=room(id,{mirror:true});const {A,B}=x;
  const effect=catalog.get(id).effects[0],{resource,amount}=effect.params;
  const {response}=respond(x);
  const a=A.read(),b=B.read();
  assert.equal(a.players[0][resource],(resource==='hp'?20:10)+amount,id);
  assert.equal(a.players[1][resource],resource==='hp'?30:15,id);
  assert.equal(a.phase,'turn',id);
  assert.equal(a.activePlayerId,'A',id);
  assert.equal(b.players[1].hand.some(c=>c.definitionId==='i002'),false,id);
  assert.equal(b.players[1].hand.filter(c=>c.definitionId==='d001').length,1,id);
  assert.equal(a.players[0].hand.filter(c=>c.definitionId==='d001').length,1,id);
  assert.equal(B.submit(response).duplicate,true,id);
  assert.deepEqual(B.read(),b,id);
 }
});
test('other-player or reflected recovery still clamps at 99 and consumes the source instance',()=>{
 for(const mirror of [false,true]){
  const x=room('i009',{mirror,cap:true}),{A}=x;
  respond(x);
  const result=A.read();
  assert.equal(result.players[mirror?0:1].hp,99);
  assert.equal(result.players[mirror?1:0].hp,98);
  assert.equal(result.players[0].hand.length,2);
  assert.equal(result.activePlayerId,'A');
 }
});
test('after supporting an opponent, the original player may attack normally',()=>{
 const x=room('i006'),{A,B}=x;
 respond(x);
 const after=A.read();
 const weapon=after.players[0].hand.find(c=>c.definitionId==='w016');
 A.submit({commandId:'attack-after-support',expectedRevision:after.revision,
  actorId:'A',type:'playCards',targetId:'B',orderedInstanceIds:[weapon.instanceId]});
 assert.equal(B.read().phase,'defense');
});
test('an ordinary restorative sent to an empty/defeated seat is rejected before staging',()=>{
 const initial=createStagingRoom({firstSeatId:'A',rngSeed:71,
  seats:[{id:'A',handDefinitionIds:['i006']},{id:'B',handDefinitionIds:['d001']}]},catalog);
 initial.players[1].hp=0;
 const host=createLocalRoomHostFixture({initialState:initial,catalog});
 const A=host.connectSeatFixture('A'),first=A.read();
 assert.throws(()=>A.submit({type:'useItem',actorId:'A',commandId:'dead',
  expectedRevision:first.revision,instanceId:first.players[0].hand[0].instanceId,
  targetId:'B'}),/Item target has already been defeated/);
 assert.deepEqual(A.read(),first);
});
