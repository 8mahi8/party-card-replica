import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {resolveStagedFixture,submitAndResolveFixture} from '../v2/room-transition.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(hands){
 return createStagingRoom({
  seats:Object.entries(hands).map(([id,handDefinitionIds])=>({id,handDefinitionIds})),
  firstSeatId:'A'
 },catalog);
}
const ids=(s,id)=>s.players.find(x=>x.id===id).hand.map(x=>x.instanceId);
function send(s,actorId,type,params={}){
 const result=applyStagingCommand(s,{
  type,actorId,commandId:'multiple-'+s.revision+'-'+actorId,
  expectedRevision:s.revision,...params
 },catalog,{authorizedSeatId:actorId});
 return result.state;
}
const attack=(s,index=0)=>send(s,'A','playCards',{targetId:'B',
 orderedInstanceIds:[ids(s,'A')[index]]});
const defend=(s,indexes)=>send(s,'B','defend',{
 orderedInstanceIds:indexes.map(i=>ids(s,'B')[i])
});
const resolve=s=>resolveStagedFixture(s,catalog,fixture);

test('four plain elemental shields defend against an ice miracle; no arbitrary three-card cap',()=>{
 const s=attack(room({A:['m002'],B:['d014','d014','d014','d014']}));
 const d=defend(s,[0,1,2,3]),before=JSON.stringify(d);
 const result=resolve(d),last=result.state;
 assert.equal(JSON.stringify(d),before);
 assert.equal(last.phase,'turn');
 assert.equal(result.plan.guard,12);
 assert.equal(last.players[1].hp,40);
 assert.equal(last.players[0].mp,8);
 assert.deepEqual(last.players[0].learned,['m002']);
 assert.equal(last.players[1].hand.length,4);
});
test('five normal shields in an ordered defense are accepted against water miracle',()=>{
 const s=attack(room({A:['m002'],B:['d014','d014','d014','d014','d014']}));
 const steps=ids(s,'B').map(instanceId=>({instanceId}));
 const staged=send(s,'B','defendSequence',{orderedPlays:steps});
 const r=resolve(staged);
 assert.equal(r.plan.guard,15);
 assert.equal(r.state.players[1].hp,40);
 assert.equal(r.state.players[1].hand.length,5);
});
test('Rainbow Curtain followed by four neutral shields blocks a water miracle',()=>{
 const s=attack(room({A:['m002'],B:['i001','d001','d001','d001','d001']}));
 const r=resolve(defend(s,[0,1,2,3,4]));
 assert.equal(r.plan.guard,4);
 assert.equal(r.plan.hit.damage,0);
 assert.equal(r.state.players[1].hp,40);
 assert.equal(r.state.players[1].hand.length,5);
});
test('ordinary armor order after first Rainbow Curtain is preserved',()=>{
 const s=attack(room({A:['m002'],B:['d014','i001','d001','d001']}));
 const d=defend(s,[0,1,2,3]),before=JSON.stringify(d);
 assert.throws(()=>resolve(d),/Rainbow curtain must be first|Attribute remover must be first/);
 assert.equal(JSON.stringify(d),before);
});
test('Sky + Moonlight + ordinary armor use numeric guard together on neutral weapon',()=>{
 const s=room({A:['w016'],B:['d022','d029','d005']});
 const attacked=attack(s);
 const d=defend(attacked,[0,1,2]);
 const r=resolve(d);
 assert.equal(r.plan.armor,18);
 assert.equal(r.state.players[1].hp,40);
 assert.equal(r.state.players[1].mp,10);
 assert.equal(r.state.players[1].hand.length,3);
 assert.equal(r.state.activePlayerId,'B');
});
test('Rainbow Curtain + Sky + Moonlight + armor use numeric guard on elemental weapon',()=>{
 const s=room({A:['w020'],B:['i001','d024','d029','d001']});
 const d=defend(attack(s),[0,1,2,3]);
 const r=resolve(d);
 assert.equal(r.plan.stripElement,true);
 assert.equal(r.plan.armor,18);
 assert.equal(r.state.players[1].hp,40);
 assert.equal(r.state.players[1].hand.length,4);
});
test('mixed Sky and Moonlight special reactions against miracles are not guessed',()=>{
 const s=attack(room({A:['m002'],B:['d024','d029','d014']}));
 const d=defend(s,[0,1,2]);
 const before=JSON.stringify(d);
 assert.throws(()=>resolve(d),/Only one supported miracle redirect|Redirect must be used alone/);
 assert.equal(JSON.stringify(d),before);
});
test('four Sky and Moonlight reactions cannot silently drop ambiguous effects',()=>{
 const s=attack(room({A:['m002'],B:['d024','d029','d022','d028']}));
 const d=defend(s,[0,1,2,3]);
 const before=JSON.stringify(d);
 assert.throws(()=>resolve(d),/Only one supported miracle redirect|Redirect must be used alone/);
 assert.equal(JSON.stringify(d),before);
});
test('forged ordered defense with mismatching physical selection is rejected immutably',()=>{
 const s=attack(room({A:['m002'],B:['d014','d014','d014','d014']}));
 const d=defend(s,[0,1,2,3]);
 const forged={...d,pending:{...d.pending,defense:{...d.pending.defense,
  sequence:[{instanceId:ids(d,'B')[0]},{instanceId:ids(d,'B')[1]}]}}};
 const before=JSON.stringify(forged);
 assert.throws(()=>resolve(forged),/Defensive selection sequence mismatch/);
 assert.equal(JSON.stringify(forged),before);
});
test('forged learned miracle in sequence cannot be charged or drawn without declaration',()=>{
 const s=attack(room({A:['m002'],B:['d014']}));
 const d=defend(s,[0]);
 const forged={...d,pending:{...d.pending,defense:{...d.pending.defense,
  sequence:[{instanceId:ids(d,'B')[0]},{learnedDefinitionId:'m007'}]}}};
 const before=JSON.stringify(forged);
 assert.throws(()=>resolve(forged),/Defensive selection sequence mismatch/);
 assert.equal(JSON.stringify(forged),before);
});
test('both single Sky and single Moonlight still redirect a miracle after compiler hardening',()=>{
 for(const name of ['d024','d029']){
  let s=attack(room({A:['m002'],B:[name]}));
  const r=resolve(defend(s,[0]));
  assert.equal(r.redirected,true,name);
  assert.equal(r.state.activePlayerId,'A',name);
  assert.equal(r.state.players[0].mp,8,name);
 }
});
test('shared submit path accepts 4 shields when defended from a staged attack',()=>{
 let s=room({A:['m002'],B:['d014','d014','d014','d014']});
 const a=submitAndResolveFixture(s,{type:'playCards',commandId:'cmd-A',actorId:'A',
  expectedRevision:s.revision,targetId:'B',orderedInstanceIds:[ids(s,'A')[0]]},
  catalog,{...fixture,authorizedSeatId:'A'});
 assert.equal(a.state.phase,'defense');
 s=a.state;
 const b=submitAndResolveFixture(s,{type:'defend',commandId:'cmd-B',actorId:'B',
  expectedRevision:s.revision,orderedInstanceIds:ids(s,'B')},
  catalog,{...fixture,authorizedSeatId:'B'});
 assert.equal(b.autoResolved,true);
 assert.equal(b.state.phase,'turn');
 assert.equal(b.state.players[1].hp,40);
});
