import test from 'node:test';
import assert from 'node:assert/strict';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';
import {planZeroHpRecoveryFixture} from '../v2/zero-hp-recovery.mjs';
import {runEffectQueueFixture} from '../v2/effect-runner.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {defineCard} from '../v2/foundation.mjs';

const {byId:catalog,summary}=migrateLegacyCatalog();
const lab={labOnly:true,fixtureDrawDefinitionId:'d001'};
const room=(B=['i005'],A=['w016'],C=null)=>{
 const seats=[{id:'A',handDefinitionIds:A},{id:'B',handDefinitionIds:B}];
 if(C)seats.push({id:'C',handDefinitionIds:C});
 return createStagingRoom({seats,firstSeatId:'A',rngSeed:73},catalog);
};
const effects=(s,target='B',hits=1)=>{
 const staged={...s,phase:'resolving',activePlayerId:null,
   pending:{type:'attack',originalAttackerId:'A',targetId:target}};
 return runEffectQueueFixture(staged,catalog,[
  ...Array.from({length:hits},()=>({
    type:'hit',targetId:target,damage:99,hpAfter:0,instantDefeat:false
  })),
  {type:'refill'}, {type:'advance',afterId:'A'}
 ],lab);
};
const cmd=(s,actorId,type,fields={})=>({
 commandId:type+'-'+s.revision,expectedRevision:s.revision,actorId,type,...fields
});
const send=(s,c)=>submitAndResolveFixture(s,c,catalog,{
 ...lab,authorizedSeatId:c.actorId
});

