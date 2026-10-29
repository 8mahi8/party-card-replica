/**
 * 2026 reference-backed HP absorption: Piong weapon list, Macaron artifacts,
 * Piong head-to-head self-attack section and 2021 competitive guide.
 * Important: Sun Charm recovery timing vs FATAL hits on a different player
 * remains unverified, and must fail without state mutation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {defineCard} from '../v2/foundation.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const opts={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(a=['w048'],b=['d001'],ahp=25,bhp=40){
 const state=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}
 ],firstSeatId:'A',rngSeed:53},catalog);
 state.players[0].hp=ahp;state.players[1].hp=bhp;
 return state;
}
const submit=(s,actorId,type,data={},other={})=>
  submitAndResolveFixture(s,{
    commandId:type+'-'+s.revision,actorId,type,
    expectedRevision:s.revision,...data
  },catalog,{...opts,authorizedSeatId:actorId,...other});
function attack(s,targetId='B',ids=s.players[0].hand.slice(0,1).map(c=>c.instanceId)){
 return submit(s,'A','playCards',{targetId,orderedInstanceIds:ids});
}
function defend(s,ids=[],other={}){
 return submit(s,s.activePlayerId,'defend',{orderedInstanceIds:ids},other);
}
function end(s,defense=[]){
 const t=attack(s);
 assert.equal(t.state.phase,'defense');
 return defend(t.state,defense);
}
test('two sourced HP absorbing weapons are typed and have accurate stats and weight',()=>{
 for(const [id,attack,price] of [['w048',7,10],['w049',12,15]]){
   const d=catalog.get(id);
   assert.equal(d.stats.attack,attack);
   assert.equal(d.stats.price,price);
   assert.equal(d.drawWeight,1);
   assert.equal(d.family,'weapon');
   assert.deepEqual(d.effects,[{when:'afterHit',type:'absorbHp',params:{amount:'damage'}}]);
 }
});
test('base absorb hits opponent and heals current attack source exactly once',()=>{
 const s=room(),original=JSON.stringify(s);
 const result=end(s),[a,b]=result.state.players;
 assert.equal(a.hp,32);assert.equal(b.hp,33);
 assert.deepEqual(result.events.filter(e=>e.type==='absorbHp').map(e=>[e.playerId,e.restored]),[['A',7]]);
 assert.equal(result.events.filter(e=>e.type==='damage').length,1);
 assert.equal(a.hand.length,1);
 assert.equal(a.hand[0].definitionId,'d001');
 assert.equal(JSON.stringify(s),original);
});
test('armor reduces BOTH damage and healing, not printed weapon attack',()=>{
 const s=room(['w049'],['d005']);
 const a=attack(s),defId=a.state.players[1].hand[0].instanceId;
 const r=defend(a.state,[defId]);
 assert.equal(r.state.players[0].hp,32); // 12 - 5 = 7
 assert.equal(r.state.players[1].hp,33);
 assert.equal(r.events.find(e=>e.type==='absorbHp').attempted,7);
});
test('fully blocked hit yields no HP absorption',()=>{
 const s=room(['w048'],['d009']);
 const a=attack(s),id=a.state.players[1].hand[0].instanceId;
 const r=defend(a.state,[id]);
 assert.equal(r.state.players[0].hp,25);
 assert.equal(r.state.players[1].hp,40);
 assert.equal(r.events.some(e=>e.type==='absorbHp'),false);
});
test('overkill still heals for full damage, not victim actual lost HP',()=>{
 const r=end(room(['w048'],['d001'],25,2));
 assert.equal(r.state.players[0].hp,32);
 assert.equal(r.state.players[1].hp,0);
 assert.equal(r.state.phase,'finished');
 assert.equal(r.events.find(e=>e.type==='absorbHp').attempted,7);
});
test('self-targeted Real Ghost Sword at 1 HP leaves HP12 and never consumes charm',()=>{
 const s=room(['w049','i005'],['d001'],1,40);
 const r=attack(s,'A'),a=r.state.players[0];
 assert.equal(a.hp,12);
 assert.equal(a.hand.some(c=>c.definitionId==='i005'),true);
 assert.equal(r.events.some(e=>e.type==='revive'),false);
 assert.equal(r.events.find(e=>e.type==='absorbHp').attempted,12);
 assert.equal(r.state.activePlayerId,'B');
});
test('self-targeted Ghost Sword at 1 HP heals back to HP7',()=>{
 const r=attack(room(['w048'],['d001'],1),'A');
 assert.equal(r.state.players[0].hp,7);
 assert.equal(r.events.filter(e=>e.type==='absorbHp').length,1);
});
test('healing caps at HP99 when attacker is near maximum',()=>{
 const r=end(room(['w048'],['d001'],98,40));
 assert.equal(r.state.players[0].hp,99);
 assert.equal(r.events.find(e=>e.type==='absorbHp').restored,1);
});
test('one reflect changes absorber to reflector rather than original attacker',()=>{
 const s=room(['w048'],['w027'],25,25);
 const t=attack(s);
 const b=t.state.players[1].hand[0].instanceId;
 const r=defend(t.state,[b]);
 assert.equal(r.state.phase,'defense');
 assert.equal(r.state.activePlayerId,'A');
 const end=defend(r.state);
 assert.equal(end.state.players[0].hp,18);
 assert.equal(end.state.players[1].hp,32);
 assert.deepEqual(end.events.filter(e=>e.type==='absorbHp').map(e=>e.playerId),['B']);
 assert.equal(end.events.filter(e=>e.type==='spend').length,0);
});
test('deflection onto its owner heals that owner without an extra defense choice',()=>{
 const s=room(['w048'],['w026'],25,4);
 const t=attack(s);
 const b=t.state.players[1].hand[0].instanceId;
 const r=defend(t.state,[b],{deflectRng:()=>0.99});
 assert.equal(r.state.phase,'turn');
 assert.equal(r.state.players[0].hp,25);
 assert.equal(r.state.players[1].hp,7); // 4 -> 0 -> +7
 assert.equal(r.events.some(e=>e.type==='revive'),false);
 assert.equal(r.events.filter(e=>e.type==='absorbHp').length,1);
});
test('fatal attack into a held Sun Charm refuses unverified original timing atomically',()=>{
 const s=room(['w048'],['i005'],25,2);
 const t=attack(s),baseline=JSON.stringify(t.state);
 assert.throws(()=>defend(t.state),/Sun Charm|absorption|Absorption/i);
 assert.equal(JSON.stringify(t.state),baseline);
});
test('a forged hit flag cannot turn an ordinary weapon into an absorber',async()=>{
 const {applyStagingCommand}=await import('../v2/staging-room.mjs');
 const {runEffectQueueFixture}=await import('../v2/effect-runner.mjs');
 const s=room(['w016'],['d001']);
 const a=applyStagingCommand(s,{commandId:'a',actorId:'A',type:'playCards',
   targetId:'B',expectedRevision:0,orderedInstanceIds:[s.players[0].hand[0].instanceId]
 },catalog,{authorizedSeatId:'A'}).state;
 const d=applyStagingCommand(a,{commandId:'b',actorId:'B',type:'defend',
   expectedRevision:1,orderedInstanceIds:[]
 },catalog,{authorizedSeatId:'B'}).state;
 const original=JSON.stringify(d);
 assert.throws(()=>runEffectQueueFixture(d,catalog,[
  {type:'hit',targetId:'B',damage:10,hpAfter:30,instantDefeat:false,lifeSteal:true}
 ],opts),/authentic attack/);
 assert.equal(JSON.stringify(d),original);
});
test('malformed absorption definitions are rejected before entering the catalog',()=>{
 const base={id:'test.hp',family:'weapon',element:'none',drawWeight:1,
  playModes:['mainAttack'],stats:{attack:7,price:10},source:{ruleset:'test',confidence:'lab'}};
 for(const e of [
   {when:'beforeHit',type:'absorbHp',params:{amount:'damage'}},
   {when:'afterHit',type:'absorbHp',params:{amount:'hpLost'}},
   {when:'afterHit',type:'absorbHp',params:{amount:'damage',extra:1}}
 ])assert.throws(()=>defineCard({...base,effects:[e]}),/Invalid absorbHp/);
});
test('duplicate absorbing main weapons are never silently combined',()=>{
 const s=room(['w048','w049']);
 const ids=s.players[0].hand.map(c=>c.instanceId);
 assert.throws(()=>attack(s,'B',ids));
});
