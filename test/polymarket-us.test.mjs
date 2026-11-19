// pmus-v1: a Polymarket US bot only signs the Call; HiveTrade places the
// order in the Hive owner's own Polymarket US account. The wire vectors below
// were printed by HiveTrade's own `botSignalMessage` (the function the API
// verifies with, bot-kit `botSignal.ts`) for these exact inputs, on
// 2026-11-19, and the signatures by that same message signed with the public
// test key below. They are literals on purpose: the starter's own code never
// produces its expected values, so the starter and the API cannot drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';
import { signalMessage, PMUS_SIGNAL_VERSION } from '../lib/protocol.mjs';
import { config } from '../lib/config.mjs';
import { execute } from '../lib/run.mjs';
import { discoverPolymarketUs, pmusLimitPrice, gatewayRead, findPolymarketUsMarket, parsePolymarketUsInput, PMUS_GATEWAY } from '../lib/polymarket-us.mjs';
import { findMarket, lookupVenue } from '../lib/find-market.mjs';
import { callTool } from '../mcp/tools.mjs';
// Public deterministic test key, never funded or used on a network.
const account = privateKeyToAccount(`0x${'01'.repeat(32)}`);
const SLUG = 'cpc-btc-updown-15m-2026-11-12-1415z';
// A Call carries no amount: no stakeUsd. HiveTrade stakes the Hive's Amount per Call.
const yes = { hiveId: 4300, venue: 'polymarket_us', polymarketUsSlug: SLUG, side: 'yes', signalStrength: 100,
  limitPrice: 0.53, execution: 'hivetrade-v1', nonce: 'pmus-vector-1', issuedAt: 1700000000000, intent: true };
const no = { ...yes, side: 'no', limitPrice: 0.0453, nonce: 'pmus-vector-2' };
const API_YES = 'HiveTrade bot signal pmus-v1\nhive:4300\nvenue:polymarket_us\nmarket:cpc-btc-updown-15m-2026-11-12-1415z\nside:yes\nsignal:100\nlimitPrice:0.53\nexecution:hivetrade-v1\nnonce:pmus-vector-1\nissuedAt:1700000000000\nintent:true';
const API_NO = 'HiveTrade bot signal pmus-v1\nhive:4300\nvenue:polymarket_us\nmarket:cpc-btc-updown-15m-2026-11-12-1415z\nside:no\nsignal:100\nlimitPrice:0.0453\nexecution:hivetrade-v1\nnonce:pmus-vector-2\nissuedAt:1700000000000\nintent:true';
const API_YES_SIGNATURE = '0x263fb71591d032d5a488bbe9048e2c125c378949deeae94023dc3a330f87ac9b4490dc5fa8fbbd00a32b8551b3260da993d32ce8dbc43f533a9b01802b37a3b11b';
const API_NO_SIGNATURE = '0x2fdac0216bbd03f6e2072b6271398e44bf44e52449fde6c8f68f19888f849de24f6dd516581dbda53cbbf045dd97ee46b87035cadb4bc78ee58c3a2ca7e0869b1c';

test('pmus-v1 wire vectors are the bytes HiveTrade\'s botSignalMessage builds', async () => {
  assert.equal(PMUS_SIGNAL_VERSION, 'pmus-v1');
  assert.equal(signalMessage(yes), API_YES);
  assert.equal(signalMessage(no), API_NO);
  // Same bytes, same key: the same signature the API's verifier accepted.
  assert.equal(await account.signMessage({ message: signalMessage(yes) }), API_YES_SIGNATURE);
  assert.equal(await account.signMessage({ message: signalMessage(no) }), API_NO_SIGNATURE);
  assert.equal(await recoverMessageAddress({ message: signalMessage(yes), signature: API_YES_SIGNATURE }), account.address);
  // The price and the side are inside the signature.
  assert.notEqual(await recoverMessageAddress({ message: signalMessage({ ...yes, limitPrice: 0.6 }), signature: API_YES_SIGNATURE }), account.address);
  assert.notEqual(await recoverMessageAddress({ message: signalMessage({ ...yes, side: 'no' }), signature: API_YES_SIGNATURE }), account.address);
  // No amount line, ever: the Hive's Amount per Call is the leg.
  assert.doesNotMatch(signalMessage({ ...yes, stakeUsd: 1 }), /stake:/);
});

