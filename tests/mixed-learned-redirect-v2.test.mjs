import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand,viewStagingRoom} from '../v2/staging-room.mjs';
import {compileOrderedWeaponAttack} from '../v2/ordered-attack.mjs';
import {resolveBasicFixture} from '../v2/basic-resolution.mjs';
import {resolveRedirectFixture} from '../v2/redirect-resolution.mjs';
import {resolveWallFixture} from '../v2/wall-resolution.mjs';
import {createMatch,playAuraWeaponAttack,defend} from '../src/match.mjs';
import {playPlusMiracleAttack} from '../src/plus-miracle.mjs';
import {findVerifiedBasicCard as oldCard} from '../src/verified-basic-cards.mjs';

const {byId:catalog}=migrateLegacyCatalog(),draw=()=>oldCard('d001');
function room(hand,{learned={},mp={},hp={}}={}){
 const s=createStagingRoom({seats:Object.entries(hand).map(([id,handDefinitionIds])=>({id,handDefinitionIds})),
  firstSeatId:'A',rngSeed:12345},catalog);
 for(const p of s.players){
   if(learned[p.id])p.learned=[...learned[p.id]];
   if(mp[p.id]!==undefined)p.mp=mp[p.id];
   if(hp[p.id]!==undefined)p.hp=hp[p.id];
 }
 return s;
}
function old(hand,{learned={},mp={},hp={}}={}){
 const s=createMatch({playerIds:Object.keys(hand),firstPlayerId:'A',rng:()=>0,draw});
 for(const p of s.players){
   p.hand=hand[p.id].map(oldCard);
   if(learned[p.id])p.learned=learned[p.id].map(oldCard);
   if(mp[p.id]!==undefined)p.mp=mp[p.id];
   if(hp[p.id]!==undefined)p.hp=hp[p.id];
 }
 return s;
}
const hand=(state,i)=>({instanceId:state.players[0].hand[i].instanceId});
const learned=id=>({learnedDefinitionId:id});
function attack(s,order,target='B'){
 const action={type:'playSequence',commandId:'mixed-attack-0',actorId:'A',expectedRevision:s.revision,
  targetId:target,orderedPlays:order};
 return applyStagingCommand(s,action,catalog,{authorizedSeatId:'A'}).state;
}
function defense(s,who,indices=[],options={}){
 const p=s.players.find(x=>x.id===who);
 const cmd={type:'defend',commandId:'defense-'+s.revision,actorId:who,expectedRevision:s.revision,
  orderedInstanceIds:indices.map(i=>p.hand[i].instanceId),...options};
 return applyStagingCommand(s,cmd,catalog,{authorizedSeatId:who}).state;
}
function finish(s){
 return resolveBasicFixture(s,catalog,{labOnly:true,fixtureDrawDefinitionId:'d001'});
}
function redirect(s,rng){
 return resolveRedirectFixture(s,catalog,{
  labOnly:true,fixtureDrawDefinitionId:'d001',
  ...(rng?{deflectRng:rng}:{})
 });
}
function parity(now,prior){
 assert.deepEqual(now.players.map(p=>[p.hp,p.mp,p.money,p.hand.length,p.learned]),
 prior.players.map(p=>[p.hp,p.mp,p.money,p.hand.length,p.learned.map(x=>x.id)]));
 assert.equal(now.phase,prior.phase);
 assert.equal(now.activePlayerId,prior.activePlayerId);
 assert.equal(now.winnerId,prior.winnerId);
}
test('mixed sequence preserves exact order with hand and learned sources',()=>{
 const s=room({A:['w016','a003'],B:['d005']},{learned:{A:['m004']}});
 const ordered=[hand(s,0),learned('m004'),hand(s,1)];
 const a=attack(s,ordered);
 assert.deepEqual(a.pending.attackSequence,ordered);
 assert.deepEqual(a.pending.attackInstanceIds,[s.players[0].hand[0].instanceId,s.players[0].hand[1].instanceId]);
 assert.equal(a.phase,'defense');
 assert.equal(JSON.stringify(s.pending), 'null');
 assert.equal(JSON.stringify(viewStagingRoom(a,'B')).includes('attackSequence'),false);
});
test('learned Aura between two weapons doubles all weapon power, old parity',()=>{
 const h={A:['w016','a003'],B:['d005']},options={learned:{A:['m004']}};
 const s=room(h,options);
 const r=finish(defense(attack(s,[hand(s,0),learned('m004'),hand(s,1)]),'B',[0]));
 const o=playAuraWeaponAttack(old(h,options),{playerId:'A',targetId:'B',handIndices:[0,1],learnedAuraId:'m004'},draw);
 parity(r.state,defend(o,{playerId:'B',handIndices:[0]},draw));
 assert.equal(r.plan.attack,26);
 assert.equal(r.state.players[0].hand.length,3);
 assert.equal(r.state.players[0].mp,4);
});
test('learned Fireball adds attack power and creates exactly one new draw, old parity',()=>{
 const h={A:['w016'],B:['d001']},options={learned:{A:['m005']}};
 const s=room(h,options);
 const r=finish(defense(attack(s,[hand(s,0),learned('m005')]),'B'));
 const o=playPlusMiracleAttack(old(h,options),{playerId:'A',targetId:'B',handIndices:[0],learnedPlusId:'m005'},draw);
 parity(r.state,defend(o,{playerId:'B',handIndices:[]},draw));
 assert.equal(r.state.players[0].hand.length,2);
 assert.equal(r.state.players[1].hp,28);
});
test('learned Meteor plus water weapon preserves water attribute',()=>{
 const h={A:['w021'],B:['d014']},options={learned:{A:['m006']}};
 const s=room(h,options);
 const staged=defense(attack(s,[hand(s,0),learned('m006')]),'B',[0]);
 const r=finish(staged);
 const o=playPlusMiracleAttack(old(h,options),{playerId:'A',targetId:'B',handIndices:[0],learnedPlusId:'m006'},draw);
 parity(r.state,defend(o,{playerId:'B',handIndices:[0]},draw));
 assert.equal(r.plan.element,'water');
 assert.equal(r.state.players[0].mp,3);
});
test('Spirit immediately after learned Aura waives MP while learned cast still grants draw',()=>{
 const s=room({A:['w016','i003'],B:['d001']},{learned:{A:['m004']},mp:{A:0}});
 const staged=defense(attack(s,[hand(s,0),learned('m004'),hand(s,1)]),'B');
 const compiled=compileOrderedWeaponAttack(staged,catalog);
 assert.equal(compiled.attack,20);
 assert.equal(compiled.payableMP,0);
 assert.equal(compiled.learnedDrawCount,1);
 const result=finish(staged).state;
 assert.equal(result.players[0].mp,0);
 assert.equal(result.players[0].hand.length,3);
 assert.equal(result.players[1].hp,20);
});
test('non-adjacent Spirit after learned Aura is invalid without mutating the state',()=>{
 const s=room({A:['w016','a003','i003'],B:['d001']},{learned:{A:['m004']}});
 const staged=defense(attack(s,[hand(s,0),learned('m004'),hand(s,1),hand(s,2)]),'B');
 const before=JSON.stringify(staged);
 assert.throws(()=>finish(staged),/Spirit must immediately follow/);
 assert.equal(JSON.stringify(staged),before);
});
test('two learned or mixed Fireballs in one attack are rejected until original behavior is verified',()=>{
 const h={A:['w016','m005'],B:['d001']},s=room(h,{learned:{A:['m005']}});
 const p=defense(attack(s,[hand(s,0),hand(s,1),learned('m005')]),'B');
 assert.throws(()=>finish(p),/Only identical verified hand-based plus pair/);
 const before=JSON.stringify(p);
 assert.equal(JSON.stringify(p),before);
});
test('cannot forge learned cast, replay same card or smuggle extra fields',()=>{
 const s=room({A:['w016'],B:['d001']},{learned:{A:['m004']}});
 const base=[hand(s,0)];
 assert.throws(()=>attack(s,[...base,learned('m005')]),/not learned/);
 assert.throws(()=>attack(s,[...base,hand(s,0)]),/Repeated card instance/);
 assert.throws(()=>attack(s,[...base,learned('m004'),learned('m004')]),/Repeated learned miracle/);
 assert.throws(()=>attack(s,[...base,{instanceId:base[0].instanceId,learnedDefinitionId:'m004'}]),/one source/);
 assert.throws(()=>attack(s,[learned('m004'),...base]),/Sequence must begin with weapon/);
 assert.equal(s.revision,0);
});
test('mixing input is idempotent, with exact order included in command fingerprint',()=>{
 const s=room({A:['w016','a003'],B:['d001']},{learned:{A:['m004']}});
 const first=[hand(s,0),learned('m004'),hand(s,1)];
 const cmd={type:'playSequence',actorId:'A',commandId:'same',expectedRevision:0,
  targetId:'B',orderedPlays:first};
 const one=applyStagingCommand(s,cmd,catalog,{authorizedSeatId:'A'}).state;
 const retry=applyStagingCommand(one,cmd,catalog,{authorizedSeatId:'A'});
 assert.strictEqual(retry.state,one);assert.equal(retry.duplicate,true);
 assert.throws(()=>applyStagingCommand(one,{...cmd,orderedPlays:[first[0],first[2],first[1]]},
  catalog,{authorizedSeatId:'A'}),/Conflicting commandId/);
});
test('reflected learned-Fireball weapon pays once, learns once and refills once',()=>{
 const h={A:['w016'],B:['w027']},s=room(h,{learned:{A:['m005']}});
 const first=redirect(defense(attack(s,[hand(s,0),learned('m005')]),'B',[0]));
 assert.equal(first.state.phase,'defense');
 assert.equal(first.state.activePlayerId,'A');
 assert.equal(first.state.players[0].mp,8);
 assert.deepEqual(first.state.players[0].learned,['m005']);
 assert.equal(first.state.pending.spentByPlayer.A,2);
 assert.equal(first.state.pending.spentByPlayer.B,1);
 assert.equal(first.state.players[0].hand.length,0);
 const next=redirect(defense(first.state,'A',[]));
 assert.equal(next.state.players[0].hp,28);
 assert.equal(next.state.players[0].mp,8);
 assert.equal(next.state.players[0].hand.length,2);
 assert.equal(next.state.players[1].hand.length,1);
 assert.equal(next.state.activePlayerId,'B');
});
test('two reflections never pay Aura twice, even after state JSON roundtrip',()=>{
 const h={A:['w016','w027'],B:['w027']};
 const s=room(h,{learned:{A:['m004']}});
 const first=redirect(defense(attack(s,[hand(s,0),learned('m004')]),'B',[0])).state;
 const second=redirect(defense(JSON.parse(JSON.stringify(first)),'A',[0])).state;
 assert.equal(second.pending.attackContext.attack,20);
 assert.equal(second.players[0].mp,4);
 assert.equal(second.pending.spentByPlayer.A,3);
 const final=redirect(defense(second,'B',[])).state;
 assert.equal(final.players[1].hp,20);
 assert.equal(final.players[0].mp,4);
 assert.equal(final.players[0].hand.length,3);
 assert.equal(final.activePlayerId,'B');
});
test('deflection to self resolves boosted attack, without permitting extra defense',()=>{
 const h={A:['w016','m005'],B:['w026']},s=room(h);
 const first=defense(attack(s,[hand(s,0),hand(s,1)]),'B',[0]);
 const outcome=redirect(first,()=>0.99);
 assert.equal(outcome.immediate,true);
 assert.equal(outcome.state.phase,'turn');
 assert.equal(outcome.state.players[1].hp,28);
 assert.equal(outcome.state.players[0].mp,8);
 assert.deepEqual(outcome.state.players[0].learned,['m005']);
 assert.equal(outcome.state.players[0].hand.length,2);
});
test('Wall stops learned Aura weapon without dropping MP or draw credits',()=>{
 const h={A:['w016'],B:['m001']},s=room(h,{learned:{A:['m004']}});
 const incoming=defense(attack(s,[hand(s,0),learned('m004')]),'B',[0]);
 const r=resolveWallFixture(incoming,catalog,{labOnly:true,fixtureDrawDefinitionId:'d001'}).state;
 assert.equal(r.players[0].mp,4);
 assert.equal(r.players[0].hand.length,2);
 assert.equal(r.players[1].hp,40);
 assert.deepEqual(r.players[0].learned,['m004']);
});
test('learned boosted self-attack is refused before any payment',()=>{
 const s=room({A:['w016'],B:['d001']},{learned:{A:['m005']}});
 const staged=attack(s,[hand(s,0),learned('m005')],'A');
 const original=JSON.stringify(staged);
 assert.throws(()=>finish(staged),/Boosted self-target attack has not been verified/);
 assert.equal(JSON.stringify(staged),original);
});
