/**
 * G4 LAB-ONLY pure exchanger for the original "両替" trade artifact.
 *
 * HP : MP : money is 1:1:1; source-backed explanations:
 * https://godfield-beginner.game-info.wiki/
 * https://w.atwiki.jp/aniwotawiki/pages/47010.html
 * https://macarongamemo.com/entry/godfield-artifact
 *
 * Original random forced exchanges may set HP=0, but a manually selected
 * zero-HP outcome is not confirmed. That branch remains fail-closed.
 * This routine does NOT advance a turn, spend a card, draw, or authenticate.
 */
function fail(message){throw new Error(message);}
function safePool(v,label,{positive=false}={}){
 if(!Number.isSafeInteger(v)||v<0||(positive&&v===0))
   fail('Invalid exchange '+label);
 return v;
}
function normalize(x,label,{living=false}={}){
 if(x===null||typeof x!=='object'||Array.isArray(x)||
    Object.keys(x).length!==3||!['hp','mp','money'].every(k=>Object.hasOwn(x,k)))
   fail('Invalid exchange '+label);
 return Object.freeze({
   hp:safePool(x.hp,label+' HP',{positive:living}),
   mp:safePool(x.mp,label+' MP'),
   money:safePool(x.money,label+' money')
 });
}
/**
 * Pure one-to-one resource allocation. The caller's object is never mutated.
 * Exactly 3 explicit integer pools and safe-integer conservation are required.
 */
export function previewExchangeFixture(before,allocation){
 const from=normalize(before,'origin',{living:true});
 const to=normalize(allocation,'allocation',{living:true});
 const total=from.hp+from.mp+from.money;
 if(!Number.isSafeInteger(total))fail('Exchange total exceeds safe integer range');
 const next=to.hp+to.mp+to.money;
 if(!Number.isSafeInteger(next)||next!==total)
   fail('Exchange must conserve total HP, MP and money');
 return Object.freeze({
   type:'exchangePreview',before:from,after:to,total,
   changed:from.hp!==to.hp||from.mp!==to.mp||from.money!==to.money
 });
}
