import test from 'node:test';
import assert from 'node:assert/strict';
import { KALSHI_BOT_SERIES, isSupportedKalshiTicker, kalshiSeriesOf, pickOpenMarket } from '../lib/kalshi-markets.mjs';

test('the kit accepts the same Kalshi series as the public HiveTrade list, matched exactly', () => {
  const all = Object.values(KALSHI_BOT_SERIES).flat();
  assert.ok(all.length > 150 && new Set(all).size === all.length);
  for (const series of ['KXBTC15M', 'KXEPLGAME', 'KXNFLGAME', 'KXFEDDECISION', 'KXHIGHNY', 'KXCS2GAME']) assert.ok(all.includes(series), series);
  assert.equal(kalshiSeriesOf('KXNFLGAME-26OCT19WASSF-SF'), 'KXNFLGAME');
  assert.equal(isSupportedKalshiTicker('KXNFLGAMETD-26OCT19WASSF-X'), false);
  assert.equal(isSupportedKalshiTicker('KXHIGHNY-26OCT25-T60.5'), true);
  for (const bad of ['', 'kxbtc15m-x', 'KXBTC15M', 'KXBTC15M-a b', null]) assert.equal(isSupportedKalshiTicker(bad), false, String(bad));
});
test('KALSHI_SERIES picks a market only when exactly one is open now; it never reads prices', () => {
  const now = Date.parse('2026-10-25T12:05:00Z');
  const m = (ticker, open, close, status = 'active') => ({ ticker, status, open_time: open, close_time: close, yes_ask_dollars: '0.50' });
  assert.deepEqual(pickOpenMarket([m('KXBTC15M-A', '2026-10-25T12:00:00Z', '2026-10-25T12:15:00Z'), m('KXBTC15M-B', '2026-10-25T12:15:00Z', '2026-10-25T12:30:00Z'),
    m('KXBTC15M-C', '2026-10-25T11:45:00Z', '2026-10-25T12:00:00Z'), m('KXBTC15M-D', '2026-10-25T12:00:00Z', '2026-10-25T12:15:00Z', 'closed')], 'KXBTC15M', now), { ticker: 'KXBTC15M-A' });
  assert.deepEqual(pickOpenMarket([], 'KXBTC15M', now), { ticker: null, open: [] });
  assert.deepEqual(pickOpenMarket([m('KXEPLGAME-A', null, '2026-10-26T00:00:00Z'), m('KXEPLGAME-B', null, '2026-10-27T00:00:00Z')], 'KXEPLGAME', now), { ticker: null, open: ['KXEPLGAME-A', 'KXEPLGAME-B'] });
});
