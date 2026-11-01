/**
 * G3 research primitive: the payment side of original "売る" (forced sale).
 *
 * Original rule: debit buyer money first, then MP, then HP. Example:
 * buyer HP15/MP10/¥5 buying a ¥25 card -> HP5/MP0/¥0.
 *
 * Evidence: https://w.atwiki.jp/aniwotawiki/pages/47010.html
 * Independently: https://w.atwiki.jp/piong/pages/19.html
 *
 * This is a PURE calculation. It does not transfer cards, create money,
 * end turns, refill hands, or decide a sale's lethal seller payout.
 *
 * The special case where price exceeds all three available pools kills the
 * buyer, but original evidence does not establish whether the seller receives
 * the full nominal price or only the available payment. Do not guess:
 * settlement='lethal-unverified' and sellerCredit=null.
 */
const int=(x,label)=>{
 if(!Number.isSafeInteger(x)||x<0)throw new Error('Invalid '+label);
 return x;
};
/** Compute forced-sale debit without performing an unaudited trade. */
export function planForcedSalePayment({price,buyer}={}){
 if(!buyer||typeof buyer!=='object'||Array.isArray(buyer))
   throw new Error('Invalid buyer');
 const amount=int(price,'sale price'),hp=int(buyer.hp,'buyer HP'),
  mp=int(buyer.mp,'buyer MP'),money=int(buyer.money,'buyer money');
 if(hp===0)throw new Error('Buyer is eliminated');
 const moneySpent=Math.min(money,amount);
 const mpSpent=Math.min(mp,amount-moneySpent);
 const hpSpent=Math.min(hp,amount-moneySpent-mpSpent);
 const unpaid=amount-moneySpent-mpSpent-hpSpent;
 const paid=amount-unpaid;
 const next=Object.freeze({
  hp:hp-hpSpent,mp:mp-mpSpent,money:money-moneySpent
 });
 return Object.freeze({
  kind:'forcedSale',price:amount,
  debit:Object.freeze({money:moneySpent,mp:mpSpent,hp:hpSpent}),
  paid,unpaid,buyerAfter:next,
  buyerEliminated:next.hp===0,
  settlement:unpaid>0?'lethal-unverified':'complete',
  sellerCredit:unpaid>0?null:paid
 });
}
