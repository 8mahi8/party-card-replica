/**
 * G7 source-limited Flash miracle research ONLY.
 * The original miracle is MP3, light, 25%-accuracy ALL-target, attack1.
 * If >0 damage gets through, the surviving victim gains Flash.
 *
 * This function joins independently verified accuracy and common element /
 * damage rules WITHOUT staging a defense, charging MP, applying a status,
 * redirecting, refilling, or ending a turn. Whether a miss displays defense
 * UI and the exact redirect order are not yet confirmed in the original.
 *
 * The caller's hypothetical "defenses" are NOT consumed; they are useful
 * for comparing full protection with a damaging hit after an accuracy roll.
 */
import {planAreaAccuracyResearchFixture} from './area-accuracy-research.mjs';
import {calculateHit,sumLegalArmor} from '../src/rules.mjs';

export const FLASH_MIRACLE_RESEARCH=Object.freeze({
 referenceName:'閃光',attack:1,element:'light',mpCost:3,accuracyPercent:25,
 effect:'flash',scope:'allOpponents'
});
function fail(text){throw new Error('Flash miracle research: '+text);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function defenseEntry(def){
 if(!plain(def)||Object.keys(def).some(k=>!['rainbowCurtain','shields'].includes(k))||
    (def.rainbowCurtain!==undefined&&typeof def.rainbowCurtain!=='boolean')||
    !Array.isArray(def.shields))
   fail('Invalid hypothetical defense');
 if(def.shields.some(sh=>!plain(sh)||Object.keys(sh).sort().join(',')!=='element,guard'))
   fail('Invalid shield record');
 return def;
}
/** A preview, not a turn/match transition or a playable miracle. */
export function planFlashMiracleResearchFixture({
 players,sourceId,rngSeed,defenses={}
}={}){
 if(!plain(defenses))fail('Defenses must be a target-ID map');
 const source=players?.find?.(p=>p?.id===sourceId);
 if(!source||!Number.isSafeInteger(source.mp)||source.mp<3)
   fail('Caster needs original MP3 to attempt Flash');
 const base=planAreaAccuracyResearchFixture({
   players,sourceId,rngSeed,accuracyPercent:25
 });
 const eligible=new Set(base.outcomes.map(x=>x.targetId));
 if(Object.keys(defenses).some(id=>!eligible.has(id)))
   fail('Hypothetical defense for an ineligible target');
 const outcomes=base.outcomes.map(({targetId,hit})=>{
   const recipient=players.find(p=>p.id===targetId);
   const defense=defenseEntry(defenses[targetId]??{rainbowCurtain:false,shields:[]});
   // Even on a miss, validate declared hypothetical shield compatibility;
   // this does not mean the original game allows spending a shield on a miss.
   const guard=sumLegalArmor('light',defense.shields,{
     rainbowCurtain:defense.rainbowCurtain===true
   });
   const result=hit?
     calculateHit({attack:1,element:'light',armor:guard,
       hp:recipient.hp,rainbowCurtain:defense.rainbowCurtain===true}):
     {damage:0,hpAfter:recipient.hp,instantDefeat:false};
   return Object.freeze({
     targetId,accuracyHit:hit,
     damage:result.damage,hpAfter:result.hpAfter,
     wouldInflictFlash:hit&&result.damage>0&&result.hpAfter>0
   });
 });
 return Object.freeze({
   miracle:FLASH_MIRACLE_RESEARCH,
   outcomes:Object.freeze(outcomes),nextSeed:base.nextSeed,
   // Do not expose an alleged MP spent amount. The caller's MP is untouched.
   mpRequirement:3
 });
}
