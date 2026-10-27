import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {resolveStagedFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001'};
const STOP=[['w029',11],['w030',13],['w031',15],['a013',15]];
const REFLECT=[['w028',10]];
const DEFLECT=[['a012',9]];
function room(hands){
 return createStagingRoom({
  seats:Object.entries(hands).map(([id,handDefinitionIds])=>({id,handDefinitionIds})),
  firstSeatId:'A',rngSeed:29
 },catalog);
}
const inst=(s,id,n=0)=>s.players.find(p=>p.id===id).hand[n].instanceId;
function send(s,id,type,more={}){
 return applyStagingCommand(s,{
  type,commandId:'counter-'+id+'-'+s.revision,
  actorId:id,expectedRevision:s.revision,...more
 },catalog,{authorizedSeatId:id}).state;
}
function attack(s,positions=[0]){
 return send(s,'A','playCards',{targetId:'B',orderedInstanceIds:positions.map(i=>inst(s,'A',i))});
}
const defend=(s,positions=[0])=>send(s,'B','defend',{orderedInstanceIds:positions.map(i=>inst(s,'B',i))});
const resolve=(s,rng)=>resolveStagedFixture(s,catalog,{...fixture,...(rng?{deflectRng:rng}:{})});

test('six dual-use miracle counters preserve wiki attack, price, weight and effect type',()=>{
 assert.deepEqual([summary.unique,summary.slots,summary.complete],[83,201,false]);
 for(const [id,atk] of [...STOP,...REFLECT,...DEFLECT]){
  const d=catalog.get(id);
  assert.equal(d.family,'weapon',id);
  assert.equal(d.stats.attack,atk,id);
  assert.equal(d.drawWeight,1,id);
  assert.equal(d.stats.price,id==='w028'?10:id==='a012'?5:15,id);
  assert.ok(d.playModes.includes('defend'),id);
  assert.ok(d.playModes.includes(id.startsWith('a')?'addAttack':'mainAttack'),id);
  assert.equal(d.effects.length,1,id);
  assert.equal(d.effects[0].when,'onDefense',id);
  assert.equal(d.effects[0].params.scope,'miracle',id);
 }
 for(const [id] of STOP)assert.equal(catalog.get(id).effects[0].type,'stopAttack',id);
 assert.deepEqual(catalog.get('w028').effects[0].params,{mode:'reflect',scope:'miracle'});
 assert.deepEqual(catalog.get('a012').effects[0].params,{mode:'deflect',scope:'miracle'});
});
test('all Angel counter weapons completely stop dark miracle even without printed numeric guard',()=>{
 for(const [id] of STOP){
  const staged=defend(attack(room({A:['m003'],B:[id]})));
  const before=JSON.stringify(staged);
  const r=resolve(staged);
  assert.equal(r.plan.stopped,true,id);
  assert.equal(r.plan.hit.instantDefeat,false,id);
  assert.equal(r.state.players[1].hp,40,id);
  assert.equal(r.state.players[0].mp,5,id);
  assert.equal(r.state.players[1].mp,10,id);
  assert.equal(r.state.players[1].hand.length,1,id);
  assert.equal(JSON.stringify(staged),before,id);
 }
});
test('Moonlight Axe reflects a miracle back to caster with original MP paid once',()=>{
 const first=resolve(defend(attack(room({A:['m002'],B:['w028']}))));
 assert.equal(first.redirected,true);
 assert.equal(first.plan.mode,'reflect');
 assert.equal(first.state.activePlayerId,'A');
 assert.equal(first.state.players[0].mp,8);
 assert.equal(first.state.players[1].mp,10);
 const caster=send(first.state,'A','defend',{orderedInstanceIds:[]});
 const done=resolve(caster).state;
 assert.equal(done.players[0].hp,36);
 assert.equal(done.players[1].hp,40);
 assert.equal(done.players[0].mp,8);
});
test('Sky Harpoon deflects a miracle, including the original caster as a target',()=>{
 const first=resolve(defend(attack(room({A:['m002'],B:['a012']}))),()=>0);
 assert.equal(first.redirected,true);
 assert.equal(first.plan.mode,'deflect');
 assert.equal(first.state.activePlayerId,'A');
 assert.equal(first.state.players[0].mp,8);
 const caster=send(first.state,'A','defend',{orderedInstanceIds:[]});
 assert.equal(resolve(caster).state.players[0].hp,36);
});
test('main counter weapons still attack at printed ATK when played as normal weapons',()=>{
 for(const [id,atk] of [...STOP,...REFLECT].filter(([id])=>id.startsWith('w'))){
  const s=attack(room({A:[id],B:['d001']}));
  const d=defend(s,[]);
  const r=resolve(d);
  assert.equal(r.state.players[1].hp,40-atk,id);
  assert.equal(r.state.players[0].mp,10,id);
  assert.equal(r.state.players[0].hand.length,1,id);
 }
});
test('additive counters boost a regular main weapon without activating defensive effect',()=>{
 for(const [id,bonus] of [...STOP,...DEFLECT].filter(([id])=>id.startsWith('a'))){
  const s=attack(room({A:['w016',id],B:['d001']}),[0,1]);
  const d=defend(s,[]);
  const r=resolve(d);
  assert.equal(r.plan.attack,10+bonus,id);
  assert.equal(r.state.players[1].hp,40-10-bonus,id);
  assert.equal(r.state.players[0].mp,10,id);
 }
});
test('a counter weapon without guard may not defend an ordinary physical attack',()=>{
 for(const [id] of [...STOP,...REFLECT,...DEFLECT]){
  const s=defend(attack(room({A:['w016'],B:[id]})));
  const before=JSON.stringify(s);
  assert.throws(()=>resolve(s),/Miracle-only weapon reaction cannot guard/,id);
  assert.equal(JSON.stringify(s),before,id);
 }
});
test('Angel counter is exclusive against a miracle; forged combinations remain atomic failures',()=>{
 const s=defend(attack(room({A:['m002'],B:['w029','d014']})),[0,1]);
 const before=JSON.stringify(s);
 assert.throws(()=>resolve(s),/Angel stop armor must be selected alone/);
 assert.equal(JSON.stringify(s),before);
});
test('hotseat switches Sky -> Angel weapon -> Moonlight when defending against miracle',()=>{
 const ui=createV2LabController({hands:{A:['m002'],B:['d024','w029','w028']}});
 const a=ui.reveal();ui.toggle({instanceId:a.hand[0].instanceId});
 assert.equal(ui.submit().ok,true);
 const b=ui.reveal();
 for(const index of [0,1,2]){
  ui.toggle({instanceId:b.hand[index].instanceId});
  assert.deepEqual(ui.view().selection,[{instanceId:b.hand[index].instanceId}]);
 }
 assert.equal(ui.submit().ok,true);
 assert.equal(ui.view().actorId,'A');
 assert.equal(ui.labSnapshot().players[1].hp,40);
});
