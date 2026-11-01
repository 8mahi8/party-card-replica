import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {createLocalRoomHostFixture} from '../v2/local-room-host-fixture.mjs';
const {byId:catalog}=migrateLegacyCatalog();
function match(weapon,medicine){
 const initial=createStagingRoom({firstSeatId:'A',rngSeed:12345,
   rulesetId:'partial-reference-v2-lab',seats:[
    {id:'A',handDefinitionIds:[weapon,'d003','i005']},
    {id:'B',handDefinitionIds:[medicine,'w016','d001','d003']}
   ]},catalog);
 const host=createLocalRoomHostFixture({initialState:initial,catalog});
 return {A:host.connectSeatFixture('A'),B:host.connectSeatFixture('B')};
}
function command(conn,actorId,type,extra,commandId){
 return conn.submit({type,actorId,commandId,expectedRevision:conn.read().revision,...extra});
}
for(const [weapon,medicine,sick,hpAfter] of [
 ['w056','i017','cold',31],
 ['w059','i018','hell',32]
]){
 test('full match: '+weapon+' infects, '+medicine+' cures next turn, no illness tick',()=>{
  const {A,B}=match(weapon,medicine);
  const sword=A.read().players[0].hand.find(c=>c.definitionId===weapon);
  command(A,'A','playCards',{targetId:'B',orderedInstanceIds:[sword.instanceId]},'start');
  assert.equal(B.read().players[1].disease,null,'attack declaration does not infect');
  command(B,'B','defend',{orderedInstanceIds:[]},'accept');
  const injured=B.read();
  assert.equal(injured.players[1].hp,hpAfter);
  assert.equal(injured.players[1].disease,sick);
  assert.equal(injured.activePlayerId,'B');
  const item=injured.players[1].hand.find(c=>c.definitionId===medicine);
  const healed=command(B,'B','useItem',{instanceId:item.instanceId,targetId:'B'},'cure');
  assert.equal(B.read().players[1].disease,null,'cure immediately clears illness');
  assert.equal(B.read().players[1].hp,hpAfter,'cure does not restore HP');
  assert.equal(B.read().activePlayerId,'B','medicine does not consume attack');
  const weaponB=B.read().players[1].hand.find(c=>c.definitionId==='w016');
  command(B,'B','playCards',{targetId:'A',orderedInstanceIds:[weaponB.instanceId]},'counter');
  command(A,'A','defend',{orderedInstanceIds:[]},'counter-accept');
  assert.equal(B.read().players[1].hp,hpAfter,'cured illness cannot tick on end turn');
  assert.equal(B.read().players[1].disease,null);
  assert.equal(B.read().activePlayerId,'A');
  assert.equal(A.read().players[0].hp,30,'normal counterattack still damages opponent');
 });
}
test('full match: infected player who refuses cure takes own-turn illness damage',()=>{
 const {A,B}=match('w056','i017');
 const sword=A.read().players[0].hand.find(c=>c.definitionId==='w056');
 command(A,'A','playCards',{targetId:'B',orderedInstanceIds:[sword.instanceId]},'infect');
 command(B,'B','defend',{orderedInstanceIds:[]},'infect-accept');
 assert.equal(B.read().players[1].disease,'cold');
 const weapon=B.read().players[1].hand.find(c=>c.definitionId==='w016');
 command(B,'B','playCards',{targetId:'A',orderedInstanceIds:[weapon.instanceId]},'ignore-cure');
 command(A,'A','defend',{orderedInstanceIds:[]},'ignore-cure-accept');
 assert.equal(B.read().players[1].hp,30,'cold does exactly one damage at its owners turn end');
});
