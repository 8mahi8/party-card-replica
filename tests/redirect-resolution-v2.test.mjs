import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand,viewStagingRoom} from '../v2/staging-room.mjs';
import {resolveRedirectFixture} from '../v2/redirect-resolution.mjs';
import {createMatch,playAttack,defend} from '../src/match.mjs';
import {findVerifiedBasicCard as oldCard} from '../src/verified-basic-cards.mjs';
const {byId:catalog}=migrateLegacyCatalog();
const draw=()=>oldCard('d001');
function setup(hands,hp={}){
 const ids=Object.keys(hands);
 const s=createStagingRoom({seats:ids.map(id=>({id,handDefinitionIds:hands[id]})),firstSeatId:'A',rngSeed:123456},catalog);
 for(const [id,n] of Object.entries(hp))s.players.find(x=>x.id===id).hp=n;
 return s;
}
function oldSetup(hands,hp={}){
 const ids=Object.keys(hands),s=createMatch({playerIds:ids,firstPlayerId:'A',draw,rng:()=>0});
 s.players.forEach(p=>p.hand=hands[p.id].map(oldCard));
 for(const [id,n] of Object.entries(hp))s.players.find(x=>x.id===id).hp=n;
 return s;
}
function submit(state,actorId,type,indices,commandId,targetId){
 const who=state.players.find(x=>x.id===actorId);
 return applyStagingCommand(state,{
  commandId,actorId,type,expectedRevision:state.revision,
  orderedInstanceIds:indices.map(i=>who.hand[i].instanceId),
  ...(type==='playCards'?{targetId}:{}),
 },catalog,{authorizedSeatId:actorId}).state;
}
const attack=(s,indices=[0],target='B')=>submit(s,'A','playCards',indices,'attack-1',target);
const respond=(s,who,indices,serial)=>submit(s,who,'defend',indices,'defend-'+serial);
const resolve=(s,rng)=>resolveRedirectFixture(s,catalog,{
 labOnly:true,fixtureDrawDefinitionId:'d001',...(rng?{deflectRng:rng}:{})
});
function parity(a,b){
 assert.deepEqual(a.players.map(x=>[x.hp,x.hand.length,x.mp,x.money]),
  b.players.map(x=>[x.hp,x.hand.length,x.mp,x.money]));
 assert.equal(a.phase,b.phase);assert.equal(a.activePlayerId,b.activePlayerId);
 assert.equal(a.winnerId,b.winnerId);
}
test('normal defense routes to existing basic resolver without redirect',()=>{
 const s=respond(attack(setup({A:['w016'],B:['d005']})),'B',[0],1);
 const r=resolve(s);
 assert.equal(r.state.phase,'turn');assert.equal(r.state.players[1].hp,35);
 assert.equal(r.state.pending,null);
});
test('reflect routes back to attacker, keeps original turn owner for advancing',()=>{
 const hands={A:['w016','d003'],B:['w027','d001']};
 const s=respond(attack(setup(hands)),'B',[0],1);
 const first=resolve(s);
 assert.equal(first.state.phase,'defense');assert.equal(first.state.activePlayerId,'A');
 assert.equal(first.state.pending.originalAttackerId,'A');
 assert.equal(first.state.pending.sourceId,'B');
 assert.equal(first.state.pending.targetId,'A');
 assert.equal(first.state.pending.attackContext.attack,10);
 assert.deepEqual(first.state.players.map(p=>p.hand.length),[1,1]);
 const f=resolve(respond(first.state,'A',[0],2));
 const oldPending=playAttack(oldSetup(hands),{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const oldRefl=defend(oldPending,{playerId:'B',handIndices:[0]},draw);
 const oldFinal=defend(oldRefl,{playerId:'A',handIndices:[0]},draw);
 parity(f.state,oldFinal);
 assert.equal(f.state.players[0].hp,33);
 assert.equal(f.state.activePlayerId,'B');
});
test('deflect to self hits immediately and uses no further defense opportunity',()=>{
 const hands={A:['w016'],B:['w026','d009']};
 const s=respond(attack(setup(hands)),'B',[0],1);
 const f=resolve(s,()=>0.99);
 const oldPending=playAttack(oldSetup(hands),{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const oldResult=defend(oldPending,{playerId:'B',handIndices:[0]},draw,()=>0.99);
 parity(f.state,oldResult);
 assert.equal(f.immediate,true);
 assert.equal(f.state.players[1].hp,30);
 assert.equal(f.events.some(x=>x.type==='redirect'&&x.to==='B'),true);
});
test('deflect to third person offers new defense and keeps original turn',()=>{
 const hands={A:['w016'],B:['w026'],C:['d005']};
 const first=resolve(respond(attack(setup(hands)),'B',[0],1),()=>0.8);
 assert.equal(first.state.activePlayerId,'C');
 const final=resolve(respond(first.state,'C',[0],2));
 const o=oldSetup(hands);const p=playAttack(o,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const r=defend(p,{playerId:'B',handIndices:[0]},draw,()=>0.8);
 const fin=defend(r,{playerId:'C',handIndices:[0]},draw);
 parity(final.state,fin);
 assert.deepEqual(final.state.players.map(p=>p.hp),[40,40,35]);
});
test('double reflection chain preserves attack and original owner',()=>{
 const hands={A:['w016','w027','d001'],B:['w027','d001']};
 const f1=resolve(respond(attack(setup(hands)),'B',[0],1));
 const f2=resolve(respond(f1.state,'A',[0],2));
 assert.equal(f2.state.activePlayerId,'B');
 assert.equal(f2.state.pending.attackContext.attack,10);
 const fin=resolve(respond(f2.state,'B',[0],3));
 const old1=playAttack(oldSetup(hands),{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const old2=defend(old1,{playerId:'B',handIndices:[0]},draw);
 const old3=defend(old2,{playerId:'A',handIndices:[0]},draw);
 const oldFin=defend(old3,{playerId:'B',handIndices:[0]},draw);
 parity(fin.state,oldFin);
 assert.equal(fin.state.players[1].hp,31);
 assert.equal(fin.state.turnCount,1);
});
test('super mirror can reflect light while neutral-weapon reflector cannot',()=>{
 const hands={A:['w024'],B:['i002','w027']};
 const s=attack(setup(hands));
 const invalid=respond(s,'B',[1],1);
 const before=JSON.stringify(invalid);
 assert.throws(()=>resolve(invalid),/Reaction cannot redirect/);
 assert.equal(JSON.stringify(invalid),before);
 const refl=resolve(respond(s,'B',[0],2));
 const fin=resolve(respond(refl.state,'A',[],3));
 const p=playAttack(oldSetup(hands),{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const r=defend(p,{playerId:'B',handIndices:[0]},draw);
 const oldFin=defend(r,{playerId:'A',handIndices:[]},draw);
 parity(fin.state,oldFin);
 assert.equal(fin.state.players[0].hp,37);
});
test('reflected hit can eliminate original turn owner with no refill for dead',()=>{
 const hands={A:['w016'],B:['i002']};
 const first=resolve(respond(attack(setup(hands,{A:5})),'B',[0],1));
 const final=resolve(respond(first.state,'A',[],2));
 const o=oldSetup(hands,{A:5});const p=playAttack(o,{playerId:'A',targetId:'B',handIndices:[0]},draw);
 const r=defend(p,{playerId:'B',handIndices:[0]},draw);
 const oldFin=defend(r,{playerId:'A',handIndices:[]},draw);
 parity(final.state,oldFin);
 assert.equal(final.state.phase,'finished');assert.equal(final.state.winnerId,'B');
});
test('redirect with multiple selected defenses is rejected atomically',()=>{
 const s=respond(attack(setup({A:['w006'],B:['w027','d001']})),'B',[0,1],1);
 const before=JSON.stringify(s);
 assert.throws(()=>resolve(s),/selected alone/);
 assert.equal(JSON.stringify(s),before);
});
test('invalid redirect cannot spend cards or advance revision',()=>{
 const s=respond(attack(setup({A:['w024'],B:['w027']})),'B',[0],1);
 const original=JSON.stringify(s);
 assert.throws(()=>resolve(s),/cannot redirect/);
 assert.equal(JSON.stringify(s),original);
});
test('deterministic deflection uses room rngSeed and advances it only for deflect',()=>{
 const one=respond(attack(setup({A:['w016'],B:['w026'],C:['d001']})),'B',[0],1);
 const a=resolve(one),b=resolve(JSON.parse(JSON.stringify(one)));
 assert.equal(a.state.pending?.targetId,b.state.pending?.targetId);
 assert.deepEqual(a.events,b.events);
 assert.notEqual(a.state.rngSeed,one.rngSeed);
 const refl=respond(attack(setup({A:['w016'],B:['w027']})),'B',[0],1);
 assert.equal(resolve(refl).state.rngSeed,refl.rngSeed);
});
test('next responder sees only own cards, not any spent card or internal attack context',()=>{
 const first=resolve(respond(attack(setup({A:['w016','d001'],B:['w027']})),'B',[0],1));
 const v=viewStagingRoom(first.state,'A');
 assert.equal(v.pending.targetId,'A');
 assert.equal(v.pending.sourceId,'B');
 assert.equal(JSON.stringify(v).includes('attackContext'),false);
 assert.equal(JSON.stringify(v).includes('processedCommands'),false);
 assert.equal(Object.hasOwn(v.players[1],'hand'),false);
});
test('redirect chain survives JSON serialization and remains deterministic',()=>{
 const first=resolve(respond(attack(setup({A:['w016','d001'],B:['w027']})),'B',[0],1));
 const s=JSON.parse(JSON.stringify(first.state));
 assert.deepEqual(s,first.state);
 const f=resolve(respond(s,'A',[],2));
 assert.equal(f.state.players[0].hp,30);
 assert.equal(f.state.activePlayerId,'B');
});
test('direct self attack still resolves in redirect entrypoint with no response',()=>{
 const s=attack(setup({A:['w006'],B:['d001']}),[0],'A');
 const r=resolve(s);
 assert.equal(r.state.players[0].hp,37);
 assert.equal(r.state.activePlayerId,'B');
});
test('fixture gate rejects use outside explicit lab mode',()=>{
 const s=respond(attack(setup({A:['w016'],B:['w027']})),'B',[0],1);
 assert.throws(()=>resolveRedirectFixture(s,catalog,{fixtureDrawDefinitionId:'d001'}),/lab fixture/);
});
