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
test('online trial room offers twenty-nine explicitly named fixture hand sets, never fake random draws',()=>{
 assert.match(page,/<select id="labPreset"/);
 assert.match(page,/<option value="basic">/);
 assert.match(page,/<option value="elements">/);
 assert.match(page,/<option value="fireArmor">/);
 assert.match(page,/<option value="flashDefense">/);
 assert.match(page,/<option value="flashDagger">/);
 assert.match(page,/<option value="mistGun">/);
 assert.match(page,/<option value="magicalStaff">/);
 assert.match(page,/<option value="recoilSword">/);
 assert.match(page,/<option value="mistMiracle">/);
 assert.match(page,/<option value="dreamMiracle">/);
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
 assert.match(page,/<option value="absorbMiracle">/);
 assert.match(page,/<option value="cleansingMiracles">/);
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
 assert.deepEqual(Object.keys(presets).sort(),['absorbMiracle','basic','broom','buy','cleansingMiracles','dark','dreamMiracle','elements','exchange','fireArmor','flashDagger','flashDefense','heaven','illnessAttack','learnedTrial','magicalStaff','mistGun','mistMiracle','recoilSword','recovery','resourceMiracles','sale','shells','soap','support','tear','turbulenceBack','turbulenceSelf','windMiracles']);
 assert.equal(summary.complete,false,'deck not audited for real weighted draws');
});
test('all twenty-nine fixed presets contain valid catalog definitions and four cards per seat',()=>{
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
test('Dream miracle preset exercises real curse and two grades of cure, without random fake deck',()=>{
 assert.deepEqual(Array.from(presets.dreamMiracle.A),['m021','i003','w016','d003']);
 assert.deepEqual(Array.from(presets.dreamMiracle.B),['i017','i018','d018','i002']);
 assert.equal(presets.dreamMiracle.mpA,10);
 assert.equal(catalog.get('m021').effects[0].params.affliction,'dream');
 assert.equal(summary.complete,false);
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

test('new three fire armors are selectable only in the named G7 test set, not the source draw pool',()=>{
 assert.deepEqual(Array.from(presets.fireArmor.A),['w041','d035','w016','i006']);
 assert.deepEqual(Array.from(presets.fireArmor.B),['d060','d061','d062','w016']);
 for(const id of ['d060','d061','d062']){
  const card=catalog.get(id);
  assert.equal(card.family,'armor');
  assert.equal(card.element,'fire');
  assert.deepEqual(card.effects,[]);
 }
 assert.equal(summary.complete,false);
});

test('Melody and Song trial is an explicit twenty-first controlled source-backed preset',()=>{
 assert.deepEqual(Array.from(presets.cleansingMiracles.A),['m017','m018','i003','w016']);
 assert.deepEqual(Array.from(presets.cleansingMiracles.B),['m013','w016','d003','i002']);
 assert.equal(presets.cleansingMiracles.mpA,25);
 assert.equal(presets.cleansingMiracles.diseaseA,'fever');
 for(const id of ['m017','m018']){
  const def=catalog.get(id);
  assert.equal(def.family,'miracle');
  assert.deepEqual(def.effects.map(x=>x.type),['cleanseAfflictions']);
 }
 assert.equal(summary.complete,false);
});

test('Flash research preset is an explicit test state and never used as real card distribution',()=>{
 assert.deepEqual(Array.from(presets.flashDefense.A),['w027','w016','d003','i006']);
 assert.deepEqual(Array.from(presets.flashDefense.B),['d001','d003','i017','w016']);
 assert.deepEqual(Array.from(presets.flashDefense.afflictionsB),['flash']);
 assert.match(page,/initialState\.players\[index\]\.afflictions=\[\.\.\.list\]/);
 assert.equal(summary.complete,false);
});

test('Flash Dagger research preset supplies an authentic hit weapon and a cure',()=>{
 assert.deepEqual(Array.from(presets.flashDagger.A),['w060','w016','d001','i006']);
 assert.deepEqual(Array.from(presets.flashDagger.B),['i017','d001','w016','i002']);
 const dagger=catalog.get('w060');
 assert.deepEqual([dagger.stats.attack,dagger.element,dagger.stats.price],[2,'light',15]);
 assert.deepEqual(dagger.effects,[{when:'afterHit',type:'inflictAffliction',params:{affliction:'flash'}}]);
 assert.equal(summary.complete,false,'partial catalog remains a non-production research fixture');
});

test('Mist Gun preset covers hit, water defense, Mirror and a cure',()=>{
 assert.deepEqual(Array.from(presets.mistGun.A),['w061','w016','d001','i006']);
 assert.deepEqual(Array.from(presets.mistGun.B),['i017','d062','w016','i002']);
 const gun=catalog.get('w061');
 assert.deepEqual([gun.stats.attack,gun.element,gun.stats.price],[3,'water',10]);
 assert.deepEqual(gun.effects,[{when:'afterHit',type:'inflictAffliction',params:{affliction:'mist'}}]);
 assert.equal(summary.complete,false);
});

test('Recoil sword preset is source-backed and includes a Super Mirror counter',()=>{
 assert.deepEqual(Array.from(presets.recoilSword.A),['w063','i005','d003','w016']);
 assert.deepEqual(Array.from(presets.recoilSword.B),['d003','d009','i002','w016']);
 assert.deepEqual(catalog.get('w063').effects,[{when:'afterHit',type:'recoilHp',params:{amount:'damage'}}]);
 assert.equal(summary.complete,false);
});

test('Magical Staff source-backed MP×2 is an explicit 27th research-only preset',()=>{
 assert.deepEqual(Array.from(presets.magicalStaff.A),['w062','w016','d003','i006']);
 assert.deepEqual(Array.from(presets.magicalStaff.B),['d003','d001','i002','w016']);
 assert.equal(presets.magicalStaff.mpA,8);
 assert.deepEqual(catalog.get('w062').effects,[{when:'onDeclare',type:'spendMpForAttack',params:{multiplier:2}}]);
 assert.equal(summary.complete,false);
});

test('Absorb miracle trial uses source-backed solo spell, Mirror, Curtain and Spirit',()=>{
 assert.deepEqual(Array.from(presets.absorbMiracle.A),['m019','i003','w016','d003']);
 assert.deepEqual(Array.from(presets.absorbMiracle.B),['i002','i001','d003','w016']);
 assert.equal(presets.absorbMiracle.mpA,25);
 const m=catalog.get('m019');
 assert.deepEqual([m.stats.attack,m.stats.mpCost,m.element],[10,10,'light']);
 assert.deepEqual(m.effects,[{when:'afterHit',type:'absorbHp',params:{amount:'damage'}}]);
});
