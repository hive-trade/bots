import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';
import { signalMessage, fillMessage, walletMessage, kalshiStake } from '../lib/protocol.mjs';
import { config } from '../lib/config.mjs';
import { strategy } from '../strategy.mjs';
import { interpretOrder } from '../lib/polymarket.mjs';
import { execute } from '../lib/run.mjs';
// Public deterministic test key, never funded or used on a network.
const account = privateKeyToAccount(`0x${'01'.repeat(32)}`);
const pm = { hiveId: 42, venue: 'polymarket', conditionId: 'condition', side: 'yes',
  signalStrength: 25, stakeUsd: 1, orderType: 'marketable', nonce: 'test', issuedAt: 1789480000000, intent: true };
const kalshi = { hiveId: 42, venue: 'kalshi', kalshiTicker: 'KXBTC15M-EXAMPLE', side: 'no',
  signalStrength: 25, stakeUsd: 0.52, kalshiContracts: 1, kalshiPriceCents: 50,
  execution: 'hivetrade-v1', nonce: 'test', issuedAt: 1789480000000, intent: true };
const actual = { filled: true, orderID: 'order', status: 'matched', filledUsd: 0.8, sizeShares: 2, avgPrice: 0.4 };
test('fixed Polymarket wire vector and signature recovery', async () => {
  assert.equal(signalMessage(pm), 'HiveTrade bot signal v1\nhive:42\ncondition:condition\nside:yes\nsignal:25\nstake:1\norder:marketable\nnonce:test\nissuedAt:1789480000000\nintent:true');
  const signature = await account.signMessage({ message: signalMessage(pm) });
  assert.equal(await recoverMessageAddress({ message: signalMessage(pm), signature }), account.address);
  assert.notEqual(await recoverMessageAddress({ message: signalMessage({ ...pm, stakeUsd: 2 }), signature }), account.address);
});
test('fixed Kalshi v2 vector and fee rounding', () => {
  assert.equal(signalMessage(kalshi), 'HiveTrade bot signal kalshi-v2\nhive:42\nvenue:kalshi\nticker:KXBTC15M-EXAMPLE\nside:no\nsignal:25\nstake:0.52\ncontracts:1\npriceCents:50\nexecution:hivetrade-v1\nnonce:test\nissuedAt:1789480000000\nintent:true');
  assert.equal(kalshiStake(1, 50), 0.52); assert.equal(kalshiStake(1, 2), 0.03);
  assert.equal(kalshiStake(3, 50), 1.56);
});
test('fill and wallet binding fixed vectors', () => {
  assert.equal(fillMessage({ hiveId: 42, marketId: 9, fillResult: actual, nonce: 'n', issuedAt: 123 }),
    'HiveTrade bot fill v1\nhive:42\nmarket:9\nfilled:true\norder:order\nfilledUsd:0.8\nshares:2\nnonce:n\nissuedAt:123');
  assert.equal(walletMessage({ hiveId: 42, walletAddress: '0xABCD', issuedAt: 123 }), 'hivetrade:bot-register-wallet:42:0xabcd:123');
});
test('strategy defaults to skip and rejects invalid caps', () => {
  assert.equal(strategy({ yesAsk: 0.4 }, {}), null);
  assert.deepEqual(strategy({ yesAsk: 0.4 }, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: '0.45' }), { side: 'yes', maxPrice: 0.45 });
  assert.equal(strategy({ yesAsk: 0.46 }, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: '0.45' }), null);
  assert.throws(() => strategy({}, { EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: 'NaN' }));
});
test('configuration cannot silently enable trading or redirect signed requests', () => {
  const env = { VENUE: 'kalshi', BOT_HIVE_ID: '42' };
  assert.equal(config(env).live, false);
  for (const patch of [{ BOT_HIVE_ID: '1.5' }, { MAX_STAKE_USD: '-1' }, { BOT_LIVE_TRADING_ENABLED: 'yes' }, { BOT_API_URL: 'https://example.com' }, { SIGNAL_STRENGTH: '11' }]) assert.throws(() => config({ ...env, ...patch }));
});
test('order ID and requested amount never stand in for real fills', () => {
  const response = { orderID: 'o', status: 'matched', makingAmount: '0.8', takingAmount: '2' };
  assert.equal(interpretOrder(response, 1, account.address).filledUsd, 0.8);
  for (const patch of [{ status: 'live' }, { status: 'delayed' }, { makingAmount: undefined }, { takingAmount: 'NaN' }, { orderID: '' }, { success: false }, { error: 'timeout' }, { makingAmount: 2 }]) assert.throws(() => interpretOrder({ ...response, ...patch }, 1, account.address));
});
function harness(t, signal = pm) {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-example-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { cfg: { stateDir: dir, api: 'https://api.hivetrade.com', hiveId: 42 }, account, signal };
}
test('PM places exactly one order after go and reports actual fill; restart blocks duplicates', async t => {
  const h = harness(t); const calls = []; let orders = 0;
  const request = async (url, body) => { calls.push({ url, body }); return calls.length === 1 ? { id: 9, go: true } : { ok: true }; };
  await execute({ ...h, request, submitOrder: async () => { orders++; return actual; } });
  assert.equal(orders, 1); assert.equal(calls.length, 2);
  assert.equal(calls[1].body.fill.fillResult.filledUsd, 0.8);
  await assert.rejects(execute({ ...h, request, submitOrder: async () => { orders++; } }), /already attempted/);
  assert.equal(orders, 1);
});
test('go:false never places an order', async t => {
  await execute({ ...harness(t), request: async () => ({ id: 9, go: false }), submitOrder: () => assert.fail('must not order') });
});
test('missing go and signal timeout never place an order; unresolved journal blocks retries', async t => {
  for (const request of [async () => ({ id: 9 }), async () => { throw new Error('timeout'); }]) {
    const h = harness(t);
    await assert.rejects(execute({ ...h, request, submitOrder: () => assert.fail('must not order') }));
    await assert.rejects(execute({ ...h, signal: { ...pm, conditionId: 'another' }, request: () => assert.fail('must not resend') }), /Unresolved/);
  }
});
test('order timeout or fill-report timeout does not cause a second order', async t => {
  for (const phase of ['order', 'report']) {
    const h = harness(t); let orders = 0; let requests = 0;
    await assert.rejects(execute({ ...h,
      request: async () => { if (++requests === 1) return { id: 9, go: true }; throw new Error('timeout'); },
      submitOrder: async () => { orders++; if (phase === 'order') throw new Error('timeout'); return actual; },
    }));
    await assert.rejects(execute({ ...h, request: () => assert.fail('no retry'), submitOrder: () => assert.fail('no second order') }), /Unresolved/);
    assert.equal(orders, 1);
    const records = JSON.parse(readFileSync(join(h.cfg.stateDir, 'journal.json')));
    assert.equal(records[0].status, phase === 'order' ? 'placing-order' : 'reporting-fill');
  }
});
test('Kalshi v2 never places a local order or reports a fill', async t => {
  const h = harness(t, kalshi); let requests = 0;
  await execute({ ...h, request: async () => { requests++; return { id: 9, venue: 'kalshi', accepted: true, captainFill: { filled: true } }; }, submitOrder: () => assert.fail('no local Kalshi order') });
  assert.equal(requests, 1);
});
test('Kalshi accepted without a fill remains unresolved', async t => {
  const h = harness(t, kalshi);
  await assert.rejects(execute({ ...h, request: async () => ({ id: 9, venue: 'kalshi', accepted: true }) }), /unconfirmed/);
  await assert.rejects(execute({ ...h, request: () => assert.fail('no retry') }), /Unresolved/);
});
test('concurrent or crashed runner lock blocks a second process', async t => {
  const h = harness(t); mkdirSync(join(h.cfg.stateDir, 'runner.lock'));
  await assert.rejects(execute({ ...h, request: () => assert.fail('no request') }), /EEXIST/);
});
