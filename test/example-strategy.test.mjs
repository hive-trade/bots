// Tests for the EXAMPLE rule that ships in strategy.mjs.
// When you replace strategy.mjs with your own rule, replace this file with
// tests for your rule (keep the name, or rename it to my-strategy.test.mjs).
// The kit's other tests never load strategy.mjs, so they keep passing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { strategy } from '../strategy.mjs';

test('example rule: skips until configured, buys only at or below the price cap', () => {
  assert.equal(strategy({ yesAsk: 0.4 }, {}), null);
  assert.deepEqual(strategy({ yesAsk: 0.4 }, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: '0.45' }), { side: 'yes', maxPrice: 0.45 });
  assert.equal(strategy({ yesAsk: 0.46 }, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: '0.45' }), null);
  assert.throws(() => strategy({}, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: 'NaN' }));
});