test('VENUE=polymarket_us is accepted; the Polymarket legacy flag never applies to it', () => {
  const cfg = config({ VENUE: 'polymarket_us' });
  assert.equal(cfg.venue, 'polymarket_us');
  assert.equal(cfg.legacySelfManaged, false);
  assert.equal(config({ VENUE: 'polymarket_us', POLYMARKET_LEGACY_SELF_MANAGED: 'true' }).legacySelfManaged, false);
  assert.throws(() => config({ VENUE: 'polymarket-us' }), /VENUE must be polymarket, polymarket_us or kalshi/);
});

// A fake gateway that records every URL and fails the test on two reads in flight.
function gateway(routes) {
  const seen = []; let inFlight = 0; let maxInFlight = 0;
  const request = async url => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); seen.push(url);
    try {
      await new Promise(resolve => setTimeout(resolve, 2));
      const path = url.slice(PMUS_GATEWAY.length);
      const answer = routes[path];
      if (answer === undefined) throw new Error('gateway.polymarket.us answered HTTP 404.');
      if (answer instanceof Error) throw answer;
      return typeof answer === 'function' ? answer() : answer;
    } finally { inFlight--; }
  };
  return { request, seen, maxInFlight: () => maxInFlight };
}
const q = value => ({ value, currency: 'USD' });
const market = (over = {}) => ({ slug: SLUG, question: 'Bitcoin Up or Down', title: 'Nov 12, 2:15PM', active: true, closed: false,
  status: 'MARKET_STATUS_OPEN', orderPriceMinTickSize: 0.01, endDate: '2026-11-12T19:30:00Z', ...over });
const book = (over = {}) => ({ marketData: { marketSlug: SLUG, state: 'MARKET_STATE_OPEN',
  bids: [{ px: q('0.4400'), qty: '10' }, { px: q('0.4600'), qty: '5' }],
  offers: [{ px: q('0.5000'), qty: '3' }, { px: q('0.4800'), qty: '7' }, { px: q('0.4700'), qty: '0' }], ...over } });

test('the dry run reads the market, then its book, one request at a time; NO ask = 1 - best YES bid', async () => {
  const g = gateway({ [`/v1/market/slug/${SLUG}`]: { market: market() }, [`/v1/markets/${SLUG}/book`]: book() });
  const m = await discoverPolymarketUs(SLUG, { request: g.request });
  assert.deepEqual(g.seen, [`${PMUS_GATEWAY}/v1/market/slug/${SLUG}`, `${PMUS_GATEWAY}/v1/markets/${SLUG}/book`]);
  assert.equal(g.maxInFlight(), 1);
  assert.equal(m.slug, SLUG); assert.equal(m.id, SLUG);
  assert.equal(m.question, 'Bitcoin Up or Down: Nov 12, 2:15PM');
  assert.equal(m.yesAsk, 0.48, 'cheapest offer with size');
  assert.equal(m.noAsk, 0.54, '1 - the best YES bid (0.46)');
  assert.equal(m.tickSize, 0.01);
});

test('closed, unknown, link-shaped and odd-tick markets stop with a plain reason', async () => {
  const closed = gateway({ [`/v1/market/slug/${SLUG}`]: { market: market({ closed: true }) } });
  await assert.rejects(discoverPolymarketUs(SLUG, { request: closed.request }), /not name an open Polymarket US market/);
  assert.equal(closed.seen.length, 1, 'no book read for a closed market');
  await assert.rejects(discoverPolymarketUs(SLUG, { request: gateway({}).request }), /no market with the slug/);
  await assert.rejects(discoverPolymarketUs('https://polymarket.us/event/x'), /is a link, not a slug/);
  await assert.rejects(discoverPolymarketUs('Not_A_Slug'), /not a Polymarket US market slug/);
  await assert.rejects(discoverPolymarketUs(''), /MARKET_SLUG is not set/);
  const odd = gateway({ [`/v1/market/slug/${SLUG}`]: { market: market({ orderPriceMinTickSize: 0.3 }) } });
  await assert.rejects(discoverPolymarketUs(SLUG, { request: odd.request }), /price step/);
  const paused = gateway({ [`/v1/market/slug/${SLUG}`]: { market: market() }, [`/v1/markets/${SLUG}/book`]: book({ state: 'MARKET_STATE_HALTED' }) });
  await assert.rejects(discoverPolymarketUs(SLUG, { request: paused.request }), /not open for orders/);
});

