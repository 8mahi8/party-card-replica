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
test('online trial room offers nineteen explicitly named fixture hand sets, never fake random draws',()=>{
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
 assert.match(page,/<option value="windMiracles">/);
 assert.match(page,/<option value="learnedTrial">/);
 assert.match(page,/<option value="resourceMiracles">/);
 assert.match(page,/<option value="sale">/);
 assert.match(page,/<option value="buy">/);
 assert.match(page,/<option value="exchange">/);
 assert.match(page,/<option value="turbulenceBack">/);
 assert.match(page,/<option value="turbulenceSelf">/);
 assert.match(page,/<option value="tear">/);
 assert.match(page,/id="useItem"/);
 assert.match(page,/原作の山札ではありません/);
 assert.match(page,/LAB_PRESETS\[\$\('labPreset'\)\.value\]/);
 assert.match(page,/handDefinitionIds:\[\.\.\.preset\.A\]/);
 assert.match(page,/handDefinitionIds:\[\.\.\.preset\.B\]/);
 assert.deepEqual(Object.keys(presets).sort(),['basic','broom','buy','dark','elements','exchange','heaven','illnessAttack','learnedTrial','recovery','resourceMiracles','sale','shells','soap','support','tear','turbulenceBack','turbulenceSelf','windMiracles']);
 assert.equal(summary.complete,false,'deck not audited for real weighted draws');
});
test('all nineteen fixed presets contain valid catalog definitions and four cards per seat',()=>{
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

test('Sell trial has two distinct physical cards and a genuine mirror response',()=>{
 assert.deepEqual(Array.from(presets.sale.A),['t001','w003','d005','w016']);
 assert.deepEqual(Array.from(presets.sale.B),['i002','d001','d003','w027']);
 assert.equal(catalog.get('w003').stats.price,25);
 assert.equal(catalog.get('t001').family,'trade');
 assert(catalog.get('i002').effects.some(e=>e.when==='onDefense'&&
  e.type==='redirectAttack'&&e.params.mode==='reflect'&&e.params.scope==='any'));
});

test('Buy/Exchange trials use existing verified trade definitions and affordable research hands',()=>{
 assert.deepEqual(Array.from(presets.buy.A),['t002','w016','d003','d005']);
 assert.deepEqual(Array.from(presets.buy.B),['i002','d001','d003','w027']);
 assert.deepEqual(Array.from(presets.exchange.A),['t003','w016','d003','i006']);
 assert.equal(presets.buy.rngSeed,71);
 for(const id of presets.buy.B)assert(catalog.get(id).stats.price<=20);
 for(const [id,kind] of [['t002','requestBuy'],['t003','reallocateResources']]){
  assert(catalog.get(id).effects.some(e=>e.when==='onDeclare'&&e.type===kind));
 }
});

test('Fountain/Treasure research fixture offers both resource miracles as physical choices',()=>{
 assert.deepEqual(Array.from(presets.resourceMiracles.A),['m015','m016','i003','w016']);
 assert.deepEqual(Array.from(presets.resourceMiracles.B),['w027','d003','d018','m013']);
 assert.equal(presets.resourceMiracles.mpA,25);
 for(const id of ['m015','m016'])assert.equal(catalog.get(id)?.family,'miracle');
});
