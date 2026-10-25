// pm-op-v1: a new Polymarket bot only signs the Call; HiveTrade places the
// order in the Hive owner's own HiveTrade account. These vectors are the same
// bytes as HiveTrade's developer guide (docs/bots/developer-guide.md §3b) and
// its bot-kit contract test, so the starter and the API cannot drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';
import { signalMessage, exitMessage, configMessage, isLimitPrice, readBotConfig, requestExit, PM_OP_EXECUTION, KIT_CAPABILITIES } from '../lib/protocol.mjs';
import { operatorLimitPrice } from '../lib/polymarket.mjs';
import { config } from '../lib/config.mjs';
import { execute } from '../lib/run.mjs';
// Public deterministic test key, never funded or used on a network.
const account = privateKeyToAccount(`0x${'01'.repeat(32)}`);
// A Call carries no amount: no stakeUsd. HiveTrade stakes the Hive's Amount per Call.
const op = { hiveId: 4300, venue: 'polymarket', conditionId: '0xabc123', side: 'yes', signalStrength: 100,
  limitPrice: 0.53, execution: PM_OP_EXECUTION, nonce: 'pmop-0xabc123', issuedAt: 1700000000000, intent: true };

test('fixed pm-op-v1 signal vector (same bytes as HiveTrade\'s developer guide)', async () => {
  assert.equal(signalMessage(op), [
    'HiveTrade bot signal pm-op-v1', 'hive:4300', 'venue:polymarket', 'condition:0xabc123', 'side:yes',
    'signal:100', 'limitPrice:0.53', 'execution:hivetrade-operator-v1', 'nonce:pmop-0xabc123',
    'issuedAt:1700000000000', 'intent:true'].join('\n'));
  const signature = await account.signMessage({ message: signalMessage(op) });
  assert.equal(await recoverMessageAddress({ message: signalMessage(op), signature }), account.address);
  assert.notEqual(await recoverMessageAddress({ message: signalMessage({ ...op, limitPrice: 0.6 }), signature }), account.address);
  // An amount cannot be added after signing; an older bot's shape (with a
  // stake line) is different bytes, which HiveTrade still verifies as signed.
  assert.notEqual(await recoverMessageAddress({ message: signalMessage({ ...op, stakeUsd: 1 }), signature }), account.address);
  assert.match(signalMessage({ ...op, stakeUsd: 1 }), /\nsignal:100\nstake:1\nlimitPrice:0\.53\n/);
});

test('fixed pm-op-v1 exit vector and config message', () => {
  assert.equal(exitMessage({ hiveId: 4300, conditionId: '0xABC123', side: 'yes', nonce: 'pmop-exit-1', issuedAt: 1700000000000 }), [
    'HiveTrade bot exit pm-op-v1', 'hive:4300', 'venue:polymarket', 'condition:0xabc123', 'side:yes',
    'execution:hivetrade-operator-v1', 'nonce:pmop-exit-1', 'issuedAt:1700000000000'].join('\n'));
  assert.equal(configMessage(42), 'hivetrade:bot-config:42');
  assert.equal(configMessage(42, ['pm-op-v1']), 'hivetrade:bot-config:42:capabilities:pm-op-v1');
  assert.deepEqual(KIT_CAPABILITIES, ['pm-op-v1']);
});

test('limit prices: between 0 and 1, at most 4 decimals', () => {
  for (const [p, ok] of [[0.53, true], [0.0001, true], [0.12345, false], [0, false], [1, false], ['0.5', false]]) assert.equal(isLimitPrice(p), ok, String(p));
});

test('the limit price is the strategy maxPrice rounded down to the market tick', async () => {
  const market = { yesToken: '1', noToken: '2' };
  const tick = t => async () => ({ minimum_tick_size: t });
  assert.equal(await operatorLimitPrice(market, { side: 'yes', maxPrice: 0.537 }, tick('0.01')), 0.53);
  assert.equal(await operatorLimitPrice(market, { side: 'no', maxPrice: 0.5379 }, tick('0.001')), 0.537);
  await assert.rejects(operatorLimitPrice(market, { side: 'yes', maxPrice: 0.005 }, tick('0.01')), /smallest price step/);
});

