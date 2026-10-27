import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand,viewStagingRoom} from '../v2/staging-room.mjs';
import {compileSoloMiracleResolution,resolveSoloMiracleFixture} from '../v2/miracle-resolution.mjs';
import {createMatch,playMiracleAttack,defend} from '../src/match.mjs';
import {findVerifiedBasicCard as oldCard} from '../src/verified-basic-cards.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const draw=()=>oldCard('d001');
function lab(hands,{mp={},hp={},learned={}}={}){
 const players=Object.keys(hands);
 const room=createStagingRoom({seats:players.map(id=>({id,handDefinitionIds:hands[id]})),
  firstSeatId:'A'},catalog);
 for(const p of room.players){
  if(mp[p.id]!==undefined)p.mp=mp[p.id];
  if(hp[p.id]!==undefined)p.hp=hp[p.id];
  if(learned[p.id])p.learned=[...learned[p.id]];
 }
 return room;
}
function stage(s,{attack=[0],defense=[],target='B'}={}){
 const actor=s.players[0],a=applyStagingCommand(s,{
  commandId:'miracle-attack',actorId:'A',type:'playCards',targetId:target,
  expectedRevision:0,orderedInstanceIds:attack.map(i=>actor.hand[i].instanceId)
 },catalog,{authorizedSeatId:'A'}).state;
 if(target==='A')return a;
 return applyStagingCommand(a,{commandId:'miracle-defense',actorId:target,type:'defend',
  expectedRevision:1,orderedInstanceIds:defense.map(i=>a.players.find(p=>p.id===target).hand[i].instanceId)
 },catalog,{authorizedSeatId:target}).state;
}
const resolve=s=>resolveSoloMiracleFixture(s,catalog,{labOnly:true,fixtureDrawDefinitionId:'d001'});
function old(hands,{attack=[0],defense=[],target='B',mp={},hp={}}={}){
 let s=createMatch({playerIds:Object.keys(hands),firstPlayerId:'A',draw,rng:()=>0});
 for(const p of s.players){
  p.hand=hands[p.id].map(oldCard);
  if(mp[p.id]!==undefined)p.mp=mp[p.id];
  if(hp[p.id]!==undefined)p.hp=hp[p.id];
 }
 const p=playMiracleAttack(s,{playerId:'A',targetId:target,handIndex:attack[0],
  ...(attack.length===2?{spiritHandIndex:attack[1]}:{})},draw);
 return target==='A'?p:defend(p,{playerId:target,handIndices:defense},draw);
}
function parity(v1,v2){
 assert.deepEqual(v1.players.map(p=>[p.hp,p.mp,p.money,p.hand.length,p.learned.map(x=>x.id)]),
  v2.players.map(p=>[p.hp,p.mp,p.money,p.hand.length,p.learned]));
 assert.equal(v1.phase,v2.phase);assert.equal(v1.activePlayerId,v2.activePlayerId);
 assert.equal(v1.winnerId,v2.winnerId);
}
test('ice miracle costs MP2, becomes learned and draws one on first use',()=>{
 const hands={A:['m002'],B:['d001']};
 const state=stage(lab(hands));
 const original=JSON.stringify(state),plan=compileSoloMiracleResolution(state,catalog);
 assert.equal(plan.attack,4);assert.equal(plan.payableMP,2);
 assert.deepEqual(plan.queue.map(x=>x.type),['spend','mp','learn','spend','hit','refill','advance']);
 assert.equal(JSON.stringify(state),original);
 const result=resolve(state);
 parity(old(hands),result.state);
 assert.equal(result.state.players[0].hand.length,1);
 assert.deepEqual(result.state.players[0].learned,['m002']);
 assert.equal(result.state.players[1].hp,36);
});
test('ice versus compatible fire armor is reduced by guard',()=>{
 const hands={A:['m002'],B:['d014']};
 const result=resolve(stage(lab(hands),{defense:[0]}));
 parity(old(hands,{defense:[0]}),result.state);
 assert.equal(result.state.players[1].hp,39);
});
test('incompatible shield for miracle is rejected without mutation',()=>{
 const hands={A:['m002'],B:['d001']};
 const state=stage(lab(hands),{defense:[0]}),serialized=JSON.stringify(state);
 assert.throws(()=>resolve(state),/Illegal shield/);
 assert.equal(JSON.stringify(state),serialized);
});
test('dark miracle pierces incomplete guard and causes instant defeat',()=>{
 const hands={A:['m003'],B:['d001']};
 const result=resolve(stage(lab(hands),{defense:[0]}));
 parity(old(hands,{defense:[0]}),result.state);
 assert.equal(result.state.winnerId,'A');
 assert.equal(result.plan.hit.instantDefeat,true);
});
test('dark miracle fully guarded does not cause instant defeat',()=>{
 const hands={A:['m003'],B:['d005']};
 const result=resolve(stage(lab(hands),{defense:[0]}));
 parity(old(hands,{defense:[0]}),result.state);
 assert.equal(result.state.players[1].hp,40);
});
test('angel armor stops a water miracle rather than subtracting numeric guard',()=>{
 const hands={A:['m002'],B:['d018']};
 const result=resolve(stage(lab(hands),{defense:[0]}));
 parity(old(hands,{defense:[0]}),result.state);
 assert.equal(result.plan.stopped,true);assert.equal(result.state.players[1].hp,40);
});
test('angel armor stops dark instant death and must be selected alone',()=>{
 const hands={A:['m003'],B:['d021','d001']};
 const result=resolve(stage(lab(hands),{defense:[0]}));
 parity(old(hands,{defense:[0]}),result.state);
 assert.equal(result.plan.hit.instantDefeat,false);
 const invalid=stage(lab(hands),{defense:[0,1]});
 assert.throws(()=>resolve(invalid),/selected alone/);
});
test('rainbow curtain then ordinary guard removes light attack attribute',()=>{
 const hands={A:['m006'],B:['i001','d001']};
 const r=resolve(stage(lab(hands),{defense:[0,1]}));
 parity(old(hands,{defense:[0,1]}),r.state);
 assert.equal(r.state.players[1].hp,31);
});
test('spirit doll directly after a hand miracle makes its MP free and draws for both',()=>{
 const hands={A:['m006','i003'],B:['d001']},opts={attack:[0,1],mp:{A:0}};
 const result=resolve(stage(lab(hands,{mp:opts.mp}),opts));
 parity(old(hands,opts),result.state);
 assert.equal(result.plan.payableMP,0);assert.equal(result.state.players[0].mp,0);
 assert.equal(result.state.players[0].hand.length,2);
});
test('cannot cast if MP is insufficient and no spirit is selected',()=>{
 const hands={A:['m003'],B:['d001']};
 const s=stage(lab(hands,{mp:{A:4}})),unchanged=JSON.stringify(s);
 assert.throws(()=>resolve(s),/Not enough MP/);
 assert.equal(JSON.stringify(s),unchanged);
});
test('a lone Aura or wall is not treated as a solo offensive miracle',()=>{
 const hands={A:['m004','m001'],B:['d001']};
 const s=lab(hands);
 assert.throws(()=>stage(s,{attack:[0]}),/Attack must start/);
 assert.throws(()=>stage(s,{attack:[1]}),/Not a structural attack/);
});
test('unverified miracle plus weapon or two attack miracles is rejected',()=>{
 const hands={A:['m002','m005','w016'],B:['d001']};
 const a=stage(lab(hands),{attack:[0,1]});
 assert.throws(()=>resolve(a),/Only spirit directly after miracle/);
 const b=stage(lab(hands),{attack:[0,2]});
 assert.throws(()=>resolve(b),/Only spirit directly after miracle/);
});
test('miracle with super mirror defense stays blocked until effect is researched',()=>{
 const hands={A:['m002'],B:['i002']};
 const s=stage(lab(hands),{defense:[0]});
 assert.throws(()=>resolve(s),/Unsupported miracle defense effect redirectAttack/);
});
test('self-cast dark miracle cannot be defended and awards victory to opponent',()=>{
 const hands={A:['m003'],B:['d001']};
 const r=resolve(stage(lab(hands),{target:'A'}));
 parity(old(hands,{target:'A'}),r.state);
 assert.equal(r.state.phase,'finished');assert.equal(r.state.winnerId,'B');
});
test('learned miracles are stored as definition IDs with FIFO limit of six',()=>{
 const hands={A:['m002'],B:['d001']};
 const state=lab(hands,{learned:{A:['old1','old2','old3','old4','old5','old6']}});
 const result=resolve(stage(state));
 assert.deepEqual(result.state.players[0].learned,['old2','old3','old4','old5','old6','m002']);
 assert.equal(JSON.stringify(viewStagingRoom(result.state,'B')).includes('old6'),false);
});
test('test-only fixed draws cannot run without explicit labOnly option',()=>{
 const s=stage(lab({A:['m002'],B:['d001']}));
 assert.throws(()=>resolveSoloMiracleFixture(s,catalog,{fixtureDrawDefinitionId:'d001'}),/lab fixture/);
});
