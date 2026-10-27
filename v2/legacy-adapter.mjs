/**
 * V2 G1: migrate the existing PARTIAL research catalog into strict definitions.
 * This module translates DECLARED card characteristics, it does not execute
 * them. Never promote an unverified value to an official probability.
 */
import {defineCard,buildCatalog} from './foundation.mjs';
import {VERIFIED_BASIC_CARDS,PARTIAL_CARD_SOURCE} from '../src/verified-basic-cards.mjs';

const KNOWN_KEYS=new Set([
  'id','referenceName','kind','category','slot','element','attack','guard',
  'attackBonus','price','weight','reaction','reactionScope','stopScope',
  'role','boost','plusAttack','mpCost','effect','attackElementOverride'
]);
const CATEGORY_BY_KIND=Object.freeze({weapon:'weapon_single',armor:'armor_normal',miracle:'miracle',defense_item:'item',support_item:'item'});
const mk=(when,type,params={})=>({when,type,params});
const truthyInt=x=>Number.isSafeInteger(x)&&x>=0;
// Documented 2025 server-selection example: weapon + Fireball + Fireball.
// This is research metadata, not card-name branching in the battle engine.
const VERIFIED_IDENTICAL_PLUS_PAIRS=new Set(['m005']);

export function convertLegacyCard(card,{ruleset=PARTIAL_CARD_SOURCE}={}) {
  if(!card||typeof card!=='object'||Array.isArray(card))throw new TypeError('Invalid legacy card');
  const unknown=Object.keys(card).filter(k=>!KNOWN_KEYS.has(k));
  if(unknown.length)throw new Error('Unmapped legacy fields: '+unknown.join(','));
  const family=card.kind==='defense_item'||card.kind==='support_item'?'item':card.kind;
  if(!CATEGORY_BY_KIND[card.kind]||card.category!==CATEGORY_BY_KIND[card.kind])
    throw new Error('Unsupported category or card kind: '+card.id);
  if(!truthyInt(card.price)||!truthyInt(card.weight)||card.weight===0)
    throw new Error('Invalid legacy price/weight');
  const effects=[];
  const modes=[];
  let attack=0,guard=0,mpCost=0;
  if(card.kind==='weapon') {
    if(!truthyInt(card.attack)||!['main','addon'].includes(card.slot))throw new Error('Malformed weapon');
    attack=card.attack;
    modes.push(card.slot==='main'?'mainAttack':'addAttack');
    if(card.guard!==undefined){if(!truthyInt(card.guard))throw new Error('Malformed weapon guard');guard=card.guard; modes.push('defend');}
    if(card.stopScope!==undefined){
      if(card.stopScope!=='miracle')throw new Error('Unmapped weapon stop scope');
      if(!modes.includes('defend'))modes.push('defend');
      effects.push(mk('onDefense','stopAttack',{scope:'miracle'}));
    }
    if(card.reaction!==undefined){
      if(!['reflect','deflect'].includes(card.reaction)||
        !['neutral_weapon','miracle'].includes(card.reactionScope))
        throw new Error('Unmapped weapon reaction');
      if(card.stopScope!==undefined)throw new Error('Multiple weapon defense effects not verified');
      if(!modes.includes('defend'))modes.push('defend');
      effects.push(mk('onDefense','redirectAttack',{
        mode:card.reaction,
        scope:card.reactionScope==='miracle'?'miracle':'neutralWeapon'
      }));
    } else if(card.reactionScope!==undefined)
      throw new Error('Orphan weapon reaction scope');
    if(card.attackElementOverride!==undefined){
      if(card.slot!=='addon'||!['fire','water'].includes(card.attackElementOverride)||
         card.element!==card.attackElementOverride)
        throw new Error('Unverified attribute override definition');
      effects.push(mk('onDeclare','setAttackElement',{element:card.attackElementOverride}));
    }
  } else if(card.kind==='armor') {
    if(!truthyInt(card.guard))throw new Error('Malformed armor');
    guard=card.guard;modes.push('defend');
    if(card.attackBonus!==undefined){if(!truthyInt(card.attackBonus))throw new Error('Malformed attack bonus');attack=card.attackBonus;modes.push('addAttack');}
    if(card.stopScope!==undefined){
      if(card.stopScope!=='miracle')throw new Error('Unmapped armor stop scope');
      effects.push(mk('onDefense','stopAttack',{scope:'miracle'}));
    }
    if(card.reaction!==undefined){
      if(!['reflect','deflect'].includes(card.reaction)||card.reactionScope!=='miracle')
        throw new Error('Unmapped armor miracle reaction');
      effects.push(mk('onDefense','redirectAttack',{mode:card.reaction,scope:'miracle'}));
    } else if(card.reactionScope!==undefined)throw new Error('Orphan armor reaction scope');
  } else if(card.kind==='miracle') {
    if(!truthyInt(card.mpCost))throw new Error('Malformed miracle MP cost');
    mpCost=card.mpCost;
    if(card.role==='attack') {
      if(!truthyInt(card.attack))throw new Error('Malformed miracle attack');
      attack=card.attack;modes.push('cast');
      if(card.plusAttack===true){
        modes.push('addAttack');
        effects.push(mk('onDeclare','addAttack',{
          scope:'weapon',
          stacking:VERIFIED_IDENTICAL_PLUS_PAIRS.has(card.id)?'identicalPair':'single'
        }));
      } else if(card.plusAttack!==undefined)throw new Error('Unknown plus-attack flag');
    } else if(card.role==='stop') {
      if(card.stopScope!=='neutral_weapon')throw new Error('Unmapped miracle stop scope');
      modes.push('defend');effects.push(mk('onDefense','stopAttack',{scope:'neutralWeapon'}));
    } else if(card.role==='deflect_miracle') {
      modes.push('defend');effects.push(mk('onDefense','redirectAttack',{mode:'deflect',scope:'miracle'}));
    } else if(card.role==='boost_weapon') {
      if(card.boost!=='double_weapon')throw new Error('Unmapped miracle boost');
      modes.push('cast');effects.push(mk('onDeclare','multiplyAttack',{factor:2,scope:'weapon'}));
    } else throw new Error('Unmapped miracle role');
  } else if(card.kind==='defense_item') {
    modes.push('defend');
    if(card.effect==='strip_element')effects.push(mk('onDefense','stripElement'));
    else if(card.effect==='reflect_any')effects.push(mk('onDefense','redirectAttack',{mode:'reflect',scope:'any'}));
    else throw new Error('Unmapped defense item effect');
  } else if(card.kind==='support_item') {
    modes.push('support');
    if(card.effect==='free_previous_miracle')effects.push(mk('onCost','waivePreviousMp',{target:'previousMiracle'}));
    else throw new Error('Unmapped support item effect');
  }
  return defineCard({
    id:card.id,family,element:card.element,drawWeight:card.weight,
    stats:{attack,guard,mpCost,price:card.price},playModes:modes,effects,
    source:{ruleset,confidence:'secondary'}
  });
}

export function migrateLegacyCatalog(cards=VERIFIED_BASIC_CARDS) {
  if(!Array.isArray(cards)||cards.length===0)throw new TypeError('No legacy cards supplied');
  const definitions=Object.freeze(cards.map(card=>convertLegacyCard(card)));
  const byId=buildCatalog(definitions);
  const totalSlots=definitions.reduce((sum,card)=>sum+card.drawWeight,0);
  return Object.freeze({definitions,byId,summary:Object.freeze({unique:byId.size,slots:totalSlots,complete:false,source:PARTIAL_CARD_SOURCE})});
}
