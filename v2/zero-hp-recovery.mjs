/**
 * G4 reusable, pure HP=0 passive-trigger planner.
 *
 * Source-backed Sun Charm: one held copy is consumed automatically when
 * HP reaches zero; the holder resumes with HP10. Surplus hit damage does
 * not carry across that revival, and additional charms stay for future
 * zero-HP events. This plan never advances turns, transfers goods, or pays
 * forced-sale proceeds.
 *
 * https://w.atwiki.jp/piong/pages/19.html
 * https://w.atwiki.jp/piong/pages/21.html
 * https://ameblo.jp/roctar1550/entry-12169716304.html
 */
function fail(message){throw new Error(message);}
export function planZeroHpRecoveryFixture({player,catalog,hpAfter}={}){
 if(!player||!Array.isArray(player.hand)||!(catalog instanceof Map)||
    !Number.isSafeInteger(player.hp)||player.hp<=0||
    !Number.isSafeInteger(hpAfter)||hpAfter<0||hpAfter>player.hp)
   fail('Invalid zero-HP recovery context');
 if(hpAfter>0)
   return Object.freeze({kind:'survived',hpAfter,consumedInstanceId:null,
     restoredHp:null});
 for(const card of player.hand){
   const def=catalog.get(card?.definitionId);
   const source=def?.effects?.find(e=>e.when==='onZeroHp'&&
     e.type==='reviveAtZeroHp'&&e.params.hp===10);
   if(source){
     if(def.family!=='item'||!def.playModes.includes('passive')||
        def.discardPolicy!=='forbidden')
       fail('Malformed passive resurrection definition');
     return Object.freeze({kind:'revived',hpAfter:10,
       consumedInstanceId:card.instanceId,
       consumedDefinitionId:card.definitionId,restoredHp:10});
   }
 }
 return Object.freeze({kind:'eliminated',hpAfter:0,
   consumedInstanceId:null,restoredHp:null});
}
