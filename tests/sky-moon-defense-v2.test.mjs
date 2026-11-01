import test from 'node:test';
import assert from 'node:assert/strict';
import {RESEARCH_CATALOG_CONTRACT} from './helpers/research-catalog-contract.mjs';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,applyStagingCommand} from '../v2/staging-room.mjs';
import {resolveStagedFixture,submitAndResolveFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const fixture={labOnly:true,fixtureDrawDefinitionId:'d001'};
const SKY=[['d022',1],['d023',3],['d024',5],['d025',7],['d026',9]];
const MOON=[['d027',8],['d028',10],['d029',12]];
function room(hands,{mp={},learned={},rngSeed=31}={}){
 const s=createStagingRoom({
  seats:Object.entries(hands).map(([id,handDefinitionIds])=>({id,handDefinitionIds})),
  firstSeatId:'A',rngSeed
 },catalog);
 for(const p of s.players){
  if(mp[p.id]!==undefined)p.mp=mp[p.id];
  if(learned[p.id])p.learned=[...learned[p.id]];
 }
 return s;
}
const instance=(s,id,n=0)=>s.players.find(x=>x.id===id).hand[n].instanceId;
function send(s,id,type,more={}){
 return applyStagingCommand(s,{type,commandId:'sky-'+id+'-'+s.revision,
  actorId:id,expectedRevision:s.revision,...more},catalog,{authorizedSeatId:id}).state;
}
function attack(s,definitionId='m002'){
 const index=s.players[0].hand.findIndex(x=>x.definitionId===definitionId);
 if(index<0)throw Error('Missing requested attacker card');
 return send(s,'A','playCards',{targetId:'B',orderedInstanceIds:[instance(s,'A',index)]});
}
const defend=(s,id,indices=[])=>send(s,id,'defend',{orderedInstanceIds:indices.map(i=>instance(s,id,i))});
const resolve=(s,deflectRng=null)=>resolveStagedFixture(s,catalog,{...fixture,deflectRng});

test('all five Sky and three Moonlight armors have cited guard, price and miracle-only effect',()=>{
 const {summary}=migrateLegacyCatalog();
 assert.equal(summary.unique,RESEARCH_CATALOG_CONTRACT.unique);assert.equal(summary.slots,RESEARCH_CATALOG_CONTRACT.slots);assert.equal(summary.complete,false);
 for(const [id,guard] of SKY){
  const d=catalog.get(id);
  assert.equal(d.stats.guard,guard,id);assert.equal(d.stats.price,5,id);
  assert.equal(d.drawWeight,1,id);assert.deepEqual(d.playModes,['defend']);
  assert.deepEqual(d.effects[0].params,{mode:'deflect',scope:'miracle'},id);
 }
 for(const [id,guard] of MOON){
  const d=catalog.get(id);
  assert.equal(d.stats.guard,guard,id);assert.equal(d.stats.price,10,id);
  assert.equal(d.drawWeight,1,id);
  assert.deepEqual(d.effects[0].params,{mode:'reflect',scope:'miracle'},id);
 }
});
test('each Moonlight armor sends water miracle to its caster, who can defend',()=>{
 for(const [id] of MOON){
  let state=attack(room({A:['m002','d014'],B:[id]}));
  const first=resolve(defend(state,'B',[0]));
  assert.equal(first.redirected,true,id);
  assert.equal(first.plan.mode,'reflect',id);
  assert.equal(first.state.activePlayerId,'A',id);
  assert.equal(first.state.players[0].mp,8,id);
  assert.equal(first.state.players[1].hand.length,0,id);
  state=defend(first.state,'A',[0]);
  const last=resolve(state).state;
  assert.equal(last.players[0].hp,39,id);
  assert.equal(last.players[0].mp,8,id);
  assert.equal(last.players[1].hand.length,1,id);
  assert.equal(last.activePlayerId,'B',id);
 }
});
test('each Sky armor deflects water miracle to the original attacker with RNG0',()=>{
 for(const [id] of SKY){
  const stage=defend(attack(room({A:['m002'],B:[id]})),'B',[0]);
  const first=resolve(stage,()=>0);
  assert.equal(first.redirected,true,id);
  assert.equal(first.plan.mode,'deflect',id);
  assert.equal(first.state.phase,'defense',id);
  assert.equal(first.state.activePlayerId,'A',id);
  assert.equal(first.state.players[1].mp,10,id);
  const done=resolve(defend(first.state,'A')).state;
  assert.equal(done.players[0].hp,36,id);
  assert.equal(done.players[1].hand.length,1,id);
 }
});
test('Sky armor can send miracle to third living seat and retain caster costs once',()=>{
 let s=attack(room({A:['m002'],B:['d025'],C:['d014']}));
 let r=resolve(defend(s,'B',[0]),()=>0.9);
 assert.equal(r.state.activePlayerId,'C');assert.equal(r.state.pending.targetId,'C');
 s=defend(r.state,'C',[0]);
 const after=resolve(s).state;
 assert.equal(after.players[2].hp,39);
 assert.equal(after.players[0].mp,8);
 assert.equal(after.players[1].mp,10);
 assert.equal(after.players[1].hand.length,1);
 assert.equal(after.activePlayerId,'B');
});
test('Sky self-deflection resolves dark instant defeat immediately; armor guard cannot mitigate it',()=>{
 const s=attack(room({A:['m003'],B:['d026','d005']}),'m003');
 const r=resolve(defend(s,'B',[0]),()=>0.99);
 assert.equal(r.immediate,true);
 assert.equal(r.state.phase,'finished');
 assert.equal(r.state.winnerId,'A');
 assert.equal(r.state.players[1].hp,0);
 assert.equal(r.state.players[1].mp,10);
});
test('Moonlight versus dark miracle reflects the instant-defeat property',()=>{
 const s=attack(room({A:['m003'],B:['d029']}),'m003');
 const r=resolve(defend(s,'B',[0]));
 assert.equal(r.state.activePlayerId,'A');
 const done=resolve(defend(r.state,'A')).state;
 assert.equal(done.phase,'finished');
 assert.equal(done.winnerId,'B');
 assert.equal(done.players[0].mp,5);
});
test('two Moonlight pieces can reflect the same miracle twice; source pays MP once',()=>{
 let s=attack(room({A:['m002','d027'],B:['d029']}));
 let r=resolve(defend(s,'B',[0]));
 assert.equal(r.state.players[0].mp,8);
 r=resolve(defend(r.state,'A',[0]));
 assert.equal(r.state.activePlayerId,'B');
 const done=resolve(defend(r.state,'B')).state;
 assert.equal(done.players[1].hp,36);
 assert.equal(done.players[0].mp,8);
 assert.equal(done.players[0].hand.length,2);
 assert.equal(done.players[1].hand.length,1);
});
test('Sky followed by Moonlight redirects back to Sky wearer then still permits defense',()=>{
 let s=attack(room({A:['m002','d027'],B:['d024','d014']}));
 let r=resolve(defend(s,'B',[0]),()=>0);
 assert.equal(r.state.activePlayerId,'A');
 r=resolve(defend(r.state,'A',[0]));
 assert.equal(r.state.activePlayerId,'B');
 const done=resolve(defend(r.state,'B',[0])).state;
 assert.equal(done.players[1].hp,39);
 assert.equal(done.players[0].mp,8);
});
test('Sky armor retains its printed guard against neutral physical weapon',()=>{
 for(const [id,guard] of SKY){
  const s=room({A:['w016'],B:[id]});
  const d=defend(send(s,'A','playCards',{targetId:'B',
    orderedInstanceIds:[instance(s,'A')]}),'B',[0]);
  const r=resolve(d);
  assert.equal(r.redirected,undefined,id);
  assert.equal(r.state.players[1].hp,40-Math.max(0,10-guard),id);
  assert.equal(r.state.players[1].mp,10,id);
 }
});
test('Moonlight armor also retains its guard against ordinary neutral weapon',()=>{
 for(const [id,guard] of MOON){
  const s=room({A:['w016'],B:[id]});
  const a=send(s,'A','playCards',{targetId:'B',orderedInstanceIds:[instance(s,'A')]});
  const result=resolve(defend(a,'B',[0]));
  assert.equal(result.state.players[1].hp,40-Math.max(0,10-guard),id);
  assert.equal(result.state.players[1].mp,10,id);
 }
});
test('miracle-only armor is not legal against elemental physical weapon',()=>{
 const s=room({A:['w018'],B:['d024']});
 const a=send(s,'A','playCards',{targetId:'B',orderedInstanceIds:[instance(s,'A')]});
 const d=defend(a,'B',[0]),original=JSON.stringify(d);
 assert.throws(()=>resolve(d),/Illegal shield/);
 assert.equal(JSON.stringify(d),original);
});
test('special armor plus another armor is held pending research on combination order',()=>{
 const s=attack(room({A:['m002'],B:['d024','d014']}));
 const d=defend(s,'B',[0,1]),before=JSON.stringify(d);
 assert.throws(()=>resolve(d,()=>0),/Redirect must be used alone/);
 assert.equal(JSON.stringify(d),before);
});
test('a Sky armor cannot be turned into free MP spell with Spirit',()=>{
 const s=attack(room({A:['m002'],B:['d024','i003']}));
 const d=defend(s,'B',[0,1]),before=JSON.stringify(d);
 assert.throws(()=>resolve(d,()=>0),/Redirect must be used alone/);
 assert.equal(JSON.stringify(d),before);
});
test('default deterministic deflection does not mutate original staged command',()=>{
 const s=defend(attack(room({A:['m002'],B:['d022']},{rngSeed:123})),'B',[0]);
 const before=JSON.stringify(s);
 const a=resolve(s),b=resolve(s);
 assert.deepEqual(a.state,b.state);
 assert.notEqual(a.state.rngSeed,s.rngSeed);
 assert.equal(JSON.stringify(s),before);
});
test('hotseat controller accepts Sky or Moonlight without exposing the opponent hand',()=>{
 for(const defId of ['d022','d029']){
  const lab=createV2LabController({hands:{A:['m002'],B:[defId]}});
  let a=lab.reveal();lab.toggle({instanceId:a.hand[0].instanceId});
  assert.equal(lab.submit().ok,true);
  let b=lab.reveal();assert.equal(b.hand[0].definitionId,defId);
  lab.toggle({instanceId:b.hand[0].instanceId});
  const first=lab.submit();
  assert.equal(first.ok,true,first.error);
  assert.equal(first.view.revealed,false);
  assert.equal(first.view.actorId,'A');
  assert.equal(first.view.hand.length,0);
  lab.reveal();
  const final=lab.submit();
  assert.equal(final.ok,true,final.error);
  assert.equal(lab.labSnapshot().players[1].hp,40);
 }
});