test('a 429 is retried twice after a pause; anything else is not retried', async () => {
  const waits = [];
  const wait = async ms => { waits.push(ms); };
  let calls = 0;
  const flaky = async () => { calls++; if (calls < 3) throw new Error('gateway.polymarket.us answered HTTP 429.'); return { ok: 1 }; };
  assert.deepEqual(await gatewayRead('/v1/x', { request: flaky, wait }), { ok: 1 });
  assert.deepEqual(waits, [1000, 2000]);
  calls = 0;
  const always = async () => { calls++; throw new Error('gateway.polymarket.us answered HTTP 429.'); };
  await assert.rejects(gatewayRead('/v1/x', { request: always, wait }), /HTTP 429/);
  assert.equal(calls, 3);
  calls = 0;
  const down = async () => { calls++; throw new Error('gateway.polymarket.us answered HTTP 500.'); };
  await assert.rejects(gatewayRead('/v1/x', { request: down, wait }), /HTTP 500/);
  assert.equal(calls, 1);
});

test('the limit price is the strategy maxPrice rounded down to the market price step', () => {
  assert.equal(pmusLimitPrice({ tickSize: 0.01 }, { maxPrice: 0.537 }), 0.53);
  assert.equal(pmusLimitPrice({ tickSize: 0.001 }, { maxPrice: 0.5379 }), 0.537);
  assert.equal(pmusLimitPrice({ tickSize: 0.0001 }, { maxPrice: 0.04531 }), 0.0453);
  assert.equal(pmusLimitPrice({ tickSize: 0.01 }, { maxPrice: 0.53 }), 0.53, 'the cap itself is allowed');
  assert.throws(() => pmusLimitPrice({ tickSize: 0.01 }, { maxPrice: 0.005 }), /smallest price step/);
});

test('find-market: a polymarket.us event link lists its markets; a market slug answers that market', async () => {
  const event = { event: { slug: 'btc-updown', title: 'Bitcoin Up or Down', markets: [market(), market({ slug: 'btc-old', closed: true })] } };
  const g = gateway({ '/v1/events/slug/btc-updown': event });
  const found = await findPolymarketUsMarket('https://polymarket.us/event/btc-updown', { request: g.request });
  assert.equal(found.kind, 'event'); assert.equal(found.venue, 'polymarket_us');
  assert.deepEqual(found.markets.map(m => [m.slug, m.open]), [[SLUG, true], ['btc-old', false]]);
  assert.equal(g.maxInFlight(), 1);
  const one = await findPolymarketUsMarket(SLUG, { request: gateway({ [`/v1/market/slug/${SLUG}`]: { market: market() } }).request });
  assert.deepEqual([one.kind, one.slug, one.open, one.endDate], ['market', SLUG, true, '2026-11-12T19:30:00Z']);
  await assert.rejects(findPolymarketUsMarket('nothing-here', { request: gateway({}).request }), /No Polymarket US market or event/);
  assert.throws(() => parsePolymarketUsInput('https://polymarket.com/event/x'), /polymarket\.us link/);
});

test('find-market routes polymarket.us links and VENUE=polymarket_us slugs to Polymarket US', async () => {
  assert.equal(lookupVenue('https://polymarket.us/event/x'), 'polymarket_us');
  assert.equal(lookupVenue('polymarket.us/event/x', 'polymarket'), 'polymarket_us');
  assert.equal(lookupVenue('some-slug', 'polymarket_us'), 'polymarket_us');
  assert.equal(lookupVenue('some-slug', 'kalshi'), 'polymarket');
  assert.equal(lookupVenue('https://polymarket.com/event/x', 'polymarket_us'), 'polymarket');
  const g = gateway({ [`/v1/market/slug/${SLUG}`]: { market: market() } });
  assert.equal((await findMarket(SLUG, { venue: 'polymarket_us', request: g.request })).venue, 'polymarket_us');
  const out = await callTool('find_market', { link: SLUG, venue: 'polymarket_us' }, { request: g.request });
  assert.ok(!out.isError, out.content[0].text);
  assert.equal(JSON.parse(out.content[0].text).slug, SLUG);
});

function harness(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-pmus-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { cfg: { stateDir: dir, api: 'https://api.hivetrade.com', hiveId: 4300 }, account, signal: yes };
}