test('the mode check declares pm-op-v1 inside the signed bytes', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, headers: init.headers }; return { ok: true, json: async () => ({ hiveId: 7, pmCaptainExecution: 'operator' }) }; };
  const answer = await readBotConfig({ account, api: 'https://api.hivetrade.com', fetchImpl });
  assert.equal(answer.pmCaptainExecution, 'operator');
  assert.equal(seen.url, 'https://api.hivetrade.com/api/bot/config');
  assert.equal(seen.headers['x-bot-capabilities'], 'pm-op-v1');
  const message = configMessage(Number(seen.headers['x-bot-issued-at']), ['pm-op-v1']);
  assert.equal(await recoverMessageAddress({ message, signature: seen.headers['x-bot-signature'] }), account.address);
});

test('an exit request is signed and carries no order', async () => {
  let sent;
  await requestExit({ account, api: 'https://api.hivetrade.com', hiveId: 7, conditionId: '0xab', side: 'no', nonce: 'n',
    request: async (url, body) => { sent = { url, body }; return { ok: true }; } });
  assert.equal(sent.url, 'https://api.hivetrade.com/api/bot/exit');
  assert.deepEqual(Object.keys(sent.body).sort(), ['request', 'signature']);
  assert.equal(await recoverMessageAddress({ message: exitMessage(sent.body.request), signature: sent.body.signature }), account.address);
});

test('the legacy flag is opt-in and validated', () => {
  assert.equal(config({ VENUE: 'polymarket' }).legacySelfManaged, false);
  assert.equal(config({ VENUE: 'polymarket', POLYMARKET_LEGACY_SELF_MANAGED: 'true' }).legacySelfManaged, true);
  assert.equal(config({ VENUE: 'kalshi', POLYMARKET_LEGACY_SELF_MANAGED: 'true' }).legacySelfManaged, false);
  assert.throws(() => config({ VENUE: 'polymarket', POLYMARKET_LEGACY_SELF_MANAGED: 'yes' }), /LEGACY/);
});

function harness(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-operator-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { cfg: { stateDir: dir, api: 'https://api.hivetrade.com', hiveId: 4300 }, account, signal: op };
}

test('pm-op-v1 sends ONE signal and never places a local order or reports a fill', async t => {
  const h = harness(t); const calls = [];
  const result = await execute({ ...h, request: async (url, body) => { calls.push({ url, body }); return { accepted: true, marketId: 55 }; },
    submitOrder: () => assert.fail('no local order on pm-op-v1') });
  assert.deepEqual(result, { marketId: 55, accepted: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.hivetrade.com/api/bot/signal');
  assert.equal(await recoverMessageAddress({ message: signalMessage(calls[0].body.signal), signature: calls[0].body.signature }), account.address);
  await assert.rejects(execute({ ...h, request: () => assert.fail('no resend') }), /already attempted/);
});

test('a clean skip is complete and places nothing', async t => {
  const h = harness(t);
  const result = await execute({ ...h, request: async () => ({ accepted: false, skipped: true, code: 'BOT_TOTAL_BUDGET_REACHED' }),
    submitOrder: () => assert.fail('no local order') });
  assert.deepEqual(result, { skipped: true, code: 'BOT_TOTAL_BUDGET_REACHED' });
  assert.equal(JSON.parse(readFileSync(join(h.cfg.stateDir, 'journal.json')))[0].status, 'complete');
});

test('a timeout or an unrecognised answer stays unresolved and is never resent', async t => {
  for (const request of [async () => { throw new Error('timeout'); }, async () => ({ ok: true })]) {
    const h = harness(t);
    await assert.rejects(execute({ ...h, request, submitOrder: () => assert.fail('no local order') }));
    await assert.rejects(execute({ ...h, signal: { ...op, conditionId: '0xother' }, request: () => assert.fail('no resend') }), /Unresolved/);
  }
});
