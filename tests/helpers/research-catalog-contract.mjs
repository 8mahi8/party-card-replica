/**
 * One deliberate, independently maintained snapshot of the PARTIAL research deck.
 *
 * When new source-verified cards are added, update this ONE snapshot after
 * reviewing each new definition and its reference. Individual gameplay tests
 * should import the constants instead of embedding 90/209 everywhere.
 *
 * A matching snapshot does NOT imply the 353-card / 500-slot original deck
 * is complete, nor does it authorize random production draws.
 */
export const RESEARCH_CATALOG_CONTRACT=Object.freeze({
  unique:162,
  slots:406,
  complete:false
});