test('pmus-v1 sends ONE signed signal and never places a local order or reports a fill', async t => {
  const h = harness(t); const calls = [];
  const result = await execute({ ...h, request: async (url, body) => { calls.push({ url, body }); return { accepted: true, id: 91, marketId: 91, venue: 'polymarket_us' }; },
    submitOrder: () => assert.fail('no local order on pmus-v1') });
  assert.deepEqual(result, { marketId: 91, accepted: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.hivetrade.com/api/bot/signal');
  assert.equal(calls[0].body.signature, API_YES_SIGNATURE);
  assert.equal(await recoverMessageAddress({ message: API_YES, signature: calls[0].body.signature }), account.address);
  await assert.rejects(execute({ ...h, request: () => assert.fail('no resend') }), /already attempted/);
});

test('a pmus-v1 clean skip is complete; a timeout or an unknown answer stays unresolved', async t => {
  const h = harness(t);
  const skipped = await execute({ ...h, request: async () => ({ accepted: false, skipped: true, code: 'POLYMARKET_US_BOT_PRICE_MOVED' }),
    submitOrder: () => assert.fail('no local order') });
  assert.deepEqual(skipped, { skipped: true, code: 'POLYMARKET_US_BOT_PRICE_MOVED' });
  assert.equal(JSON.parse(readFileSync(join(h.cfg.stateDir, 'journal.json')))[0].status, 'complete');
  for (const request of [async () => { throw new Error('timeout'); }, async () => ({ ok: true })]) {
    const u = harness(t);
    await assert.rejects(execute({ ...u, request, submitOrder: () => assert.fail('no local order') }));
    await assert.rejects(execute({ ...u, signal: { ...yes, polymarketUsSlug: 'other-market' }, request: () => assert.fail('no resend') }), /Unresolved/);
  }
});

test('the CLI dry run with VENUE=polymarket_us uses public GETs one at a time and needs no key', t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-pmus-dry-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fixture = join(dir, 'fixture.mjs');
  writeFileSync(fixture, `
    let inFlight = 0;
    globalThis.fetch = async (url, options = {}) => {
      if (options.method && options.method !== 'GET') throw new Error('WRITE REQUEST FORBIDDEN');
      if (inFlight++ > 0) throw new Error('TWO GATEWAY READS IN FLIGHT');
      try {
        await new Promise(r => setTimeout(r, 5));
        const q = v => ({ value: v, currency: 'USD' });
        let body;
        if (url === '${PMUS_GATEWAY}/v1/market/slug/${SLUG}') body = { market: { slug: '${SLUG}', question: 'Bitcoin Up or Down', active: true, closed: false, status: 'MARKET_STATUS_OPEN', orderPriceMinTickSize: 0.01 } };
        else if (url === '${PMUS_GATEWAY}/v1/markets/${SLUG}/book') body = { marketData: { marketSlug: '${SLUG}', state: 'MARKET_STATE_OPEN', bids: [{ px: q('0.5500'), qty: '4' }], offers: [{ px: q('0.4000'), qty: '3' }] } };
        else throw new Error('Unexpected URL ' + url);
        console.log('GET ' + url);
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } finally { inFlight--; }
    };
  `);
  const result = spawnSync(process.execPath, ['--import', join(root, 'test-support/use-fixture-strategy.mjs'), '--import', fixture, join(root, 'bot.mjs')], {
    cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, VENUE: 'polymarket_us', BOT_LIVE_TRADING_ENABLED: 'false', MARKET_SLUG: SLUG } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const lines = result.stdout.trim().split('\n');
  assert.deepEqual(lines.filter(l => l.startsWith('GET ')), [`GET ${PMUS_GATEWAY}/v1/market/slug/${SLUG}`, `GET ${PMUS_GATEWAY}/v1/markets/${SLUG}/book`]);
  assert.ok(lines.includes(`TRACE market ${SLUG}: Bitcoin Up or Down`), result.stdout);
  assert.ok(lines.includes('TRACE asks: YES $0.40, NO $0.45'), result.stdout);
  assert.match(result.stdout, /"mode":"DRY RUN","market":"cpc-btc-updown-15m-2026-11-12-1415z","side":"yes","priceCap":0\.45,"amount":"the Amount per Call set on your Hive"/);
});
