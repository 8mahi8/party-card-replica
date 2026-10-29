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
  const steps=p?.attackSequence??p?.attackInstanceIds?.map(instanceId=>({instanceId}));
  if(!player||!Array.isArray(steps)||steps.length===0)
    fail('No weapon selected');
  const seenPhysical=new Set(),seenLearned=new Set();
  const selected=steps.map(step=>{
    if(step?.instanceId && Object.keys(step).length===1){
      const id=step.instanceId;
      if(seenPhysical.has(id))fail('Repeated selected attack instance');
      seenPhysical.add(id);
      const instance=player.hand.find(c=>c.instanceId===id);
      if(!instance)fail('Selected attack instance not held');
      const def=catalog.get(instance.definitionId);
      if(!def)fail('Unknown attack card');
      return {instance,def,fromLearned:false};
    }
    if(step?.learnedDefinitionId && Object.keys(step).length===1){
      const id=step.learnedDefinitionId;
      if(seenLearned.has(id))fail('Repeated learned miracle in one sequence not verified');
      seenLearned.add(id);
      const def=catalog.get(id);
      if(!player.learned.includes(id)||def?.family!=='miracle'||!def.playModes.includes('cast'))
        fail('Selected miracle not learned');
      return {instance:null,def,fromLearned:true};
    }
    fail('Malformed attack sequence step');
  });
  // The legacy field must match the hand-origin selections if both are present.
  if(p.attackSequence && JSON.stringify(selected.filter(x=>x.instance).map(x=>x.instance.instanceId))
      !==JSON.stringify(p.attackInstanceIds))
    fail('Sequence and selected card instances do not match');
  return {caster:player,selected};
}
export function compileOrderedWeaponAttack(state,catalog){
  if(!(catalog instanceof Map)||!catalog.size)fail('Card catalog required');
  const {caster,selected}=getSelected(state,catalog);
  if(selected[0].def.family!=='weapon')
    fail('Basic resolution requires weapon first');
  let weaponAttack=0,attackElement='none',mainCount=0,weaponCount=0;
  let aura=null,plusCount=0,additive=0,lastWasMiracle=false,hasArmorBonus=false,itemBonus=0;
  let learnedDrawCount=0;
  let forcedAttackElement=null,absorbsHp=false,hitCount=1;
  let wandPosition=-1,auraPosition=-1;
  const casts=[],selectedKinds=[];
  const miracles=[];
  for(const [position,{instance,def,fromLearned}] of selected.entries()){
    const mult=effectsOf(def,'multiplyAttack');
    const plus=effectsOf(def,'addAttack');
    const discount=effectsOf(def,'waivePreviousMp');
    if(def.family==='weapon'||(def.family==='armor'&&def.playModes.includes('addAttack'))){
      if(fromLearned)fail('Only miracles may come from learned selection');
      if(plusCount)fail('Weapon or armor after plus miracle unverified');
      if(def.family==='weapon'){
        if(!def.playModes.some(mode=>mode==='mainAttack'||mode==='addAttack'))fail('Weapon is not attackable');
        if(def.playModes.includes('mainAttack'))mainCount++;
        if(mainCount>1)fail('Too many main weapons');
        attackElement=weaponCount===0?def.element:combineElements(attackElement,def.element);
        weaponCount++;
      } else {hasArmorBonus=true;if(aura)fail('Aura with armor attack bonus unverified');}
      for(const eff of def.effects){
        if(eff.type==='setAttackElement'&&eff.when==='onDeclare' && def.family==='weapon' &&
           def.playModes.includes('addAttack') && ['fire','water'].includes(eff.params.element) &&
           eff.params.element===def.element){
          if(forcedAttackElement!==null)
            fail('Multiple attack-element override wands unverified');
          forcedAttackElement=eff.params.element;
          wandPosition=position;
          continue;
        }
        if(eff.type==='repeatAttack'&&eff.when==='onDeclare'&&
           eff.params.count===2&&def.family==='weapon'&&def.playModes.includes('mainAttack')){
          if(hitCount!==1)fail('Repeated multi-hit effects unverified');
          hitCount=2;continue;
        }
        if(eff.type==='absorbHp'&&eff.when==='afterHit'&&
           eff.params.amount==='damage'&&def.family==='weapon'){
          if(absorbsHp)fail('Multiple HP absorption weapons unverified');
          absorbsHp=true;continue;
        }
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
        if(aura||plusCount||hasArmorBonus||itemBonus)fail('Aura stacked with other miracles or armor bonus unverified; non-weapon bonus unverified');
        if(def.effects.length!==1)fail('Unrecognized Aura effects');
        aura=def.id;
        auraPosition=position;
      } else if(plus.length===1 && def.effects.length===1 &&
         plus[0].when==='onDeclare' && plus[0].params.scope==='weapon' &&
         def.playModes.includes('addAttack') && def.stats.attack>0){
        if(aura)fail('Aura stacked with other miracles unverified');
        if(itemBonus)fail('Non-weapon item bonus plus miracle damage precedence unverified');
        plusCount++;
        if(plusCount>2)fail('More than two plus miracles not verified');
        if(plusCount===2 && (def.id!==miracles[0]?.id ||
          plus[0].params.stacking!=='identicalPair'||fromLearned||miracles[0]?.fromLearned))
          fail('Only identical verified hand-based plus pair may stack');
        additive=add(additive,def.stats.attack);
        attackElement=combineElements(attackElement,def.element);
      } else fail('Unsupported attack miracle effect');
      miracles.push({id:def.id,mpCost:def.stats.mpCost,discounted:false,fromLearned});
      if(fromLearned)learnedDrawCount++;
      casts.push({type:'learn',definitionId:def.id});
      lastWasMiracle=true;
      selectedKinds.push('miracle');
    } else if(def.family==='item'&&def.playModes.includes('addAttack')&&
       plus.length===1&&plus[0].when==='onDeclare'&&
       plus[0].params.scope==='weapon'&&def.effects.length===1&&
       def.stats.attack>0){
      if(fromLearned)fail('Attack item must come from hand');
      if(aura||plusCount)
        fail('Non-weapon attack bonus mixed with miracles: damage precedence unverified');
      if(itemBonus)fail('More than one +ATK item unverified');
      itemBonus=add(itemBonus,def.stats.attack);
      lastWasMiracle=false;
      selectedKinds.push('itemBonus');
    } else if(def.family==='item'&&def.playModes.includes('support')&&
       discount.length===1&&discount[0].when==='onCost' &&
       discount[0].params.target==='previousMiracle'&&def.effects.length===1){
      if(fromLearned)fail('Spirit must come from hand');
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
  if(hitCount===2&&(miracles.length>0||hasArmorBonus||itemBonus||absorbsHp))
    fail('Repeat hits with miracles, armor attack bonus or other special effects are not verified');
  if(miracles.length&&state.pending.targetId===caster.id)
    fail('Boosted self-target attack has not been verified');
  if(aura&&plusCount)fail('Aura plus additive miracle ordering unverified');
  if(forcedAttackElement!==null){
    if(plusCount)fail('Element-setting wand with plus miracle unverified');
    // The 2025 player guide reports that a dye wand must be selected
    // after Aura. Exact older/other-client behavior is unresolved.
    // Do not silently invent an elemental result for this ordering.
    if(aura!==null&&wandPosition<auraPosition)
      fail('Attribute wand before Aura: original dye priority unverified');
  }
  // Aura multiplies all weapon attack values, even addons chosen later.
  const attack=add(add(aura?add(weaponAttack,weaponAttack):weaponAttack,additive),itemBonus);
  const payableMP=miracles.reduce((n,m)=>add(n,m.discounted?0:m.mpCost),0);
  if(caster.mp<payableMP)fail('Not enough MP');
  const learnedMiracles=[...new Set(miracles.map(m=>m.id))];
  return Object.freeze({
    // The ordinary Aura attack is neutral even with an elemental weapon.
    // A verified dye wand AFTER Aura is the explicit exception: it sets
    // the final fire/water attribute. Do not preserve the weapon element.
    attack,element:forcedAttackElement??(aura?'none':attackElement),attackKind:'weapon',
    instanceIds:Object.freeze(selected.filter(x=>x.instance).map(x=>x.instance.instanceId)),
    payableMP,learnedDrawCount,learnedMiracles:Object.freeze(learnedMiracles),
    hasModifiers:miracles.length>0,absorbsHp,hitCount,
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
  if(attackContext.learnedDrawCount)
    queue.push({type:'grantDraw',playerId:actorId,count:attackContext.learnedDrawCount});
  if(attackContext.hasModifiers){
    queue.push({type:'mp',playerId:actorId,cost:attackContext.payableMP});
    for(const definitionId of attackContext.learnedMiracles)
      queue.push({type:'learn',playerId:actorId,definitionId});
  }
  return queue;
}
