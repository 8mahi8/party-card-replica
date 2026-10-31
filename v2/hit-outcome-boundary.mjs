/**
 * G3/G7 research contract: describe a single settled hit BEFORE optional
 * passive HP-0 recovery. This is pure observation, not a lifesteal/status
 * implementation, and must not be used to infer undocumented original rules.
 *
 * Different values matter: printed/attempted damage, HP actually lost,
 * overkill, an instant defeat, and post-hit passive recovery are NOT
 * interchangeable when future special weapon effects are implemented.
 */
function fail(message) { throw new Error(message); }
function nonnegativeSafe(n) { return Number.isSafeInteger(n) && n >= 0; }

export function inspectHitOutcomeBoundaryFixture({
  beforeHp, damage, hpAfter, instantDefeat, revivedHp = null
} = {}) {
  if(!nonnegativeSafe(beforeHp) || beforeHp===0)
    fail('Hit boundary requires a living target and valid starting HP');
  if(!nonnegativeSafe(damage) || !nonnegativeSafe(hpAfter) ||
     typeof instantDefeat !== 'boolean')
    fail('Malformed hit boundary');
  if(instantDefeat) {
    if(damage===0 || hpAfter!==0)
      fail('Instant defeat requires a positive hit ending at zero HP');
  } else if(hpAfter !== Math.max(0,beforeHp-damage)) {
    fail('Damage and resulting HP disagree');
  }
  if(revivedHp !== null &&
     (!nonnegativeSafe(revivedHp) || revivedHp===0 || hpAfter!==0))
    fail('Recovery can only follow a zero-HP hit');
  const hpLost = beforeHp-hpAfter;
  const overkill = instantDefeat ? null : Math.max(0,damage-beforeHp);
  const hitKind = damage===0 ? 'zero-damage'
    : instantDefeat ? 'instant-defeat'
    : overkill>0 ? 'overkill' : 'ordinary-hit';
  return Object.freeze({
    beforeHp,damage,hpAfter,hpLost,overkill,
    instantDefeat,revived:revivedHp!==null,revivedHp,
    hitKind,
    // Preserve the distinction: a future onHit policy must consciously
    // choose a source-backed amount and cannot quietly use one of these.
    requiresSpecialEffectTimingReview:
      instantDefeat || overkill>0 || revivedHp!==null
  });
}
