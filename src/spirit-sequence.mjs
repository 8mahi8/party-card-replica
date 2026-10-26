/**
 * Pure ordered-selection rule for spirit items. The spirit item waives the
 * MP cost of the immediately preceding miracle, never an earlier miracle.
 * Reference: https://w.atwiki.jp/gfplusa/pages/19.html
 * and https://note.com/oreapo_note/n/n7791e8e30943
 *
 * This does not decide if arbitrary card sequences are otherwise playable.
 */
export function priceMiracleSequence(sequence) {
  if (!Array.isArray(sequence) || sequence.length === 0) throw new Error('Empty miracle sequence');
  let payableMP = 0;
  const discountedPositions = [];
  let previousType = null;
  for (let i = 0; i < sequence.length; i++) {
    const entry = sequence[i];
    if (!entry || typeof entry !== 'object') throw new TypeError('Invalid selection entry');
    if (entry.type === 'miracle') {
      if (!Number.isSafeInteger(entry.mpCost) || entry.mpCost < 0)
        throw new RangeError('Invalid miracle cost');
      payableMP += entry.mpCost;
    } else if (entry.type === 'spirit') {
      if (previousType !== 'miracle') throw new Error('Spirit must immediately follow one miracle');
      const miracle = sequence[i - 1];
      payableMP -= miracle.mpCost;
      discountedPositions.push(i - 1);
    } else if (entry.type !== 'weapon') {
      throw new Error('Unknown selection entry type');
    }
    previousType = entry.type;
  }
  return Object.freeze({payableMP, discountedPositions:Object.freeze(discountedPositions)});
}
