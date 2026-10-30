/**
 * Original-faithful disease family only (not mist/flash/dream/dark cloud).
 * Sources: Piong disaster list (2026), beginner rules, AnimeWiki.
 * All mutations are applied in the host effect runner, never on a client.
 */
const STAGES=Object.freeze(['cold','fever','hell','heaven']);
export const DISEASE_STAGES=STAGES;
export function assertDisease(value){
 if(value!==null&&value!==undefined&&!STAGES.includes(value))
   throw new Error('Unknown illness stage');
 return value??null;
}
/** Any new disease exposure escalates an existing stage by exactly one. */
export function planDiseaseExposure(disease){
 const old=assertDisease(disease);
 if(old==='heaven')return Object.freeze({disease:'heaven',fatal:true,escalated:true});
 if(old===null)return Object.freeze({disease:'heaven',fatal:false,escalated:false});
 return Object.freeze({disease:STAGES[STAGES.indexOf(old)+1],
   fatal:false,escalated:true});
}
/**
 * Disease damage/healing is applied at the end of the sufferer's own turn.
 * Five-percent progression is a separate authoritative PRNG sample.
 * When no disease is present, RNG MUST stay unchanged.
 */
export function planDiseaseTurnEnd(disease,hp,roll){
 const stage=assertDisease(disease);
 if(!Number.isSafeInteger(hp)||hp<1||hp>99)
   throw new Error('Invalid disease turn HP');
 if(stage===null)return Object.freeze({disease:null,hpAfter:hp,
   advanced:false,fatal:false});
 if(typeof roll!=='number'||!Number.isFinite(roll)||roll<0||roll>=1)
   throw new Error('Invalid disease progression roll');
 const delta={cold:-1,fever:-2,hell:-5,heaven:5}[stage];
 const adjusted=Math.max(0,Math.min(99,hp+delta));
 if(roll<0.05){
  if(stage==='heaven')return Object.freeze({disease:'heaven',hpAfter:0,
    advanced:true,fatal:true});
  return Object.freeze({disease:STAGES[STAGES.indexOf(stage)+1],
    hpAfter:adjusted,advanced:true,fatal:false});
 }
 return Object.freeze({disease:stage,hpAfter:adjusted,advanced:false,fatal:false});
}