test('Sun Charm is a source-backed 0.2% 10-yen passive, non-discardable card',()=>{
 const item=catalog.get('i005');
 assert.equal(item.family,'item');
 assert.equal(item.stats.price,10);
 assert.equal(item.drawWeight,1);
 assert.deepEqual(item.playModes,['passive']);
 assert.equal(item.discardPolicy,'forbidden');
 assert.deepEqual(item.effects.map(e=>[e.when,e.type,e.params.hp]),
  [['onZeroHp','reviveAtZeroHp',10]]);
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);
 assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);
});
test('strict schema rejects forged resurrection timing and recovery amount',()=>{
 const base={id:'custom',family:'item',element:'none',drawWeight:1,
  stats:{price:10},playModes:['passive'],
  discardPolicy:'forbidden',
  source:{ruleset:'test',confidence:'secondary'}};
 for(const e of [
  {when:'afterHit',type:'reviveAtZeroHp',params:{hp:10}},
  {when:'onZeroHp',type:'reviveAtZeroHp',params:{hp:11}},
  {when:'onZeroHp',type:'reviveAtZeroHp',params:{hp:10,draw:2}},
  {when:'onDeclare',type:'reviveAtZeroHp',params:{}}
 ])assert.throws(()=>defineCard({...base,effects:[e]}),/Invalid reviveAtZeroHp/);
});
test('pure planner selects exactly first held passive on HP0 and never mutates source',()=>{
 const s=room(['i005','d001','i005']),p=s.players[1],before=JSON.stringify(s);
 p.hp=2;
 const x=planZeroHpRecoveryFixture({player:p,catalog,hpAfter:0});
 assert.equal(x.kind,'revived');
 assert.equal(x.hpAfter,10);
 assert.equal(x.consumedInstanceId,p.hand[0].instanceId);
 assert.equal(x.consumedDefinitionId,'i005');
 assert.equal(x.restoredHp,10);
 assert.equal(Object.isFrozen(x),true);
 assert.equal(s.players[1].hand.length,3);
 assert.equal(s.players[1].hand[2].definitionId,'i005');
 assert.equal(JSON.stringify(s).includes('"hp":2'),true);
});
test('normal positive HP is never revived; no charm means elimination',()=>{
 const p=room(['i005']).players[1];
 assert.equal(planZeroHpRecoveryFixture({player:p,catalog,hpAfter:1}).kind,'survived');
 assert.equal(planZeroHpRecoveryFixture({player:room(['d001']).players[1],
  catalog,hpAfter:0}).kind,'eliminated');
});
test('pure planner rejects nonliving targets, negative HP and malformed catalog',()=>{
 const p=room(['i005']).players[1];
 for(const x of [
  {player:{...p,hp:0},catalog,hpAfter:0},
  {player:p,catalog,hpAfter:-1},
  {player:p,catalog,hpAfter:p.hp+1},
  {player:p,catalog:null,hpAfter:0},
  {player:{...p,hand:null},catalog,hpAfter:0}
 ])assert.throws(()=>planZeroHpRecoveryFixture(x),/Invalid zero-HP recovery/);
});
test('fatal hit consumes one Sun Charm and refills its spent slot on surviving player',()=>{
 const s=room(['i005','d001','i005']),before=JSON.stringify(s);
 s.players[1].hp=5;
 const originalIds=s.players[1].hand.map(x=>x.instanceId);
 const n=effects(s),p=n.state.players[1];
 assert.equal(p.hp,10);
 assert.deepEqual(p.hand.map(x=>x.definitionId),['d001','i005','d001']);
 assert.equal(p.hand.some(x=>x.instanceId===originalIds[0]),false);
 assert.equal(p.hand[1].instanceId,originalIds[2]);
 assert.equal(n.state.phase,'turn');
 assert.equal(n.state.activePlayerId,'B');
 assert.equal(n.state.turnCount,1);
 assert.equal(n.state.rngSeed,s.rngSeed);
 assert.deepEqual(n.events.map(e=>e.type),['damage','revive','refill','turnAdvance']);
 assert.equal(n.events[0].hpAfter,0);
 assert.equal(n.events[1].revivedHp,10);
 assert.equal(n.events[2].added,1);
 assert.notEqual(JSON.stringify(s),before,'explicit HP setup is in fixture only');
 assert.equal(s.players[1].hand[0].instanceId,originalIds[0]);
});
test('overkill damage cannot carry into next life',()=>{
 const s=room(['i005']);
 s.players[1].hp=1;
 const n=effects(s);
 assert.equal(n.events[0].damage,99);
 assert.equal(n.events[0].hpAfter,0);
 assert.equal(n.state.players[1].hp,10);
 assert.equal(n.state.phase,'turn');
});
test('two separate HP0 events each consume only one of two charms',()=>{
 const s=room(['i005','i005','d001']);
 s.players[1].hp=9;
 const n=effects(s,'B',2);
 assert.equal(n.state.players[1].hp,10);
 assert.equal(n.events.filter(e=>e.type==='revive').length,2);
 assert.equal(n.events.filter(e=>e.type==='refill')[0].added,2);
 assert.deepEqual(n.state.players[1].hand.map(x=>x.definitionId),
  ['d001','d001','d001']);
});
test('one charm cannot save against two independent fatal hit effects',()=>{
 const s=room(['i005','d001']);
 s.players[1].hp=1;
 const n=effects(s,'B',2);
 assert.equal(n.events.filter(e=>e.type==='revive').length,1);
 assert.equal(n.state.players[1].hp,0);
 assert.equal(n.state.phase,'finished');
 assert.equal(n.state.winnerId,'A');
 assert.equal(n.state.players[1].hand.some(x=>x.definitionId==='i005'),false);
 assert.equal(n.events.filter(e=>e.type==='refill')[0]?.added,0);
});
test('no charm keeps original two-player victory behavior and never creates refill',()=>{
 const s=room(['d001']);s.players[1].hp=1;
 const n=effects(s);
 assert.equal(n.state.phase,'finished');
 assert.equal(n.state.winnerId,'A');
 assert.equal(n.state.players[1].hp,0);
 assert.equal(n.events.some(e=>e.type==='revive'),false);
 assert.deepEqual(n.state.players[1].hand.map(x=>x.definitionId),['d001']);
});
test('Sun Charm cannot be voluntarily discarded or selected to attack',()=>{
 const s=room(['i005','d001'],['i005','w016']);
 const id=s.players[0].hand[0].instanceId;
 assert.throws(()=>send(s,cmd(s,'A','discard',{orderedInstanceIds:[id]})),
   /cannot be discarded|Cannot|forbidden/i);
 assert.throws(()=>send(s,cmd(s,'A','playCards',{targetId:'B',orderedInstanceIds:[id]})));
 assert.equal(s.phase,'turn');
});
test('end-to-end staged attack causes one automatic revival after P2 chooses no defense',()=>{
 const s=room(['i005','d001'],['w016']);
 s.players[1].hp=5;
 const attacker=s.players[0].hand[0].instanceId;
 const first=send(s,cmd(s,'A','playCards',{targetId:'B',orderedInstanceIds:[attacker]}));
 assert.equal(first.state.phase,'defense');
 const untouched=JSON.stringify(s);
 const second=send(first.state,cmd(first.state,'B','defend',{orderedInstanceIds:[]}));
 assert.equal(second.autoResolved,true);
 assert.equal(second.state.players[1].hp,10);
 assert.equal(second.state.phase,'turn');
 assert.equal(second.state.activePlayerId,'B');
 assert.equal(second.state.players[1].hand[0].definitionId,'d001');
 assert.equal(second.state.players[1].hand[1].definitionId,'d001');
 assert.equal(second.events.some(e=>e.type==='revive'),true);
 assert.equal(JSON.stringify(s),untouched);
 const view=viewStagingRoom(second.state,'A');
 assert.equal(Object.hasOwn(view.players[1],'hand'),false);
 assert.equal(Object.hasOwn(view,'rngSeed'),false);
});
test('revival applies in three-seat game without changing unrelated C',()=>{
 const s=room(['i005'],['w016'],['d001','i002']);
 s.players[1].hp=1;
 const c=JSON.stringify(s.players[2]);
 const n=effects(s);
 assert.equal(n.state.players[1].hp,10);
 assert.equal(n.state.activePlayerId,'B');
 assert.equal(JSON.stringify(n.state.players[2]),c);
});
test('fatal trade remains separate: a revival charm cannot silently resolve Sell',()=>{
 const s=room(['i005'],['t001','w003']);
 s.players[1].hp=1;s.players[1].mp=0;s.players[1].money=0;
 const sel=s.players[0].hand;
 const command=cmd(s,'A','declareSale',{targetId:'B',
  saleInstanceId:sel[0].instanceId,soldInstanceId:sel[1].instanceId});
 const before=JSON.stringify(s);
 assert.throws(()=>send(s,command),/Lethal forced sale requires original zero-HP/);
 assert.equal(JSON.stringify(s),before);
});
