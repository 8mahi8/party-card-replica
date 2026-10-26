import test from 'node:test';
import assert from 'node:assert/strict';
import {
 STARTING_STATS,INITIAL_HAND_SIZE,MAX_HAND_SIZE,MAX_LEARNED_MIRACLES,
 ELEMENTS,CATEGORY_DISTRIBUTION,totalSlots,canBlock,combineElements,
 calculateHit,sumLegalArmor,drawWeighted,refillHand,initialHand,
 learnMiracle,payMiracle,payForcedSale,reflectTarget
} from '../src/rules.mjs';

test('initial stats, 9 cards, 18 cap, 500 weighted category slots',()=>{
 assert.deepEqual(STARTING_STATS,{hp:40,mp:10,money:20});
 assert.equal(INITIAL_HAND_SIZE,9);assert.equal(MAX_HAND_SIZE,18);
 assert.equal(totalSlots(CATEGORY_DISTRIBUTION),500);
 assert.equal(initialHand(()=>({id:'T'})).length,9);
 assert.equal(refillHand(new Array(17).fill('a'),5,()=> 'b').length,18);
});

test('full verified element compatibility matrix',()=>{
 const legal={
  none: ELEMENTS,fire:['water','light'],water:['fire','light'],
  wood:['earth','light'],earth:['wood','light'],light:[],dark:ELEMENTS
 };
 for(const attack of ELEMENTS)for(const shield of ELEMENTS){
   assert.equal(canBlock(attack,shield),legal[attack].includes(shield),`${attack}/${shield}`);
 }
});

test('rainbow curtain makes colored attack blockable by neutral shield',()=>{
 assert.equal(canBlock('fire','none'),false);
 assert.equal(canBlock('fire','none',{rainbowCurtain:true}),true);
 assert.equal(canBlock('light','none',{rainbowCurtain:true}),true);
});

test('attribute mixing and coloring',()=>{
 assert.equal(combineElements('fire','fire'),'fire');
 assert.equal(combineElements('fire','water'),'none');
 assert.equal(combineElements('fire','none'),'none');
 assert.equal(combineElements('light','water'),'water');
 assert.equal(combineElements('wood','light'),'wood');
 assert.equal(combineElements('dark','fire'),'none');
 assert.equal(combineElements('fire','water',{dye:'earth'}),'earth');
});

test('damage clamps at zero and dark attacks instantly kill if not fully blocked',()=>{
 assert.deepEqual(calculateHit({attack:7,armor:4,hp:40,element:'none'}),
  {damage:3,instantDefeat:false,hpAfter:37,effectiveElement:'none'});
 assert.equal(calculateHit({attack:3,armor:7,hp:40}).damage,0);
 assert.equal(calculateHit({attack:12,armor:11,hp:99,element:'dark'}).hpAfter,0);
 assert.equal(calculateHit({attack:12,armor:12,hp:99,element:'dark'}).hpAfter,99);
 assert.deepEqual(calculateHit({attack:12,armor:2,hp:40,element:'dark',rainbowCurtain:true}),
 {damage:10,instantDefeat:false,hpAfter:30,effectiveElement:'none'});
});

test('multiple compatible shields add, incompatible ones reject, self attacks cannot block',()=>{
 assert.equal(sumLegalArmor('fire',[{element:'water',guard:3},{element:'light',guard:5}]),8);
 assert.throws(()=>sumLegalArmor('fire',[{element:'none',guard:12}]),/incompatible/);
 assert.throws(()=>sumLegalArmor('none',[{element:'none',guard:1}],{selfTarget:true}),/Self-target/);
});

test('drawn item is replaced for each independent draw',()=>{
 const deck=[{id:'a',weight:1},{id:'b',weight:2}];
 assert.equal(drawWeighted(deck,()=>0).id,'a');
 assert.equal(drawWeighted(deck,()=>0.5).id,'b');
 assert.equal(drawWeighted(deck,()=>0).id,'a');
 assert.throws(()=>drawWeighted(deck,()=>1),/rng/);
});

test('miracles are learned with six-card FIFO and pay MP on each use',()=>{
 const first=['a','b','c','d','e','f'];
 assert.deepEqual(learnMiracle(first,'g'),['b','c','d','e','f','g']);
 assert.deepEqual(learnMiracle(first,'b'),first);
 assert.equal(MAX_LEARNED_MIRACLES,6);
 assert.equal(payMiracle(10,6),4);
 assert.throws(()=>payMiracle(5,6),/Not enough/);
});

test('forced sale drains money before MP before HP',()=>{
 const p=payForcedSale({hp:15,mp:10,money:5},25);
 assert.deepEqual(p.buyer,{hp:5,mp:0,money:0});
 assert.equal(p.unpaid,0);
 const lethal=payForcedSale({hp:3,mp:1,money:1},10);
 assert.equal(lethal.buyer.hp,0);
 assert.equal(lethal.unpaid,5);
});

test('reflection returns to source; deflection can return to self',()=>{
 assert.deepEqual(reflectTarget({source:0,target:1,actor:1,mode:'reflect',living:[0,1]}),{source:1,target:0});
 assert.deepEqual(reflectTarget({source:0,target:1,actor:1,mode:'deflect',living:[0,1],rng:()=>0.9}),{source:1,target:1});
 assert.throws(()=>reflectTarget({source:1,target:1,actor:1,mode:'reflect',living:[0,1]}),/self-hit/);
});
