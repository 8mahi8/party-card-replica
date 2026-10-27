import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {compileBasicWeaponAttack,resolveBasicFixture} from '../v2/basic-resolution.mjs';
import {compileOrderedWeaponAttack} from '../v2/ordered-attack.mjs';
import {resolveRedirectFixture} from '../v2/redirect-resolution.mjs';
import {resolveWallFixture} from '../v2/wall-resolution.mjs';
import {createMatch,playAuraWeaponAttack,defend} from '../src/match.mjs';
import {playPlusMiracleAttack,playStackedPlusMiracles} from '../src/plus-miracle.mjs';
import {findVerifiedBasicCard as oldCard} from '../src/verified-basic-cards.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const draw=()=>oldCard('d001');
function create(hands,{mp={},learned={}}={}){
 const state=createStagingRoom({seats:Object.entries(hands).map(([id,handDefinitionIds])=>({id,handDefinitionIds})),
  firstSeatId:'A'},catalog);
 for(const p of state.players){
  if(mp[p.id]!==undefined)p.mp=mp[p.id];
  if(learned[p.id])p.learned=[...learned[p.id]];
 }
 return state;
}
function stage(state,{attack,defense=[],target='B'}){
 const a=state.players.find(x=>x.id==='A');
 const p=applyStagingCommand(state,{
  commandId:'combo-a',actorId:'A',expectedRevision:state.revision,type:'playCards',targetId:target,
  orderedInstanceIds:attack.map(i=>a.hand[i].instanceId)
 },catalog,{authorizedSeatId:'A'}).state;
 if(target==='A')return p;
 const b=p.players.find(x=>x.id===target);
 return applyStagingCommand(p,{
  commandId:'combo-b',actorId:target,expectedRevision:p.revision,type:'defend',
  orderedInstanceIds:defense.map(i=>b.hand[i].instanceId)
 },catalog,{authorizedSeatId:target}).state;
}
function old(hands,{mp={}}={}){
 const state=createMatch({playerIds:Object.keys(hands),firstPlayerId:'A',rng:()=>0,draw});
 for(const p of state.players){p.hand=hands[p.id].map(oldCard);if(mp[p.id]!==undefined)p.mp=mp[p.id];}
 return state;
}
function compare(a,b){
 assert.deepEqual(a.players.map(x=>[x.hp,x.mp,x.money,x.hand.length,x.learned.map(z=>z.id)]),
 b.players.map(x=>[x.hp,x.mp,x.money,x.hand.length,x.learned]));
 assert.equal(a.phase,b.phase);assert.equal(a.activePlayerId,b.activePlayerId);
 assert.equal(a.winnerId,b.winnerId);
}
const settle=s=>resolveBasicFixture(s,catalog,{labOnly:true,fixtureDrawDefinitionId:'d001'});
const plan=s=>compileBasicWeaponAttack(s,catalog);
test('Aura + main and extra weapon doubles ALL weapon power (old engine parity)',()=>{
 const h={A:['w016','a003','m004'],B:['d005']};
 const s=stage(create(h),{attack:[0,1,2],defense:[0]});
 const p=plan(s);assert.equal(p.attack,26);assert.equal(p.element,'none');
 assert.deepEqual(p.learnedMiracles,['m004']);assert.equal(p.payableMP,6);
 const result=settle(s);
 const legacy=playAuraWeaponAttack(old(h),{playerId:'A',targetId:'B',handIndices:[0,1],auraHandIndex:2},draw);
 compare(defend(legacy,{playerId:'B',handIndices:[0]},draw),result.state);
 assert.equal(result.state.players[1].hp,19);
});
test('Aura before extra weapon still doubles the later extra weapon',()=>{
 const h={A:['w016','m004','a003'],B:['d005']};
 const s=stage(create(h),{attack:[0,1,2],defense:[0]});
 const p=plan(s);
 assert.equal(p.attack,26);assert.deepEqual(p.selectedKinds,['weapon','miracle','weapon']);
 const result=settle(s);
 const oldPending=playAuraWeaponAttack(old(h),{playerId:'A',targetId:'B',handIndices:[0,2],auraHandIndex:1},draw);
 compare(defend(oldPending,{playerId:'B',handIndices:[0]},draw),result.state);
});
test('Aura following weapon and directly adjacent spirit waives only its MP',()=>{
 const h={A:['w016','m004','i003'],B:['d001']},s=stage(create(h,{mp:{A:0}}),{attack:[0,1,2]});
 const p=plan(s);assert.equal(p.attack,20);assert.equal(p.payableMP,0);
 const result=settle(s).state;
 assert.equal(result.players[0].mp,0);assert.equal(result.players[0].hand.length,3);
 assert.deepEqual(result.players[0].learned,['m004']);
 assert.equal(result.players[1].hp,20);
});
test('Aura plus attack-bonus armor is refused until original priority is researched',()=>{
 const h={A:['w016','d010','m004'],B:['d001']};
 const s=stage(create(h),{attack:[0,1,2]});
 assert.throws(()=>plan(s),/armor bonus unverified/);
 assert.equal(s.players[0].mp,10);
});
test('Fireball adds two and uses neutral mixed attribute as legacy did',()=>{
 const h={A:['w016','m005'],B:['d001']};
 const s=stage(create(h),{attack:[0,1]});
 assert.equal(plan(s).attack,12);assert.equal(plan(s).element,'none');
 const p=playPlusMiracleAttack(old(h),{playerId:'A',targetId:'B',handIndices:[0],plusHandIndex:1},draw);
 compare(defend(p,{playerId:'B',handIndices:[]},draw),settle(s).state);
});
test('Meteor plus water weapon leaves water attribute (light mixing exception)',()=>{
 const h={A:['w021','m006'],B:['d014']};
 const s=stage(create(h),{attack:[0,1],defense:[0]});
 assert.equal(plan(s).attack,11);assert.equal(plan(s).element,'water');
 const p=playPlusMiracleAttack(old(h),{playerId:'A',targetId:'B',handIndices:[0],plusHandIndex:1},draw);
 compare(defend(p,{playerId:'B',handIndices:[0]},draw),settle(s).state);
});
test('two consecutive Fireballs add four, cost MP4, and learn one definition',()=>{
 const h={A:['w016','m005','m005'],B:['d001']};
 const s=stage(create(h),{attack:[0,1,2]});
 assert.equal(plan(s).attack,14);assert.equal(plan(s).payableMP,4);
 const p=playStackedPlusMiracles(old(h),{playerId:'A',targetId:'B',handIndices:[0],plusHandIndices:[1,2]},draw);
 compare(defend(p,{playerId:'B'},draw),settle(s).state);
 assert.deepEqual(settle(s).state.players[0].learned,['m005']);
});
test('spirit after second Fireball waives only second MP2, preserves original comparison',()=>{
 const h={A:['w016','m005','m005','i003'],B:['d001']};
 const s=stage(create(h,{mp:{A:2}}),{attack:[0,1,2,3]});
 const p=plan(s);
 assert.equal(p.payableMP,2);assert.equal(p.attack,14);
 const orig=playStackedPlusMiracles(old(h,{mp:{A:2}}),{
  playerId:'A',targetId:'B',handIndices:[0],plusHandIndices:[1,2],spiritHandIndex:3
 },draw);
 compare(defend(orig,{playerId:'B'},draw),settle(s).state);
});
test('Fireball plus first weapon receives extra draw and learns the miracle',()=>{
 const h={A:['w016','m005'],B:['d001']};
 const r=settle(stage(create(h),{attack:[0,1]}));
 assert.deepEqual(r.state.players[0].learned,['m005']);
 assert.equal(r.state.players[0].hand.length,2);
 assert.equal(r.state.players[0].mp,8);
});
test('cost errors are atomic for Aura, Fireball and two Fireballs',()=>{
 for(const h of [
  ['w016','m004'],['w016','m005'],['w016','m005','m005']
 ]){
  const s=stage(create({A:h,B:['d001']},{mp:{A:1}}),{attack:h.map((_,i)=>i)});
  const before=JSON.stringify(s);
  assert.throws(()=>settle(s),/Not enough MP/);
  assert.equal(JSON.stringify(s),before);
 }
});
test('spirit must immediately follow a miracle; may not float after another weapon',()=>{
 const h={A:['w016','m004','a003','i003'],B:['d001']};
 const s=stage(create(h),{attack:[0,1,2,3]});
 assert.throws(()=>plan(s),/Spirit must immediately follow/);
});
test('two Spirits cannot waive the same miracle twice',()=>{
 const h={A:['w016','m005','i003','i003'],B:['d001']};
 const s=stage(create(h),{attack:[0,1,2,3]});
 assert.throws(()=>plan(s),/Spirit must immediately follow/);
});
test('unknown combo of Aura plus Fireball and multiple Auras fails closed',()=>{
 for(const ids of [['w016','m004','m005'],['w016','m004','m004']]){
  const s=stage(create({A:ids,B:['d001']}),{attack:[0,1,2]});
  assert.throws(()=>plan(s),/Aura stacked/);
 }
});
test('two mixed plus miracles are rejected until their combination is verified',()=>{
 const s=stage(create({A:['w016','m005','m006'],B:['d001']}),{attack:[0,1,2]});
 assert.throws(()=>plan(s),/Only two Fireballs verified/);
});
test('weapon after additive miracle is rejected pending gameplay evidence',()=>{
 const s=stage(create({A:['w016','m005','a003'],B:['d001']}),{attack:[0,1,2]});
 assert.throws(()=>plan(s),/Weapon or armor after plus miracle unverified/);
});
test('ordinary cards still use the normal queued attack path',()=>{
 const h={A:['w016','a003'],B:['d005']};
 const s=stage(create(h),{attack:[0,1],defense:[0]});
 const p=plan(s);
 assert.equal(p.hasModifiers,false);assert.equal(p.attack,13);
 assert.equal(p.payableMP,0);assert.deepEqual(p.learnedMiracles,[]);
 const settled=settle(s);
 assert.equal(settled.state.players[1].hp,32);
});
test('Wall stops a boosted neutral weapon but attack magic still spends MP and learns',()=>{
 const h={A:['w016','m004'],B:['m001']};
 const s=stage(create(h),{attack:[0,1],defense:[0]});
 const r=resolveWallFixture(s,catalog,{labOnly:true,fixtureDrawDefinitionId:'d001'});
 assert.equal(r.state.players[1].hp,40);assert.equal(r.state.players[0].mp,4);
 assert.deepEqual(r.state.players[0].learned,['m004']);
 assert.deepEqual(r.state.players[1].learned,['m001']);
});
test('boosted weapon reflect declines explicitly rather than dropping miracle cost',()=>{
 const h={A:['w016','m005'],B:['w027']};
 const s=stage(create(h),{attack:[0,1],defense:[0]});
 const before=JSON.stringify(s);
 assert.throws(()=>resolveRedirectFixture(s,catalog,{labOnly:true,fixtureDrawDefinitionId:'d001'}),
  /Boosted weapon reactions/);
 assert.equal(JSON.stringify(s),before);
});
test('selected hand instance IDs are all consumed, replaced and unique',()=>{
 const h={A:['w016','m005','m005','i003'],B:['d001']};
 const s=stage(create(h),{attack:[0,1,2,3]});
 const oldIds=s.players[0].hand.map(x=>x.instanceId);
 const result=settle(s).state;
 assert.equal(result.players[0].hand.length,4);
 assert.equal(oldIds.some(x=>result.players[0].hand.some(y=>y.instanceId===x)),false);
 const instances=result.players.flatMap(p=>p.hand.map(x=>x.instanceId));
 assert.equal(instances.length,new Set(instances).size);
});
