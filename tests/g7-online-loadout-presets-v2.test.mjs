import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {migrateLegacyCatalog} from '../v2/legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from '../v2/staging-room.mjs';

const page=readFileSync(new URL('../v2/demo/firebase-online-lab.html',import.meta.url),'utf8');
const {byId:catalog,summary}=migrateLegacyCatalog();
const literal=page.match(/const LAB_PRESETS=(Object\.freeze\(\{[\s\S]*?\}\));/);
if(!literal)throw Error('Expected source-backed lab presets in online demo');
const presets=vm.runInNewContext(literal[1]);
test('online trial room offers eleven explicitly named fixture hand sets, never fake random draws',()=>{
 assert.match(page,/<select id="labPreset"/);
 assert.match(page,/<option value="basic">/);
 assert.match(page,/<option value="elements">/);
 assert.match(page,/<option value="dark">/);
 assert.match(page,/<option value="recovery">/);
 assert.match(page,/<option value="support">/);
 assert.match(page,/<option value="broom">/);
 assert.match(page,/<option value="soap">/);
 assert.match(page,/<option value="heaven">/);
 assert.match(page,/<option value="shells">/);
 assert.match(page,/<option value="illnessAttack">/);
 assert.match(page,/<option value="tear">/);
 assert.match(page,/id="useItem"/);
 assert.match(page,/原作の山札ではありません/);
 assert.match(page,/LAB_PRESETS\[\$\('labPreset'\)\.value\]/);
 assert.match(page,/handDefinitionIds:\[\.\.\.preset\.A\]/);
 assert.match(page,/handDefinitionIds:\[\.\.\.preset\.B\]/);
 assert.deepEqual(Object.keys(presets).sort(),['basic','broom','dark','elements','heaven','illnessAttack','recovery','shells','soap','support','tear']);
 assert.equal(summary.complete,false,'deck not audited for real weighted draws');
});
test('all eleven fixed presets contain valid catalog definitions and four cards per seat',()=>{
 for(const [name,hands] of Object.entries(presets)){
  for(const seat of ['A','B']){
   assert.equal(hands[seat].length,4,name+' '+seat);
   assert.equal(new Set(hands[seat]).size,4,name+' '+seat+' must have distinct fixture definitions');
   for(const id of hands[seat])assert(catalog.has(id),name+' missing card '+id);
  }
  const room=createStagingRoom({firstSeatId:'A',
   seats:[{id:'A',handDefinitionIds:[...hands.A]},{id:'B',handDefinitionIds:[...hands.B]}],
   rulesetId:'partial-reference-v2-lab',rngSeed:71},catalog);
  assert.equal(viewStagingRoom(room,'A',catalog).players[0].hand.length,4);
  assert.equal(viewStagingRoom(room,'B',catalog).players[1].hand.length,4);
  assert.equal(viewStagingRoom(room,'A',catalog).players[1].hand,undefined);
  assert.equal(viewStagingRoom(room,'B',catalog).players[0].hand,undefined);
 }
});
test('Soap preset deliberately seeds three distinct learned miracles per side',()=>{
 assert.deepEqual(Array.from(presets.soap.A),['i015','w016','d003','i006']);
 assert.deepEqual(Array.from(presets.soap.B),['i002','w027','d003','i005']);
 for(const side of ['learnedA','learnedB']){
  assert.equal(presets.soap[side].length,3);
  assert.equal(new Set(presets.soap[side]).size,3);
  for(const id of presets.soap[side])
   assert.equal(catalog.get(id)?.family,'miracle');
 }
 assert.match(page,/initialState\.players\[index\]\.learned=\[\.\.\.ids\]/);
 assert.match(page,/id="learnedMiracles"/);
});
test('source-backed support preset gives the defender an actual Super Mirror',()=>{
 assert.deepEqual(Array.from(presets.support.A),['i006','i010','w016','d003']);
 assert.deepEqual(Array.from(presets.support.B),['i002','i007','w027','d003']);
});
test('the previous default fixture remains byte-for-byte equivalent',()=>{
 assert.deepEqual(Array.from(presets.basic.A),['w016','d001','m002','d003']);
 assert.deepEqual(Array.from(presets.basic.B),['w027','d003','m001','d001']);
});
