// Tests for the EXAMPLE rule that ships in strategy.mjs.
// When you replace strategy.mjs with your own rule, replace this file with
// tests for your rule (keep the name, or rename it to my-strategy.test.mjs).
// The kit's other tests never load strategy.mjs, so they keep passing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { strategy } from '../strategy.mjs';

const trades = decision => Boolean(decision && decision.skip !== true);

test('example rule: skips until configured, buys only at or below the price cap', () => {
  assert.equal(trades(strategy({ yesAsk: 0.4 }, {})), false);
  const buy = strategy({ yesAsk: 0.4 }, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: '0.45' });
  assert.equal(buy.side, 'yes'); assert.equal(buy.maxPrice, 0.45);
  assert.equal(trades(strategy({ yesAsk: 0.45 }, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: '0.45' })), true, 'the cap is inclusive');
  assert.equal(trades(strategy({ yesAsk: 0.46 }, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: '0.45' })), false);
  assert.equal(trades(strategy({ yesAsk: null }, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: '0.45' })), false, 'missing book');
  assert.throws(() => strategy({}, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: 'NaN' }));
});
test('example rule: every decision explains itself for the dry run trace', () => {
  for (const [market, env] of [[{ yesAsk: 0.4 }, {}], [{ yesAsk: 0.4 }, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: '0.45' }], [{ noAsk: 0.9 }, { EXAMPLE_SIDE: 'no', EXAMPLE_MAX_PRICE: '0.45' }]]) {
    const { reasons } = strategy(market, env);
    assert.ok(Array.isArray(reasons) && reasons.length > 0 && reasons.every(r => typeof r === 'string'));
  }
});
