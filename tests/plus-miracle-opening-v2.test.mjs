import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom} from '../v2/staging-room.mjs';
import {submitAndResolveFixture} from '../v2/room-transition.mjs';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup} from '../v2/lab-ui.mjs';

const {byId:catalog}=migrateLegacyCatalog();
const options={labOnly:true,fixtureDrawDefinitionId:'d001'};
function room(cards,{mp=10,learned=[]}={}){
 const s=createStagingRoom({seats:[
  {id:'A',handDefinitionIds:cards},
  {id:'B',handDefinitionIds:[]}
 ],firstSeatId:'A'},catalog);
 s.players[0].mp=mp;
 s.players[0].learned=[...learned];
 return s;
}
function command(s,id,type,rest={}){
 return {type,actorId:id,commandId:'plusfirst-'+s.revision+'-'+id,
  expectedRevision:s.revision,...rest};
}
function submit(s,id,type,rest={}){
 return submitAndResolveFixture(s,command(s,id,type,rest),catalog,
  {...options,authorizedSeatId:id});
}
const hand=(s,i)=>s.players[0].hand[i].instanceId;
function attack(s,indices){
 return submit(s,'A','playCards',{targetId:'B',
  orderedInstanceIds:indices.map(i=>hand(s,i))});
}
function attackSequence(s,steps){
 return submit(s,'A','playSequence',{targetId:'B',orderedPlays:steps});
}
function settle(staged){
 return submit(staged.state,'B','defend',{orderedInstanceIds:[]}).state;
}
test('server-investigated Fireball-first is its own miracle, not a weapon modifier',()=>{
 const s=room(['m005','a003']);
 const prepared=attack(s,[0]);
 assert.equal(prepared.state.phase,'defense');
 const final=settle(prepared);
 assert.equal(final.players[1].hp,38);
 assert.equal(final.players[0].mp,8);
 assert.deepEqual(final.players[0].learned,['m005']);
 assert.equal(final.players[0].hand.length,2);
 assert.equal(final.activePlayerId,'B');
});
test('server-investigated Meteor-first is light miracle and consumes 7 MP',()=>{
 const staged=attack(room(['m006']),[0]);
 assert.equal(staged.state.phase,'defense');
 const final=settle(staged);
 assert.equal(final.players[1].hp,30);
 assert.equal(final.players[0].mp,3);
 assert.deepEqual(final.players[0].learned,['m006']);
 assert.equal(final.players[0].hand.length,1);
});
test('Fireball and Meteor may open then use immediately adjacent Spirit for MP0',()=>{
 for(const [id,damage] of [['m005',2],['m006',10]]){
  const initial=room([id,'i003'],{mp:0});
  const staged=attack(initial,[0,1]);
  const final=settle(staged);
  assert.equal(final.players[1].hp,40-damage,id);
  assert.equal(final.players[0].mp,0,id);
  assert.equal(final.players[0].hand.length,2,id);
  assert.deepEqual(final.players[0].learned,[id],id);
 }
});
test('playSequence with Fireball opening and Spirit gives same result as playCards',()=>{
 const s=room(['m005','i003'],{mp:0});
 const action=attackSequence(s,[{instanceId:hand(s,0)},{instanceId:hand(s,1)}]);
 const out=settle(action);
 assert.equal(out.players[1].hp,38);
 assert.equal(out.players[0].mp,0);
 assert.deepEqual(out.players[0].learned,['m005']);
});
test('Meteor-first playSequence without Spirit works, without incorrectly requiring a weapon',()=>{
 const s=room(['m006']);
 const staged=attackSequence(s,[{instanceId:hand(s,0)}]);
 const final=settle(staged);
 assert.equal(final.players[1].hp,30);
});
test('forged learned spell after physical first Fireball is rejected rather than silently omitted',()=>{
 const s=room(['m005'],{learned:['m006']});
 const before=JSON.stringify(s);
 const seq=[{instanceId:hand(s,0)},{learnedDefinitionId:'m006'}];
 assert.throws(()=>attackSequence(s,seq),/Miracle opening cannot mix learned/);
 assert.equal(JSON.stringify(s),before);
});
test('miracle-first cannot silently become a weapon attack by adding an extra weapon',()=>{
 for(const id of ['m005','m006']){
  for(const kind of ['playCards','playSequence']){
   const s=room([id,'a003']);
   const before=JSON.stringify(s);
   const seq=[{instanceId:hand(s,0)},{instanceId:hand(s,1)}];
   assert.throws(()=>kind==='playCards'?attack(s,[0,1]):attackSequence(s,seq),
     /Only spirit directly after miracle/,id+' '+kind);
   assert.equal(JSON.stringify(s),before);
  }
 }
});
test('first Fireball plus another plus miracle is not a valid weapon modification',()=>{
 const s=room(['m005','m006']),before=JSON.stringify(s);
 assert.throws(()=>attack(s,[0,1]),/Only spirit directly after miracle/);
 assert.equal(JSON.stringify(s),before);
});
test('weapon-first with extras then Fireball remains a 15 point weapon attack',()=>{
 const s=room(['w016','a003','m005']);
 const out=settle(attack(s,[0,1,2]));
 assert.equal(out.players[1].hp,25);
 assert.equal(out.players[0].mp,8);
 assert.deepEqual(out.players[0].learned,['m005']);
});
test('weapon-first water + light additive + Meteor stays water attack',()=>{
 const s=room(['w021','a010','m006']);
 const out=settle(attack(s,[0,1,2]));
 assert.equal(out.players[1].hp,28);
 assert.equal(out.players[0].mp,3);
 assert.deepEqual(out.players[0].learned,['m006']);
});
test('unverified additive after Fireball modifier stays rejected atomically',()=>{
 const s=room(['w016','m005','a003']),before=JSON.stringify(s);
 assert.throws(()=>attack(s,[0,1,2]),/Weapon or armor after plus miracle unverified/);
 assert.equal(JSON.stringify(s),before);
});
test('lab displays printed + attack on both plus-miracles and explains solo miracle opening',()=>{
 const ui=createV2LabController({hands:{A:['m005','m006','a003'],B:[]}});
 const v=ui.reveal();
 assert.match(v.hand[0].label,/火の玉 · \+攻2 · MP2/);
 assert.match(v.hand[1].label,/流星 · \+攻10 · MP7/);
 assert.match(v.hand[2].label,/ブーメラン · \+攻3/);
 ui.toggle({instanceId:v.hand[0].instanceId});
 const markup=renderV2LabMarkup(ui.view());
 assert.match(markup,/先頭に選ぶと単独奇跡/);
 assert.match(markup,/直後の精霊のみ/);
 assert.equal(ui.submit().ok,true);
 assert.equal(ui.view().phase,'defense');
 ui.reveal();
 assert.equal(ui.submit().ok,true);
 assert.equal(ui.labSnapshot().players[1].hp,38);
});
