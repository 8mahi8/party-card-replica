import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {sumLegalArmor,canBlock} from '../src/rules.mjs';

// Source evidence:
// https://w.atwiki.jp/piong/pages/17.html
// https://w.atwiki.jp/aniwotawiki/pages/47010.html
// Rainbow Curtain removes the attack attribute, including light and dark.
// The ordinary shield behind it therefore becomes usable; dark no longer KO's.
const {byId:catalog}=migrateLegacyCatalog();
const options={labOnly:true,fixtureDrawDefinitionId:'d001'};
function start(cardsA,cardsB){
 return createStagingRoom({seats:[{id:'A',handDefinitionIds:cardsA},
  {id:'B',handDefinitionIds:cardsB}],firstSeatId:'A'},catalog);
}
function send(state,actorId,type,indices){
 const player=state.players.find(p=>p.id===actorId);
 return submitAndResolveFixture(state,{
  commandId:'rainbow-'+actorId+'-'+state.revision,
  expectedRevision:state.revision,actorId,type,
  ...(type==='playCards'?{targetId:'B'}:{}),
  orderedInstanceIds:indices.map(i=>player.hand[i].instanceId)
 },catalog,{...options,authorizedSeatId:actorId});
}
function duel(cardsA,cardsB,guardSelection){
 const initial=start(cardsA,cardsB),before=JSON.stringify(initial);
 const attack=send(initial,'A','playCards',[0]);
 const result=send(attack.state,'B','defend',guardSelection);
 assert.equal(JSON.stringify(initial),before,'commands must not mutate originals');
 return result.state;
}

test('original reference: light shields are illegal without Rainbow for both miracle and weapon',()=>{
 for(const cardId of ['w024','m006']){
  const stage=send(start([cardId],['d005']),'A','playCards',[0]);
  assert.throws(()=>send(stage.state,'B','defend',[0]),/Illegal shield|incompatible shield/);
  assert.equal(stage.state.phase,'defense');
 }
});
test('light weapon + Rainbow -> ordinary iron armor works; original hand replenished',()=>{
 const s=duel(['w024'],['i001','d005'],[0,1]);
 assert.equal(s.players[1].hp,40);
 assert.equal(s.players[1].hand.length,2);
 assert.equal(s.activePlayerId,'B');
});
test('light miracle + Rainbow -> ordinary iron armor works and applies numeric guard',()=>{
 const s=duel(['m006'],['i001','d005'],[0,1]);
 assert.equal(s.players[1].hp,35);
 assert.equal(s.players[0].mp,3);
 assert.deepEqual(s.players[0].learned,['m006']);
});
test('dark weapon without defense is instant defeat but Rainbow removes death attribute',()=>{
 const noDefense=duel(['w025'],[],[]);
 assert.equal(noDefense.phase,'finished');
 assert.equal(noDefense.players[1].hp,0);
 const curtain=duel(['w025'],['i001'],[0]);
 assert.equal(curtain.phase,'turn');
 assert.equal(curtain.players[1].hp,39);
});
test('dark miracle without guard is instant defeat but Rainbow alone causes ordinary 5 damage',()=>{
 const noDefense=duel(['m003'],[],[]);
 assert.equal(noDefense.phase,'finished');
 const curtain=duel(['m003'],['i001'],[0]);
 assert.equal(curtain.phase,'turn');
 assert.equal(curtain.players[1].hp,35);
 assert.equal(curtain.players[0].mp,5);
});
test('Rainbow before normal shield neutralizes dark miracle, so HP is reduced by attack minus guard',()=>{
 const s=duel(['m003'],['i001','d001'],[0,1]);
 assert.equal(s.phase,'turn');
 assert.equal(s.players[1].hp,36);
});
test('Rainbow must be selected before shield, not after, on both attack families',()=>{
 for(const card of ['w024','m003']){
  const initial=start([card],['d005','i001']),stage=send(initial,'A','playCards',[0]);
  const before=JSON.stringify(stage.state);
  assert.throws(()=>send(stage.state,'B','defend',[0,1]),/Attribute remover must be first/);
  assert.equal(JSON.stringify(stage.state),before);
 }
});
test('shared armor primitive enforces original element table including Rainbow override',()=>{
 assert.equal(canBlock('light','none'),false);
 assert.equal(canBlock('light','none',{rainbowCurtain:true}),true);
 assert.equal(sumLegalArmor('light',[{guard:1,element:'none'},{guard:5,element:'none'}],
  {rainbowCurtain:true}),6);
 assert.equal(sumLegalArmor('dark',[{guard:5,element:'none'}]),5);
 assert.throws(()=>sumLegalArmor('light',[{guard:1,element:'none'}]),/incompatible shield/);
});
test('extreme malformed shield guards do not overflow integer damage arithmetic',()=>{
 assert.throws(()=>sumLegalArmor('none',[{guard:Number.MAX_SAFE_INTEGER,element:'none'},
  {guard:1,element:'none'}]),/overflow|safe/i);
 assert.throws(()=>sumLegalArmor('none',[{guard:Number.MAX_SAFE_INTEGER+1,element:'none'}]),
  /safe/i);
});
