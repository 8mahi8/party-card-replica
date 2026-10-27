/**
 * V2 G3: compile ordered weapon + typed additive / multiplier miracle effects.
 *
 * Research-limited cases:
 * - Weapon(s) with one Aura, including addons chosen AFTER Aura
 * - Weapon(s) with one Fireball/Meteor
 * - Weapon(s) with two Fireballs, as documented in Bot selection research
 * - One spirit doll IMMEDIATELY after the miracle it discounts
 *
 * Aura+additive miracle, recasts from learned list mixed with weapons, and
 * other stacked miracles require more research and are rejected.
 *
 * This module only compiles; execution of pay/learn/spend/refill belongs to
 * effect-runner.mjs.
 */
import {combineElements} from '../src/rules.mjs';

function fail(message){throw new Error(message);}
function add(a,b) {
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0||a>Number.MAX_SAFE_INTEGER-b)
    fail('Attack or MP overflow');
  return a+b;
}
function effectsOf(def,type){
  return def.effects.filter(x=>x.type===type);
}
function getSelected(state,catalog){
  const p=state?.pending;
  const player=state?.players?.find(x=>x.id===p?.originalAttackerId);
  if(!player||!Array.isArray(p?.attackInstanceIds)||p.attackInstanceIds.length===0)
    fail('No weapon selected');
  if(new Set(p.attackInstanceIds).size!==p.attackInstanceIds.length)
    fail('Repeated selected attack instance');
  return {
    caster:player,
    selected:p.attackInstanceIds.map(id=>{
      const instance=player.hand.find(c=>c.instanceId===id);
      if(!instance)fail('Selected attack instance not held');
      const def=catalog.get(instance.definitionId);
      if(!def)fail('Unknown attack card');
      return {instance,def};
    })
  };
}
export function compileOrderedWeaponAttack(state,catalog){
  if(!(catalog instanceof Map)||!catalog.size)fail('Card catalog required');
  const {caster,selected}=getSelected(state,catalog);
  if(selected[0].def.family!=='weapon')
    fail('Basic resolution requires weapon first');
  let weaponAttack=0,attackElement='none',mainCount=0,weaponCount=0;
  let aura=null,plusCount=0,additive=0,lastWasMiracle=false,hasArmorBonus=false;
  const casts=[],selectedKinds=[];
  const miracles=[];
  for(const {instance,def} of selected){
    const mult=effectsOf(def,'multiplyAttack');
    const plus=effectsOf(def,'addAttack');
    const discount=effectsOf(def,'waivePreviousMp');
    if(def.family==='weapon'||(def.family==='armor'&&def.playModes.includes('addAttack'))){
      if(plusCount)fail('Weapon or armor after plus miracle unverified');
      if(def.family==='weapon'){
        if(!def.playModes.some(mode=>mode==='mainAttack'||mode==='addAttack'))fail('Weapon is not attackable');
        if(def.playModes.includes('mainAttack'))mainCount++;
        if(mainCount>1)fail('Too many main weapons');
        attackElement=weaponCount===0?def.element:combineElements(attackElement,def.element);
        weaponCount++;
      } else {hasArmorBonus=true;if(aura)fail('Aura with armor attack bonus unverified');}
      for(const eff of def.effects){
        if(!['redirectAttack','stopAttack'].includes(eff.type)||eff.when!=='onDefense')
          fail('Unsupported weapon or armor effect');
      }
      weaponAttack=add(weaponAttack,def.stats.attack);
      lastWasMiracle=false;
      selectedKinds.push('weapon');
    } else if(def.family==='miracle'){
      if(!Number.isSafeInteger(def.stats.mpCost)||def.stats.mpCost<0)
        fail('Invalid miracle MP');
      if(mult.length===1 && mult[0].when==='onDeclare' && mult[0].params.factor===2 &&
         mult[0].params.scope==='weapon' && def.playModes.includes('cast')){
        if(aura||plusCount||hasArmorBonus)fail('Aura stacked with other miracles or armor bonus unverified');
        if(def.effects.length!==1)fail('Unrecognized Aura effects');
        aura=def.id;
      } else if(plus.length===1 && def.effects.length===1 &&
         plus[0].when==='onDeclare' && plus[0].params.scope==='weapon' &&
         def.playModes.includes('addAttack') && def.stats.attack>0){
        if(aura)fail('Aura stacked with other miracles unverified');
        plusCount++;
        if(plusCount>2)fail('More than two plus miracles not verified');
        if(plusCount===2 && (def.id!==miracles[0]?.id ||
          plus[0].params.stacking!=='identicalPair'))
          fail('Only identical verified plus pair may stack');
        additive=add(additive,def.stats.attack);
        attackElement=combineElements(attackElement,def.element);
      } else fail('Unsupported attack miracle effect');
      miracles.push({id:def.id,mpCost:def.stats.mpCost,discounted:false});
      casts.push({type:'learn',definitionId:def.id});
      lastWasMiracle=true;
      selectedKinds.push('miracle');
    } else if(def.family==='item'&&def.playModes.includes('support')&&
       discount.length===1&&discount[0].when==='onCost' &&
       discount[0].params.target==='previousMiracle'&&def.effects.length===1){
      if(!lastWasMiracle||!miracles.length)fail('Spirit must immediately follow a miracle');
      const prior=miracles.at(-1);
      if(prior.discounted)fail('Only one spirit per miracle');
      prior.discounted=true;
      lastWasMiracle=false;
      selectedKinds.push('support');
    } else {
      fail('Unsupported weapon combination');
    }
  }
  if(!weaponCount)fail('Attack requires a weapon');
  if(aura&&plusCount)fail('Aura plus additive miracle ordering unverified');
  // Aura multiplies all weapon attack values, even addons chosen later.
  const attack=add(aura?add(weaponAttack,weaponAttack):weaponAttack,additive);
  const payableMP=miracles.reduce((n,m)=>add(n,m.discounted?0:m.mpCost),0);
  if(caster.mp<payableMP)fail('Not enough MP');
  const learnedMiracles=[...new Set(miracles.map(m=>m.id))];
  return Object.freeze({
    attack,element:attackElement,attackKind:'weapon',
    instanceIds:Object.freeze(selected.map(x=>x.instance.instanceId)),
    payableMP,learnedMiracles:Object.freeze(learnedMiracles),
    hasModifiers:miracles.length>0,
    selectedKinds:Object.freeze(selectedKinds)
  });
}
/**
 * All generated effects go through the existing common interpreter; this is
 * reusable for a normal hit or Wall stop. NOT for unimplemented redirects.
 */
export function queuedAttackCosts(attackContext,actorId) {
  if(!attackContext||!Array.isArray(attackContext.instanceIds))
    fail('Missing attack compilation');
  const queue=[{type:'spend',playerId:actorId,instanceIds:attackContext.instanceIds}];
  if(attackContext.hasModifiers){
    queue.push({type:'mp',playerId:actorId,cost:attackContext.payableMP});
    for(const definitionId of attackContext.learnedMiracles)
      queue.push({type:'learn',playerId:actorId,definitionId});
  }
  return queue;
}
