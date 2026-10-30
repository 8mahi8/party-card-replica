/**
 * Source-limited 1v1 Mirage research: 1 physical cast = one neutral sweep,
 * two = two sweeps, three = three; Nokobunbun doubles each sweep.
 * Reference: Piong head-to-head guide, Piong miracles, Macaron 2026.
 * NO claim of multiplayer-wide target routing or exact Wall vs chain.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {defineCard} from '../v2/foundation.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
const options={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(a,b=[],{hp=40,mp=25,players=2}={}){
 const seats=[{id:'A',handDefinitionIds:a},{id:'B',handDefinitionIds:b}];
 if(players===3)seats.push({id:'C',handDefinitionIds:[]});
 const s=createStagingRoom({seats,firstSeatId:'A',rngSeed:31},catalog);
 s.players[0].mp=mp;s.players[1].hp=hp;
 return s;
}
const command=(s,id,type,data={},config={})=>submitAndResolveFixture(s,{
 commandId:'m-'+s.revision,expectedRevision:s.revision,actorId:id,type,...data
},catalog,{...options,authorizedSeatId:id,...config});
const attack=(s,targetId='B')=>command(s,'A','playCards',{
 targetId,orderedInstanceIds:s.players[0].hand.map(c=>c.instanceId)});
const defense=(s,ids=[])=>command(s,s.activePlayerId,'defend',{
 orderedInstanceIds:ids});
function whole(s){
 let result=attack(s),hits=[],prompts=[],events=[],first=result;
 while(result.state.phase==='defense'&&prompts.length<8){
  const next=result.state;
  prompts.push({target:next.activePlayerId,idx:next.pending.strikeIndex??0,
    remaining:next.players[0].hand.length,rev:next.revision});
  result=defense(next);
  hits.push(result.plan?.hit?.damage??null);
  events.push(...result.events);
 }
 return {result,hits,prompts,events,first};
}
test('Mirage is source-backed MP5 zero-price 1/500 and effect is typed',()=>{
 const def=catalog.get('m012');
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
 assert.equal(def.family,'miracle');assert.equal(def.stats.mpCost,5);
 assert.equal(def.stats.price,0);assert.equal(def.drawWeight,1);
 assert.deepEqual(def.effects,[{when:'onDeclare',type:'widenAttack',
   params:{mode:'allLiving'}}]);
});
test('single Mirage neutralizes elemental weapon in 1v1; no duplicate hit',()=>{
 const {result,hits,prompts}=whole(room(['w018','m012']));
 assert.equal(prompts.length,1);
 assert.deepEqual(hits,[1]);assert.equal(result.plan.element,'none');
 assert.equal(result.state.players[1].hp,39);
 assert.equal(result.state.players[0].mp,20);
 assert.equal(result.state.players[0].hand.length,2);
 assert.equal(result.state.players[0].learned.includes('m012'),true);
});
test('two Mirages create two independent defense windows, one MP cost per cast',()=>{
 const initial=room(['w016','m012','m012']),unchanged=JSON.stringify(initial);
 const {result,hits,prompts,events}=whole(initial);
 assert.deepEqual(hits,[10,10]);assert.equal(prompts.length,2);
 assert.deepEqual(prompts.map(x=>x.idx),[0,1]);
 assert.equal(result.state.players[1].hp,20);
 assert.equal(result.state.players[0].mp,15);
 assert.equal(result.state.players[0].hand.length,3);
 assert.equal(result.state.players[0].learned.filter(id=>id==='m012').length,1);
 assert.equal(result.state.turnCount,1);
 assert.equal(events.filter(e=>e.type==='damage').length,2);
 assert.equal(events.filter(e=>e.type==='payMp').length,1);
 assert.equal(JSON.stringify(initial),unchanged);
});
test('three Mirages use three defense windows (no accidental fourth)',()=>{
 const {result,hits,prompts,events}=whole(room(['w006','m012','m012','m012']));
 assert.deepEqual(hits,[3,3,3]);assert.equal(prompts.length,3);
 assert.equal(result.state.players[1].hp,31);
 assert.equal(result.state.players[0].mp,10);
 assert.equal(events.filter(e=>e.type==='nextStrike').length,2);
 assert.equal(result.state.players[0].hand.length,4);
});
test('Nokobunbun plus two Mirages means four hits, NOT three or two',()=>{
 const r=whole(room(['w050','m012','m012']));
 assert.deepEqual(r.hits,[3,3,3,3]);assert.equal(r.prompts.length,4);
 assert.equal(r.result.state.players[1].hp,28);
 assert.equal(r.result.state.players[0].mp,15);
 assert.equal(r.result.state.players[0].hand.length,3);
 assert.equal(r.result.state.turnCount,1);
});
test('Nokobunbun plus three Mirages gives six separate hits',()=>{
 const r=whole(room(['w050','m012','m012','m012']));
 assert.deepEqual(r.hits,[3,3,3,3,3,3]);
 assert.equal(r.prompts.length,6);
 assert.equal(r.result.state.players[1].hp,22);
 assert.equal(r.result.state.players[0].mp,10);
 assert.equal(r.events.filter(e=>e.type==='nextStrike').length,5);
});
test('weapon additive is applied to all four hits without reusing the cards',()=>{
 const r=whole(room(['w050','a003','m012','m012']));
 assert.deepEqual(r.hits,[6,6,6,6]);
 assert.equal(r.result.state.players[1].hp,16);
 assert.equal(r.result.state.players[0].hand.length,4);
 assert.equal(r.events.filter(e=>e.type==='spend'&&e.playerId==='A'&&e.count===4).length,1);
 assert.equal(r.events.filter(e=>e.type==='refill').length,1);
});
test('defender uses different armor on successive Mirage hits; no interim refill',()=>{
 const start=room(['w006','m012','m012'],['d003']);
 const a=attack(start),first=defense(a.state,[a.state.players[1].hand[0].instanceId]);
 assert.equal(first.state.players[1].hp,40);
 assert.equal(first.state.players[1].hand.length,0);
 assert.equal(first.state.pending.strikeIndex,1);
 const projection=viewStagingRoom(first.state,'A',catalog);
 assert.equal(projection.pending.strikeNumber,2);
 assert.equal(projection.pending.strikeCount,2);
 assert.equal(projection.players[1].hand,undefined);
 const end=defense(first.state);
 assert.equal(end.state.players[1].hp,37);
 assert.equal(end.state.players[1].hand.length,1);
});
test('lethal first Mirage hit immediately ends game and pays cost only once',()=>{
 const r=whole(room(['w016','m012','m012'],[],{hp:5}));
 assert.equal(r.hits.length,1);
 assert.equal(r.result.state.phase,'finished');
 assert.equal(r.result.state.players[1].hp,0);
 assert.equal(r.result.state.players[0].mp,15);
});
test('a first-hit reflector changes one Mirage sweep target but not next one',()=>{
 const start=room(['w016','m012','m012'],['w027']);
 const a=attack(start),b=defense(a.state,[a.state.players[1].hand[0].instanceId]);
 assert.equal(b.state.activePlayerId,'A');
 const c=defense(b.state);
 assert.equal(c.state.players[0].hp,30);
 assert.equal(c.state.pending.strikeIndex,1);
 assert.equal(c.state.activePlayerId,'B');
 const d=defense(c.state);
 assert.equal(d.state.players[1].hp,30);
 assert.equal(d.state.players[0].mp,15);
});
test('one Mirage in three-seat room fails closed; it is not single-target by mistake',()=>{
 const s=room(['w016','m012'],[],{players:3}),saved=JSON.stringify(s);
 assert.throws(()=>attack(s),/Mirage all-target.*multiplayer/);
 assert.equal(JSON.stringify(s),saved);
});
test('one Mirage with an elemental wand fails until original priority is verified',()=>{
 const s=room(['w016','a015','m012']),saved=JSON.stringify(s);
 assert.throws(()=>attack(s),/Mirage combined with other special/);
 assert.equal(JSON.stringify(s),saved);
});
test('Mirage with another miracle (Aura) is explicitly gated',()=>{
 const s=room(['w016','m004','m012']),saved=JSON.stringify(s);
 assert.throws(()=>attack(s),/Mirage combined|Aura stacked/);
 assert.equal(JSON.stringify(s),saved);
});
test('insufficient MP for 2 or 3 Mirages rejects attack before defense',()=>{
 for(const [cards,mp] of [
  [['w016','m012','m012'],9],
  [['w016','m012','m012','m012'],14]
 ]){
  const s=room(cards,[],{mp}),saved=JSON.stringify(s);
  assert.throws(()=>attack(s),/Not enough MP/);
  assert.equal(JSON.stringify(s),saved);
 }
});
test('a malformed widening effect is rejected by schema',()=>{
 const base={id:'test.mirage',family:'miracle',element:'none',drawWeight:1,
  source:{ruleset:'fixture',confidence:'research'},playModes:['cast'],
  stats:{attack:0,mpCost:5,price:0}};
 for(const effect of [
  {when:'afterHit',type:'widenAttack',params:{mode:'allLiving'}},
  {when:'onDeclare',type:'widenAttack',params:{mode:'singleTarget'}},
  {when:'onDeclare',type:'widenAttack',params:{mode:'allLiving',oops:1}}
 ])assert.throws(()=>defineCard({...base,effects:[effect]}),/Invalid widenAttack/);
});
test('forged second Mirage continuation does not bypass attack authentication',async()=>{
 const {runEffectQueueFixture}=await import('../v2/effect-runner.mjs');
 const s=room(['w016']),a=attack(s);
 const forged={...a.state,phase:'resolving',activePlayerId:null,
  pending:{...a.state.pending,defense:{playerId:'B',instanceIds:[]}}};
 const untouched=JSON.stringify(forged);
 assert.throws(()=>runEffectQueueFixture(forged,catalog,[
  {type:'hit',targetId:'B',damage:10,hpAfter:30,instantDefeat:false},
  {type:'continueStrike',attackContext:{attackKind:'weapon',hitCount:2,mirageCount:2},repeatTargetId:'B'}
 ],options),/original physical weapon or Mirage sequence/);
 assert.equal(JSON.stringify(forged),untouched);
});

test('one learned plus one hand Mirage uses same two-hit engine and grants one learned draw',()=>{
 const s=room(['w006','m012']);s.players[0].learned.push('m012');
 const plays=[
  {instanceId:s.players[0].hand[0].instanceId},
  {instanceId:s.players[0].hand[1].instanceId},
  {learnedDefinitionId:'m012'}
 ];
 let result=command(s,'A','playSequence',{targetId:'B',orderedPlays:plays});
 const hits=[];
 while(result.state.phase==='defense'){
  result=defense(result.state);hits.push(result.plan.hit.damage);
 }
 assert.deepEqual(hits,[3,3]);
 assert.equal(result.state.players[0].mp,15);
 assert.equal(result.state.players[1].hp,34);
 assert.equal(result.state.players[0].hand.length,3);
 assert.equal(result.state.players[0].learned.filter(id=>id==='m012').length,1);
});
test('repeating the SAME learned Mirage twice in one command is rejected atomically',()=>{
 const s=room(['w006']);s.players[0].learned.push('m012');
 const before=JSON.stringify(s);
 assert.throws(()=>command(s,'A','playSequence',{
  targetId:'B',orderedPlays:[
   {instanceId:s.players[0].hand[0].instanceId},
   {learnedDefinitionId:'m012'},
   {learnedDefinitionId:'m012'}
  ]
 }),/Repeated learned miracle/);
 assert.equal(JSON.stringify(s),before);
});
