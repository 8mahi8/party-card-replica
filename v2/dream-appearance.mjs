/**
 * V2 laboratory-only Dream (formerly hallucination) appearance boundary.
 *
 * Dream changes what a player SEES, never the definition of the physical
 * artifact. Do not use the incomplete reference deck to roll 50% Dream
 * appearance: original disguise candidates are weighted by the FULL deck,
 * and must match usable timing. This module only accepts an explicit,
 * already-chosen fixture disguise with strict same-timing validation.
 *
 * Sources:
 * https://macarongamemo.com/entry/godfield-dream (2026-04-05)
 * https://w.atwiki.jp/piong/pages/23.html
 * https://note.com/rich_echium152/n/n02fdc4949096 (creator 2022 quote)
 * https://ameblo.jp/godfield-tactics/entry-12100951333.html
 */
function fail(message){throw new Error(message);}
function cardDef(catalog,id){
 const def=catalog.get(id);
 if(!def)fail('Dream appearance requires known card definitions');
 return def;
}
/**
 * Conservative equivalence: same playable-mode set, family, defense-effect
 * trigger/target and discard handling. This is deliberately STRICTER than
 * the original and never an attempt to model the full disguise distribution.
 */
export function dreamTimingSignatureFixture(def){
 if(!def||!Array.isArray(def.playModes)||!Array.isArray(def.effects))
   fail('Invalid Dream timing definition');
 const effects=def.effects.filter(e=>e.when==='onDefense')
   .map(e=>[e.type,e.params?.mode??null,e.params?.scope??null])
   .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return JSON.stringify({
   family:def.family,
   playModes:[...def.playModes].sort(),
   guardUsable:def.stats.guard>0,
   defenseEffects:effects,
   discardPolicy:def.discardPolicy
 });
}
/** Return immutable room with an explicitly fixture-verified appearance. */
export function attachDreamAppearanceFixture(state,catalog,{
 seatId,instanceId,appearsAsDefinitionId
}={}){
 if(!state||state.schemaVersion!==2||!Array.isArray(state.players)||
   !(catalog instanceof Map)||typeof seatId!=='string'||
   typeof instanceId!=='string'||typeof appearsAsDefinitionId!=='string')
   fail('Invalid Dream fixture request');
 const owner=state.players.find(p=>p.id===seatId);
 const held=owner?.hand.find(c=>c.instanceId===instanceId);
 if(!held||owner.hp<=0||state.phase!=='turn')fail('Dream fixture requires held living card');
 const trueDef=cardDef(catalog,held.definitionId);
 const displayDef=cardDef(catalog,appearsAsDefinitionId);
 if(trueDef.id===displayDef.id)fail('Dream fixture must have distinct appearance');
 // 2026 documentation: trade, miracles, unique-timing artifacts unaffected.
 if(['trade','miracle'].includes(trueDef.family)||trueDef.playModes.includes('passive')||
    ['trade','miracle'].includes(displayDef.family)||
    trueDef.playModes.some(x=>!['mainAttack','addAttack','defend','support'].includes(x))||
    dreamTimingSignatureFixture(trueDef)!==dreamTimingSignatureFixture(displayDef))
   fail('Dream appearance must share verified usable timing');
 const already=owner.dreamDisguises??[];
 if(!Array.isArray(already)||already.some(x=>x.instanceId===instanceId))
   fail('Duplicate Dream appearance fixture');
 return {
   ...state,players:state.players.map(p=>p.id===seatId?{
     ...p,dreamDisguises:[...already.map(x=>({...x})),
       {instanceId,appearsAsDefinitionId}]
   }:p)
 };
}
/**
 * Strict private presentation helper. The true identity is NEVER included
 * in a self-facing projected card when a disguise is present.
 * This deliberately does not disclose dreamDisguises to either seat.
 */
export function dreamVisibleDefinitionIdFixture(player,card,catalog){
 const entries=player.dreamDisguises;
 if(entries===undefined)return card.definitionId;
 if(!Array.isArray(entries))fail('Invalid Dream fixture state');
 const matching=entries.filter(x=>x.instanceId===card.instanceId);
 if(matching.length>1)fail('Duplicate Dream appearance state');
 if(!matching.length)return card.definitionId;
 if(!(catalog instanceof Map))fail('Dream presentation requires catalog');
 const visual=cardDef(catalog,matching[0].appearsAsDefinitionId);
 const actual=cardDef(catalog,card.definitionId);
 if(dreamTimingSignatureFixture(visual)!==dreamTimingSignatureFixture(actual))
   fail('Dream presentation timing mismatch');
 return visual.id;
}
