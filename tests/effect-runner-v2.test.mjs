import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {runEffectQueueFixture} from '../v2/effect-runner.mjs';

const {byId:catalog}=migrateLegacyCatalog();
function room(){
 const s=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:['w016','w016']},
  {id:'B',handDefinitionIds:['d005']}
 ],firstSeatId:'A'},catalog);
 const attacked=applyStagingCommand(s,{commandId:'at1',actorId:'A',type:'playCards',expectedRevision:0,
  orderedInstanceIds:[s.players[0].hand[0].instanceId],targetId:'B'
 },catalog,{authorizedSeatId:'A'}).state;
 return applyStagingCommand(attacked,{commandId:'de1',actorId:'B',type:'defend',expectedRevision:1,
  orderedInstanceIds:[]
 },catalog,{authorizedSeatId:'B'}).state;
}
const run=(state,queue)=>runEffectQueueFixture(state,catalog,queue,{labOnly:true,fixtureDrawDefinitionId:'d001'});
test('shared runner spends, refills, advances with unique IDs and no mutation',()=>{
 const s=room(),baseline=JSON.stringify(s),instance=s.players[0].hand[0].instanceId;
 const queue=[{type:'spend',playerId:'A',instanceIds:[instance]},
  {type:'hit',targetId:'B',damage:5,hpAfter:35,instantDefeat:false},
  {type:'refill'}, {type:'advance',afterId:'A'}];
 const result=run(s,queue).state;
 assert.equal(result.revision,3);
 assert.equal(result.players[1].hp,35);
 assert.equal(result.players[0].hand.length,2);
 assert.equal(result.nextInstanceSerial,s.nextInstanceSerial+1);
 assert.notEqual(result.players[0].hand[1].instanceId,instance);
 assert.equal(result.phase,'turn');assert.equal(result.activePlayerId,'B');
 assert.equal(JSON.stringify(s),baseline);
});
test('MP payment and learning handled by the same interpreter',()=>{
 const s=room(),queue=[{type:'mp',playerId:'A',cost:2},
  {type:'learn',playerId:'A',definitionId:'m002'},
  {type:'hit',targetId:'B',damage:4,hpAfter:36,instantDefeat:false},
  {type:'refill'},{type:'advance',afterId:'A'}];
 const x=run(s,queue);
 assert.equal(x.state.players[0].mp,8);
 assert.deepEqual(x.state.players[0].learned,['m002']);
 assert.equal(x.events.find(e=>e.type==='payMp').cost,2);
});
test('old spentByPlayer counts survive redirect hand removal and refill at final hit',()=>{
 const s=room();
 s.players[0].hand.shift();
 s.pending.spentByPlayer={A:1};
 const r=run(s,[{type:'hit',targetId:'B',damage:3,hpAfter:37,instantDefeat:false},
  {type:'refill'},{type:'advance',afterId:'A'}]).state;
 assert.equal(r.players[0].hand.length,2);
});
test('duplicate spending or unknown effects fail atomically',()=>{
 const s=room(),original=JSON.stringify(s),id=s.players[0].hand[0].instanceId;
 assert.throws(()=>run(s,[{type:'spend',playerId:'A',instanceIds:[id,id]}]),/Repeated card/);
 assert.throws(()=>run(s,[{type:'unsupportedAction'}]),/Unknown queued effect/);
 assert.equal(JSON.stringify(s),original);
});
test('cannot steal MP, learn arbitrary cards, or modify HP via malformed hit',()=>{
 const s=room(),original=JSON.stringify(s);
 assert.throws(()=>run(s,[{type:'mp',playerId:'A',cost:100}]),/MP payment/);
 assert.throws(()=>run(s,[{type:'learn',playerId:'A',definitionId:'w016'}]),/Only known miracles/);
 assert.throws(()=>run(s,[{type:'hit',targetId:'B',damage:1,hpAfter:41,instantDefeat:false}]),/Malformed hit/);
 assert.equal(JSON.stringify(s),original);
});
test('runner never permits partial card pool to be used unless explicit lab flag',()=>{
 const s=room();
 assert.throws(()=>runEffectQueueFixture(s,catalog,[{type:'refill'}],{fixtureDrawDefinitionId:'d001'}),/lab fixture/);
 assert.throws(()=>runEffectQueueFixture(s,catalog,[{type:'refill'}],{labOnly:true,fixtureDrawDefinitionId:'missing'}),/fixture draw/);
});
test('dead players do not receive replacement cards',()=>{
 const s=room(),id=s.players[1].hand[0].instanceId;
 const q=[{type:'spend',playerId:'B',instanceIds:[id]},
  {type:'hit',targetId:'B',damage:40,hpAfter:0,instantDefeat:false},
  {type:'refill'},{type:'advance',afterId:'A'}];
 const r=run(s,q);
 assert.equal(r.state.players[1].hand.length,0);
 assert.equal(r.state.phase,'finished');assert.equal(r.state.winnerId,'A');
});
test('all card instances remain uniquely identified after repeated refill instructions',()=>{
 const s=room(),id=s.players[0].hand[0].instanceId;
 const q=[{type:'spend',playerId:'A',instanceIds:[id]},
  {type:'refill'},{type:'advance',afterId:'A'}];
 const r=run(s,q).state;
 const all=r.players.flatMap(p=>p.hand.map(c=>c.instanceId));
 assert.equal(all.length,new Set(all).size);
});
