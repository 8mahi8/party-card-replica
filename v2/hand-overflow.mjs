/**
 * G4 research primitive: incoming traded artifact when the receiver has
 * already reached the original hand limit (18).
 *
 * Sources:
 * https://w.atwiki.jp/aniwotawiki/pages/47010.html
 * https://note.com/md_stardustman/n/nfc5dfb559f95
 * Both report that an incoming 19th artifact randomly ejects one of the
 * receiver's EXISTING 18. The precise original PRNG is not documented;
 * xorshift32 remains a LAB-only, deterministic test surrogate.
 */
import {drawRandom32} from './foundation.mjs';
import {MAX_HAND_SIZE} from '../src/rules.mjs';

export function planIncomingHandTransfer(hand,seed){
 if(!Array.isArray(hand)||hand.length>MAX_HAND_SIZE)
   throw new Error('Invalid receiver hand size');
 if(!Number.isSafeInteger(seed)||seed<=0||seed>0xffffffff)
   throw new Error('Invalid RNG seed');
 const ids=hand.map(x=>x?.instanceId);
 if(ids.some(x=>typeof x!=='string'||!x.length)||new Set(ids).size!==ids.length)
   throw new Error('Invalid receiver card instance IDs');
 if(hand.length<MAX_HAND_SIZE)
   return Object.freeze({willOverflow:false,evictedInstanceId:null,
     evictedIndex:null,nextSeed:seed});
 const draw=drawRandom32(seed);
 const index=Math.floor(draw.value*MAX_HAND_SIZE);
 return Object.freeze({willOverflow:true,evictedInstanceId:ids[index],
   evictedIndex:index,nextSeed:draw.nextSeed});
}
